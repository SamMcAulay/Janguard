import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
} from 'discord.js';
import { config } from '../../config';
import { prisma } from '../../db';

export async function handleVipCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { discordId: interaction.user.id },
  });

  // Already linked and active
  if (user?.isVip && user.steamId) {
    const authUrl = `${config.BASE_URL}/auth/steam?discordId=${interaction.user.id}`;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Re-link Steam Account')
        .setStyle(ButtonStyle.Link)
        .setURL(authUrl),
    );

    await interaction.reply({
      content:
        '**Your VIP is already active!**\n\n' +
        `Steam ID: \`${user.steamId}\`\n\n` +
        'If you need to link a different Steam account, click below.',
      components: [row],
      ephemeral: true,
    });
    return;
  }

  // Not yet linked — show activation button
  const authUrl = `${config.BASE_URL}/auth/steam?discordId=${interaction.user.id}`;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Link Steam & Activate VIP')
      .setStyle(ButtonStyle.Link)
      .setURL(authUrl),
  );

  await interaction.reply({
    content:
      '**Activate your VIP Reserved Slot**\n\n' +
      'Click the button below to authenticate with Steam.\n' +
      'You must have the **Premium** role to complete activation.',
    components: [row],
    ephemeral: true,
  });
}
