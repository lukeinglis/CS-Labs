"use server";

import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  NEW_PLAYER,
  newMatchId,
  newPlayerId,
  toMatchRecord,
  validateDraft,
  type DraftMatch,
} from "@/lib/draft";
import {
  findDuplicate,
  getPlayers,
  isStoreConfigured,
  saveMatch,
  savePlayer,
  setAlias,
  type DuplicateHit,
} from "@/lib/storage";
import type { Player } from "@/lib/types";

export type SubmitResult =
  | { ok: true; matchId: string }
  | { ok: false; errors: string[]; duplicate?: DuplicateHit };

export type SubmitInput = {
  passphrase: string;
  submittedBy: string;
  draft: DraftMatch;
  /** Set once the submitter has seen a duplicate warning and chosen to save anyway. */
  acceptDuplicate?: boolean;
};

function passphraseMatches(supplied: string): boolean {
  const expected = process.env.SUBMIT_PASSPHRASE;
  if (!expected) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the length.
  return a.length === b.length && timingSafeEqual(a, b);
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
    source: { kind: "manual", confirmedBy: submittedBy },
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
