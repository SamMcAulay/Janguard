import { config } from './config';
import { client } from './bot/client';
import { registerReadyEvent } from './bot/events/ready';
import { registerGuildMemberUpdateEvent } from './bot/events/guildMemberUpdate';
import { handleVipCommand } from './bot/commands/vip';
import { createServer } from './server/app';
import { prisma } from './db';
import { Interaction } from 'discord.js';

async function main(): Promise<void> {
  // Connect to database
  await prisma.$connect();
  console.log('Database connected');

  // Register bot events
  registerReadyEvent();
  registerGuildMemberUpdateEvent();

  // Handle slash commands
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'vip') {
      await handleVipCommand(interaction);
    }
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
