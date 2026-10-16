import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { exactFingerprint, looseFingerprint } from "./fingerprint";
import { normalizeName } from "./names";
import type { MatchRecord, Player } from "./types";

const PLAYERS = "players";
const MATCHES = "matches";
const ALIASES = "aliases";

export function isStoreConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// Built on first use rather than at module scope, so a build without the credentials
// present does not crash while Next.js evaluates this module.
let client: Redis | null = null;

/**
 * Redis.fromEnv() is not usable here: the Vercel Marketplace injects the Upstash
 * credentials under KV_REST_API_*, not the UPSTASH_REDIS_REST_* names it looks for.
 */
function getKv(): Redis {
  if (!isStoreConfigured()) {
    throw new Error(
      "Redis is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN."
    );
  }
  client ??= new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });
  return client;
}

/** mget has a request size ceiling, and the match log only grows. */
async function mgetAll<T>(keys: string[]): Promise<T[]> {
  if (keys.length === 0) return [];
  const db = getKv();
  const out: T[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const batch = await db.mget<(T | null)[]>(keys.slice(i, i + 100));
    for (const value of batch) if (value !== null) out.push(value);
  }
  return out;
}

// ── Players ──

export async function getPlayers(): Promise<Player[]> {
  const ids = await getKv().smembers<string[]>(PLAYERS);
  const players = await mgetAll<Player>(ids.map((id) => `player:${id}`));
  return players.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getPlayer(id: string): Promise<Player | null> {
  return getKv().get<Player>(`player:${id}`);
}

export async function savePlayer(player: Player): Promise<void> {
  const db = getKv();
  await Promise.all([
    db.set(`player:${player.id}`, player),
    db.sadd(PLAYERS, player.id),
    db.hset(ALIASES, { [normalizeName(player.displayName)]: player.id }),
  ]);
}

// ── Aliases ──

/** Maps an in-game name as it appeared on a scoreboard to a roster player. */
export async function resolveName(name: string): Promise<string | null> {
  const aliases = await getAliases();
  return aliases[normalizeName(name)] ?? null;
}

export async function getAliases(): Promise<Record<string, string>> {
  return (await getKv().hgetall<Record<string, string>>(ALIASES)) ?? {};
}

export async function setAlias(name: string, playerId: string): Promise<void> {
  await getKv().hset(ALIASES, { [normalizeName(name)]: playerId });
}

export async function removeAlias(name: string): Promise<void> {
  await getKv().hdel(ALIASES, normalizeName(name));
}

// ── Matches ──

export async function getMatches(): Promise<MatchRecord[]> {
  const ids = await getKv().smembers<string[]>(MATCHES);
  const matches = await mgetAll<MatchRecord>(ids.map((id) => `match:${id}`));
  return matches.sort((a, b) => a.playedAt.localeCompare(b.playedAt));
}

export async function getMatch(id: string): Promise<MatchRecord | null> {
  return getKv().get<MatchRecord>(`match:${id}`);
}

export type DuplicateHit = {
  matchId: string;
  /** "exact" means every stat line matches, which only happens on a resubmission. */
  confidence: "exact" | "likely";
};

export async function findDuplicate(
  match: MatchRecord
): Promise<DuplicateHit | null> {
  const db = getKv();
  const [exact, loose] = await Promise.all([
    db.get<string>(`fp-exact:${exactFingerprint(match)}`),
    db.get<string>(`fp-loose:${looseFingerprint(match)}`),
  ]);
  if (exact && exact !== match.id) return { matchId: exact, confidence: "exact" };
  if (loose && loose !== match.id) return { matchId: loose, confidence: "likely" };
  return null;
}

export async function saveMatch(match: MatchRecord): Promise<void> {
  const db = getKv();
  await Promise.all([
    db.set(`match:${match.id}`, match),
    db.sadd(MATCHES, match.id),
    db.set(`fp-exact:${exactFingerprint(match)}`, match.id),
    db.set(`fp-loose:${looseFingerprint(match)}`, match.id),
    // Every version is kept so a disputed correction can be audited later. The random
    // suffix is what makes that true: an ISO timestamp alone collides for two saves in
    // the same millisecond, and the later one would quietly replace the earlier in the
    // history. The timestamp still leads, so the keys sort chronologically.
    db.set(
      `match-rev:${match.id}:${new Date().toISOString()}-${randomUUID().slice(0, 8)}`,
      match
    ),
  ]);
}

/**
 * Voiding is a correction, not a delete. The match keeps its URL and its stat lines and
 * simply stops counting towards anyone's rating, which is what you want for a game that
 * was mis-recorded or abandoned: the evidence stays, the consequence goes.
 *
 * `reason` ends up on the public match page, so it is written for the group to read.
 */
export async function voidMatch(
  id: string,
  reason: string,
  by: string
): Promise<MatchRecord | null> {
  const match = await getMatch(id);
  if (!match) return null;
  const voided: MatchRecord = { ...match, voided: true, voidReason: reason, voidedBy: by };
  await saveMatch(voided);
  return voided;
}

/**
 * Puts a voided match back into the ratings.
 *
 * The three void fields are deleted rather than set to false, so a restored record is
 * shaped exactly like one that was never voided. Nothing downstream then has to tell
 * "false" apart from "absent", and a stale reason cannot sit around on a live match.
 * The previous state is still readable in the `match-rev:` history either way.
 */
export async function restoreMatch(id: string): Promise<MatchRecord | null> {
  const match = await getMatch(id);
  if (!match) return null;
  const restored: MatchRecord = { ...match };
  delete restored.voided;
  delete restored.voidReason;
  delete restored.voidedBy;
  await saveMatch(restored);
  return restored;
}
