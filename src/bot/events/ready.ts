import { ActivityType, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { client } from '../client';
import { config } from '../../config';
import { startStatusUpdater } from '../../services/statusUpdater';

export function registerReadyEvent(): void {
  client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user?.tag}`);

    // Register slash command
    const command = new SlashCommandBuilder()
      .setName('vip')
      .setDescription('Link your Steam account to activate VIP');

    const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
    try {
      await rest.put(
        Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
        { body: [command.toJSON()] },
      );
      console.log('Slash commands registered');
    } catch (err) {
      console.error('Failed to register slash commands:', err);
    }

    // Start the live server status rotation
    startStatusUpdater(client);
  });
}
