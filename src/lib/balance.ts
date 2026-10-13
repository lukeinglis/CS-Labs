import { predictWin } from "openskill";
import type { MatchRecord } from "./types";

export type BalancePlayer = {
  playerId: string;
  mu: number;
  sigma: number;
};

export type BalanceConstraints = {
  /** Pairs that must land on the same team. */
  together?: [string, string][];
  /** Pairs that must be split across teams. */
  apart?: [string, string][];
};

export type SplitCandidate = {
  teamA: string[];
  teamB: string[];
  /** Predicted win probability for team A. */
  winProbability: number;
  /** 1.0 is a perfect coin flip, 0.0 is a guaranteed result. */
  fairness: number;
  /** How often these specific teammates have already been stacked together. */
  repeats: number;
  score: number;
};

export type BalanceOptions = {
  constraints?: BalanceConstraints;
  pairCounts?: Map<string, number>;
  /** How much to trade fairness away in order to break up habitual stacks. */
  varietyWeight?: number;
  /** Size of team A. Defaults to an even split, rounded down. */
  teamSize?: number;
  limit?: number;
  maxCombinations?: number;
};

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Counts how often each pair of players has been on the same team. */
export function buildPairCounts(
  matches: MatchRecord[],
  recentMatches?: number
): Map<string, number> {
  const counts = new Map<string, number>();
  const ordered = matches
    .filter((m) => !m.voided)
    .slice()
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  const considered =
    recentMatches === undefined ? ordered : ordered.slice(0, recentMatches);

  for (const match of considered) {
    for (const team of match.teams) {
      const ids = team.players.map((p) => p.playerId);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = pairKey(ids[i], ids[j]);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

function violatesConstraints(
  teamA: Set<string>,
  constraints: BalanceConstraints | undefined
): boolean {
  if (!constraints) return false;

  for (const [a, b] of constraints.together ?? []) {
    if (teamA.has(a) !== teamA.has(b)) return true;
  }
  for (const [a, b] of constraints.apart ?? []) {
    if (teamA.has(a) === teamA.has(b)) return true;
  }
  return false;
}

function countRepeats(ids: string[], pairCounts: Map<string, number>): number {
  let total = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      total += pairCounts.get(pairKey(ids[i], ids[j])) ?? 0;
    }
  }
  return total;
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
  }
  return Math.round(result);
}

/**
 * Enumerates index subsets of a given size. When the two teams are the same size
 * the first player is pinned to team A, which removes mirror-image duplicates.
 */
function* subsets(n: number, k: number, pinFirst: boolean): Generator<number[]> {
  const combo: number[] = [];

  function* walk(start: number): Generator<number[]> {
    if (combo.length === k) {
      yield [...combo];
      return;
    }
    for (let i = start; i < n; i++) {
      if (n - i < k - combo.length) break;
      combo.push(i);
      yield* walk(i + 1);
      combo.pop();
    }
  }

  if (pinFirst) {
    combo.push(0);
    yield* walk(1);
  } else {
    yield* walk(0);
  }
}

/**
 * Brute-forces every legal way to split the present players and scores each one on
 * predicted fairness, optionally trading some fairness to avoid repeat stacks.
 */
export function generateSplits(
  players: BalancePlayer[],
  options: BalanceOptions = {}
): SplitCandidate[] {
  const n = players.length;
  if (n < 2) return [];

  const sizeA = options.teamSize ?? Math.floor(n / 2);
  if (sizeA < 1 || sizeA >= n) return [];

  const varietyWeight = options.varietyWeight ?? 0;
  const pairCounts = options.pairCounts ?? new Map<string, number>();
  const limit = options.limit ?? 10;
  const maxCombinations = options.maxCombinations ?? 200_000;

  const evenSplit = sizeA * 2 === n;
  if (binomial(evenSplit ? n - 1 : n, evenSplit ? sizeA - 1 : sizeA) > maxCombinations) {
    throw new Error(
      `Too many combinations for ${n} players. Narrow the lineup or raise maxCombinations.`
    );
  }

  const candidates: SplitCandidate[] = [];
  let worstRepeats = 0;

  for (const indices of subsets(n, sizeA, evenSplit)) {
    const inA = new Set(indices);
    const teamA = players.filter((_, i) => inA.has(i));
    const teamB = players.filter((_, i) => !inA.has(i));
    const idsA = teamA.map((p) => p.playerId);
    const idsB = teamB.map((p) => p.playerId);

    if (violatesConstraints(new Set(idsA), options.constraints)) continue;

    const [winProbability] = predictWin([
      teamA.map(({ mu, sigma }) => ({ mu, sigma })),
      teamB.map(({ mu, sigma }) => ({ mu, sigma })),
    ]);

    const repeats =
      countRepeats(idsA, pairCounts) + countRepeats(idsB, pairCounts);
    worstRepeats = Math.max(worstRepeats, repeats);

    candidates.push({
      teamA: idsA,
      teamB: idsB,
      winProbability,
      fairness: 1 - 2 * Math.abs(winProbability - 0.5),
      repeats,
      score: 0,
    });
  }

  for (const candidate of candidates) {
    const repeatPenalty = worstRepeats > 0 ? candidate.repeats / worstRepeats : 0;
    candidate.score = candidate.fairness - varietyWeight * repeatPenalty;
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}
