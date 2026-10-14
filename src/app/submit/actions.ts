"use server";

import { timingSafeEqual } from "node:crypto";
import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import {
  NEW_PLAYER,
  newMatchId,
  newPlayerId,
  toMatchRecord,
  validateDraft,
  type DraftMatch,
} from "@/lib/draft";
import { extractionWarnings, toDraft } from "@/lib/extract";
import { normalizeName } from "@/lib/names";
import {
  findDuplicate,
  getAliases,
  getPlayers,
  isStoreConfigured,
  saveMatch,
  savePlayer,
  setAlias,
  type DuplicateHit,
} from "@/lib/storage";
import { isVisionConfigured, readScoreboard, VisionError } from "@/lib/vision";
import type { MatchSource, Player } from "@/lib/types";

export type SubmitResult =
  | { ok: true; matchId: string }
  | { ok: false; errors: string[]; duplicate?: DuplicateHit };

/** Where a draft came from, as the browser reports it. Re-checked before it is stored. */
export type DraftOrigin = {
  blobUrl: string;
  extractionModel: string;
  /** Dotted paths the submitter changed after extraction, e.g. "teams.0.players.2.kills". */
  editedFields: string[];
};

export type SubmitInput = {
  passphrase: string;
  submittedBy: string;
  draft: DraftMatch;
  /** Set once the submitter has seen a duplicate warning and chosen to save anyway. */
  acceptDuplicate?: boolean;
  origin?: DraftOrigin;
};

export type ExtractResult =
  | { ok: true; draft: DraftMatch; warnings: string[]; blobUrl: string; extractionModel: string }
  | { ok: false; errors: string[] };

export type ExtractInput = {
  passphrase: string;
  /** A downscaled JPEG, base64 encoded without the data-URL prefix. */
  imageBase64: string;
  /** Local wall-clock time to seed the draft with, since a scoreboard carries no date. */
  playedAt: string;
};

/** Caps what a single request can spend on the vision API, in decoded bytes. */
const MAX_IMAGE_BYTES = 1_500_000;

/**
 * Reads a scoreboard image into an editable draft. Passphrase-gated like submitMatch,
 * because this one costs money per call and would otherwise be an open API proxy.
 */
export async function extractScoreboard(input: ExtractInput): Promise<ExtractResult> {
  if (!passphraseMatches(input.passphrase ?? "")) {
    return { ok: false, errors: ["That passphrase is not right."] };
  }
  if (!isVisionConfigured()) {
    return { ok: false, errors: ["Screenshot reading is not configured."] };
  }

  const base64 = input.imageBase64 ?? "";
  if (!base64) return { ok: false, errors: ["No image was uploaded."] };
  if (base64.length * 0.75 > MAX_IMAGE_BYTES) {
    return { ok: false, errors: ["That image is too large even after resizing."] };
  }

  let raw, model;
  try {
    ({ raw, model } = await readScoreboard(base64));
  } catch (err) {
    if (err instanceof VisionError) return { ok: false, errors: [err.message] };
    throw err;
  }

  const draft = toDraft(raw, input.playedAt);

  // Resolving handles here rather than in the browser means a returning player is
  // already matched when the form appears, so a repeat lineup needs no dropdown work.
  const aliases = await getAliases();
  const resolved: DraftMatch = {
    ...draft,
    teams: draft.teams.map((team) => ({
      ...team,
      players: team.players.map((line) => ({
        ...line,
        playerId: aliases[normalizeName(line.name)],
      })),
    })) as DraftMatch["teams"],
  };

  // The screenshot is kept so a disputed match can be checked against what was actually
  // on screen. This is the downscaled copy, which is the one the model read.
  const blob = await put(`scoreboards/${newMatchId()}.jpg`, Buffer.from(base64, "base64"), {
    access: "public",
    contentType: "image/jpeg",
  });

  return {
    ok: true,
    draft: resolved,
    warnings: extractionWarnings(raw),
    blobUrl: blob.url,
    extractionModel: model,
  };
}

