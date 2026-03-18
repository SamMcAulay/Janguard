import passport from 'passport';
import SteamStrategy from 'passport-steam';
import { config } from '../config';

passport.serializeUser((user: any, done) => {
  done(null, user);
});

passport.deserializeUser((obj: any, done) => {
  done(null, obj);
});

passport.use(
  new SteamStrategy(
    {
      returnURL: `${config.BASE_URL}/auth/steam/return`,
      realm: config.BASE_URL,
      apiKey: config.STEAM_API_KEY,
    },
    (_identifier: string, profile: any, done: any) => {
      // profile._json.steamid is the SteamID64
      return done(null, profile);
    },
  ),
);

export { passport };
