import axios, { AxiosError } from 'axios';
import { config } from '../config';

const api = axios.create({
  baseURL: 'https://api.battlemetrics.com',
  headers: {
    Authorization: `Bearer ${config.BATTLEMETRICS_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

// ---------- VIP Management (RCON via BattleMetrics) ----------

export async function addVip(steamId: string, discordId: string): Promise<void> {
  const payload = {
    data: {
      type: 'rconCommand',
      attributes: {
        command: 'hll:vipadd',
        options: {
          platformID: steamId,
          description: discordId,
        },
      },
    },
  };

  try {
    await api.post(`/servers/${config.HLL_SERVER_ID}/command`, payload);
    console.log(`Added VIP for Steam ID ${steamId} (Discord: ${discordId})`);
  } catch (err) {
    const axErr = err as AxiosError;
    if (axErr.response) {
      console.error(
        `BattleMetrics VipAdd failed (${axErr.response.status}):`,
        JSON.stringify(axErr.response.data),
      );
    }
    throw err;
  }
}

export async function removeVip(steamId: string): Promise<void> {
  const payload = {
    data: {
      type: 'rconCommand',
      attributes: {
        command: 'hll:vipdel',
        options: {
          platformID: steamId,
        },
      },
    },
  };

  try {
    await api.post(`/servers/${config.HLL_SERVER_ID}/command`, payload);
    console.log(`Removed VIP for Steam ID ${steamId}`);
  } catch (err) {
    const axErr = err as AxiosError;
    if (axErr.response) {
      console.error(
        `BattleMetrics VipDel failed (${axErr.response.status}):`,
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
