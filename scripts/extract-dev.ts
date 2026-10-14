/**
 * Prompt tuning loop for scoreboard extraction. Sends a local scoreboard image to the
 * vision model and diffs the result against the hand-transcribed expected output, so a
 * prompt change can be judged on real input instead of vibes.
 *
 *   node scripts/extract-dev.ts
 *   node scripts/extract-dev.ts fixtures/expected/mirage.json --model claude-opus-4-7
 *
 * The images themselves are gitignored (real people's handles, public repo), so this
 * only runs for someone who has them locally.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  EXTRACTION_PROMPT,
  extractionWarnings,
  parseExtraction,
  startingSideFrom,
  type RawScoreboard,
} from "../src/lib/extract.ts";

const MAX_EDGE = 1568;
const DEFAULT_MODEL = "claude-sonnet-4-6";

const args = process.argv.slice(2);
const modelFlag = args.indexOf("--model");
const model = modelFlag === -1 ? DEFAULT_MODEL : args[modelFlag + 1];
const expectedPath = args.find((a) => a.endsWith(".json")) ?? "fixtures/expected/mirage.json";

/**
 * Read straight from the env file rather than relying on --env-file, which refuses to
 * overwrite a variable that is already set. Some shells export an empty
 * ANTHROPIC_API_KEY, and an empty value wins under --env-file.
 */
function envFileValue(name: string): string | undefined {
  let contents: string;
  try {
    contents = readFileSync(".env.development.local", "utf8");
  } catch {
    return undefined;
  }
  const hit = contents.match(new RegExp(`^${name}=(.*)$`, "m"));
  return hit?.[1].trim().replace(/^["']|["']$/g, "") || undefined;
}

const apiKey = envFileValue("ANTHROPIC_API_KEY") ?? process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("No ANTHROPIC_API_KEY in .env.development.local or the environment.");
  process.exit(1);
}

const expected = JSON.parse(readFileSync(expectedPath, "utf8"));

/**
 * Anthropic resizes anything larger than ~1568px on its longest edge anyway, so sending
 * the full 5712px phone photo only costs upload time. sips is macOS-native and keeps the
 * aspect ratio; the browser will do the same job with a canvas.
 */
function downscale(imagePath: string): string {
  const out = path.join(tmpdir(), `cs-extract-${path.basename(imagePath)}.jpg`);
  execFileSync("sips", ["-Z", String(MAX_EDGE), "-s", "format", "jpeg", imagePath, "--out", out], {
    stdio: "ignore",
  });
  return out;
}

async function extract(imagePath: string): Promise<{ raw: RawScoreboard; usage: unknown }> {
  const base64 = readFileSync(downscale(imagePath)).toString("base64");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = await res.json();
  const text = body.content.find((c: { type: string }) => c.type === "text")?.text ?? "";
  return { raw: parseExtraction(text), usage: body.usage };
}

type Diff = { field: string; expected: unknown; got: unknown };

function diff(want: RawScoreboard, got: RawScoreboard): Diff[] {
  const out: Diff[] = [];
  const add = (field: string, e: unknown, g: unknown) => {
    if (e !== g) out.push({ field, expected: e, got: g });
  };

  add("map", want.map, got.map);

  for (const [i, wantTeam] of want.teams.entries()) {
    const gotTeam = got.teams[i];
    add(`team[${i}].side`, wantTeam.side, gotTeam.side);
    add(`team[${i}].roundsWon`, wantTeam.roundsWon, gotTeam.roundsWon);
    add(`team[${i}].playerCount`, wantTeam.players.length, gotTeam.players.length);

    for (const [j, wantPlayer] of wantTeam.players.entries()) {
      // Match on position rather than name: a misread name should surface as one name
      // diff, not as every stat on that row going missing.
      const gotPlayer = gotTeam.players[j];
      if (!gotPlayer) continue;
      for (const key of ["name", "kills", "deaths", "assists", "headshotPct", "damage"] as const) {
        add(`team[${i}].player[${j}].${key}`, wantPlayer[key], gotPlayer[key]);
      }
    }
  }

  return out;
}

const { raw, usage } = await extract(expected.image);
const diffs = diff(expected as RawScoreboard, raw);
const rounds = raw.teams[0].roundsWon + raw.teams[1].roundsWon;

console.log(`model: ${model}`);
console.log(`image: ${expected.image}`);
console.log(`usage: ${JSON.stringify(usage)}`);
console.log(
  `derived: ${rounds} rounds, team 1 started ${startingSideFrom(raw.teams[0].side, rounds)}, team 2 started ${startingSideFrom(raw.teams[1].side, rounds)}`
);

const warnings = extractionWarnings(raw);
if (warnings.length) {
  console.log("\nwarnings:");
  for (const w of warnings) console.log(`  - ${w}`);
}

if (diffs.length === 0) {
  console.log("\nexact match against the expected transcription.");
} else {
  console.log(`\n${diffs.length} field(s) wrong:`);
  for (const d of diffs) {
    console.log(`  ${d.field}: expected ${JSON.stringify(d.expected)}, got ${JSON.stringify(d.got)}`);
  }
  process.exitCode = 1;
}
