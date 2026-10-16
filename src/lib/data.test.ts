import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchRecord, Player } from "./types";

/**
 * These are about the loaders being the gate, not about the projections, which
 * `public.test.ts` covers. The reason the check lives in the loader at all is that a
 * page which forgets to check is a privacy bug, whereas a loader that forgets to
 * refuse is one place to audit. So: prove it refuses.
 */
let admin = false;

vi.mock("./session", () => ({
  isAdmin: async () => admin,
}));

const MATCH: MatchRecord = {
  id: "m-1",
  playedAt: "2026-10-14T22:37:00.000Z",
  map: "Inferno",
  roundsPlayed: 24,
  teams: [
    {
      label: "A",
      startingSide: "T",
      roundsWon: 13,
      players: [
        { playerId: "p-a", kills: 22, assists: 3, deaths: 18, damage: 2406 },
      ],
    },
    {
      label: "B",
      startingSide: "CT",
      roundsWon: 11,
      players: [
        { playerId: "p-b", kills: 18, assists: 3, deaths: 16, damage: 1919 },
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
    editedFields: [],
  },
};

const PLAYERS: Player[] = [
  { id: "p-a", displayName: "Ann", createdAt: "2026-01-01T00:00:00.000Z", active: true },
  { id: "p-b", displayName: "Bob", createdAt: "2026-01-01T00:00:00.000Z", active: true },
];

vi.mock("./storage", () => ({
  isStoreConfigured: () => true,
  getMatches: async () => [MATCH],
  getPlayers: async () => PLAYERS,
}));

beforeEach(() => {
  admin = false;
});

describe("loadRankings", () => {
  it("refuses a request that is not signed in", async () => {
    const { loadRankings } = await import("./data");
    await expect(loadRankings()).rejects.toThrow(/private/i);
  });

  it("serves an admin the performance numbers", async () => {
    admin = true;
    const { loadRankings } = await import("./data");
    const { ranked } = await loadRankings();
    const ann = ranked.find((p) => p.playerId === "p-a")!;

    expect(ann.displayName).toBe("Ann");
    expect(typeof ann.perfRating).toBe("number");
    expect(typeof ann.overall).toBe("number");
  });

  // A route that has already checked passes this so the cookie is not read twice. It
  // is a performance shortcut, so it must not become a way to skip the check: callers
  // of this are the admin routes, and the layout above them has already refused.
  it("takes assumeAdmin as proof the caller already checked", async () => {
    const { loadRankings } = await import("./data");
    await expect(loadRankings({ assumeAdmin: true })).resolves.toBeDefined();
  });
});

describe("loadPublicRankings", () => {
  it("needs no sign-in", async () => {
    const { loadPublicRankings } = await import("./data");
    await expect(loadPublicRankings()).resolves.toBeDefined();
  });

  // The same substring check the projection tests use, but one level up, because the
  // thing that matters is what the whole payload a public page receives looks like.
  it("hands a public page nothing performance-derived", async () => {
    const { loadPublicRankings } = await import("./data");
    const json = JSON.stringify(await loadPublicRankings());

    for (const key of ["perfRating", "overall", "kills", "deaths", "damage", "blobUrl"]) {
      expect(json).not.toContain(key);
    }
    for (const value of ["2406", "1919"]) {
      expect(json).not.toContain(value);
    }
  });

  it("ranks by the team-outcome rating, highest first", async () => {
    const { loadPublicRankings } = await import("./data");
    const { ranked } = await loadPublicRankings();

    expect(ranked.length).toBe(2);
    expect(ranked[0].teamRating).toBeGreaterThanOrEqual(ranked[1].teamRating);
    // Ann won 13-11, so she is the one on top.
    expect(ranked[0].playerId).toBe("p-a");
  });
});

describe("loadPublicMatches", () => {
  it("strips the stat lines and the screenshot", async () => {
    const { loadPublicMatches } = await import("./data");
    const json = JSON.stringify(await loadPublicMatches());

    expect(json).toContain("Inferno");
    expect(json).toContain("p-a");
    expect(json).not.toContain("blob.example.com");
    expect(json).not.toContain("2406");
  });
});
