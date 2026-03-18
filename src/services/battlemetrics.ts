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

export async function addPlayerToReservedList(steamId: string): Promise<void> {
  const url = `/reserved-player-lists/${config.BM_RESERVED_LIST_ID}/players`;

  const payload = {
    data: {
      type: 'reservedPlayer',
      attributes: {
        identifiers: [
          {
            type: 'steamID',
            identifier: steamId,
            manual: true,
          },
        ],
      },
    },
  };

  try {
    await api.post(url, payload);
    console.log(`Added ${steamId} to reserved list`);
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

export async function removePlayerFromReservedList(steamId: string): Promise<void> {
  // Step 1: Find the reservedPlayer entry by searching for the steamId
  const searchUrl = `/reserved-player-lists/${config.BM_RESERVED_LIST_ID}/players`;

  try {
    const searchRes = await api.get(searchUrl, {
      params: { 'filter[search]': steamId },
    });

    const players = searchRes.data?.data;
    if (!players || players.length === 0) {
      console.warn(`No reserved player found for steamId ${steamId}`);
      return;
    }

    const reservedPlayerId = players[0].id;

    // Step 2: Delete by the BattleMetrics reservedPlayer ID
    await api.delete(`${searchUrl}/${reservedPlayerId}`);
    console.log(`Removed ${steamId} (BM ID: ${reservedPlayerId}) from reserved list`);
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
