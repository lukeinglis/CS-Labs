import { describe, expect, it } from "vitest";
import type { PublicMatch } from "./public";
import {
  currentStreak,
  games,
  overallRecord,
  recordByMap,
  recordByTeamSize,
  teamSizeKey,
  versusEveryone,
  winRate,
} from "./records";

let seq = 0;

/**
 * `a` beats `b` on `map` unless the scores say otherwise. Taking rosters as plain
 * name arrays keeps each case readable as the thing it is testing, which is who was
 * on which side rather than any stat.
 */
function m(
  a: string[],
  b: string[],
  {
    map = "Mirage",
    scoreA = 13,
    scoreB = 7,
    playedAt,
    voided,
  }: {
    map?: string;
    scoreA?: number;
    scoreB?: number;
    playedAt?: string;
    voided?: boolean;
  } = {}
): PublicMatch {
  seq += 1;
  return {
    id: `m-${seq}`,
    playedAt: playedAt ?? `2026-10-${String(seq).padStart(2, "0")}T20:00:00.000Z`,
    map,
    roundsPlayed: scoreA + scoreB,
    teams: [
      { label: "A", startingSide: "T", roundsWon: scoreA, players: a.map((playerId) => ({ playerId })) },
      { label: "B", startingSide: "CT", roundsWon: scoreB, players: b.map((playerId) => ({ playerId })) },
    ],
    submittedBy: "Luke",
    submittedAt: "2026-10-15T00:00:00.000Z",
    source: { kind: "screenshot", confirmedBy: "Luke" },
    ...(voided ? { voided: true } : {}),
  };
}

describe("overallRecord", () => {
  it("counts wins, losses and draws from the round score", () => {
    const matches = [
      m(["luke"], ["bob"]),
      m(["bob"], ["luke"]),
      m(["luke"], ["bob"], { scoreA: 12, scoreB: 12 }),
    ];
    expect(overallRecord(matches, "luke")).toEqual({ wins: 1, losses: 1, draws: 1 });
  });

  it("ignores matches the player was not in", () => {
    expect(overallRecord([m(["bob"], ["eve"])], "luke")).toEqual({
      wins: 0, losses: 0, draws: 0,
    });
  });

  it("ignores voided matches", () => {
    const matches = [m(["luke"], ["bob"]), m(["luke"], ["bob"], { voided: true })];
    expect(overallRecord(matches, "luke")).toEqual({ wins: 1, losses: 0, draws: 0 });
  });
});

describe("winRate", () => {
  it("counts a draw as half a win", () => {
    expect(winRate({ wins: 1, losses: 1, draws: 0 })).toBe(0.5);
    expect(winRate({ wins: 0, losses: 0, draws: 1 })).toBe(0.5);
  });

  // Someone with no games should read as 0%, not NaN.
  it("is zero rather than NaN with no games", () => {
    expect(winRate({ wins: 0, losses: 0, draws: 0 })).toBe(0);
    expect(games({ wins: 0, losses: 0, draws: 0 })).toBe(0);
  });
});

describe("teamSizeKey", () => {
  it("names the lobby shape smaller side first", () => {
    expect(teamSizeKey(m(["a", "b", "c"], ["d", "e", "f", "g"]))).toBe("3v4");
    // The same uneven lobby from the other side is the same format, not a 4v3.
    expect(teamSizeKey(m(["d", "e", "f", "g"], ["a", "b", "c"]))).toBe("3v4");
  });

  it("handles the even case", () => {
    expect(teamSizeKey(m(["a", "b"], ["c", "d"]))).toBe("2v2");
  });
});

