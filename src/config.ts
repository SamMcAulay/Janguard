function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

export const config = {
  DISCORD_TOKEN: required('DISCORD_TOKEN'),
  DISCORD_CLIENT_ID: required('DISCORD_CLIENT_ID'),
  DISCORD_PREMIUM_ROLE_ID: required('DISCORD_PREMIUM_ROLE_ID'),
  DISCORD_GUILD_ID: required('DISCORD_GUILD_ID'),
  STEAM_API_KEY: required('STEAM_API_KEY'),
  BATTLEMETRICS_TOKEN: required('BATTLEMETRICS_TOKEN'),
  HLL_SERVER_ID: required('HLL_SERVER_ID'),
  ARMA_SERVER_ID: process.env.ARMA_SERVER_ID || '', // placeholder — not live yet
  BM_RESERVED_LIST_ID: required('BM_RESERVED_LIST_ID'),
  DATABASE_URL: required('DATABASE_URL'),
  BASE_URL: required('BASE_URL'),
  PORT: parseInt(process.env.PORT || '3000', 10),
  SESSION_SECRET: required('SESSION_SECRET'),
};
