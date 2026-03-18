import { ActivityType, Client } from 'discord.js';
import { config } from '../config';
import { getServerStatus } from './battlemetrics';

const INTERVAL_MS = 150_000; // 2.5 minutes
let showHll = true;

export function startStatusUpdater(client: Client): void {
  async function update() {
    try {
      if (showHll || !config.ARMA_SERVER_ID) {
        // HLL turn (or fallback when Arma isn't configured)
        const hll = await getServerStatus(config.HLL_SERVER_ID);
        if (hll) {
          client.user?.setActivity({
            name: `HLL: ${hll.players}/${hll.maxPlayers} on ${hll.map}`,
            type: ActivityType.Watching,
          });
        }
      } else {
        // Arma turn
        const arma = await getServerStatus(config.ARMA_SERVER_ID);
        if (arma) {
          client.user?.setActivity({
            name: `Arma: ${arma.players}/${arma.maxPlayers} on ${arma.map}`,
            type: ActivityType.Watching,
          });
        } else {
          // Arma failed — fall back to HLL
          const hll = await getServerStatus(config.HLL_SERVER_ID);
          if (hll) {
            client.user?.setActivity({
              name: `HLL: ${hll.players}/${hll.maxPlayers} on ${hll.map}`,
              type: ActivityType.Watching,
            });
          }
        }
      }
    } catch (err) {
      console.error('Status update error:', err);
    }

    // Toggle for next tick (only matters when Arma is configured)
    showHll = !showHll;
  }

  // Run immediately, then on interval
  update();
  setInterval(update, INTERVAL_MS);
  console.log('Status updater started (every 150s)');
}
