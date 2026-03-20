import { Router, Request, Response, NextFunction } from 'express';
import { passport } from '../auth';
import { config } from '../../config';
import { prisma } from '../../db';
import { client } from '../../bot/client';
import { addPlayerToReservedSlot } from '../../services/battlemetrics';
const router = Router();

// Step 1: User clicks link — capture discordId, then redirect to Steam
router.get('/auth/steam', (req: Request, res: Response, next: NextFunction) => {
  const discordId = req.query.discordId as string | undefined;
  const guildId = (req.query.guildId as string) || '';
  if (!discordId) {
    res.status(400).send(errorPage('Missing discordId parameter.'));
    return;
  }

  // Store in session (now backed by PostgreSQL — persists across redirects)
  (req.session as any).discordId = discordId;
  (req.session as any).guildId = guildId;

  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      res.status(500).send(errorPage('Failed to initialize session.'));
      return;
    }
    passport.authenticate('steam')(req, res, next);
  });
});

// Step 2: Steam redirects back here after auth
// Use middleware to save session data before passport regenerates the session
router.get(
  '/auth/steam/return',
  (req: Request, _res: Response, next: NextFunction) => {
    // Capture session data before passport.authenticate regenerates the session
    const discordId = (req.session as any).discordId;
    const guildId = (req.session as any).guildId;
    (req as any)._authContext = { discordId, guildId };
    next();
  },
  passport.authenticate('steam', { failureRedirect: '/auth/failed' }),
  async (req: Request, res: Response) => {
    try {
      const steamProfile = req.user as any;
      const steamId: string = steamProfile._json.steamid;

      const { discordId, guildId: rawGuildId } = (req as any)._authContext || {};
      const guildId: string = rawGuildId || '';

      if (!discordId) {
        console.error('Auth return: no discordId found. Session:', JSON.stringify(req.session));
        res.status(400).send(errorPage('Session expired. Please try again from Discord.'));
        return;
      }

      const isTestGuild = config.DISCORD_TEST_GUILD_ID && guildId === config.DISCORD_TEST_GUILD_ID;

      // Verify the user has the Premium role (skip for test guild)
      const targetGuildId = isTestGuild ? config.DISCORD_TEST_GUILD_ID : config.DISCORD_GUILD_ID;
      const guild = client.guilds.cache.get(targetGuildId);
      if (!guild) {
        res.status(500).send(errorPage('Bot cannot access the server. Contact an admin.'));
        return;
      }

      let member;
      try {
        member = await guild.members.fetch(discordId);
      } catch {
        res.status(404).send(errorPage('Could not find your Discord account in the server.'));
        return;
      }

      if (!isTestGuild) {
        const hasRole = member.roles.cache.has(config.DISCORD_PREMIUM_ROLE_ID);

        if (!hasRole) {
          res.status(403).send(
            errorPage(
              'You do not have the Premium role required for VIP.<br><br>' +
              'Purchase VIP at <a href="https://teg.gg" target="_blank">Teg.gg</a> to get started.',
            ),
          );
          return;
        }
      }

      // Upsert user in database
      await prisma.user.upsert({
        where: { discordId },
        update: { steamId, isVip: true },
        create: { discordId, steamId, isVip: true },
      });

      // Add to BattleMetrics reserved list
      await addPlayerToReservedSlot(steamId);

      // DM the user
      try {
        await member.send(
          `Your VIP reserved slot is now **active**! Steam ID \`${steamId}\` has been linked to your account.`,
        );
      } catch {
        console.warn(`Could not DM ${member.user.tag}`);
      }

      res.send(successPage(member.user.tag, steamId));
    } catch (err) {
      console.error('Auth return error:', err);
      res.status(500).send(errorPage('An internal error occurred. Please try again later.'));
    }
  },
);

router.get('/auth/failed', (_req: Request, res: Response) => {
  res.status(401).send(errorPage('Steam authentication failed. Please try again.'));
});

// ---------- HTML Templates ----------

function successPage(discordTag: string, steamId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VIP Activated - JanGuard</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #16213e; border-radius: 12px; padding: 2.5rem; max-width: 420px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
    h1 { color: #4ecca3; margin-top: 0; }
    .detail { background: #0f3460; padding: 0.75rem 1rem; border-radius: 8px; margin: 0.5rem 0; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>VIP Activated</h1>
    <p>Your reserved slot is now active. You can close this page.</p>
    <div class="detail"><strong>Discord:</strong> ${escapeHtml(discordTag)}</div>
    <div class="detail"><strong>Steam ID:</strong> ${escapeHtml(steamId)}</div>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - JanGuard</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #16213e; border-radius: 12px; padding: 2.5rem; max-width: 420px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
    h1 { color: #e74c3c; margin-top: 0; }
    a { color: #4ecca3; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Error</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { router as steamRoutes };
