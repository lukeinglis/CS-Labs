import type { DraftMatch, DraftStatLine, DraftTeam } from "./draft";
import type { Side } from "./types";

/**
 * What the vision model is asked for: the scoreboard read verbatim, nothing inferred.
 * Anything derivable (starting side, ADR, round totals) is computed here instead, so a
 * model that is good at reading a table does not also have to be right about CS2 rules.
 */
export type RawScoreboardPlayer = {
  name: string;
  kills: number;
  deaths: number;
  assists: number;
  headshotPct: number | null;
  damage: number;
};

export type RawScoreboardTeam = {
  /** The side as printed on the scoreboard, which is where the team is standing now. */
  side: Side;
  roundsWon: number;
  players: RawScoreboardPlayer[];
};

export type RawScoreboard = {
  map: string | null;
  teams: [RawScoreboardTeam, RawScoreboardTeam];
};

export const EXTRACTION_PROMPT = `You are reading a photo or screenshot of a Counter-Strike 2 scoreboard. Transcribe it. Do not infer, estimate, or correct anything you cannot see.

LAYOUT
The scoreboard has two team blocks. Each block has a header showing the side (COUNTER-TERRORISTS or TERRORISTS) and that team's round count. Below the header is one row per player.

Each player row starts with a connection-quality number under a signal-bars icon, then an avatar and the handle, then the stats. That leading number is ping. It is NOT a stat, so skip it.

The stat columns, left to right, are:
  Kills | Deaths | Assists | HS% | DMG

DMG is total damage for the match, usually in the high hundreds to low thousands. There is no ADR column, so do not calculate one.

NAMES
Transcribe each handle exactly as shown, character for character. Handles routinely contain:
  - clan tags in brackets, e.g. [AKB48]PanShe -> report the whole string "[AKB48]PanShe"
  - symbols and leetspeak, e.g. 2ca$h, gux666
  - spaces
  - the literal word BOT as part of a human player's chosen name
Never drop, clean up, or normalise a name. Never treat a name as a bot or a placeholder.

RULES
- Report the side exactly as the scoreboard shows it. Do not try to work out which side anyone started on.
- Report the round count from the large number beside each team block, not from the combined score banner across the top of the screen.
- Team sizes are often uneven and often small. 2v2, 3v4 and 4v5 are all normal. Report exactly the rows you see; never pad a team to five.
- The screenshot may be from the middle of a match, so the rounds may not add up to a finished game. That is fine.
- HS% of 0 is a real value. Use 0, not null. Use null only when the cell is genuinely unreadable or absent.
- If the map name is not visible, use null. Do not guess it from the textures.
- Ignore the match timer, the game mode header, and any post-match summary card. Read only the scoreboard table.

OUTPUT
Return only JSON, no prose and no code fence:
{
  "map": "Mirage" | null,
  "teams": [
    {
      "side": "CT" | "T",
      "roundsWon": 0,
      "players": [
        { "name": "", "kills": 0, "deaths": 0, "assists": 0, "headshotPct": 0, "damage": 0 }
      ]
    },
    { "side": "CT" | "T", "roundsWon": 0, "players": [] }
  ]
}`;

function asCount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Expected a whole number for ${field}, got ${JSON.stringify(value)}`);
  }
  return value;
}

function asSide(value: unknown): Side {
  if (value !== "CT" && value !== "T") {
    throw new Error(`Expected a side of "CT" or "T", got ${JSON.stringify(value)}`);
  }
  return value;
}

function asPlayer(value: unknown, where: string): RawScoreboardPlayer {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${where} is not a player object.`);
  }
  const p = value as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name.trim()) {
    throw new Error(`${where} has no name.`);
  }
  const hs = p.headshotPct;
  if (hs !== null && hs !== undefined && (typeof hs !== "number" || hs < 0 || hs > 100)) {
    throw new Error(`${where} has an out-of-range headshot percentage.`);
  }
  return {
    name: p.name,
    kills: asCount(p.kills, `${where} kills`),
    deaths: asCount(p.deaths, `${where} deaths`),
    assists: asCount(p.assists, `${where} assists`),
    headshotPct: hs === null || hs === undefined ? null : Math.round(hs),
    damage: asCount(p.damage, `${where} damage`),
  };
}

/**
 * Parses a model response into a RawScoreboard, throwing on anything malformed. The
 * model is instructed not to fence its JSON but does anyway often enough to be worth
 * tolerating, so a fence or surrounding prose is stripped rather than rejected.
 */
export function parseExtraction(text: string): RawScoreboard {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The model did not return any JSON.");
  }

  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("The model returned JSON that could not be parsed.");
  }

  const root = json as Record<string, unknown>;
  if (!Array.isArray(root.teams) || root.teams.length !== 2) {
    throw new Error("Expected exactly two teams.");
  }

  const teams = root.teams.map((raw, i): RawScoreboardTeam => {
    const t = raw as Record<string, unknown>;
    if (!Array.isArray(t.players) || t.players.length < 1) {
      throw new Error(`Team ${i + 1} has no players.`);
    }
    return {
      side: asSide(t.side),
      roundsWon: asCount(t.roundsWon, `team ${i + 1} rounds won`),
      players: t.players.map((p, j) => asPlayer(p, `Team ${i + 1} player ${j + 1}`)),
    };
  });

  return {
    map: typeof root.map === "string" && root.map.trim() ? root.map.trim() : null,
    teams: [teams[0], teams[1]],
  };
}

