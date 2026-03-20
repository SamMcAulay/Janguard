import { GuildMember, PartialGuildMember } from 'discord.js';
import { config } from '../../config';
import { prisma } from '../../db';
import { removePlayerFromReservedSlot } from '../../services/battlemetrics';

export function registerGuildMemberUpdateEvent(): void {
  const { client } = require('../client');

  client.on('guildMemberUpdate', async (oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) => {
    try {
      const hadRole = oldMember.roles.cache.has(config.DISCORD_PREMIUM_ROLE_ID);
      const hasRole = newMember.roles.cache.has(config.DISCORD_PREMIUM_ROLE_ID);

      // Only act when role is removed
      if (!hadRole || hasRole) return;

      const user = await prisma.user.findUnique({
        where: { discordId: newMember.id },
      });

      if (!user || !user.isVip) return;

      console.log(`Revoking VIP for ${newMember.user.tag} (Steam: ${user.steamId})`);

      await removePlayerFromReservedSlot(user.steamId);

      await prisma.user.update({
        where: { discordId: newMember.id },
        data: { isVip: false },
      });

      try {
        await newMember.send(
          'Your Premium role has been removed, so your VIP reserved slot has been revoked. If you believe this is an error, please contact a server admin.',
        );
      } catch {
        console.warn(`Could not DM ${newMember.user.tag} about VIP revocation`);
      }
    } catch (err) {
      console.error('Error handling guildMemberUpdate:', err);
    }
  });
}
