import { ChannelType, Message, PermissionFlagsBits, TextChannel } from 'discord.js';

async function wipeChannel(channel: TextChannel, searchText: string, targetUserId: string | null): Promise<number> {
  let lastId: string | undefined;
  const toDelete: Message[] = [];

  // Scan the last 500 messages per channel
  for (let i = 0; i < 5; i++) {
    const fetched = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
    if (fetched.size === 0) break;

    for (const msg of fetched.values()) {
      const contentMatch = msg.content === searchText;
      const userMatch = targetUserId ? msg.author.id === targetUserId : true;

      if (contentMatch && userMatch) {
        toDelete.push(msg);
      }
    }

    lastId = fetched.last()?.id;
    if (fetched.size < 100) break;
  }

  if (toDelete.length === 0) return 0;

  const now = Date.now();
  const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
  const bulkDeletable = toDelete.filter((m) => now - m.createdTimestamp < twoWeeksMs);
  const tooOld = toDelete.filter((m) => now - m.createdTimestamp >= twoWeeksMs);

  // Bulk delete in chunks of 100
  for (let i = 0; i < bulkDeletable.length; i += 100) {
    const chunk = bulkDeletable.slice(i, i + 100);
    if (chunk.length === 1) {
      await chunk[0].delete();
    } else if (chunk.length > 1) {
      await channel.bulkDelete(chunk);
    }
  }

  // Individually delete messages older than 14 days
  for (const msg of tooOld) {
    await msg.delete();
  }

  return toDelete.length;
}

export async function handleWipeCommand(message: Message): Promise<void> {
  if (!message.guild || !(message.channel instanceof TextChannel)) return;

  // Require Manage Messages permission
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply('You need the **Manage Messages** permission to use this command.');
    return;
  }

  const botMember = message.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply('I need the **Manage Messages** permission to use this command.');
    return;
  }

  // Parse: !wipe {text} [@user]
  const args = message.content.slice('!wipe '.length).trim();
  if (!args) {
    await message.reply('Usage: `!wipe <text> [| note] [@user]`');
    return;
  }

  let searchText: string;
  let note: string | null = null;
  let targetUserId: string | null = null;

  let remaining = args;

  // Check if the last argument is a user mention
  const mentionMatch = remaining.match(/<@!?(\d+)>\s*$/);
  if (mentionMatch) {
    targetUserId = mentionMatch[1];
    remaining = remaining.slice(0, mentionMatch.index).trim();
  }

  // Split on | to separate search text from note
  const pipeIndex = remaining.indexOf('|');
  if (pipeIndex !== -1) {
    searchText = remaining.slice(0, pipeIndex).trim();
    note = remaining.slice(pipeIndex + 1).trim() || null;
  } else {
    searchText = remaining;
  }

  if (!searchText) {
    await message.reply('Usage: `!wipe <text> [| note] [@user]`');
    return;
  }

  // Delete the wipe command immediately so the spam link isn't sitting in chat
  await message.delete().catch(() => {});

  // Wipe across all text channels the bot can access
  const guild = message.guild;
  const channels = guild.channels.cache.filter(
    (ch): ch is TextChannel =>
      ch.type === ChannelType.GuildText &&
      ch.permissionsFor(botMember!)?.has(PermissionFlagsBits.ManageMessages) === true,
  );

  let totalDeleted = 0;
  for (const channel of channels.values()) {
    totalDeleted += await wipeChannel(channel, searchText, targetUserId);
  }

  // Send summary in the channel the command was run in
  const targetLabel = targetUserId ? ` from <@${targetUserId}>` : '';
  const noteLabel = note ? `\nReason: ${note}` : '';
  await message.channel.send(
    `Wiped **${totalDeleted}** message${totalDeleted !== 1 ? 's' : ''} across **${channels.size}** channel${channels.size !== 1 ? 's' : ''}${targetLabel} matching \`${searchText}\` — requested by ${message.author}.${noteLabel}`,
  );
}
