"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  LEAGUE_COOKIE,
  isConfigured,
  issueToken,
  passphraseIsCorrect,
  type Role,
} from "@/lib/session";

/** Thirty days. Long enough to stay signed in between game nights. */
const MAX_AGE = 60 * 60 * 24 * 30;

const COOKIE: Record<Role, string> = {
  league: LEAGUE_COOKIE,
  admin: ADMIN_COOKIE,
};

/** Where each form lives, so a failed attempt goes back to the one you used. */
const FORM: Record<Role, string> = {
  league: "/login",
  admin: "/login/admin",
};

async function signInAs(role: Role, formData: FormData): Promise<void> {
  const supplied = String(formData.get("passphrase") ?? "");
  const form = FORM[role];

  if (!isConfigured(role)) redirect(`${form}?error=unconfigured`);

  if (!passphraseIsCorrect(role, supplied)) {
    // A deliberate pause. The compare itself is constant time, but nothing else stops
    // someone working through a word list, and there is no legitimate reason to need
    // more than a couple of attempts a second.
    await new Promise((resolve) => setTimeout(resolve, 400));
    redirect(`${form}?error=wrong`);
  }

  const token = issueToken(role);
  if (!token) redirect(`${form}?error=unconfigured`);

  const jar = await cookies();
  jar.set(COOKIE[role], token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });

  redirect("/stats");
}

export async function signIn(formData: FormData): Promise<void> {
  await signInAs("league", formData);
}

/**
 * Signing in as admin does not replace a league sign-in so much as cover it, since
 * `canSeeStats` accepts either cookie. One form is enough for the person holding both.
 */
export async function signInAsAdmin(formData: FormData): Promise<void> {
  await signInAs("admin", formData);
}

/** Clears both, so "sign out" means what it says however you signed in. */
export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(LEAGUE_COOKIE);
  jar.delete(ADMIN_COOKIE);
  redirect("/");
}
