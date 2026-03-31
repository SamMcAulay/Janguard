import { ButtonInteraction } from 'discord.js';
import { prisma } from '../../db';

export async function handleCalendarButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (interaction.customId === 'cal_subscribe') {
    const existing = await prisma.userSubscription.findUnique({
      where: { userId: interaction.user.id },
    });

    if (existing) {
      await interaction.reply({
        content: 'You are already subscribed.',
        ephemeral: true,
      });
      return;
    }

    await prisma.userSubscription.create({
      data: { userId: interaction.user.id },
    });

    await interaction.reply({
      content: '✅ You will now receive DMs for calendar events.',
      ephemeral: true,
    });
  } else if (interaction.customId === 'cal_unsubscribe') {
    await prisma.userSubscription.deleteMany({
      where: { userId: interaction.user.id },
    });

    await interaction.reply({
      content: '🚫 You have been unsubscribed from event DMs.',
      ephemeral: true,
    });
  }
}
