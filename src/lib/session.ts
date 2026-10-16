/**
 * The private side of the site, which is one person: Luke.
 *
 * The group was uneasy about individual stats being on a public page, so the deal is
 * that win/loss is public and everything else lives behind this gate. That makes this
 * module a privacy boundary rather than a convenience, which is why the check is a
 * signed cookie rather than a flag, and why `server-only` is imported: a stray import
 * from a client component should fail the build, not ship the secret to a browser.
 */
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";

export const ADMIN_COOKIE = "cs-labs.admin";

/**
 * Bumping this invalidates every issued cookie at once, which is the only way back if
 * the passphrase is ever shared with someone it should not have been.
 */
const TOKEN_VERSION = "v1";

/** Constant-time compare that does not leak the length through a thrown error. */
function equals(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The cookie is an HMAC of a constant, so it carries no information and cannot be
 * forged without the passphrase. There is exactly one principal, so there is nothing
 * to put in a payload and no session store to keep.
 */
function tokenFor(passphrase: string): string {
  return createHmac("sha256", passphrase).update(TOKEN_VERSION).digest("hex");
}

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSPHRASE);
}

export function passphraseIsCorrect(supplied: string): boolean {
  const expected = process.env.ADMIN_PASSPHRASE;
  if (!expected) return false;
  return equals(supplied, expected);
}

export function issueToken(): string | null {
  const expected = process.env.ADMIN_PASSPHRASE;
  return expected ? tokenFor(expected) : null;
}

/**
 * Whether this request may see individual performance.
 *
 * `cache` dedupes it across a single render, so a page and the data functions it calls
 * can each ask without re-reading the cookie. Reading a cookie also opts the route out
 * of being prerendered, which is exactly what we want: an authenticated render must
 * never be cached and handed to someone else.
 */
export const isAdmin = cache(async (): Promise<boolean> => {
  const expected = process.env.ADMIN_PASSPHRASE;
  if (!expected) return false;

  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token) return false;

  return equals(token, tokenFor(expected));
});
