import { ActivityType, ChannelType, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { client } from '../client';
import { config } from '../../config';
import { startStatusUpdater } from '../../services/statusUpdater';
import { startCalendarPollers } from '../../services/calendarPoller';

export function registerReadyEvent(): void {
  client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user?.tag}`);

    // Register slash commands
    const vipCommand = new SlashCommandBuilder()
      .setName('vip')
      .setDescription('Link your Steam account to activate VIP');

    const setupCalendarCommand = new SlashCommandBuilder()
      .setName('setup_calendar')
      .setDescription('Set the channel for calendar event announcements')
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('The channel to send announcements to')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      );

    const commands = [vipCommand.toJSON(), setupCalendarCommand.toJSON()];

    const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
    const guilds = [config.DISCORD_GUILD_ID, config.DISCORD_TEST_GUILD_ID].filter(Boolean);
    for (const guildId of guilds) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, guildId),
          { body: commands },
        );
        console.log(`Slash commands registered for guild ${guildId}`);
      } catch (err) {
        console.error(`Failed to register slash commands for guild ${guildId}:`, err);
      }
    }

    // Start the live server status rotation
    startStatusUpdater(client);

    // Start calendar polling engine
    startCalendarPollers(client);
  });
}
