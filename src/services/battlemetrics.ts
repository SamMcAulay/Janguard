import axios, { AxiosError } from 'axios';
import { config } from '../config';

const api = axios.create({
  baseURL: 'https://api.battlemetrics.com',
  headers: {
    Authorization: `Bearer ${config.BATTLEMETRICS_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

// ---------- Reserved Slot Management ----------

export async function addPlayerToReservedSlot(steamId: string, discordTag?: string): Promise<void> {
  const payload = {
    data: {
      type: 'reservedSlot',
      attributes: {
        expires: null, // no expiry — managed by role revocation
        note: discordTag ? `Discord: ${discordTag}` : 'Managed by JanGuard',
        identifiers: [
          {
            type: 'steamID',
            identifier: steamId,
            manual: true,
          },
        ],
      },
      relationships: {
        servers: {
          data: [
            {
              type: 'server',
              id: config.HLL_SERVER_ID,
            },
          ],
        },
        organization: {
          data: {
            type: 'organization',
            id: config.BM_ORGANIZATION_ID,
          },
        },
      },
    },
  };

  try {
    await api.post('/reserved-slots', payload);
    console.log(`Added reserved slot for Steam ID ${steamId}`);
  } catch (err) {
    const axErr = err as AxiosError;
    if (axErr.response) {
      console.error(
        `BattleMetrics add failed (${axErr.response.status}):`,
        JSON.stringify(axErr.response.data),
      );
    }
    throw err;
  }
}

export async function removePlayerFromReservedSlot(steamId: string): Promise<void> {
  try {
    // Step 1: Find the reserved slot by searching for the steam ID
    const searchRes = await api.get('/reserved-slots', {
      params: {
        'filter[search]': steamId,
        'filter[server]': config.HLL_SERVER_ID,
      },
    });

    const slots = searchRes.data?.data;
    if (!slots || slots.length === 0) {
      console.warn(`No reserved slot found for Steam ID ${steamId}`);
      return;
    }

    const reservedSlotId = slots[0].id;

    // Step 2: Delete by the BattleMetrics reserved slot ID
    await api.delete(`/reserved-slots/${reservedSlotId}`);
    console.log(`Removed reserved slot for Steam ID ${steamId} (slot ID: ${reservedSlotId})`);
  } catch (err) {
    const axErr = err as AxiosError;
    if (axErr.response) {
      console.error(
        `BattleMetrics remove failed (${axErr.response.status}):`,
        JSON.stringify(axErr.response.data),
      );
    }
    throw err;
  }
}

// ---------- Server Info ----------

interface ServerStatus {
  name: string;
  players: number;
  maxPlayers: number;
  map: string;
}

export async function getServerStatus(serverId: string): Promise<ServerStatus | null> {
  if (!serverId) return null;

  try {
    const res = await api.get(`/servers/${serverId}`);
    const attrs = res.data?.data?.attributes;

    return {
      name: attrs.name,
      players: attrs.players,
      maxPlayers: attrs.maxPlayers,
      map: attrs.details?.map || attrs.details?.mission || 'Unknown',
    };
  } catch (err) {
    const axErr = err as AxiosError;
    console.error(
      `Failed to fetch server ${serverId}:`,
      axErr.response?.status,
      axErr.message,
    );
    return null;
  }
}
