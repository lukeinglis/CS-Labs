import { normalizeName } from "./names";
import type { MatchRecord, MatchSource, MatchTeam, Side } from "./types";

/**
 * A match as it exists while someone is still editing it: handles have not necessarily
 * been matched to roster players yet, and the numbers may not add up. Everything that
 * reaches storage goes through validateDraft first.
 */
/**
 * Stands in for a roster id while the submitter is still editing. The server swaps it
 * for a real id, so a draft carrying this is valid but a MatchRecord never is.
 */
export const NEW_PLAYER = "__new__";

export type DraftStatLine = {
  /** The handle exactly as it appeared on the scoreboard. */
  name: string;
  /** A roster id, or NEW_PLAYER to add this handle to the roster on save. */
  playerId?: string;
  kills: number;
  assists: number;
  deaths: number;
  damage: number;
  headshotPct?: number;
  joinedLate?: boolean;
};

export type DraftTeam = {
  label: string;
  startingSide: Side;
  roundsWon: number;
  players: DraftStatLine[];
};

export type DraftMatch = {
  playedAt: string;
  map: string;
  teams: [DraftTeam, DraftTeam];
};

export function roundsPlayed(draft: DraftMatch): number {
  return draft.teams[0].roundsWon + draft.teams[1].roundsWon;
}

function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Everything that would make a match nonsensical rather than merely surprising. Returns
 * human-readable problems so the confirm step can list them all at once instead of
 * rejecting on the first one.
 */
export function validateDraft(draft: DraftMatch): string[] {
  const errors: string[] = [];

  if (!draft.map.trim()) errors.push("Pick a map.");
  if (Number.isNaN(Date.parse(draft.playedAt))) errors.push("Pick when it was played.");

  if (draft.teams[0].startingSide === draft.teams[1].startingSide) {
    errors.push("The two teams cannot have started on the same side.");
  }

  const rounds = roundsPlayed(draft);
  if (rounds < 1) errors.push("A match needs at least one round.");

  for (const team of draft.teams) {
    if (!isCount(team.roundsWon)) {
      errors.push(`Team ${team.label}: rounds won must be a whole number.`);
    }
    if (team.players.length < 1) {
      errors.push(`Team ${team.label} has nobody on it.`);
    }
  }

  const lines = draft.teams.flatMap((t) => t.players);

  for (const line of lines) {
    const who = line.name.trim() || "An unnamed player";
    if (!line.name.trim()) errors.push("Every row needs a name.");
    if (!line.playerId) errors.push(`${who} is not matched to anyone on the roster.`);
    if (![line.kills, line.assists, line.deaths, line.damage].every(isCount)) {
      errors.push(`${who}: stats must be whole numbers and cannot be negative.`);
    }
    // A player cannot die more often than there were rounds, so this catches both a
    // misread scoreboard and a round count that was entered wrong.
    if (rounds >= 1 && line.deaths > rounds && !line.joinedLate) {
      errors.push(`${who}: ${line.deaths} deaths in ${rounds} rounds is impossible.`);
    }
    if (line.headshotPct !== undefined && (line.headshotPct < 0 || line.headshotPct > 100)) {
      errors.push(`${who}: headshot percentage must be between 0 and 100.`);
    }
  }

  const ids = lines.map((l) => l.playerId).filter((id) => id && id !== NEW_PLAYER);
  if (ids.some((id, i) => ids.indexOf(id) !== i)) {
    errors.push("The same player is on the scoreboard twice.");
  }

  // Two rows both adding a new player under the same handle would silently become one
  // roster entry playing for both teams.
  const fresh = lines
    .filter((l) => l.playerId === NEW_PLAYER)
    .map((l) => normalizeName(l.name));
  if (fresh.some((name, i) => fresh.indexOf(name) !== i)) {
    errors.push("Two rows are adding the same new player.");
  }

  return errors;
}

/** Match ids are prefixed so they can never be read back from Redis as a number. */
export function newMatchId(now = new Date(), rand = Math.random): string {
  return `m-${now.getTime().toString(36)}-${Math.floor(rand() * 1e6).toString(36)}`;
}

/** Player ids are prefixed for the same reason, and kept readable for debugging. */
export function newPlayerId(displayName: string, taken: Set<string>): string {
  const base = `p-${normalizeName(displayName).slice(0, 24) || "player"}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function toMatchRecord(
  draft: DraftMatch,
  meta: { id: string; submittedBy: string; submittedAt: string; source: MatchSource }
): MatchRecord {
  const teams = draft.teams.map(
    (team): MatchTeam => ({
      label: team.label,
      startingSide: team.startingSide,
      roundsWon: team.roundsWon,
      players: team.players.map((line) => ({
        playerId: line.playerId!,
        kills: line.kills,
        assists: line.assists,
        deaths: line.deaths,
        damage: line.damage,
        ...(line.headshotPct !== undefined && { headshotPct: line.headshotPct }),
        ...(line.joinedLate && { joinedLate: true }),
      })),
    })
  );

  return {
    id: meta.id,
    playedAt: new Date(draft.playedAt).toISOString(),
    map: draft.map.trim(),
    roundsPlayed: roundsPlayed(draft),
    teams: [teams[0], teams[1]],
    submittedBy: meta.submittedBy,
    submittedAt: meta.submittedAt,
    source: meta.source,
  };
}
