/**
 * The private half of the read model: the per-player numbers that the public
 * projections in `public.ts` strip out.
 *
 * Shapes here are keyed by id and handed to components as separate props rather than
 * folded into a match or a player. That is deliberate. A component whose match type
 * has nowhere to put a kill count cannot leak one, so the only way a stat reaches the
 * browser is a caller explicitly passing one of these maps, and every caller that does
 * is a route under `/admin`.
 */
import "server-only";

import { ranking } from "../../cs-labs.config";
import { adr, computeMatchPerf } from "./ranking";
import type { MatchRecord } from "./types";

/** One player's line in one match. */
export type StatLine = {
  kills: number;
  assists: number;
  deaths: number;
  adr: number;
  /** Output relative to the rest of that lobby. 1.00 is exactly average. */
  perf: number;
};

/** Every line in one match, keyed by player id. */
export type StatColumns = Record<string, StatLine>;

export function statColumnsFor(match: MatchRecord): StatColumns {
  const perf = computeMatchPerf(match, ranking);
  const rounds = match.roundsPlayed;

  return Object.fromEntries(
    match.teams.flatMap((team) =>
      team.players.map((line) => [
        line.playerId,
        {
          kills: line.kills,
          assists: line.assists,
          deaths: line.deaths,
          adr: adr(line, rounds),
          perf: perf.get(line.playerId) ?? 1,
        },
      ])
    )
  );
}

/**
 * One player's line in every match they played, keyed by match id, which is what a
 * player page needs to show a performance history down the side of their results.
 */
export function statHistoryFor(
  matches: MatchRecord[],
  playerId: string
): Record<string, StatLine> {
  const out: Record<string, StatLine> = {};
  for (const match of matches) {
    const line = statColumnsFor(match)[playerId];
    if (line) out[match.id] = line;
  }
  return out;
}
