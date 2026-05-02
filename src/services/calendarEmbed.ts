import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

export interface CalendarEvent {
  eventId: string;
  summary: string;
  description?: string | null;
  htmlLink?: string | null;
  startTime: number;
  endTime: number;
}

type NotificationType = 'new' | '1hr' | 'ended' | 'deleted';

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a\s+[^>]*href="([^"]*)"[^>]*>[^<]*<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function generateEventEmbed(
  event: CalendarEvent,
  type: NotificationType,
  isDM: boolean,
): EmbedBuilder {
  const embed = new EmbedBuilder();

  const titles: Record<NotificationType, string> = {
    new: `📅 New Event: ${event.summary}`,
    '1hr': `⏰ Starting Soon: ${event.summary}`,
    ended: `🏁 Event Ended: ${event.summary}`,
    deleted: `❌ Event Cancelled: ${event.summary}`,
  };

  embed.setTitle(titles[type]);
  embed.setColor(
    type === 'new' ? 0x4285f4
    : type === '1hr' ? 0xfbbc05
    : type === 'ended' ? 0x34a853
    : 0xea4335,
  );

  let desc = '';
  if (event.description) {
    desc += stripHtml(event.description) + '\n\n';
  }
  if (event.htmlLink) {
    desc += `[View on Google Calendar](${event.htmlLink})`;
  }
  if (desc) embed.setDescription(desc);

  if (type !== 'deleted') {
    embed.addFields(
      {
        name: 'Start',
        value: `<t:${event.startTime}:F> (<t:${event.startTime}:R>)`,
        inline: true,
      },
      {
        name: 'End',
        value: `<t:${event.endTime}:t>`,
        inline: true,
      },
    );
  }

  embed.setFooter({
    text: isDM ? 'You are subscribed to event DMs' : 'Calendar announcement',
  });

  return embed;
}

export function buildSubscribeRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('cal_subscribe')
      .setLabel('Subscribe to DMs')
      .setStyle(ButtonStyle.Success),
  );
}

export function buildUnsubscribeRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('cal_unsubscribe')
      .setLabel('Unsubscribe')
      .setStyle(ButtonStyle.Danger),
  );
}
