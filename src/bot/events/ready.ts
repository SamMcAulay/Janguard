import { ActivityType, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { client } from '../client';
import { config } from '../../config';
import { startStatusUpdater } from '../../services/statusUpdater';

export function registerReadyEvent(): void {
  client.once('ready', async () => { // trigger redeploy
    console.log(`Bot logged in as ${client.user?.tag}`);

    // Register slash command
    const command = new SlashCommandBuilder()
      .setName('vip')
      .setDescription('Link your Steam account to activate VIP');

    const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
    const guilds = [config.DISCORD_GUILD_ID, config.DISCORD_TEST_GUILD_ID].filter(Boolean);
    for (const guildId of guilds) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, guildId),
          { body: [command.toJSON()] },
        );
        console.log(`Slash commands registered for guild ${guildId}`);
      } catch (err) {
        console.error(`Failed to register slash commands for guild ${guildId}:`, err);
      }
    }

    // Start the live server status rotation
    startStatusUpdater(client);
  });
}
