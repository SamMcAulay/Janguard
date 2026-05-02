import axios from 'axios';
import { Client, TextChannel } from 'discord.js';
import { prisma } from '../db';
import { config } from '../config';
import {
  CalendarEvent,
  generateEventEmbed,
  buildSubscribeRow,
  buildUnsubscribeRow,
} from './calendarEmbed';

const CALENDAR_API_BASE = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.GOOGLE_CALENDAR_ID)}/events`;

// ---------------------------------------------------------------------------
// Notification dispatch
// ---------------------------------------------------------------------------

async function dispatchToChannels(
  client: Client,
  event: CalendarEvent,
  type: 'new' | '1hr' | 'ended' | 'deleted',
): Promise<void> {
  const guilds = await prisma.guildSettings.findMany();
  for (const gs of guilds) {
    if (!gs.announcementChannelId) continue;
    try {
      const channel = await client.channels.fetch(gs.announcementChannelId);
      if (channel?.isTextBased() && channel instanceof TextChannel) {
        const embed = generateEventEmbed(event, type, false);
        await channel.send({ embeds: [embed], components: [buildSubscribeRow()] });
      }
    } catch (err) {
      console.error(`Calendar: failed to send to channel ${gs.announcementChannelId}:`, err);
    }
  }
}

async function dispatchToDMs(
  client: Client,
  event: CalendarEvent,
  type: 'new' | '1hr' | 'ended' | 'deleted',
): Promise<void> {
  const subs = await prisma.userSubscription.findMany();
  for (const sub of subs) {
    try {
      const user = await client.users.fetch(sub.userId);
      const embed = generateEventEmbed(event, type, true);
      await user.send({ embeds: [embed], components: [buildUnsubscribeRow()] });
    } catch (err) {
      console.error(`Calendar: failed to DM user ${sub.userId}:`, err);
    }
    // Small delay to respect DM rate limits
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function notify(
  client: Client,
  event: CalendarEvent,
  type: 'new' | '1hr' | 'ended' | 'deleted',
): Promise<void> {
  await Promise.all([
    dispatchToChannels(client, event, type),
    dispatchToDMs(client, event, type),
  ]);
}

// ---------------------------------------------------------------------------
// Google Calendar API helpers
// ---------------------------------------------------------------------------

interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

interface GCalListResponse {
  items?: GCalEvent[];
  nextSyncToken?: string;
}

function toEpoch(dt?: { dateTime?: string; date?: string }): number {
  if (!dt) return 0;
  const str = dt.dateTime || dt.date;
  return str ? Math.floor(new Date(str).getTime() / 1000) : 0;
}

// ---------------------------------------------------------------------------
// Sync poller – detects new & deleted events
// ---------------------------------------------------------------------------

async function runSyncPoll(client: Client): Promise<void> {
  try {
    let state = await prisma.calendarState.findUnique({ where: { id: 1 } });

    const params: Record<string, string> = { key: config.GOOGLE_API_KEY };

    if (state?.nextSyncToken) {
      params.syncToken = state.nextSyncToken;
    } else {
      // Initial fetch: only future events
      params.timeMin = new Date().toISOString();
      params.singleEvents = 'true';
      params.orderBy = 'startTime';
    }

    const { data } = await axios.get<GCalListResponse>(CALENDAR_API_BASE, { params });

    const isInitialSync = !state?.nextSyncToken;

    for (const item of data.items || []) {
      if (item.status === 'cancelled') {
        // Event deleted
        const cached = await prisma.eventCache.findUnique({ where: { eventId: item.id } });
        if (cached) {
          await notify(client, cached, 'deleted');
          await prisma.eventCache.delete({ where: { eventId: item.id } });
        }
        continue;
      }

      const existing = await prisma.eventCache.findUnique({ where: { eventId: item.id } });

      const eventData = {
        eventId: item.id,
        summary: item.summary || 'Untitled Event',
        description: item.description || null,
        htmlLink: item.htmlLink || null,
        startTime: toEpoch(item.start),
        endTime: toEpoch(item.end),
        status: 'upcoming',
      };

      if (!existing) {
        await prisma.eventCache.create({ data: eventData });
        if (!isInitialSync) {
          await notify(client, eventData, 'new');
        }
      } else {
        // Update cached event data (time/summary may have changed)
        await prisma.eventCache.update({
          where: { eventId: item.id },
          data: {
            summary: eventData.summary,
            description: eventData.description,
            htmlLink: eventData.htmlLink,
            startTime: eventData.startTime,
            endTime: eventData.endTime,
          },
        });
      }
    }

    // Persist sync token
    const token = data.nextSyncToken || null;
    await prisma.calendarState.upsert({
      where: { id: 1 },
      create: { id: 1, nextSyncToken: token },
      update: { nextSyncToken: token },
    });
  } catch (err: any) {
    // If sync token is invalidated, reset and do a full re-sync next time
    if (err?.response?.status === 410) {
      console.warn('Calendar: sync token expired, resetting');
      await prisma.calendarState.upsert({
        where: { id: 1 },
        create: { id: 1, nextSyncToken: null },
        update: { nextSyncToken: null },
      });
    } else {
      console.error('Calendar sync poll error:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Time-check poller – triggers 1-hour and end notifications
// ---------------------------------------------------------------------------

async function runTimeCheck(client: Client): Promise<void> {
  try {
    const events = await prisma.eventCache.findMany({
      where: { status: { not: 'completed' } },
    });

    const now = Math.floor(Date.now() / 1000);

    for (const event of events) {
      if (now >= event.endTime) {
        await notify(client, event, 'ended');
        await prisma.eventCache.update({
          where: { eventId: event.eventId },
          data: { status: 'completed' },
        });
      } else if (
        now >= event.startTime - 3600 &&
        event.status !== 'notified_1hr'
      ) {
        await notify(client, event, '1hr');
        await prisma.eventCache.update({
          where: { eventId: event.eventId },
          data: { status: 'notified_1hr' },
        });
      }
    }
  } catch (err) {
    console.error('Calendar time-check error:', err);
  }
}

// ---------------------------------------------------------------------------
// Start both pollers
// ---------------------------------------------------------------------------

export function startCalendarPollers(client: Client): void {
  // Run initial sync after a short delay to let the bot fully initialize
  setTimeout(() => runSyncPoll(client), 5_000);

  // Sync poller: every 5 minutes
  setInterval(() => runSyncPoll(client), 5 * 60 * 1000);

  // Time-check poller: every 1 minute
  setInterval(() => runTimeCheck(client), 60 * 1000);

  console.log('Calendar pollers started');
}
