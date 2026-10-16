import { readFile } from "node:fs/promises";
import path from "node:path";
import { ranking } from "../../cs-labs.config";
import {
  toPublicMatch,
  toPublicRating,
  type PublicMatch,
  type PublicRating,
} from "./public";
import { computeRatings } from "./ranking";
import { isAdmin } from "./session";
import { getMatches, getPlayers, isStoreConfigured } from "./storage";
import type { MatchRecord, Player, PlayerRating } from "./types";

export type RankedPlayer = PlayerRating & { displayName: string };

/** A player as a public page is allowed to see them: record and team rating only. */
export type PublicRankedPlayer = PublicRating & { displayName: string };

/**
 * Lets the site run locally before Redis is provisioned: drop matches.json and
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
  const matches = isStoreConfigured()
    ? await getMatches()
    : await readLocal<MatchRecord>("matches.json");
  return matches.slice().sort((a, b) => a.playedAt.localeCompare(b.playedAt));
}

export async function loadPlayers(): Promise<Player[]> {
  return isStoreConfigured() ? getPlayers() : readLocal<Player>("players.json");
}

/**
 * The full read model, individual performance included. Private.
 *
 * The admin check lives here rather than only in the pages, because a page that
 * forgets to check is a privacy bug and a loader that forgets to refuse is a
 * single point to audit. Callers that have already checked pass `assumeAdmin` so a
 * route does not pay for the cookie read twice.
 */
export async function loadRankings({
  assumeAdmin = false,
}: { assumeAdmin?: boolean } = {}): Promise<{
  ranked: RankedPlayer[];
  matches: MatchRecord[];
}> {
  if (!assumeAdmin && !(await isAdmin())) {
    throw new Error("loadRankings is private; use loadPublicRankings.");
  }

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

/**
 * The same read model with every performance-derived field removed, which is what
 * every public page gets. Ranked by `teamRating`: that number comes from round
 * scores through openskill and never sees a kill, so ordering by it is still only
 * ordering by games won and lost.
 */
export async function loadPublicRankings(): Promise<{
  ranked: PublicRankedPlayer[];
  matches: PublicMatch[];
}> {
  const [matches, players] = await Promise.all([loadMatches(), loadPlayers()]);
  const names = new Map(players.map((p) => [p.id, p.displayName]));
  const ratings = computeRatings(matches, ranking, new Date().toISOString());

  return {
    matches: matches.map(toPublicMatch),
    ranked: ratings
      .map((r) => ({
        ...toPublicRating(r),
        displayName: names.get(r.playerId) ?? r.playerId,
      }))
      .sort((a, b) => b.teamRating - a.teamRating),
  };
}

/** Public match list, stats and screenshot link stripped. */
export async function loadPublicMatches(): Promise<PublicMatch[]> {
  return (await loadMatches()).map(toPublicMatch);
}
