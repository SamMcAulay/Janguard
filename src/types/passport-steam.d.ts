declare module 'passport-steam' {
  import { Strategy } from 'passport';

  interface SteamStrategyOptions {
    returnURL: string;
    realm: string;
    apiKey: string;
  }

  type VerifyCallback = (
    identifier: string,
    profile: any,
    done: (err: any, user?: any) => void,
  ) => void;

  class SteamStrategy extends Strategy {
    constructor(options: SteamStrategyOptions, verify: VerifyCallback);
  }

  export = SteamStrategy;
}
