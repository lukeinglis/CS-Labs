import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchRecord } from "./types";

/**
 * Covers voiding and restoring only. The point of interest is that a restore removes the
 * void fields rather than setting them false, so a restored record is shaped like one
 * that was never voided and nothing downstream has to tell the two apart.
 */
const store = new Map<string, unknown>();
const sets = new Map<string, Set<string>>();

vi.mock("@upstash/redis", () => ({
  Redis: class {
    async get(key: string) {
      return store.get(key) ?? null;
    }
    async set(key: string, value: unknown) {
      store.set(key, value);
    }
    async sadd(key: string, member: string) {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key)!.add(member);
    }
    async smembers(key: string) {
      return [...(sets.get(key) ?? [])];
    }
    async mget(keys: string[]) {
      return keys.map((k) => store.get(k) ?? null);
    }
    async hset() {}
    async hgetall() {
      return {};
    }
    async hdel() {}
  },
}));

process.env.KV_REST_API_URL = "https://example.upstash.io";
process.env.KV_REST_API_TOKEN = "token";

const { getMatch, restoreMatch, saveMatch, voidMatch } = await import("./storage");

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
      players: [{ playerId: "p-a", kills: 22, assists: 3, deaths: 18, damage: 2406 }],
    },
    {
      label: "B",
      startingSide: "CT",
      roundsWon: 11,
      players: [{ playerId: "p-b", kills: 18, assists: 3, deaths: 16, damage: 1919 }],
    },
  ],
  submittedBy: "Luke",
  submittedAt: "2026-10-15T15:47:48.266Z",
  source: { kind: "manual", confirmedBy: "Luke" },
};

beforeEach(async () => {
  store.clear();
  sets.clear();
  await saveMatch(MATCH);
});

describe("voidMatch", () => {
  it("records the flag, the reason and the actor", async () => {
    const voided = await voidMatch("m-1", "wrong map", "admin");
    expect(voided).toMatchObject({ voided: true, voidReason: "wrong map", voidedBy: "admin" });
    expect(await getMatch("m-1")).toMatchObject({ voided: true, voidReason: "wrong map" });
  });

  it("leaves the scores and the stat lines alone, because it is not a delete", async () => {
    await voidMatch("m-1", "wrong map", "admin");
    const stored = (await getMatch("m-1"))!;
    expect(stored.teams).toEqual(MATCH.teams);
    expect(stored.roundsPlayed).toBe(24);
    expect(stored.source).toEqual(MATCH.source);
  });

  it("returns null for a match that is not there, rather than inventing one", async () => {
    expect(await voidMatch("nope", "x", "admin")).toBeNull();
    expect(await getMatch("nope")).toBeNull();
  });
});

describe("restoreMatch", () => {
  it("deletes the void fields instead of setting them false", async () => {
    await voidMatch("m-1", "wrong map", "admin");
    await restoreMatch("m-1");

    const stored = (await getMatch("m-1"))!;
    expect("voided" in stored).toBe(false);
    expect("voidReason" in stored).toBe(false);
    expect("voidedBy" in stored).toBe(false);
  });

  it("round-trips back to the original record", async () => {
    await voidMatch("m-1", "wrong map", "admin");
    await restoreMatch("m-1");
    expect(await getMatch("m-1")).toEqual(MATCH);
  });

  it("is harmless on a match that was never voided", async () => {
    await restoreMatch("m-1");
    expect(await getMatch("m-1")).toEqual(MATCH);
  });

  it("returns null for a match that is not there", async () => {
    expect(await restoreMatch("nope")).toBeNull();
  });
});

describe("the audit trail", () => {
  it("keeps a revision for the void and another for the restore", async () => {
    await voidMatch("m-1", "wrong map", "admin");
    await restoreMatch("m-1");

    const revisions = [...store.keys()].filter((k) => k.startsWith("match-rev:m-1:"));
    // One from the initial save, one per mutation.
    expect(revisions.length).toBe(3);

    const voidedRevision = revisions
      .map((k) => store.get(k) as MatchRecord)
      .find((r) => r.voided);
    expect(voidedRevision?.voidReason).toBe("wrong map");
  });
});
