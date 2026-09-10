import { Message, PermissionFlagsBits, TextChannel } from 'discord.js';
import { config } from '../../config';

/** Discord rate limits punish rapid posting, so refuse anything faster than this */
const MIN_INTERVAL_MS = 30 * 1000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;

function buildFaqMessage(intervalMs: number): string {
  return [
    '# ⚠️ Service Disruption Notice',
    '',
    '**Please be patient.** Wardogs and our server host are currently experiencing disruptions at every level, ' +
      'and there is nothing we at TEG can do about it at this time.',
    '',
    'All connectivity will be disrupted, including **community and regular servers**.',
    '',
    'This is **not** the fault of TEG. The disruption originates with **Valve**, **Bulkhead**, and the **server hosts**.',
    '',
    `-# Thank you for your patience. This notice repeats every ${formatDuration(intervalMs)} until the issue is resolved.`,
  ].join('\n');
}

/** Render a duration as a human phrase, e.g. "5 minutes", "90 seconds", "2 hours" */
export function formatDuration(ms: number): string {
  const units: [string, number][] = [
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
    ['second', 1000],
  ];
  for (const [name, size] of units) {
    if (ms >= size && ms % size === 0) {
      const count = ms / size;
      return `${count} ${name}${count !== 1 ? 's' : ''}`;
    }
  }
  return `${Math.round(ms / 1000)} seconds`;
}

/**
 * Parse a duration argument such as "5", "5m", "90s", "1h" or "1h30m".
 * A bare number is read as minutes. Returns null if nothing parses.
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(parseFloat(trimmed) * 60 * 1000);
  }

  const unitMs: Record<string, number> = {
    s: 1000,
    sec: 1000,
    secs: 1000,
    second: 1000,
    seconds: 1000,
    m: 60 * 1000,
    min: 60 * 1000,
    mins: 60 * 1000,
    minute: 60 * 1000,
    minutes: 60 * 1000,
    h: 60 * 60 * 1000,
    hr: 60 * 60 * 1000,
    hrs: 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
  };

  const parts = [...trimmed.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/g)];
  if (parts.length === 0) return null;

  let total = 0;
  for (const [, amount, unit] of parts) {
    const size = unitMs[unit];
    if (size === undefined) return null;
    total += parseFloat(amount) * size;
  }
  return Math.round(total);
}

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

  // Interval comes from the command argument, falling back to the configured default
  const args = message.content.trim().slice('?WDFAQstart'.length).trim();
  let intervalMs = config.WDFAQ_INTERVAL_MS;

  if (args) {
    const parsed = parseDuration(args);
    if (parsed === null) {
      await message.reply(
        'Could not read that interval. Try `?WDFAQstart 5m`, `?WDFAQstart 90s`, or `?WDFAQstart 1h`.',
      );
      return;
    }
    if (parsed < MIN_INTERVAL_MS || parsed > MAX_INTERVAL_MS) {
      await message.reply(
        `Interval must be between ${formatDuration(MIN_INTERVAL_MS)} and ${formatDuration(MAX_INTERVAL_MS)}.`,
      );
      return;
    }
    intervalMs = parsed;
  }

  const body = buildFaqMessage(intervalMs);

  const timer = setInterval(() => {
    channel.send(body).catch(() => {});
  }, intervalMs);

  activeTimers.set(channel.id, timer);

  // Send the first one immediately so the announcement is live right away
  await channel.send(body);
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