describe("recordByMap and recordByTeamSize", () => {
  const matches = [
    m(["luke"], ["bob"], { map: "Inferno" }),
    m(["luke"], ["bob"], { map: "Inferno" }),
    m(["bob"], ["luke"], { map: "Mirage" }),
    m(["luke", "ann"], ["bob", "eve"], { map: "Mirage" }),
  ];

  it("splits a record by map", () => {
    const byMap = recordByMap(matches, "luke");
    expect(byMap.map((r) => [r.key, r.wins, r.losses])).toEqual([
      ["Inferno", 2, 0],
      ["Mirage", 1, 1],
    ]);
  });

  it("splits a record by lobby shape", () => {
    const bySize = recordByTeamSize(matches, "luke");
    expect(bySize.map((r) => [r.key, r.games])).toEqual([
      ["1v1", 3],
      ["2v2", 1],
    ]);
  });

  // Most-played first is what makes the list readable at a glance.
  it("orders by games played", () => {
    const byMap = recordByMap(matches, "luke");
    expect(byMap[0].games).toBeGreaterThanOrEqual(byMap[1].games);
  });
});

describe("versusEveryone", () => {
  it("separates playing with someone from playing against them", () => {
    const matches = [
      // luke and ann win together.
      m(["luke", "ann"], ["bob", "eve"]),
      // luke loses to ann.
      m(["luke", "bob"], ["ann", "eve"], { scoreA: 5, scoreB: 13 }),
    ];
    const vs = versusEveryone(matches, "luke");
    const ann = vs.find((v) => v.playerId === "ann")!;

    expect(ann.with).toEqual({ wins: 1, losses: 0, draws: 0 });
    expect(ann.against).toEqual({ wins: 0, losses: 1, draws: 0 });
  });

  it("records an opponent faced every time", () => {
    const matches = [m(["luke"], ["bob"]), m(["luke"], ["bob"], { scoreA: 2, scoreB: 13 })];
    const bob = versusEveryone(matches, "luke").find((v) => v.playerId === "bob")!;
    expect(bob.against).toEqual({ wins: 1, losses: 1, draws: 0 });
    expect(games(bob.with)).toBe(0);
  });

  it("never lists the player against themselves", () => {
    const vs = versusEveryone([m(["luke", "ann"], ["bob"])], "luke");
    expect(vs.map((v) => v.playerId)).not.toContain("luke");
  });

  it("orders by how often they have shared a lobby", () => {
    const matches = [
      m(["luke"], ["bob"]),
      m(["luke"], ["bob"]),
      m(["luke"], ["eve"]),
    ];
    expect(versusEveryone(matches, "luke")[0].playerId).toBe("bob");
  });
});

describe("currentStreak", () => {
  it("counts a run of wins forward from the most recent match", () => {
    const matches = [
      m(["luke"], ["bob"], { scoreA: 2, scoreB: 13, playedAt: "2026-10-01T20:00:00.000Z" }),
      m(["luke"], ["bob"], { playedAt: "2026-10-02T20:00:00.000Z" }),
      m(["luke"], ["bob"], { playedAt: "2026-10-03T20:00:00.000Z" }),
    ];
    expect(currentStreak(matches, "luke")).toBe(2);
  });

  it("counts a losing run as a negative", () => {
    const matches = [
      m(["luke"], ["bob"], { playedAt: "2026-10-01T20:00:00.000Z" }),
      m(["luke"], ["bob"], { scoreA: 4, scoreB: 13, playedAt: "2026-10-02T20:00:00.000Z" }),
    ];
    expect(currentStreak(matches, "luke")).toBe(-1);
  });

  // Order has to come from playedAt, not from however the array arrived.
  it("reads the run in played order regardless of input order", () => {
    const recent = m(["luke"], ["bob"], { playedAt: "2026-10-09T20:00:00.000Z" });
    const older = m(["luke"], ["bob"], {
      scoreA: 1, scoreB: 13, playedAt: "2026-10-01T20:00:00.000Z",
    });
    expect(currentStreak([recent, older], "luke")).toBe(1);
    expect(currentStreak([older, recent], "luke")).toBe(1);
  });

  it("is zero for a player with no matches", () => {
    expect(currentStreak([m(["bob"], ["eve"])], "luke")).toBe(0);
  });
});
