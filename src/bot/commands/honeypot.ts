import { ChannelType, Message, PermissionFlagsBits, TextChannel } from 'discord.js';
import { prisma } from '../../db';
import { config } from '../../config';
import { wipeChannel, parallel, WipeFilter } from './wipe';

export async function handleHoneypotMessage(message: Message): Promise<void> {
  if (!message.guild || !(message.channel instanceof TextChannel)) return;

  const settings = await prisma.guildSettings.findUnique({
    where: { guildId: message.guild.id },
  });

  if (
    !settings?.honeypotChannelId ||
    message.channel.id !== settings.honeypotChannelId ||
    !settings.honeypotRoleId ||
    !settings.honeypotNotificationChannelId
  ) {
    return;
  }

  const member = message.member;
  if (!member) return;
  if (member.id === config.BOT_OWNER_ID) return;

  await member.roles.add(settings.honeypotRoleId).catch((err) => {
    console.error(`Honeypot: failed to assign role to ${member.id}:`, err);
  });

  const attachmentNames = [...message.attachments.values()].map((a) => a.name).sort();
  const filter: WipeFilter = {
    text: message.content || null,
    attachmentNames: attachmentNames.length > 0 ? attachmentNames : null,
    targetUserId: null,
  };

  if (filter.text || filter.attachmentNames) {
    const botMember = message.guild.members.me;
    const channels = [
      ...message.guild.channels.cache
        .filter(
          (ch): ch is TextChannel =>
            ch.type === ChannelType.GuildText &&
            ch.permissionsFor(botMember!)?.has(PermissionFlagsBits.ManageMessages) === true,
        )
        .values(),
    ];

    await parallel(channels, 10, (ch) => wipeChannel(ch, filter, null).catch(() => 0));
  }

  const notificationChannel = message.guild.channels.cache.get(
    settings.honeypotNotificationChannelId,
  );
  if (notificationChannel instanceof TextChannel) {
    await notificationChannel.send(
      `Hello <@${member.id}>, you are here because you were stupid, and typed in the honeypot, or you got your account yoinked, and are stupid. Please let us know when you have your account back, with 2fa enabled and your password changed.`,
    );
  }
}
