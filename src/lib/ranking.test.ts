import { describe, expect, it } from "vitest";
import { ranking as config } from "../../cs-labs.config";
import { adr, blendDelta, computeMatchPerf, computeRatings } from "./ranking";
import type { MatchRecord, PlayerStatLine, Side } from "./types";

/** Rating a player starts on, before any match has been played. */
const BASELINE =
  config.displayAlpha * (config.mu - config.z * config.sigma) + config.displayTarget;

function line(playerId: string, overrides: Partial<PlayerStatLine> = {}): PlayerStatLine {
  return { playerId, kills: 15, assists: 4, deaths: 15, damage: 1500, ...overrides };
}

function makeMatch(opts: {
  id?: string;
  playedAt?: string;
  roundsWon: [number, number];
  teamA: PlayerStatLine[];
  teamB: PlayerStatLine[];
  voided?: boolean;
}): MatchRecord {
  const [a, b] = opts.roundsWon;
  const sides: [Side, Side] = ["CT", "T"];
  return {
    id: opts.id ?? "m1",
    playedAt: opts.playedAt ?? "2026-10-01T20:00:00.000Z",
    map: "Mirage",
    roundsPlayed: a + b,
    teams: [
      { label: "A", startingSide: sides[0], roundsWon: a, players: opts.teamA },
      { label: "B", startingSide: sides[1], roundsWon: b, players: opts.teamB },
    ],
    submittedBy: "luke",
    submittedAt: "2026-10-01T21:00:00.000Z",
    source: { kind: "manual", confirmedBy: "luke" },
    voided: opts.voided,
  };
}

function fiveOnFive(roundsWon: [number, number], playedAt?: string): MatchRecord {
  return makeMatch({
    playedAt,
    roundsWon,
    teamA: ["a1", "a2", "a3", "a4", "a5"].map((p) => line(p)),
    teamB: ["b1", "b2", "b3", "b4", "b5"].map((p) => line(p)),
  });
}

function byId(ratings: ReturnType<typeof computeRatings>, id: string) {
  const found = ratings.find((r) => r.playerId === id);
  if (!found) throw new Error(`no rating for ${id}`);
  return found;
}

describe("adr", () => {
  it("derives average damage per round from the raw total", () => {
    expect(adr(line("x", { damage: 2411 }), 19)).toBeCloseTo(126.9, 1);
  });

  it("follows a corrected round count", () => {
    const l = line("x", { damage: 2400 });
    expect(adr(l, 24)).toBeCloseTo(100);
    expect(adr(l, 20)).toBeCloseTo(120);
  });
});

describe("blendDelta", () => {
  it("leaves the delta untouched for an exactly average game", () => {
    expect(blendDelta(10, 1, config)).toBeCloseTo(10);
    expect(blendDelta(-10, 1, config)).toBeCloseTo(-10);
  });

  it("lets a monster game claw a loss back to break-even", () => {
    expect(blendDelta(-10, 2, config)).toBeCloseTo(0);
  });

  it("never turns a loss into a rating gain", () => {
    for (const perf of [2.5, 3, 10]) {
      expect(blendDelta(-10, perf, config)).toBeLessThanOrEqual(0);
    }
  });

  it("penalises a bad game on a loss gently, and floors it", () => {
    expect(blendDelta(-10, 0.5, config)).toBeCloseTo(-12.5);
    expect(blendDelta(-10, 0, config)).toBeCloseTo(-12.5);
  });

  it("always keeps a win positive, even for a passenger", () => {
    expect(blendDelta(10, 0, config)).toBeCloseTo(7.5);
    expect(blendDelta(10, 0.5, config)).toBeCloseTo(7.5);
  });

  it("caps how much a big game inflates a win", () => {
    expect(blendDelta(10, 2, config)).toBeCloseTo(12.5);
    expect(blendDelta(10, 10, config)).toBeCloseTo(12.5);
  });
});

