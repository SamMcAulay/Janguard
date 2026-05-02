import { ChannelType, Message, PermissionFlagsBits, TextChannel } from 'discord.js';

export interface WipeFilter {
  text: string | null;
  attachmentNames: string[] | null;
  targetUserId: string | null;
}

function messageMatches(msg: Message, filter: WipeFilter): boolean {
  if (filter.targetUserId && msg.author.id !== filter.targetUserId) return false;

  // A message matches if its text and attachments are identical to the reference.
  // Both fields must match when present in the reference.
  const textMatch = filter.text ? msg.content === filter.text : msg.content === '';
  const attachmentNames = [...msg.attachments.values()].map((a) => a.name).sort();
  const attachmentsMatch = filter.attachmentNames
    ? attachmentNames.length === filter.attachmentNames.length &&
      attachmentNames.every((name, i) => name === filter.attachmentNames![i])
    : attachmentNames.length === 0;

  return textMatch && attachmentsMatch;
}

export async function wipeChannel(
  channel: TextChannel,
  filter: WipeFilter,
  skipMessageId: string | null,
): Promise<number> {
  const fetched = await channel.messages.fetch({ limit: 100 });
  if (fetched.size === 0) return 0;

  const toDelete = fetched.filter((msg) => {
    if (msg.id === skipMessageId) return false;
    return messageMatches(msg, filter);
  });

  if (toDelete.size === 0) return 0;

  const now = Date.now();
  const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
  const messages = [...toDelete.values()];
  const bulkDeletable = messages.filter((m) => now - m.createdTimestamp < twoWeeksMs);
  const tooOld = messages.filter((m) => now - m.createdTimestamp >= twoWeeksMs);

  if (bulkDeletable.length === 1) {
    await bulkDeletable[0].delete();
  } else if (bulkDeletable.length > 1) {
    await channel.bulkDelete(bulkDeletable);
  }

  for (const msg of tooOld) {
    await msg.delete();
  }

  return messages.length;
}

/** Run promises with a max concurrency limit */
export async function parallel<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export async function handleWipeCommand(message: Message): Promise<void> {
  if (!message.guild || !(message.channel instanceof TextChannel)) return;

  if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply('You need the **Manage Messages** permission to use this command.');
    return;
  }

  const botMember = message.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply('I need the **Manage Messages** permission to use this command.');
    return;
  }

  const args = message.content.slice('!wipe'.length).trim();

  let note: string | null = null;
  let targetUserId: string | null = null;
  let filter: WipeFilter;

  // Parse optional note and user from args (applies to both modes)
  let remaining = args;
  const mentionMatch = remaining.match(/<@!?(\d+)>\s*$/);
  if (mentionMatch) {
    targetUserId = mentionMatch[1];
    remaining = remaining.slice(0, mentionMatch.index).trim();
  }
  const pipeIndex = remaining.indexOf('|');
  if (pipeIndex !== -1) {
    note = remaining.slice(pipeIndex + 1).trim() || null;
    remaining = remaining.slice(0, pipeIndex).trim();
  }

  // Check if this is a reply to a message
  const ref = message.reference;
  if (ref?.messageId) {
    // Reply mode: use the referenced message as the template
    const refChannel = message.channel;
    const refMsg = await refChannel.messages.fetch(ref.messageId).catch(() => null);
    if (!refMsg) {
      await message.reply('Could not fetch the referenced message.');
      return;
    }

    const attachmentNames = [...refMsg.attachments.values()].map((a) => a.name).sort();
    filter = {
      text: refMsg.content || null,
      attachmentNames: attachmentNames.length > 0 ? attachmentNames : null,
      targetUserId,
    };

    if (!filter.text && !filter.attachmentNames) {
      await message.reply('The referenced message has no text or attachments to match against.');
      return;
    }
  } else {
    // Inline text mode: !wipe <text> [| note] [@user]
    if (!remaining) {
      await message.reply('Usage: reply to a spam message with `!wipe`, or `!wipe <text> [| note] [@user]`');
      return;
    }
    filter = { text: remaining, attachmentNames: null, targetUserId };
  }

  // Delete the wipe command (and the referenced spam message if in reply mode)
  const refMessageId = ref?.messageId ?? null;
  await message.delete().catch(() => {});
  if (refMessageId) {
    const refMsg = await message.channel.messages.fetch(refMessageId).catch(() => null);
    if (refMsg) await refMsg.delete().catch(() => {});
  }

  // Collect all text channels the bot can manage messages in
  const guild = message.guild;
  const channels = [...guild.channels.cache
    .filter(
      (ch): ch is TextChannel =>
        ch.type === ChannelType.GuildText &&
        ch.permissionsFor(botMember!)?.has(PermissionFlagsBits.ManageMessages) === true,
    )
    .values()];

  // Process 10 channels concurrently
  const results = await parallel(channels, 10, (ch) =>
    wipeChannel(ch, filter, refMessageId).catch(() => 0),
  );
  const totalDeleted = results.reduce((sum, n) => sum + n, 0);

  // Build summary description of what was matched
  const matchParts: string[] = [];
  if (filter.text) matchParts.push(`text \`${filter.text}\``);
  if (filter.attachmentNames) matchParts.push(`attachments [${filter.attachmentNames.join(', ')}]`);
  const matchDesc = matchParts.join(' + ');

  const targetLabel = targetUserId ? ` from <@${targetUserId}>` : '';
  const noteLabel = note ? `\nReason: ${note}` : '';
  await message.channel.send(
    `Wiped **${totalDeleted}** message${totalDeleted !== 1 ? 's' : ''} across **${channels.length}** channel${channels.length !== 1 ? 's' : ''}${targetLabel} matching ${matchDesc} — requested by ${message.author}.${noteLabel}`,
  );
}