function passphraseMatches(supplied: string): boolean {
  const expected = process.env.SUBMIT_PASSPHRASE;
  if (!expected) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the length.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The browser claims where a draft came from, so the blob URL is checked against the
 * store's own hostname rather than trusted. A bad claim downgrades to manual instead of
 * failing the save: provenance is an audit detail, not a reason to lose a match.
 */
function sourceFrom(origin: DraftOrigin | undefined, confirmedBy: string): MatchSource {
  if (!origin?.blobUrl) return { kind: "manual", confirmedBy };

  let host: string;
  try {
    const url = new URL(origin.blobUrl);
    if (url.protocol !== "https:") return { kind: "manual", confirmedBy };
    host = url.hostname;
  } catch {
    return { kind: "manual", confirmedBy };
  }
  if (!host.endsWith(".blob.vercel-storage.com")) return { kind: "manual", confirmedBy };

  return {
    kind: "screenshot",
    blobUrl: origin.blobUrl,
    confirmedBy,
    extractionModel: String(origin.extractionModel ?? "unknown"),
    editedFields: (origin.editedFields ?? []).filter((f) => typeof f === "string").slice(0, 200),
  };
}

/**
 * The only way a match reaches storage. Rendering the form is not a security boundary,
 * so everything is re-checked here: the passphrase, the shape of the draft, and whether
 * the roster ids the client sent actually exist.
 */
export async function submitMatch(input: SubmitInput): Promise<SubmitResult> {
  if (!passphraseMatches(input.passphrase ?? "")) {
    return { ok: false, errors: ["That passphrase is not right."] };
  }

  if (!isStoreConfigured()) {
    return { ok: false, errors: ["The match store is not configured."] };
  }

  const submittedBy = input.submittedBy?.trim();
  if (!submittedBy) {
    return { ok: false, errors: ["Say who is submitting this."] };
  }

  const draft = input.draft;
  const errors = validateDraft(draft);
  if (errors.length > 0) return { ok: false, errors };

  const roster = await getPlayers();
  const known = new Set(roster.map((p) => p.id));
  const lines = draft.teams.flatMap((t) => t.players);

  const unknown = lines
    .filter((l) => l.playerId !== NEW_PLAYER && !known.has(l.playerId!))
    .map((l) => l.name);
  if (unknown.length > 0) {
    return {
      ok: false,
      errors: [`No longer on the roster: ${unknown.join(", ")}. Reload and try again.`],
    };
  }

  const now = new Date().toISOString();
  const taken = new Set(known);
  const created: Player[] = [];

  const resolved: DraftMatch = {
    ...draft,
    teams: draft.teams.map((team) => ({
      ...team,
      players: team.players.map((line) => {
        if (line.playerId !== NEW_PLAYER) return line;
        const id = newPlayerId(line.name, taken);
        taken.add(id);
        created.push({
          id,
          displayName: line.name.trim(),
          createdAt: now,
          active: true,
        });
        return { ...line, playerId: id };
      }),
    })) as [DraftMatch["teams"][0], DraftMatch["teams"][1]],
  };

  const match = toMatchRecord(resolved, {
    id: newMatchId(),
    submittedBy,
    submittedAt: now,
    source: sourceFrom(input.origin, submittedBy),
  });

  const duplicate = await findDuplicate(match);
  if (duplicate && !input.acceptDuplicate) {
    return {
      ok: false,
      errors: [
        duplicate.confidence === "exact"
          ? "This exact scoreboard has already been submitted."
          : "The same roster, map, score and day is already recorded.",
      ],
      duplicate,
    };
  }

  await Promise.all(created.map(savePlayer));

  // Remember every handle that appeared, so the next scoreboard with the same spelling
  // resolves without anyone having to pick from a dropdown.
  await Promise.all(
    resolved.teams
      .flatMap((t) => t.players)
      .map((line) => setAlias(line.name, line.playerId!))
  );

  await saveMatch(match);

  revalidatePath("/");
  revalidatePath("/leaderboard");
  revalidatePath("/matches");
  revalidatePath("/balance");

  return { ok: true, matchId: match.id };
}
