import { describe, expect, it } from "vitest";
import { ranking as config } from "../../cs-labs.config";
import {
  buildPairCounts,
  generateSplits,
  pairKey,
  type BalancePlayer,
} from "./balance";
import type { MatchRecord, PlayerStatLine } from "./types";

function player(playerId: string, mu: number, sigma = 2): BalancePlayer {
  return { playerId, mu, sigma };
}

/** Ten players with a deliberate skill gradient. */
function lobby(): BalancePlayer[] {
  return [
    player("p1", 34),
    player("p2", 32),
    player("p3", 30),
    player("p4", 28),
    player("p5", 26),
    player("p6", 24),
    player("p7", 22),
    player("p8", 20),
    player("p9", 18),
    player("p10", 16),
  ];
}

function statLine(playerId: string): PlayerStatLine {
  return { playerId, kills: 15, assists: 4, deaths: 15, adr: 75 };
}

function matchWithTeams(
  teamA: string[],
  teamB: string[],
  playedAt: string
): MatchRecord {
  return {
    id: `m-${playedAt}`,
    playedAt,
    map: "Mirage",
    roundsPlayed: 20,
    teams: [
      { label: "A", startingSide: "CT", roundsWon: 13, players: teamA.map(statLine) },
      { label: "B", startingSide: "T", roundsWon: 7, players: teamB.map(statLine) },
    ],
    submittedBy: "luke",
    submittedAt: playedAt,
    source: { kind: "manual", confirmedBy: "luke" },
  };
}

describe("pairKey", () => {
  it("is order independent", () => {
    expect(pairKey("b", "a")).toBe(pairKey("a", "b"));
  });
});

describe("buildPairCounts", () => {
  it("counts teammates but never opponents", () => {
    const counts = buildPairCounts([
      matchWithTeams(["a", "b"], ["c", "d"], "2026-10-01T20:00:00.000Z"),
    ]);
    expect(counts.get(pairKey("a", "b"))).toBe(1);
    expect(counts.get(pairKey("c", "d"))).toBe(1);
    expect(counts.get(pairKey("a", "c"))).toBeUndefined();
  });

  it("accumulates across matches", () => {
    const counts = buildPairCounts([
      matchWithTeams(["a", "b"], ["c", "d"], "2026-10-01T20:00:00.000Z"),
      matchWithTeams(["a", "b"], ["c", "d"], "2026-10-02T20:00:00.000Z"),
    ]);
    expect(counts.get(pairKey("a", "b"))).toBe(2);
  });

  it("can look at only the most recent matches", () => {
    const counts = buildPairCounts(
      [
        matchWithTeams(["a", "b"], ["c", "d"], "2026-10-01T20:00:00.000Z"),
        matchWithTeams(["a", "b"], ["c", "d"], "2026-10-02T20:00:00.000Z"),
        matchWithTeams(["a", "b"], ["c", "d"], "2026-10-03T20:00:00.000Z"),
      ],
      1
    );
    expect(counts.get(pairKey("a", "b"))).toBe(1);
  });

  it("ignores voided matches", () => {
    const counts = buildPairCounts([
      { ...matchWithTeams(["a", "b"], ["c", "d"], "2026-10-01T20:00:00.000Z"), voided: true },
    ]);
    expect(counts.size).toBe(0);
  });
});

