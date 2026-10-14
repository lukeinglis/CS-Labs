import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NEW_PLAYER, validateDraft } from "./draft";
import {
  editedFields,
  extractionWarnings,
  parseExtraction,
  startingSideFrom,
  toDraft,
  type RawScoreboard,
} from "./extract";

const MIRAGE = JSON.parse(
  readFileSync("fixtures/expected/mirage.json", "utf8")
) as RawScoreboard & { image: string };

function scoreboard(patch: Partial<RawScoreboard> = {}): RawScoreboard {
  return JSON.parse(JSON.stringify({ ...MIRAGE, ...patch })) as RawScoreboard;
}

describe("parseExtraction", () => {
  const minimal = JSON.stringify({
    map: "Nuke",
    teams: [
      {
        side: "CT",
        roundsWon: 13,
        players: [{ name: "a", kills: 1, deaths: 2, assists: 3, headshotPct: 4, damage: 500 }],
      },
      {
        side: "T",
        roundsWon: 7,
        players: [{ name: "b", kills: 2, deaths: 1, assists: 0, headshotPct: null, damage: 600 }],
      },
    ],
  });

  it("reads a clean response", () => {
    const raw = parseExtraction(minimal);
    expect(raw.map).toBe("Nuke");
    expect(raw.teams[0].players[0]).toEqual({
      name: "a",
      kills: 1,
      deaths: 2,
      assists: 3,
      headshotPct: 4,
      damage: 500,
    });
    expect(raw.teams[1].players[0].headshotPct).toBeNull();
  });

  it("tolerates a code fence and surrounding prose", () => {
    const raw = parseExtraction(`Here is the scoreboard:\n\`\`\`json\n${minimal}\n\`\`\`\nHope that helps.`);
    expect(raw.map).toBe("Nuke");
  });

  it("treats a blank or missing map as unknown rather than guessing", () => {
    expect(parseExtraction(minimal.replace('"Nuke"', '"   "')).map).toBeNull();
    expect(parseExtraction(minimal.replace('"map":"Nuke",', "")).map).toBeNull();
  });

  it("rejects a response with no JSON in it", () => {
    expect(() => parseExtraction("I cannot read this image.")).toThrow(/did not return any JSON/);
  });

  it("rejects anything other than two teams", () => {
    expect(() => parseExtraction('{"teams":[{"side":"CT","roundsWon":1,"players":[]}]}')).toThrow(
      /exactly two teams/
    );
  });

  it("rejects a team with nobody on it", () => {
    expect(() => parseExtraction(minimal.replace(/"players":\[\{"name":"a".*?\}\]/, '"players":[]'))).toThrow(
      /no players/
    );
  });

  it("rejects a side that is not CT or T", () => {
    expect(() => parseExtraction(minimal.replace('"CT"', '"COUNTER-TERRORISTS"'))).toThrow(/side/);
  });

  it("rejects stats that are not whole non-negative numbers", () => {
    expect(() => parseExtraction(minimal.replace('"kills":1', '"kills":"1"'))).toThrow(/kills/);
    expect(() => parseExtraction(minimal.replace('"damage":500', '"damage":-1'))).toThrow(/damage/);
    expect(() => parseExtraction(minimal.replace('"deaths":2', '"deaths":2.5'))).toThrow(/deaths/);
  });

  it("rejects a nameless row, since a blank handle cannot be matched to anyone", () => {
    expect(() => parseExtraction(minimal.replace('"name":"a"', '"name":"  "'))).toThrow(/no name/);
  });
});

describe("startingSideFrom", () => {
  it("leaves the side alone before the MR12 swap", () => {
    expect(startingSideFrom("CT", 1)).toBe("CT");
    expect(startingSideFrom("T", 12)).toBe("T");
  });

  it("flips the side after the swap, which is every finished match", () => {
    expect(startingSideFrom("CT", 13)).toBe("T");
    expect(startingSideFrom("T", 23)).toBe("CT");
  });
});

