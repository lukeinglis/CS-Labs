/**
 * Win/loss records, sliced the ways people actually argue about them.
 *
 * Everything here is derived from who was on which team and which team won more
 * rounds, so all of it is safe to show publicly. Nothing in this file reads a kill,
 * a death or a damage figure, which is what makes the public side of the site able
 * to be genuinely interesting without being a stats-flexing leaderboard.
 */
import type { PublicMatch } from "./public";

export type Record = { wins: number; losses: number; draws: number };

/** A record plus the label it is broken down by, e.g. a map name or "3v3". */
export type SplitRecord = Record & { key: string; games: number };

/** How one player has fared alongside or across from one other player. */
export type Versus = {
  playerId: string;
  with: Record;
  against: Record;
};

export const EMPTY: Record = { wins: 0, losses: 0, draws: 0 };

export function games(r: Record): number {
  return r.wins + r.losses + r.draws;
}

/** Draws count as half, which is the usual convention and avoids a 0-0-1 player at 0%. */
export function winRate(r: Record): number {
  const n = games(r);
  return n === 0 ? 0 : (r.wins + r.draws * 0.5) / n;
}

function blank(): Record {
  return { wins: 0, losses: 0, draws: 0 };
}

function add(r: Record, outcome: Outcome): void {
  if (outcome === "win") r.wins += 1;
  else if (outcome === "loss") r.losses += 1;
  else r.draws += 1;
}

type Outcome = "win" | "loss" | "draw";

function outcomeFor(match: PublicMatch, teamIndex: 0 | 1): Outcome {
  const mine = match.teams[teamIndex].roundsWon;
  const theirs = match.teams[1 - teamIndex].roundsWon;
  if (mine > theirs) return "win";
  if (mine < theirs) return "loss";
  return "draw";
}

/**
 * The lobby shape, smaller side first, so a 4v3 and a 3v4 are the same bucket. Which
 * side was short is a property of the match, not of the format.
 */
export function teamSizeKey(match: PublicMatch): string {
  const a = match.teams[0].players.length;
  const b = match.teams[1].players.length;
  return a <= b ? `${a}v${b}` : `${b}v${a}`;
}

function teamIndexOf(match: PublicMatch, playerId: string): 0 | 1 | null {
  if (match.teams[0].players.some((p) => p.playerId === playerId)) return 0;
  if (match.teams[1].players.some((p) => p.playerId === playerId)) return 1;
  return null;
}

/** Voided matches never count, anywhere. */
function live(matches: PublicMatch[]): PublicMatch[] {
  return matches.filter((m) => !m.voided);
}

export function overallRecord(matches: PublicMatch[], playerId: string): Record {
  const out = blank();
  for (const match of live(matches)) {
    const i = teamIndexOf(match, playerId);
    if (i === null) continue;
    add(out, outcomeFor(match, i));
  }
  return out;
}

/**
 * Groups a player's matches by some label. Sorted by games played then alphabetically,
 * so the maps someone actually plays come first and ties stay stable between renders.
 */
function recordBy(
  matches: PublicMatch[],
  playerId: string,
  keyOf: (m: PublicMatch) => string
): SplitRecord[] {
  const byKey = new Map<string, Record>();

  for (const match of live(matches)) {
    const i = teamIndexOf(match, playerId);
    if (i === null) continue;
    const key = keyOf(match);
    if (!byKey.has(key)) byKey.set(key, blank());
    add(byKey.get(key)!, outcomeFor(match, i));
  }

  return [...byKey.entries()]
    .map(([key, r]) => ({ key, ...r, games: games(r) }))
    .sort((a, b) => b.games - a.games || a.key.localeCompare(b.key));
}

export function recordByMap(matches: PublicMatch[], playerId: string): SplitRecord[] {
  return recordBy(matches, playerId, (m) => m.map);
}

export function recordByTeamSize(
  matches: PublicMatch[],
  playerId: string
): SplitRecord[] {
  return recordBy(matches, playerId, teamSizeKey);
}

/**
 * How a player does with and against everyone they have shared a lobby with. One pass
 * over the matches fills both halves, since every other player in a match is either a
 * teammate or an opponent and the same match answers both questions at once.
 */
export function versusEveryone(
  matches: PublicMatch[],
  playerId: string
): Versus[] {
  const byOther = new Map<string, Versus>();

  const slot = (id: string): Versus => {
    if (!byOther.has(id)) {
      byOther.set(id, { playerId: id, with: blank(), against: blank() });
    }
    return byOther.get(id)!;
  };

  for (const match of live(matches)) {
    const mine = teamIndexOf(match, playerId);
    if (mine === null) continue;
    const outcome = outcomeFor(match, mine);

    for (const teammate of match.teams[mine].players) {
      if (teammate.playerId === playerId) continue;
      add(slot(teammate.playerId).with, outcome);
    }
    for (const opponent of match.teams[1 - mine].players) {
      add(slot(opponent.playerId).against, outcome);
    }
  }

  return [...byOther.values()].sort(
    (a, b) =>
      games(b.with) + games(b.against) - (games(a.with) + games(a.against)) ||
      a.playerId.localeCompare(b.playerId)
  );
}

/** Current run of the same result, as a signed count: +3 is three wins, -2 two losses. */
export function currentStreak(matches: PublicMatch[], playerId: string): number {
  const played = live(matches)
    .filter((m) => teamIndexOf(m, playerId) !== null)
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));

  let streak = 0;
  for (const match of played) {
    const outcome = outcomeFor(match, teamIndexOf(match, playerId)!);
    if (outcome === "draw") break;
    if (outcome === "win") {
      if (streak < 0) break;
      streak += 1;
    } else {
      if (streak > 0) break;
      streak -= 1;
    }
  }
  return streak;
}
