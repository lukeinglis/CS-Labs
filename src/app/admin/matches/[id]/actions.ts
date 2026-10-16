"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/session";
import { restoreMatch, voidMatch } from "@/lib/storage";

/**
 * Recorded on the match so the history says who did it. There is exactly one admin
 * principal, so this is a constant rather than something read off a form: a name typed
 * into a field nobody checks would be worse than no attribution at all.
 */
const ACTOR = "admin";

/** Long enough for a sentence, short enough that it still fits the banner. */
const MAX_REASON = 200;

/**
 * A Server Action is a POST endpoint on the page that renders it, reachable by anyone
 * who can send the request. Next's own guidance is explicit that render-time gating is
 * not a security boundary, so the `/admin` layout redirect does nothing for this: the
 * check has to be here. It throws rather than returning quietly, because a missed
 * authorization on something that rewrites every rating should fail loudly.
 */
async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error("Voiding a match is admin only.");
  }
}

/**
 * Voiding moves every rating on the site, not just this match, so the whole read model
 * is stale afterwards and not merely one page.
 */
function refresh(matchId: string): void {
  for (const path of [
    "/",
    "/leaderboard",
    "/matches",
    "/balance",
    "/admin",
    "/admin/matches",
  ]) {
    revalidatePath(path);
  }

  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/admin/matches/${matchId}`);

  // Every player page carries a record and a match history, and any of them may include
  // this match. A route pattern plus `page` covers the lot without enumerating ids.
  revalidatePath("/players/[id]", "page");
  revalidatePath("/admin/players/[id]", "page");
}

export async function voidMatchAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("matchId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  // No id means a hand-made request rather than a mistyped form, so there is no useful
  // page to send it back to.
  if (!id) throw new Error("No match id was supplied.");

  if (!reason) redirect(`/admin/matches/${id}?error=reason`);
  if (reason.length > MAX_REASON) redirect(`/admin/matches/${id}?error=long`);

  const voided = await voidMatch(id, reason, ACTOR);
  if (!voided) redirect(`/admin/matches/${id}?error=missing`);

  refresh(id);
  redirect(`/admin/matches/${id}?done=voided`);
}

export async function restoreMatchAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("matchId") ?? "");
  if (!id) throw new Error("No match id was supplied.");

  const restored = await restoreMatch(id);
  if (!restored) redirect(`/admin/matches/${id}?error=missing`);

  refresh(id);
  redirect(`/admin/matches/${id}?done=restored`);
}