describe("generateSplits", () => {
  it("returns nothing for a lobby too small to split", () => {
    expect(generateSplits([player("solo", 25)])).toEqual([]);
  });

  it("puts the best split as close to a coin flip as the lobby allows", () => {
    const [best] = generateSplits(lobby(), { limit: 1 });
    // Every mu here is even, so the two totals can never match exactly. A two-point
    // skill gap is the arithmetic floor, which lands just inside 0.6.
    expect(best.winProbability).toBeGreaterThan(0.4);
    expect(best.winProbability).toBeLessThan(0.6);
    expect(best.fairness).toBeGreaterThan(0.8);
  });

  it("cannot beat the fairest split that actually exists", () => {
    const all = generateSplits(lobby(), { limit: Number.MAX_SAFE_INTEGER });
    expect(all[0].fairness).toBe(Math.max(...all.map((s) => s.fairness)));
  });

  it("splits everyone exactly once across the two teams", () => {
    const [best] = generateSplits(lobby(), { limit: 1 });
    expect(best.teamA).toHaveLength(5);
    expect(best.teamB).toHaveLength(5);
    expect(new Set([...best.teamA, ...best.teamB]).size).toBe(10);
  });

  it("enumerates the 126 distinct five-on-five splits without mirror duplicates", () => {
    const all = generateSplits(lobby(), { limit: Number.MAX_SAFE_INTEGER });
    expect(all).toHaveLength(126);
  });

  it("handles an odd lobby as a short-handed split", () => {
    const [best] = generateSplits(lobby().slice(0, 9), { limit: 1 });
    expect(best.teamA).toHaveLength(4);
    expect(best.teamB).toHaveLength(5);
  });

  it("honours a forced team size", () => {
    const [best] = generateSplits(lobby(), { teamSize: 3, limit: 1 });
    expect(best.teamA).toHaveLength(3);
    expect(best.teamB).toHaveLength(7);
  });

  it("keeps players who must stay together on the same team", () => {
    const splits = generateSplits(lobby(), {
      constraints: { together: [["p1", "p2"]] },
      limit: Number.MAX_SAFE_INTEGER,
    });
    expect(splits.length).toBeGreaterThan(0);
    for (const split of splits) {
      expect(split.teamA.includes("p1")).toBe(split.teamA.includes("p2"));
    }
  });

  it("keeps players who must be separated on opposite teams", () => {
    const splits = generateSplits(lobby(), {
      constraints: { apart: [["p1", "p2"]] },
      limit: Number.MAX_SAFE_INTEGER,
    });
    expect(splits.length).toBeGreaterThan(0);
    for (const split of splits) {
      expect(split.teamA.includes("p1")).not.toBe(split.teamA.includes("p2"));
    }
  });

  it("returns nothing when constraints contradict each other", () => {
    const splits = generateSplits(lobby(), {
      constraints: { together: [["p1", "p2"]], apart: [["p1", "p2"]] },
    });
    expect(splits).toEqual([]);
  });

  it("breaks up a habitual stack when variety is weighted", () => {
    // Penalise exactly the pairings the fairness-only split would pick, so variety and
    // fairness genuinely pull against each other. Two complementary five-stacks would
    // not work: that history is symmetric enough that the fairest split already sits at
    // the minimum repeat count, leaving variety nothing to improve.
    const [fairest] = generateSplits(lobby(), { limit: 1 });
    const pairCounts = new Map<string, number>();
    for (const team of [fairest.teamA, fairest.teamB]) {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          pairCounts.set(pairKey(team[i], team[j]), 8);
        }
      }
    }

    const [fairnessOnly] = generateSplits(lobby(), { pairCounts, limit: 1 });
    const [withVariety] = generateSplits(lobby(), {
      pairCounts,
      varietyWeight: 0.5,
      limit: 1,
    });

    expect(withVariety.repeats).toBeLessThan(fairnessOnly.repeats);
    // Variety is bought with fairness, so the trade has to stay sane.
    expect(withVariety.fairness).toBeGreaterThan(0.6);
  });

  it("ignores variety entirely at zero weight", () => {
    const pairCounts = buildPairCounts([
      matchWithTeams(["p1", "p2", "p3", "p4", "p5"], ["p6", "p7", "p8", "p9", "p10"], "2026-10-01T20:00:00.000Z"),
    ]);
    const [best] = generateSplits(lobby(), { pairCounts, varietyWeight: 0, limit: 1 });
    expect(best.score).toBeCloseTo(best.fairness);
  });

  it("refuses a lobby large enough to blow up enumeration", () => {
    const huge = Array.from({ length: 40 }, (_, i) => player(`x${i}`, 25));
    expect(() => generateSplits(huge)).toThrow(/Too many combinations/);
  });

  it("ranks candidates best first", () => {
    const splits = generateSplits(lobby(), { limit: 5 });
    const scores = splits.map((s) => s.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("agrees with the ranking config's sigma conventions", () => {
    const splits = generateSplits(
      lobby().map((p) => ({ ...p, sigma: config.sigma })),
      { limit: 1 }
    );
    expect(splits[0].winProbability).toBeGreaterThan(0.4);
    expect(splits[0].winProbability).toBeLessThan(0.6);
  });
});