describe("extractionWarnings", () => {
  it("is quiet on a clean read", () => {
    expect(extractionWarnings(scoreboard())).toEqual([]);
  });

  it("flags a kills column that does not mirror the other team's deaths", () => {
    const raw = scoreboard();
    raw.teams[0].players[0].kills += 20;
    expect(extractionWarnings(raw).join(" ")).toMatch(/kills but the other team/);
  });

  it("tolerates a small gap, which team kills and bomb deaths produce normally", () => {
    const raw = scoreboard();
    raw.teams[0].players[0].kills += 3;
    expect(extractionWarnings(raw)).toEqual([]);
  });

  it("warns that overtime makes the starting sides unreliable", () => {
    const raw = scoreboard();
    raw.teams[0].roundsWon = 16;
    raw.teams[1].roundsWon = 13;
    expect(extractionWarnings(raw).join(" ")).toMatch(/overtime/);
  });

  it("flags a scoreboard that read as no rounds at all", () => {
    const raw = scoreboard();
    raw.teams[0].roundsWon = 0;
    raw.teams[1].roundsWon = 0;
    expect(extractionWarnings(raw).join(" ")).toMatch(/zero rounds/);
  });

  it("flags more deaths than rounds", () => {
    const raw = scoreboard();
    raw.teams[0].players[0].deaths = 99;
    expect(extractionWarnings(raw).join(" ")).toMatch(/more deaths than there were rounds/);
  });

  it("flags a damage figure that implies an impossible ADR", () => {
    const raw = scoreboard();
    raw.teams[0].players[0].damage = 23600;
    expect(extractionWarnings(raw).join(" ")).toMatch(/implausible ADR/);
  });
});

describe("toDraft", () => {
  const draft = toDraft(scoreboard(), "2026-10-13T20:00:00.000Z");

  it("derives the starting sides, which a scoreboard never shows", () => {
    expect(draft.teams[0].startingSide).toBe("T");
    expect(draft.teams[1].startingSide).toBe("CT");
  });

  it("carries the handles across untouched, clan tags and symbols included", () => {
    expect(draft.teams[1].players[0].name).toBe("[AKB48]PanShe");
    expect(draft.teams[0].players[3].name).toBe("2ca$h");
  });

  it("keeps a zero headshot percentage but omits an unreadable one", () => {
    expect(draft.teams[0].players[3].headshotPct).toBe(0);
    const raw = scoreboard();
    raw.teams[0].players[0].headshotPct = null;
    expect(toDraft(raw, "2026-10-13").teams[0].players[0].headshotPct).toBeUndefined();
  });

  it("leaves the map blank rather than inventing one when it was unreadable", () => {
    expect(toDraft(scoreboard({ map: null }), "2026-10-13").map).toBe("");
  });

  it("records nothing as edited when the draft was accepted as read", () => {
    expect(editedFields(draft, structuredClone(draft))).toEqual([]);
  });

  it("names the exact stat a human corrected", () => {
    const after = structuredClone(draft);
    after.teams[1].players[2].deaths = 21;
    expect(editedFields(draft, after)).toEqual(["teams.1.players.2.deaths"]);
  });

  it("records corrections to the map, the sides and the score", () => {
    const after = structuredClone(draft);
    after.map = "Inferno";
    after.teams[0].startingSide = "CT";
    after.teams[0].roundsWon = 12;
    expect(editedFields(draft, after)).toEqual([
      "map",
      "teams.0.startingSide",
      "teams.0.roundsWon",
    ]);
  });

  it("records a row the human added or deleted", () => {
    const after = structuredClone(draft);
    after.teams[0].players.pop();
    expect(editedFields(draft, after)).toEqual(["teams.0.players.length"]);
  });

  it("ignores roster matching, which the model was never asked to do", () => {
    const after = structuredClone(draft);
    after.teams[0].players[0].playerId = "p-alter";
    expect(editedFields(draft, after)).toEqual([]);
  });

  it("produces a draft that only needs roster matching to be valid", () => {
    const matched = {
      ...draft,
      teams: draft.teams.map((t) => ({
        ...t,
        players: t.players.map((p) => ({ ...p, playerId: NEW_PLAYER })),
      })),
    } as typeof draft;
    expect(validateDraft(matched)).toEqual([]);
  });
});
