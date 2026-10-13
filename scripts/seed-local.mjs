/**
 * Writes a plausible match history to .data/ so the site can be developed and eyeballed
 * before Vercel KV is provisioned. The read model only reads .data/ outside production.
 *
 *   node scripts/seed-local.mjs [matchCount]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MAPS = ["Mirage", "Inferno", "Nuke", "Overpass", "Ancient", "Anubis", "Dust II"];

// skill is only used to shape the fixture, it is not a rating the app ever sees.
const ROSTER = [
  { id: "p-fenrir", displayName: "fenrir", skill: 1.35 },
  { id: "p-kovacs", displayName: "kovacs", skill: 1.25 },
  { id: "p-nite", displayName: "n1te", skill: 1.18 },
  { id: "p-tempo", displayName: "tempo", skill: 1.1 },
  { id: "p-dash", displayName: "dash", skill: 1.02 },
  { id: "p-marlo", displayName: "marlo", skill: 0.98 },
  { id: "p-grit", displayName: "grit", skill: 0.92 },
  { id: "p-hollow", displayName: "hollowpoint", skill: 0.86 },
  { id: "p-pike", displayName: "pike", skill: 0.8 },
  { id: "p-rook", displayName: "rook", skill: 0.74 },
  { id: "p-sable", displayName: "sable", skill: 0.68 },
  { id: "p-wisp", displayName: "wisp", skill: 0.6 },
];

// mulberry32, so the fixture is deterministic without losing precision the way a naive
// LCG does once the multiply exceeds 2^53.
let seed = 20261013;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffled(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function statLine(player, rounds, teamWon, share) {
  // Everything is expressed per round, so no line can claim more deaths than there were
  // rounds. Output scales with skill, and the winning side frags a little more.
  const base = player.skill * (teamWon ? 1.08 : 0.94) * (0.88 + share * 0.3);
  const kpr = Math.max(0.15, 0.72 * base + (rand() - 0.5) * 0.12);
  const dpr = Math.min(0.9, Math.max(0.3, 0.68 / Math.max(base, 0.5) + (rand() - 0.5) * 0.1));
  const apr = Math.max(0.04, 0.14 + (rand() - 0.5) * 0.12);
  const adr = Math.max(15, 78 * base + (rand() - 0.5) * 12);
  return {
    playerId: player.id,
    kills: Math.round(kpr * rounds),
    assists: Math.round(apr * rounds),
    deaths: Math.max(1, Math.round(dpr * rounds)),
    damage: Math.round(adr * rounds),
  };
}

function buildMatch(index) {
  const lobbySize = rand() < 0.2 ? 8 : 10;
  const lobby = shuffled(ROSTER).slice(0, lobbySize);
  const half = lobbySize / 2;
  const teams = [lobby.slice(0, half), lobby.slice(half)];

  const strength = teams.map((t) => t.reduce((sum, p) => sum + p.skill, 0));
  const favourite = strength[0] >= strength[1] ? 0 : 1;
  const edge = Math.abs(strength[0] - strength[1]);

  // Closer teams produce closer scorelines, centred around 13-8 rather than a blowout.
  // Draws happen but are rare.
  const draw = rand() < 0.06;
  const loserRounds = Math.max(
    0,
    Math.min(12, Math.round(10 - edge * 1.8 + (rand() - 0.5) * 7))
  );

  const upset = !draw && rand() < 0.28;
  const winner = draw ? null : upset ? 1 - favourite : favourite;

  const scores = draw
    ? [12, 12]
    : winner === 0
      ? [13, loserRounds]
      : [loserRounds, 13];
  const roundsPlayed = scores[0] + scores[1];

  const day = String((index % 27) + 1).padStart(2, "0");
  const month = index < 27 ? "09" : "10";
  const playedAt = `2026-${month}-${day}T${19 + (index % 3)}:30:00.000Z`;

  const ctFirst = rand() < 0.5;

  return {
    id: `m-${String(index + 1).padStart(3, "0")}`,
    playedAt,
    map: MAPS[Math.floor(rand() * MAPS.length)],
    roundsPlayed,
    teams: teams.map((group, i) => {
      const total = group.reduce((sum, p) => sum + p.skill, 0);
      return {
        label: i === 0 ? "A" : "B",
        startingSide: (i === 0) === ctFirst ? "CT" : "T",
        roundsWon: scores[i],
        players: group.map((p) =>
          statLine(p, roundsPlayed, winner === i, p.skill / total)
        ),
      };
    }),
    submittedBy: ["fenrir", "marlo", "pike"][index % 3],
    submittedAt: playedAt,
    source: { kind: "manual", confirmedBy: "luke" },
  };
}

const count = Number(process.argv[2] ?? 18);
const matches = Array.from({ length: count }, (_, i) => buildMatch(i));
const players = ROSTER.map(({ id, displayName }) => ({
  id,
  displayName,
  createdAt: "2026-09-01T00:00:00.000Z",
  active: true,
}));

const dir = path.join(process.cwd(), ".data");
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, "matches.json"), JSON.stringify(matches, null, 2));
await writeFile(path.join(dir, "players.json"), JSON.stringify(players, null, 2));

console.log(`Wrote ${matches.length} matches and ${players.length} players to .data/`);
