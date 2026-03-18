import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
} from 'discord.js';
import { config } from '../../config';

export async function handleVipCommand(interaction: ChatInputCommandInteraction): Promise<void> {
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
      'Click the button below to authenticate with Steam. ' +
      'You must have the Premium role to complete activation.',
    components: [row],
    ephemeral: true,
  });
}
