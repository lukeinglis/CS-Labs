import { createHash } from "node:crypto";
import type { MatchRecord, MatchTeam } from "./types";

function hash(parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
}

function teamBlock(team: MatchTeam): string {
  const lines = team.players
    .map((p) => `${p.playerId},${p.kills},${p.assists},${p.deaths},${p.damage}`)
    .sort();
  return `${team.roundsWon}|${lines.join(";")}`;
}

/**
 * Identical stat lines for every player is not something two different games produce,
 * so a collision here means the same match was submitted twice. Team order and
 * within-team player order are normalised away, since two submitters can disagree on
 * which side was "team A".
 */
export function exactFingerprint(match: MatchRecord): string {
  return hash([match.map.toLowerCase(), ...match.teams.map(teamBlock).sort()]);
}

/**
 * The same roster, map, score and day. Strong enough to warn on, but the group really
 * could play Mirage 13-7 twice in one night, so this is a prompt rather than a verdict.
 */
export function looseFingerprint(match: MatchRecord): string {
  const ids = match.teams
    .flatMap((t) => t.players.map((p) => p.playerId))
    .sort();
  const scores = match.teams.map((t) => t.roundsWon).sort((a, b) => a - b);
  return hash([
    match.map.toLowerCase(),
    match.playedAt.slice(0, 10),
    scores.join("-"),
    ids.join(";"),
  ]);
}
