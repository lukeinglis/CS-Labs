import { describe, expect, it } from "vitest";
import { exactFingerprint, looseFingerprint } from "./fingerprint";
import type { MatchRecord, PlayerStatLine } from "./types";

function line(
  playerId: string,
  kills: number,
  assists: number,
  deaths: number,
  adr: number
): PlayerStatLine {
  return { playerId, kills, assists, deaths, adr };
}

function match(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    id: "m1",
    playedAt: "2026-10-01T20:00:00.000Z",
    map: "Mirage",
    roundsPlayed: 20,
    teams: [
      {
        label: "A",
        startingSide: "CT",
        roundsWon: 13,
        players: [line("ace", 25, 3, 12, 95), line("mid", 15, 5, 15, 70)],
      },
      {
        label: "B",
        startingSide: "T",
        roundsWon: 7,
        players: [line("foe", 14, 4, 18, 65), line("sub", 9, 7, 19, 52)],
      },
    ],
    submittedBy: "luke",
    submittedAt: "2026-10-01T22:00:00.000Z",
    source: { kind: "manual", confirmedBy: "luke" },
    ...overrides,
  };
}

/** Same game, but the other captain submitted it, so A and B are swapped. */
function mirrored(): MatchRecord {
  const base = match();
  return { ...base, id: "m2", teams: [base.teams[1], base.teams[0]] };
}

describe("exactFingerprint", () => {
  it("is stable for the same match", () => {
    expect(exactFingerprint(match())).toBe(exactFingerprint(match()));
  });

  it("ignores which team was labelled A", () => {
    expect(exactFingerprint(mirrored())).toBe(exactFingerprint(match()));
  });

  it("ignores the order players appear within a team", () => {
    const base = match();
    const shuffled = {
      ...base,
      teams: [
        { ...base.teams[0], players: [...base.teams[0].players].reverse() },
        base.teams[1],
      ] as MatchRecord["teams"],
    };
    expect(exactFingerprint(shuffled)).toBe(exactFingerprint(base));
  });

  it("ignores who submitted it and when", () => {
    expect(
      exactFingerprint(match({ submittedBy: "other", submittedAt: "2026-11-01T00:00:00.000Z" }))
    ).toBe(exactFingerprint(match()));
  });

  it("changes when a single stat is corrected", () => {
    const base = match();
    const corrected = {
      ...base,
      teams: [
        { ...base.teams[0], players: [line("ace", 26, 3, 12, 95), base.teams[0].players[1]] },
        base.teams[1],
      ] as MatchRecord["teams"],
    };
    expect(exactFingerprint(corrected)).not.toBe(exactFingerprint(base));
  });

  it("changes when the map changes", () => {
    expect(exactFingerprint(match({ map: "Nuke" }))).not.toBe(exactFingerprint(match()));
  });

  it("treats map casing as the same map", () => {
    expect(exactFingerprint(match({ map: "mirage" }))).toBe(exactFingerprint(match()));
  });
});

describe("looseFingerprint", () => {
  it("matches a rematch on the same day with the same roster and score", () => {
    const base = match();
    // Different stats entirely, same people, same map, same scoreline, same day.
    const rematch = {
      ...base,
      id: "m3",
      teams: [
        {
          ...base.teams[0],
          players: [line("ace", 18, 6, 14, 80), line("mid", 20, 2, 11, 88)],
        },
        {
          ...base.teams[1],
          players: [line("foe", 11, 5, 17, 60), line("sub", 12, 3, 20, 58)],
        },
      ] as MatchRecord["teams"],
    };
    expect(looseFingerprint(rematch)).toBe(looseFingerprint(base));
    expect(exactFingerprint(rematch)).not.toBe(exactFingerprint(base));
  });

  it("ignores which team was labelled A", () => {
    expect(looseFingerprint(mirrored())).toBe(looseFingerprint(match()));
  });

  it("ignores the time of day", () => {
    expect(looseFingerprint(match({ playedAt: "2026-10-01T03:00:00.000Z" }))).toBe(
      looseFingerprint(match())
    );
  });

  it("separates the same matchup on a different day", () => {
    expect(looseFingerprint(match({ playedAt: "2026-10-02T20:00:00.000Z" }))).not.toBe(
      looseFingerprint(match())
    );
  });

  it("separates a different scoreline", () => {
    const base = match();
    const closer = {
      ...base,
      teams: [
        { ...base.teams[0], roundsWon: 13 },
        { ...base.teams[1], roundsWon: 11 },
      ] as MatchRecord["teams"],
    };
    expect(looseFingerprint(closer)).not.toBe(looseFingerprint(base));
  });

  it("separates a different roster", () => {
    const base = match();
    const swapped = {
      ...base,
      teams: [
        { ...base.teams[0], players: [line("ringer", 25, 3, 12, 95), base.teams[0].players[1]] },
        base.teams[1],
      ] as MatchRecord["teams"],
    };
    expect(looseFingerprint(swapped)).not.toBe(looseFingerprint(base));
  });
});
