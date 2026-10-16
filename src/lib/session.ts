/**
 * Who is allowed to see what, and who is allowed to change it.
 *
 * There are two gates here, and keeping them apart is the point of the module.
 *
 * The league gate is a privacy boundary. The group was uneasy about individual stats
 * sitting on a public page, so the deal is that win/loss is public and individual
 * performance is for the people who play. That passphrase is meant to be shared widely,
 * which is exactly why it must not authorize anything destructive.
 *
 * The admin gate is an authorization boundary, and it is one person. It guards voiding
 * a match, which rewrites every rating on the site.
 *
 * One gate for both would mean that handing someone the stats passphrase also handed
 * them the ability to void matches. So: two secrets, two cookies, two predicates.
 *
 * `server-only` is imported because a stray import from a client component should fail
 * the build rather than ship a secret to a browser.
 */
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";

export const LEAGUE_COOKIE = "cs-labs.league";
export const ADMIN_COOKIE = "cs-labs.admin";

/**
 * Bumping this invalidates every issued cookie of both kinds at once, which is the way
 * back if either passphrase reaches someone it should not have.
 */
const TOKEN_VERSION = "v1";

/** Which gate a call is about. */
export type Role = "league" | "admin";

const ENV_VAR: Record<Role, string> = {
  league: "LEAGUE_PASSPHRASE",
  admin: "ADMIN_PASSPHRASE",
};

const COOKIE: Record<Role, string> = {
  league: LEAGUE_COOKIE,
  admin: ADMIN_COOKIE,
};

function secretFor(role: Role): string | undefined {
  return process.env[ENV_VAR[role]];
}

/** Constant-time compare that does not leak the length through a thrown error. */
function equals(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The cookie is an HMAC of a constant, so it carries no information and cannot be
 * forged without the passphrase. Each role has one principal, so there is nothing to
 * put in a payload and no session store to keep.
 *
 * The role is mixed into the message so the two cookies differ even if both passphrases
 * are set to the same string, which would otherwise quietly promote every league member
 * to admin.
 */
function tokenFor(role: Role, passphrase: string): string {
  return createHmac("sha256", passphrase)
    .update(`${TOKEN_VERSION}:${role}`)
    .digest("hex");
}

export function isConfigured(role: Role): boolean {
  return Boolean(secretFor(role));
}

export function passphraseIsCorrect(role: Role, supplied: string): boolean {
  const expected = secretFor(role);
  if (!expected) return false;
  return equals(supplied, expected);
}

export function issueToken(role: Role): string | null {
  const expected = secretFor(role);
  return expected ? tokenFor(role, expected) : null;
}

/** Whether the request carries a valid cookie for this role. */
async function holds(role: Role): Promise<boolean> {
  const expected = secretFor(role);
  if (!expected) return false;

  const jar = await cookies();
  const token = jar.get(COOKIE[role])?.value;
  if (!token) return false;

  return equals(token, tokenFor(role, expected));
}

/**
 * Whether this request may see individual performance.
 *
 * An admin cookie counts, so the one person holding both secrets signs in once rather
 * than twice. The implication runs one way only: a league cookie never grants admin.
 *
 * `cache` dedupes across a single render, so a page and the data functions it calls can
 * each ask without re-reading the cookie. Reading a cookie also opts the route out of
 * being prerendered, which is what we want: an authenticated render must never be
 * cached and handed to someone else.
 */
export const canSeeStats = cache(
  async (): Promise<boolean> => (await holds("league")) || (await holds("admin"))
);

/**
 * Whether this request may change the record. Admin cookie only.
 *
 * Deliberately not satisfied by a league cookie. That passphrase is shared with
 * everyone who plays, so anything this guarded would effectively be open.
 */
export const isAdmin = cache(async (): Promise<boolean> => holds("admin"));