describe("computeMatchPerf", () => {
  it("scores an identical lobby at exactly average", () => {
    const perf = computeMatchPerf(fiveOnFive([13, 7]), config);
    for (const value of perf.values()) {
      expect(value).toBeCloseTo(1);
    }
  });

  it("rates the standout player above the lobby and the anchor below", () => {
    const match = makeMatch({
      roundsWon: [13, 7],
      teamA: [
        line("star", { kills: 30, deaths: 8, damage: 2800, assists: 8 }),
        ...["a2", "a3", "a4"].map((p) => line(p)),
        line("anchor", { kills: 4, deaths: 20, damage: 600, assists: 1 }),
      ],
      teamB: ["b1", "b2", "b3", "b4", "b5"].map((p) => line(p)),
    });
    const perf = computeMatchPerf(match, config);
    expect(perf.get("star")!).toBeGreaterThan(1.3);
    expect(perf.get("anchor")!).toBeLessThan(0.8);
  });

  it("does not explode on a zero-death game", () => {
    const match = makeMatch({
      roundsWon: [13, 0],
      teamA: [line("flawless", { deaths: 0, kills: 20, damage: 2200 }), line("a2")],
      teamB: [line("b1"), line("b2")],
    });
    const perf = computeMatchPerf(match, config);
    expect(Number.isFinite(perf.get("flawless")!)).toBe(true);
    expect(perf.get("flawless")!).toBeLessThanOrEqual(config.perf.termMax);
  });

  it("stays neutral when a stat is absent across the whole lobby", () => {
    const match = makeMatch({
      roundsWon: [13, 11],
      teamA: [line("a1", { assists: 0 }), line("a2", { assists: 0 })],
      teamB: [line("b1", { assists: 0 }), line("b2", { assists: 0 })],
    });
    const perf = computeMatchPerf(match, config);
    for (const value of perf.values()) {
      expect(value).toBeCloseTo(1);
    }
  });
});

