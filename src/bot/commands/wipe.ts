import { ChannelType, Message, PermissionFlagsBits, TextChannel } from 'discord.js';

async function wipeChannel(channel: TextChannel, searchText: string, targetUserId: string | null): Promise<number> {
  // Quick check: fetch only the most recent 100 messages first.
  // Spam bots post one message per channel, so this almost always suffices.
  const fetched = await channel.messages.fetch({ limit: 100 });
  if (fetched.size === 0) return 0;

  const toDelete = fetched.filter((msg) => {
    const contentMatch = msg.content === searchText;
    const userMatch = targetUserId ? msg.author.id === targetUserId : true;
    return contentMatch && userMatch;
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
async function parallel<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

  // Parse: !wipe {text} [| note] [@user]
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

  // Collect all text channels the bot can manage messages in
  const guild = message.guild;
  const channels = [...guild.channels.cache
    .filter(
      (ch): ch is TextChannel =>
        ch.type === ChannelType.GuildText &&
        ch.permissionsFor(botMember!)?.has(PermissionFlagsBits.ManageMessages) === true,
    )
    .values()];

  // Process 10 channels at a time to stay within rate limits
  const results = await parallel(channels, 10, (ch) =>
    wipeChannel(ch, searchText, targetUserId).catch(() => 0),
  );
  const totalDeleted = results.reduce((sum, n) => sum + n, 0);

  // Send summary in the channel the command was run in
  const targetLabel = targetUserId ? ` from <@${targetUserId}>` : '';
  const noteLabel = note ? `\nReason: ${note}` : '';
  await message.channel.send(
    `Wiped **${totalDeleted}** message${totalDeleted !== 1 ? 's' : ''} across **${channels.length}** channel${channels.length !== 1 ? 's' : ''}${targetLabel} matching \`${searchText}\` — requested by ${message.author}.${noteLabel}`,
  );
}
