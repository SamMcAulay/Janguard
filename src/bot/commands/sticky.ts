import { Message, MessageCreateOptions, PermissionFlagsBits, TextChannel } from 'discord.js';
import { prisma } from '../../db';

/**
 * A sticky message is re-posted after other people talk so it stays at the
 * bottom of the channel. Reposting on every single message would burn through
 * Discord's rate limits, so bursts are collapsed into one repost.
 */
const REPOST_DELAY_MS = 3 * 1000;

interface StickyState {
  guildId: string;
  content: string;
  /** ID of the currently posted copy, so it can be deleted before the next one */
  messageId: string | null;
  timer: NodeJS.Timeout | null;
  reposting: boolean;
}

/** Active sticky messages, keyed by channel ID. Mirrors the StickyMessage table. */
const stickies = new Map<string, StickyState>();

/** Repeating pings would be obnoxious, so mentions render as plain text */
const SEND_OPTIONS: Omit<MessageCreateOptions, 'content'> = { allowedMentions: { parse: [] } };

/** Restore stickies from the database so they survive a restart or redeploy */
export async function loadStickyMessages(): Promise<void> {
  const rows = await prisma.stickyMessage.findMany();
  for (const row of rows) {
    stickies.set(row.channelId, {
      guildId: row.guildId,
      content: row.content,
      messageId: row.messageId,
      timer: null,
      reposting: false,
    });
  }
  if (rows.length > 0) {
    console.log(`Restored ${rows.length} sticky message(s)`);
  }
}

async function deletePosted(channel: TextChannel, messageId: string | null): Promise<void> {
  if (!messageId) return;
  await channel.messages.delete(messageId).catch(() => {});
}

/** Queue a repost, collapsing a burst of messages into a single one */
function schedule(channel: TextChannel, state: StickyState): void {
  if (state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    // A slow repost is still running, so wait for it and re-check afterwards
    if (state.reposting) {
      schedule(channel, state);
      return;
    }
    void repost(channel, state);
  }, REPOST_DELAY_MS);
}

async function repost(channel: TextChannel, state: StickyState): Promise<void> {
  state.reposting = true;

  try {
    await deletePosted(channel, state.messageId);
    const sent = await channel.send({ content: state.content, ...SEND_OPTIONS });
    state.messageId = sent.id;
    await prisma.stickyMessage.update({
      where: { channelId: channel.id },
      data: { messageId: sent.id },
    });
  } catch (err) {
    console.error(`Sticky: failed to repost in channel ${channel.id}:`, err);
  } finally {
    state.reposting = false;
  }
}

/**
 * Called for every message. Schedules the sticky to be re-sent shortly after
 * the channel goes quiet, so it ends up as the most recent message again.
 */
export function handleStickyMessage(message: Message): void {
  if (!(message.channel instanceof TextChannel)) return;

  const state = stickies.get(message.channel.id);
  if (!state) return;

  // Our own repost must not trigger another repost
  if (message.id === state.messageId) return;
  if (message.author.id === message.client.user?.id) return;

  schedule(message.channel, state);
}

export async function handleStickCommand(message: Message): Promise<void> {
  if (!message.guild || !(message.channel instanceof TextChannel)) return;

  if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply('You need the **Manage Messages** permission to use this command.');
    return;
  }

  const content = message.content.trim().slice('?stick'.length).trim();
  if (!content) {
    await message.reply('Give me something to stick, e.g. `?stick Read the rules before posting.`');
    return;
  }

  const channel = message.channel;
  const existing = stickies.get(channel.id);

  // Replacing a sticky: clear the old copy and any pending repost of it
  if (existing) {
    if (existing.timer) clearTimeout(existing.timer);
    await deletePosted(channel, existing.messageId);
  }

  // The command itself would sit below the sticky, so take it out of the channel
  await message.delete().catch(() => {});

  const sent = await channel.send({ content, ...SEND_OPTIONS });

  stickies.set(channel.id, {
    guildId: message.guild.id,
    content,
    messageId: sent.id,
    timer: null,
    reposting: false,
  });

  await prisma.stickyMessage.upsert({
    where: { channelId: channel.id },
    create: {
      channelId: channel.id,
      guildId: message.guild.id,
      content,
      messageId: sent.id,
      createdBy: message.author.id,
    },
    update: { content, messageId: sent.id, createdBy: message.author.id },
  });
}

export async function handleStickStopCommand(message: Message): Promise<void> {
  if (!message.guild || !(message.channel instanceof TextChannel)) return;

  if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply('You need the **Manage Messages** permission to use this command.');
    return;
  }

  const channel = message.channel;
  const state = stickies.get(channel.id);
  if (!state) {
    await message.reply('There is no sticky message in this channel.');
    return;
  }

  if (state.timer) clearTimeout(state.timer);
  await deletePosted(channel, state.messageId);
  stickies.delete(channel.id);
  await prisma.stickyMessage.delete({ where: { channelId: channel.id } }).catch(() => {});

  await message.reply('Sticky message removed.');
}
