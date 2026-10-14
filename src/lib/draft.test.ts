import { describe, expect, it } from "vitest";
import {
  NEW_PLAYER,
  newMatchId,
  newPlayerId,
  roundsPlayed,
  toMatchRecord,
  validateDraft,
  type DraftMatch,
  type DraftStatLine,
} from "./draft";

function line(overrides: Partial<DraftStatLine> = {}): DraftStatLine {
  return {
    name: "someone",
    playerId: "p-someone",
    kills: 15,
    assists: 4,
    deaths: 12,
    damage: 1500,
    ...overrides,
  };
}

function draft(overrides: Partial<DraftMatch> = {}): DraftMatch {
  return {
    playedAt: "2026-10-13T20:00:00.000Z",
    map: "Mirage",
    teams: [
      {
        label: "A",
        startingSide: "CT",
        roundsWon: 13,
        players: [line({ name: "ana", playerId: "p-ana" })],
      },
      {
        label: "B",
        startingSide: "T",
        roundsWon: 7,
        players: [line({ name: "bo", playerId: "p-bo" })],
      },
    ],
    ...overrides,
  };
}

describe("validateDraft", () => {
  it("accepts a well-formed match", () => {
    expect(validateDraft(draft())).toEqual([]);
  });

  it("rejects both teams starting on the same side", () => {
    const d = draft();
    d.teams[1].startingSide = "CT";
    expect(validateDraft(d)).toContain(
      "The two teams cannot have started on the same side."
    );
  });

  it("rejects a player who is not matched to anyone", () => {
    const d = draft();
    d.teams[0].players[0].playerId = undefined;
    expect(validateDraft(d).join()).toContain("not matched to anyone");
  });

  it("accepts a player queued to be added to the roster", () => {
    const d = draft();
    d.teams[0].players[0].playerId = NEW_PLAYER;
    expect(validateDraft(d)).toEqual([]);
  });

  it("rejects more deaths than there were rounds", () => {
    const d = draft();
    d.teams[0].players[0].deaths = 25;
    expect(validateDraft(d).join()).toContain("impossible");
  });

  it("allows a late joiner to look impossible, since they played a different game", () => {
    const d = draft();
    d.teams[0].players[0].deaths = 25;
    d.teams[0].players[0].joinedLate = true;
    expect(validateDraft(d)).toEqual([]);
  });

  it("rejects negative and fractional stats", () => {
    const d = draft();
    d.teams[0].players[0].kills = -1;
    expect(validateDraft(d).join()).toContain("whole numbers");

    const e = draft();
    e.teams[0].players[0].damage = 12.5;
    expect(validateDraft(e).join()).toContain("whole numbers");
  });

  it("rejects the same roster player appearing twice", () => {
    const d = draft();
    d.teams[1].players[0].playerId = "p-ana";
    expect(validateDraft(d)).toContain("The same player is on the scoreboard twice.");
  });

  it("rejects two rows adding the same new player", () => {
    const d = draft();
    d.teams[0].players[0] = line({ name: "[clan] Nova", playerId: NEW_PLAYER });
    d.teams[1].players[0] = line({ name: "nova", playerId: NEW_PLAYER });
    expect(validateDraft(d)).toContain("Two rows are adding the same new player.");
  });

  it("rejects an empty team", () => {
    const d = draft();
    d.teams[1].players = [];
    expect(validateDraft(d).join()).toContain("has nobody on it");
  });

  it("rejects a match with no rounds", () => {
    const d = draft();
    d.teams[0].roundsWon = 0;
    d.teams[1].roundsWon = 0;
    expect(validateDraft(d)).toContain("A match needs at least one round.");
  });

  it("rejects a missing map and an unparseable date", () => {
    const d = draft({ map: "  ", playedAt: "not a date" });
    expect(validateDraft(d)).toContain("Pick a map.");
    expect(validateDraft(d)).toContain("Pick when it was played.");
  });

  it("rejects an out-of-range headshot percentage", () => {
    const d = draft();
    d.teams[0].players[0].headshotPct = 140;
    expect(validateDraft(d).join()).toContain("between 0 and 100");
  });

  it("reports every problem at once rather than stopping at the first", () => {
    const d = draft({ map: "" });
    d.teams[0].players[0].kills = -1;
    expect(validateDraft(d).length).toBeGreaterThan(1);
  });
});

describe("roundsPlayed", () => {
  it("is the two scores added together", () => {
    expect(roundsPlayed(draft())).toBe(20);
  });
});

describe("newPlayerId", () => {
  it("builds a readable id from the handle", () => {
    expect(newPlayerId("BrUceWaYNe", new Set())).toBe("p-brucewayne");
  });

  it("strips a clan tag, matching how aliases are keyed", () => {
    expect(newPlayerId("[AKB48]PanShe", new Set())).toBe("p-panshe");
  });

  it("never collides with an id already in use", () => {
    expect(newPlayerId("nova", new Set(["p-nova"]))).toBe("p-nova-2");
    expect(newPlayerId("nova", new Set(["p-nova", "p-nova-2"]))).toBe("p-nova-3");
  });

  it("falls back to a usable id for an unprintable handle", () => {
    expect(newPlayerId("", new Set())).toBe("p-player");
  });
});

describe("newMatchId", () => {
  it("is prefixed so it can never be read back as a number", () => {
    expect(newMatchId()).toMatch(/^m-/);
  });

  it("differs between two matches submitted in the same millisecond", () => {
    const now = new Date();
    let n = 0;
    const seq = () => [0.1, 0.9][n++];
    expect(newMatchId(now, seq)).not.toBe(newMatchId(now, seq));
  });
});

describe("toMatchRecord", () => {
  const meta = {
    id: "m-1",
    submittedBy: "luke",
    submittedAt: "2026-10-13T21:00:00.000Z",
    source: { kind: "manual", confirmedBy: "luke" } as const,
  };

  it("derives rounds played from the two scores", () => {
    expect(toMatchRecord(draft(), meta).roundsPlayed).toBe(20);
  });

  it("normalises the played-at into an ISO timestamp", () => {
    const record = toMatchRecord(draft({ playedAt: "2026-10-13T16:00" }), meta);
    expect(record.playedAt).toMatch(/Z$/);
  });

  it("trims the map", () => {
    expect(toMatchRecord(draft({ map: " Nuke " }), meta).map).toBe("Nuke");
  });

  it("omits optional stats rather than writing undefined", () => {
    const record = toMatchRecord(draft(), meta);
    expect("headshotPct" in record.teams[0].players[0]).toBe(false);
    expect("joinedLate" in record.teams[0].players[0]).toBe(false);
  });

  it("keeps optional stats when they were supplied", () => {
    const d = draft();
    d.teams[0].players[0].headshotPct = 52;
    d.teams[0].players[0].joinedLate = true;
    const record = toMatchRecord(d, meta);
    expect(record.teams[0].players[0].headshotPct).toBe(52);
    expect(record.teams[0].players[0].joinedLate).toBe(true);
  });
});