export const REGULATION_HALF_ROUNDS = 12;

/**
 * A scoreboard shows which side a team is on right now, never which side it started on.
 * The group plays MR12, so sides swap after round 12 and anything past that is showing
 * the second-half side. Overtime swaps again every three rounds, which this ignores on
 * purpose: startingSide feeds nothing but a badge, so a wrong badge on an overtime match
 * is cosmetic and extractionWarnings flags it for the human to fix.
 */
export function startingSideFrom(shownSide: Side, roundsPlayed: number): Side {
  if (roundsPlayed <= REGULATION_HALF_ROUNDS) return shownSide;
  return shownSide === "CT" ? "T" : "CT";
}

const KILL_DEATH_TOLERANCE = 4;

/**
 * Soft checks on an extraction. None of these block a save, because every one of them
 * can legitimately fire on a real match. They exist to point the human at the row most
 * likely to have been misread before they hit confirm.
 */
export function extractionWarnings(raw: RawScoreboard): string[] {
  const warnings: string[] = [];
  const rounds = raw.teams[0].roundsWon + raw.teams[1].roundsWon;

  if (rounds === 0) {
    warnings.push("Both teams read as zero rounds. Check the score next to each team name.");
  }

  if (rounds > REGULATION_HALF_ROUNDS * 2) {
    warnings.push(
      "This looks like it went to overtime, so the starting sides may be the wrong way round. Check the side badges."
    );
  }

  // Every kill is somebody's death, so the two columns should mirror each other across
  // the teams. A gap of a few is normal (team kills, suicides, dying to the bomb); a
  // large gap means a digit got misread.
  for (const [i, team] of raw.teams.entries()) {
    const other = raw.teams[1 - i];
    const kills = team.players.reduce((n, p) => n + p.kills, 0);
    const deaths = other.players.reduce((n, p) => n + p.deaths, 0);
    if (Math.abs(kills - deaths) > KILL_DEATH_TOLERANCE) {
      warnings.push(
        `Team ${i + 1} has ${kills} kills but the other team only has ${deaths} deaths. One of those columns is probably misread.`
      );
    }
  }

  for (const team of raw.teams) {
    for (const p of team.players) {
      if (rounds >= 1 && p.deaths > rounds) {
        warnings.push(`${p.name} has more deaths than there were rounds. Check that row.`);
      }
      if (rounds >= 1 && p.damage / rounds > 250) {
        warnings.push(`${p.name}'s damage works out to an implausible ADR. Check that row.`);
      }
    }
  }

  return warnings;
}

/**
 * Turns a verbatim read into something the confirm form can load. Handles are left
 * unmatched: resolving them to roster ids needs the alias table, which lives server-side.
 */
export function toDraft(raw: RawScoreboard, playedAt: string): DraftMatch {
  const rounds = raw.teams[0].roundsWon + raw.teams[1].roundsWon;

  const teams = raw.teams.map(
    (team, i): DraftTeam => ({
      label: i === 0 ? "A" : "B",
      startingSide: startingSideFrom(team.side, rounds),
      roundsWon: team.roundsWon,
      players: team.players.map(
        (p): DraftStatLine => ({
          name: p.name,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          damage: p.damage,
          ...(p.headshotPct !== null && { headshotPct: p.headshotPct }),
        })
      ),
    })
  );

  return { playedAt, map: raw.map ?? "", teams: [teams[0], teams[1]] };
}

const COMPARED_STATS = ["name", "kills", "deaths", "assists", "damage", "headshotPct"] as const;

/**
 * Which fields a human changed after the model read the scoreboard. Stored with the
 * match so a pattern of corrections in one column is visible later, which is the signal
 * that the prompt needs work rather than that one screenshot was bad.
 *
 * Roster matching is deliberately not counted: picking who a handle belongs to is the
 * submitter's job, not something the model was asked to get right.
 */
export function editedFields(before: DraftMatch, after: DraftMatch): string[] {
  const edited: string[] = [];
  if (before.map !== after.map) edited.push("map");

  for (const [i, teamBefore] of before.teams.entries()) {
    const teamAfter = after.teams[i];
    const at = `teams.${i}`;
    if (teamBefore.startingSide !== teamAfter.startingSide) edited.push(`${at}.startingSide`);
    if (teamBefore.roundsWon !== teamAfter.roundsWon) edited.push(`${at}.roundsWon`);
    if (teamBefore.players.length !== teamAfter.players.length) edited.push(`${at}.players.length`);

    for (const [j, lineBefore] of teamBefore.players.entries()) {
      const lineAfter = teamAfter.players[j];
      if (!lineAfter) continue;
      for (const key of COMPARED_STATS) {
        if (lineBefore[key] !== lineAfter[key]) edited.push(`${at}.players.${j}.${key}`);
      }
    }
  }

  return edited;
}
