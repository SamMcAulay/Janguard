import { Message, PermissionFlagsBits, TextChannel } from 'discord.js';

const FAQ_MESSAGE = [
  '# ⚠️ Service Disruption Notice',
  '',
  '**Please be patient.** Wardogs and our server host are currently experiencing disruptions at every level, ' +
    'and there is nothing we at TEG can do about it at this time.',
  '',
  '## What is affected',
  'All connectivity will be disrupted, including **community and regular servers**.',
  '',
  '## Cause',
  'This is **not** the fault of TEG. The disruption originates with **Valve**, **Bulkhead**, and the **server hosts**.',
  '',
  '-# Thank you for your patience. This notice repeats every 5 minutes until the issue is resolved.',
].join('\n');

const INTERVAL_MS = 5 * 60 * 1000;

/** Active FAQ broadcast timers, keyed by channel ID */
const activeTimers = new Map<string, NodeJS.Timeout>();

export async function handleWdfaqStartCommand(message: Message): Promise<void> {
  if (!message.guild || !(message.channel instanceof TextChannel)) return;

  if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply('You need the **Manage Messages** permission to use this command.');
    return;
  }

  const channel = message.channel;

  if (activeTimers.has(channel.id)) {
    await message.reply('The FAQ broadcast is already running in this channel. Use `?WDFAQstop` to stop it.');
    return;
  }

  const timer = setInterval(() => {
    channel.send(FAQ_MESSAGE).catch(() => {});
  }, INTERVAL_MS);

  activeTimers.set(channel.id, timer);

  // Send the first one immediately so the announcement is live right away
  await channel.send(FAQ_MESSAGE);
}

export async function handleWdfaqStopCommand(message: Message): Promise<void> {
  if (!message.guild || !(message.channel instanceof TextChannel)) return;

  if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply('You need the **Manage Messages** permission to use this command.');
    return;
  }

  const timer = activeTimers.get(message.channel.id);
  if (!timer) {
    await message.reply('No FAQ broadcast is running in this channel.');
    return;
  }

  clearInterval(timer);
  activeTimers.delete(message.channel.id);
  await message.reply('FAQ broadcast stopped.');
}
