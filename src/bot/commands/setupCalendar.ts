import { ChatInputCommandInteraction, PermissionFlagsBits, ChannelType } from 'discord.js';
import { prisma } from '../../db';
import { config } from '../../config';

export async function handleSetupCalendarCommand(
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

  const channel = interaction.options.getChannel('channel', true);

  if (channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: 'Please select a text channel.',
      ephemeral: true,
    });
    return;
  }

  await prisma.guildSettings.upsert({
    where: { guildId: interaction.guildId! },
    create: {
      guildId: interaction.guildId!,
      announcementChannelId: channel.id,
    },
    update: {
      announcementChannelId: channel.id,
    },
  });

  await interaction.reply({
    content: `Calendar announcements will be sent to <#${channel.id}>.`,
    ephemeral: true,
  });
}
