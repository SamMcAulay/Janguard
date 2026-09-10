import { config } from './config';
import { client } from './bot/client';
import { registerReadyEvent } from './bot/events/ready';
import { registerGuildMemberUpdateEvent } from './bot/events/guildMemberUpdate';
import { handleVipCommand } from './bot/commands/vip';
import { handleSetupCalendarCommand } from './bot/commands/setupCalendar';
import { handleCalendarButton } from './bot/events/calendarButtons';
import { handleWipeCommand } from './bot/commands/wipe';
import { handleSetupHoneypotCommand } from './bot/commands/setupHoneypot';
import { handleHoneypotMessage } from './bot/commands/honeypot';
import { handleWdfaqStartCommand, handleWdfaqStopCommand } from './bot/commands/wdfaq';
import {
  handleStickCommand,
  handleStickStopCommand,
  handleStickyMessage,
  loadStickyMessages,
} from './bot/commands/sticky';
import { createServer } from './server/app';
import { prisma } from './db';
import { Interaction } from 'discord.js';

async function main(): Promise<void> {
  // Connect to database
  await prisma.$connect();
  console.log('Database connected');

  // Restore sticky messages saved before the last restart
  await loadStickyMessages();

  // Register bot events
  registerReadyEvent();
  registerGuildMemberUpdateEvent();

  // Handle interactions (slash commands + buttons)
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'vip') {
        await handleVipCommand(interaction);
      } else if (interaction.commandName === 'setup_calendar') {
        await handleSetupCalendarCommand(interaction);
      } else if (interaction.commandName === 'setup_honeypot') {
        await handleSetupHoneypotCommand(interaction);
      }
    } else if (interaction.isButton()) {
      if (interaction.customId === 'cal_subscribe' || interaction.customId === 'cal_unsubscribe') {
        await handleCalendarButton(interaction);
      }
    }
  });

  // Handle prefix commands and honeypot detection
  client.on('messageCreate', async (message) => {
    // Other bots push a sticky down too, so this runs before the bot filter
    handleStickyMessage(message);

    if (message.author.bot) return;
    if (message.content === '!wipe' || message.content.startsWith('!wipe ')) {
      await handleWipeCommand(message);
      return;
    }
    const lowered = message.content.trim().toLowerCase();
    if (lowered === '?wdfaqstart' || lowered.startsWith('?wdfaqstart ')) {
      await handleWdfaqStartCommand(message);
      return;
    }
    if (lowered === '?wdfaqstop') {
      await handleWdfaqStopCommand(message);
      return;
    }
    if (lowered === '?stickstop') {
      await handleStickStopCommand(message);
      return;
    }
    if (lowered.startsWith('?stick ') || lowered.startsWith('?stick\n') || lowered === '?stick') {
      await handleStickCommand(message);
      return;
    }
    await handleHoneypotMessage(message);
  });

  // Start Express server
  const app = createServer();
  app.listen(config.PORT, () => {
    console.log(`Express server listening on port ${config.PORT}`);
  });

  // Login Discord bot
  await client.login(config.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