describe("computeRatings", () => {
  it("moves winners up and losers down", () => {
    const ratings = computeRatings([fiveOnFive([13, 7])], config);
    expect(byId(ratings, "a1").overall).toBeGreaterThan(byId(ratings, "b1").overall);
    expect(byId(ratings, "a1").wins).toBe(1);
    expect(byId(ratings, "b1").losses).toBe(1);
  });

  it("rewards a blowout more than a nailbiter", () => {
    const blowout = computeRatings([fiveOnFive([13, 1])], config);
    const close = computeRatings([fiveOnFive([13, 11])], config);
    expect(byId(blowout, "a1").teamRating).toBeGreaterThan(
      byId(close, "a1").teamRating
    );
  });

  it("rewards winning short-handed more than winning even-handed", () => {
    const shortHanded = computeRatings(
      [
        makeMatch({
          roundsWon: [13, 9],
          teamA: ["a1", "a2", "a3", "a4"].map((p) => line(p)),
          teamB: ["b1", "b2", "b3", "b4", "b5"].map((p) => line(p)),
        }),
      ],
      config
    );
    const even = computeRatings([fiveOnFive([13, 9])], config);
    expect(byId(shortHanded, "a1").teamRating).toBeGreaterThan(
      byId(even, "a1").teamRating
    );
  });

  // The group plays whatever turns up, so every size from 2v2 upwards is real input.
  it.each([
    [2, 2],
    [2, 3],
    [3, 3],
    [3, 4],
    [4, 4],
    [4, 5],
    [5, 5],
  ])("rates a %iv%i lobby", (sizeA, sizeB) => {
    const ratings = computeRatings(
      [
        makeMatch({
          roundsWon: [13, 8],
          teamA: Array.from({ length: sizeA }, (_, i) => line(`a${i}`)),
          teamB: Array.from({ length: sizeB }, (_, i) => line(`b${i}`)),
        }),
      ],
      config
    );
    expect(ratings).toHaveLength(sizeA + sizeB);
    for (const r of ratings) expect(Number.isFinite(r.overall)).toBe(true);
    expect(byId(ratings, "a0").overall).toBeGreaterThan(byId(ratings, "b0").overall);
  });

  it("keeps a hard carry on a loss from gaining overall rating", () => {
    const ratings = computeRatings(
      [
        makeMatch({
          roundsWon: [7, 13],
          teamA: [
            line("carry", { kills: 34, deaths: 12, damage: 3000, assists: 9 }),
            ...["a2", "a3", "a4", "a5"].map((p) => line(p, { kills: 6, damage: 800 })),
          ],
          teamB: ["b1", "b2", "b3", "b4", "b5"].map((p) => line(p)),
        }),
      ],
      config
    );
    const carry = byId(ratings, "carry");
    const teammate = byId(ratings, "a2");
    expect(carry.overall).toBeLessThanOrEqual(BASELINE);
    expect(carry.overall).toBeGreaterThan(teammate.overall);
    expect(carry.perfRating).toBeGreaterThan(teammate.perfRating);
  });

  it("ignores voided matches", () => {
    const ratings = computeRatings(
      [fiveOnFive([13, 7]), { ...fiveOnFive([3, 13], "2026-10-02T20:00:00.000Z"), voided: true }],
      config
    );
    expect(byId(ratings, "a1").games).toBe(1);
  });

  it("replays in chronological order regardless of input order", () => {
    const first = fiveOnFive([13, 7], "2026-10-01T20:00:00.000Z");
    const second = fiveOnFive([2, 13], "2026-10-02T20:00:00.000Z");
    const forward = computeRatings([first, second], config);
    const reversed = computeRatings([second, first], config);
    expect(byId(forward, "a1").overall).toBeCloseTo(byId(reversed, "a1").overall);
    expect(byId(forward, "a1").teamRating).toBeCloseTo(byId(reversed, "a1").teamRating);
  });

  it("marks players provisional until they have enough games", () => {
    const matches = Array.from({ length: config.provisionalGames }, (_, i) =>
      fiveOnFive([13, 7], `2026-10-0${i + 1}T20:00:00.000Z`)
    );
    expect(byId(computeRatings(matches.slice(0, 2), config), "a1").provisional).toBe(true);
    expect(byId(computeRatings(matches, config), "a1").provisional).toBe(false);
  });

  it("records a tied game as a draw rather than a win or a loss", () => {
    const ratings = computeRatings([fiveOnFive([12, 12])], config);
    const a = byId(ratings, "a1");
    expect(a.draws).toBe(1);
    expect(a.wins).toBe(0);
    expect(a.losses).toBe(0);
    expect(a.games).toBe(1);
  });

  it("barely moves evenly matched teams that draw", () => {
    const drawn = byId(computeRatings([fiveOnFive([12, 12])], config), "a1");
    const won = byId(computeRatings([fiveOnFive([13, 11])], config), "a1");
    expect(Math.abs(drawn.teamRating - BASELINE)).toBeLessThan(
      Math.abs(won.teamRating - BASELINE)
    );
  });

  it("gives a late joiner neutral performance", () => {
    const match = makeMatch({
      roundsWon: [13, 5],
      teamA: [
        ...["a1", "a2", "a3", "a4"].map((p) => line(p)),
        line("latecomer", { joinedLate: true, kills: 2, deaths: 4, damage: 400, assists: 0 }),
      ],
      teamB: ["b1", "b2", "b3", "b4", "b5"].map((p) => line(p)),
    });
    const perf = computeMatchPerf(match, config);
    expect(perf.get("latecomer")).toBe(1);
  });

  it("keeps a late joiner out of the lobby averages", () => {
    const match = makeMatch({
      roundsWon: [13, 5],
      teamA: [
        ...["a1", "a2", "a3", "a4"].map((p) => line(p)),
        line("latecomer", { joinedLate: true, kills: 1, deaths: 9, damage: 200, assists: 0 }),
      ],
      teamB: ["b1", "b2", "b3", "b4", "b5"].map((p) => line(p)),
    });
    const perf = computeMatchPerf(match, config);
    // Everyone who played the full game was identical, so they must all sit at exactly average.
    for (const id of ["a1", "a2", "a3", "a4", "b1", "b5"]) {
      expect(perf.get(id)!).toBeCloseTo(1);
    }
  });

  it("excludes a late joiner's game from their performance average", () => {
    const ratings = computeRatings(
      [
        makeMatch({
          roundsWon: [13, 5],
          teamA: [line("a1"), line("latecomer", { joinedLate: true, kills: 1, damage: 180 })],
          teamB: [line("b1"), line("b2")],
        }),
      ],
      config
    );
    const late = byId(ratings, "latecomer");
    expect(late.games).toBe(1);
    expect(late.perfRating).toBe(1);
  });

  it("grows uncertainty back after a layoff beyond the grace period", () => {
    const build = (secondDate: string) =>
      computeRatings(
        [fiveOnFive([13, 7], "2026-09-01T20:00:00.000Z"), fiveOnFive([13, 7], secondDate)],
        config
      );
    const prompt = byId(build("2026-09-08T20:00:00.000Z"), "a1");
    const rusty = byId(build("2026-12-20T20:00:00.000Z"), "a1");
    expect(rusty.sigma).toBeGreaterThan(prompt.sigma);
  });

  it("never inflates uncertainty past a brand new player's", () => {
    const ratings = computeRatings(
      [
        fiveOnFive([13, 7], "2020-01-01T20:00:00.000Z"),
        fiveOnFive([13, 7], "2026-10-01T20:00:00.000Z"),
      ],
      config
    );
    expect(byId(ratings, "a1").sigma).toBeLessThanOrEqual(config.sigma);
  });

  it("applies layoff decay at display time via asOf", () => {
    const matches = [fiveOnFive([13, 7], "2026-09-01T20:00:00.000Z")];
    const fresh = byId(computeRatings(matches, config, "2026-09-02T00:00:00.000Z"), "a1");
    const stale = byId(computeRatings(matches, config, "2027-03-01T00:00:00.000Z"), "a1");
    expect(stale.sigma).toBeGreaterThan(fresh.sigma);
    expect(stale.teamRating).toBeLessThan(fresh.teamRating);
  });

  it("shrinks uncertainty as games accumulate", () => {
    const one = computeRatings([fiveOnFive([13, 7])], config);
    const many = computeRatings(
      Array.from({ length: 6 }, (_, i) =>
        fiveOnFive([13, 7], `2026-10-0${i + 1}T20:00:00.000Z`)
      ),
      config
    );
    expect(byId(many, "a1").sigma).toBeLessThan(byId(one, "a1").sigma);
  });
});
