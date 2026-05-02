import { ChatInputCommandInteraction, PermissionFlagsBits, ChannelType } from 'discord.js';
import { prisma } from '../../db';
import { config } from '../../config';

export async function handleSetupHoneypotCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const isOwner = interaction.user.id === config.BOT_OWNER_ID;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

  if (!isOwner && !isAdmin) {
    await interaction.reply({
      content: 'You need Administrator permissions to use this command.',
      ephemeral: true,
    });
    return;
  }

  const honeypotChannel = interaction.options.getChannel('honeypot_channel', true);
  const role = interaction.options.getRole('role', true);
  const notificationChannel = interaction.options.getChannel('notification_channel', true);

  if (honeypotChannel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: 'Honeypot channel must be a text channel.', ephemeral: true });
    return;
  }

  if (notificationChannel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: 'Notification channel must be a text channel.', ephemeral: true });
    return;
  }

  await prisma.guildSettings.upsert({
    where: { guildId: interaction.guildId! },
    create: {
      guildId: interaction.guildId!,
      honeypotChannelId: honeypotChannel.id,
      honeypotRoleId: role.id,
      honeypotNotificationChannelId: notificationChannel.id,
    },
    update: {
      honeypotChannelId: honeypotChannel.id,
      honeypotRoleId: role.id,
      honeypotNotificationChannelId: notificationChannel.id,
    },
  });

  await interaction.reply({
    content: [
      'Honeypot configured:',
      `- Honeypot channel: <#${honeypotChannel.id}>`,
      `- Role assigned on trigger: <@&${role.id}>`,
      `- Notification channel: <#${notificationChannel.id}>`,
    ].join('\n'),
    ephemeral: true,
  });
}
