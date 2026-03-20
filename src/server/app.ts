import express from 'express';
import session from 'express-session';
import { config } from '../config';
import { passport } from './auth';
import { steamRoutes } from './routes/steam';

export function createServer(): express.Express {
  const app = express();

  app.set('trust proxy', 1); // Railway is behind a proxy

  app.use(
    session({
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
      cookie: {
        secure: true,    // Railway provides HTTPS
        maxAge: 600_000, // 10 minutes — plenty for auth flow
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // Health check for Railway
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Steam auth routes
  app.use(steamRoutes);

  return app;
}
