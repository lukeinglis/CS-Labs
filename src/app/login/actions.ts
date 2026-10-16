"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  isAdminConfigured,
  issueToken,
  passphraseIsCorrect,
} from "@/lib/session";

/** Thirty days. Long enough to stay signed in between game nights. */
const MAX_AGE = 60 * 60 * 24 * 30;

export async function signIn(formData: FormData): Promise<void> {
  const supplied = String(formData.get("passphrase") ?? "");

  if (!isAdminConfigured()) redirect("/login?error=unconfigured");

  if (!passphraseIsCorrect(supplied)) {
    // A deliberate pause. The compare itself is constant time, but nothing else stops
    // someone working through a word list, and there is no legitimate reason to need
    // more than a couple of attempts a second.
    await new Promise((resolve) => setTimeout(resolve, 400));
    redirect("/login?error=wrong");
  }

  const token = issueToken();
  if (!token) redirect("/login?error=unconfigured");

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });

  redirect("/admin");
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect("/");
}
