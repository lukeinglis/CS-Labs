import { readFile } from "node:fs/promises";
import path from "node:path";
import { ranking } from "../../cs-labs.config";
import { computeRatings } from "./ranking";
import { getMatches, getPlayers, isKvConfigured } from "./storage";
import type { MatchRecord, Player, PlayerRating } from "./types";

export type RankedPlayer = PlayerRating & { displayName: string };

/**
 * Lets the site run locally before Vercel KV is provisioned: drop matches.json and
 * players.json into .data/ and the read model picks them up. Never consulted in
 * production, so there is no path where fixture data reaches the real site.
 */
async function readLocal<T>(file: string): Promise<T[]> {
  if (process.env.NODE_ENV === "production") return [];
  try {
    const raw = await readFile(path.join(process.cwd(), ".data", file), "utf8");
    return JSON.parse(raw) as T[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function loadMatches(): Promise<MatchRecord[]> {
  const matches = isKvConfigured()
    ? await getMatches()
    : await readLocal<MatchRecord>("matches.json");
  return matches.slice().sort((a, b) => a.playedAt.localeCompare(b.playedAt));
}

export async function loadPlayers(): Promise<Player[]> {
  return isKvConfigured() ? getPlayers() : readLocal<Player>("players.json");
}

export async function loadRankings(): Promise<{
  ranked: RankedPlayer[];
  matches: MatchRecord[];
}> {
  const [matches, players] = await Promise.all([loadMatches(), loadPlayers()]);
  const names = new Map(players.map((p) => [p.id, p.displayName]));
  const ratings = computeRatings(matches, ranking, new Date().toISOString());

  return {
    matches,
    ranked: ratings.map((r) => ({
      ...r,
      displayName: names.get(r.playerId) ?? r.playerId,
    })),
  };
}
