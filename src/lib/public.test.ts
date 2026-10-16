import { describe, expect, it } from "vitest";
import { toPublicMatch, toPublicRating } from "./public";
import type { MatchRecord, PlayerRating } from "./types";

function match(over: Partial<MatchRecord> = {}): MatchRecord {
  return {
    id: "m-1",
    playedAt: "2026-10-14T22:37:00.000Z",
    map: "Inferno",
    roundsPlayed: 24,
    teams: [
      {
        label: "A",
        startingSide: "T",
        roundsWon: 11,
        players: [
          { playerId: "p-a", kills: 22, assists: 3, deaths: 18, damage: 2406, headshotPct: 27 },
        ],
      },
      {
        label: "B",
        startingSide: "CT",
        roundsWon: 13,
        players: [
          { playerId: "p-b", kills: 18, assists: 3, deaths: 16, damage: 1919, headshotPct: 33 },
          { playerId: "p-c", kills: 1, assists: 0, deaths: 2, damage: 90, joinedLate: true },
        ],
      },
    ],
    submittedBy: "Luke",
    submittedAt: "2026-10-15T15:47:48.266Z",
    source: {
      kind: "screenshot",
      blobUrl: "https://blob.example.com/scoreboards/m-1.jpg",
      confirmedBy: "Luke",
      extractionModel: "claude-sonnet-4-6",
      editedFields: ["teams.0.players.0.kills"],
    },
    ...over,
  };
}

/**
 * These assert on the serialized form rather than on properties, because the risk is
 * not "the component drew it", it is "the value rode along in the RSC payload". A
 * substring search over the JSON is the same thing an attacker does with view-source.
 */
describe("toPublicMatch", () => {
  it("keeps what a public page needs to show a result", () => {
    const p = toPublicMatch(match());
    expect(p.map).toBe("Inferno");
    expect(p.roundsPlayed).toBe(24);
    expect(p.teams[0].roundsWon).toBe(11);
    expect(p.teams[1].roundsWon).toBe(13);
    expect(p.teams[0].startingSide).toBe("T");
    expect(p.teams[1].players.map((l) => l.playerId)).toEqual(["p-b", "p-c"]);
  });

  it("carries no per-player stat of any kind", () => {
    const json = JSON.stringify(toPublicMatch(match()));
    for (const key of ["kills", "assists", "deaths", "damage", "headshotPct"]) {
      expect(json).not.toContain(key);
    }
    // The values matter as much as the keys: 2406 damage is identifying on its own.
    // Only distinctive numbers are checked, because a short one like "22" collides
    // with the timestamp and would pass or fail for the wrong reason.
    for (const value of ["2406", "1919", "1212"]) {
      expect(json).not.toContain(value);
    }
  });

  // The blob is world-readable and the image is the scoreboard, so the link is
  // equivalent to publishing every number on it.
  it("does not leak the screenshot URL", () => {
    const json = JSON.stringify(toPublicMatch(match()));
    expect(json).not.toContain("blob.example.com");
    expect(json).not.toContain("blobUrl");
  });

  it("keeps provenance without the image", () => {
    const p = toPublicMatch(match());
    expect(p.source).toEqual({ kind: "screenshot", confirmedBy: "Luke" });
  });

  it("keeps joinedLate, which is about availability rather than performance", () => {
    const p = toPublicMatch(match());
    expect(p.teams[1].players[1].joinedLate).toBe(true);
    expect(p.teams[1].players[0].joinedLate).toBeUndefined();
  });

  it("passes a void through so a voided match can still be labelled", () => {
    const p = toPublicMatch(match({ voided: true, voidReason: "wrong map", voidedBy: "Luke" }));
    expect(p.voided).toBe(true);
    expect(p.voidReason).toBe("wrong map");
  });
});

describe("toPublicRating", () => {
  const rating: PlayerRating = {
    playerId: "p-a",
    mu: 27.1,
    sigma: 7.3,
    teamRating: 1180,
    perfRating: 1.42,
    overall: 1260,
    games: 9,
    wins: 6,
    losses: 3,
    draws: 0,
    roundsWon: 104,
    roundsLost: 88,
    lastPlayedAt: "2026-10-14T22:37:00.000Z",
    provisional: false,
  };

  it("drops both performance-derived numbers", () => {
    const json = JSON.stringify(toPublicRating(rating));
    expect(json).not.toContain("perfRating");
    expect(json).not.toContain("overall");
    expect(json).not.toContain("1.42");
    expect(json).not.toContain("1260");
  });

  it("keeps the win/loss record and the team-outcome rating", () => {
    const p = toPublicRating(rating);
    expect(p.teamRating).toBe(1180);
    expect(p.wins).toBe(6);
    expect(p.losses).toBe(3);
    expect(p.roundsWon).toBe(104);
  });

  // mu and sigma are the openskill state behind teamRating, computed from round scores
  // alone. Balancing needs them and they carry no performance signal.
  it("keeps the openskill state that team balancing runs on", () => {
    const p = toPublicRating(rating);
    expect(p.mu).toBe(27.1);
    expect(p.sigma).toBe(7.3);
  });
});
