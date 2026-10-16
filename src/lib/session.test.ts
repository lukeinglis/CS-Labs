import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The cookie jar is faked rather than the whole request, because what is worth
 * asserting is the rule, not Next's plumbing: a token only passes if it was minted
 * from the passphrase this deployment is actually holding, for the role being checked.
 *
 * The case this file exists for is the one at the bottom. The league passphrase is
 * shared with everyone who plays, so if a league cookie could satisfy `isAdmin` then
 * every player could void matches. That is the whole reason there are two gates.
 */
const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  }),
}));

// The predicates are wrapped in React's `cache`, which dedupes within a render. Tests
// are not a render, so each one re-imports the module to get a fresh cache.
async function freshSession() {
  vi.resetModules();
  return import("./session");
}

const originalLeague = process.env.LEAGUE_PASSPHRASE;
const originalAdmin = process.env.ADMIN_PASSPHRASE;

beforeEach(() => {
  jar.clear();
  process.env.LEAGUE_PASSPHRASE = "league words here";
  process.env.ADMIN_PASSPHRASE = "admin words here";
});

afterEach(() => {
  for (const [key, value] of [
    ["LEAGUE_PASSPHRASE", originalLeague],
    ["ADMIN_PASSPHRASE", originalAdmin],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("passphraseIsCorrect", () => {
  it("accepts the passphrase for that role and nothing else", async () => {
    const { passphraseIsCorrect } = await freshSession();

    expect(passphraseIsCorrect("league", "league words here")).toBe(true);
    expect(passphraseIsCorrect("admin", "admin words here")).toBe(true);
  });

  // The point of the split: neither passphrase is accepted by the other gate.
  it("does not accept the league passphrase as the admin one", async () => {
    const { passphraseIsCorrect } = await freshSession();

    expect(passphraseIsCorrect("admin", "league words here")).toBe(false);
    expect(passphraseIsCorrect("league", "admin words here")).toBe(false);
  });

  // timingSafeEqual throws on a length mismatch, so a near miss of the wrong length
  // has to be handled before the compare rather than blowing up the sign-in.
  it("rejects a wrong length without throwing", async () => {
    const { passphraseIsCorrect } = await freshSession();

    expect(passphraseIsCorrect("league", "")).toBe(false);
    expect(passphraseIsCorrect("league", "league")).toBe(false);
    expect(passphraseIsCorrect("league", "league words here and more")).toBe(false);
  });

  it("refuses everything for a role with no passphrase configured", async () => {
    delete process.env.ADMIN_PASSPHRASE;
    const { isConfigured, issueToken, passphraseIsCorrect } = await freshSession();

    expect(isConfigured("admin")).toBe(false);
    expect(isConfigured("league")).toBe(true);
    expect(issueToken("admin")).toBeNull();
    // Notably including the empty string, which is what an empty form field sends.
    expect(passphraseIsCorrect("admin", "")).toBe(false);
    expect(passphraseIsCorrect("admin", "anything")).toBe(false);
  });
});

describe("issueToken", () => {
  it("does not contain the passphrase", async () => {
    const { issueToken } = await freshSession();

    const token = issueToken("league")!;
    expect(token).not.toContain("league");
    expect(token).not.toContain("words");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the passphrase changes", async () => {
    process.env.LEAGUE_PASSPHRASE = "one";
    const first = (await freshSession()).issueToken("league");
    process.env.LEAGUE_PASSPHRASE = "two";
    const second = (await freshSession()).issueToken("league");

    expect(first).not.toEqual(second);
  });

  /**
   * The role is mixed into the HMAC message, so setting both passphrases to the same
   * string still yields two different tokens. Without that, a league cookie would be
   * byte-identical to an admin one and would pass the admin check.
   */
  it("differs by role even when both passphrases are identical", async () => {
    process.env.LEAGUE_PASSPHRASE = "same";
    process.env.ADMIN_PASSPHRASE = "same";
    const { issueToken } = await freshSession();

    expect(issueToken("league")).not.toEqual(issueToken("admin"));
  });
});

describe("canSeeStats", () => {
  it("is false with no cookie", async () => {
    const { canSeeStats } = await freshSession();
    expect(await canSeeStats()).toBe(false);
  });

  it("is true for a league cookie", async () => {
    const { LEAGUE_COOKIE, canSeeStats, issueToken } = await freshSession();

    jar.set(LEAGUE_COOKIE, issueToken("league")!);
    expect(await canSeeStats()).toBe(true);
  });

  // So the one person holding both secrets signs in once rather than twice.
  it("is true for an admin cookie alone", async () => {
    const { ADMIN_COOKIE, canSeeStats, issueToken } = await freshSession();

    jar.set(ADMIN_COOKIE, issueToken("admin")!);
    expect(await canSeeStats()).toBe(true);
  });

  it("is false for a made-up token", async () => {
    const { LEAGUE_COOKIE, canSeeStats } = await freshSession();

    jar.set(LEAGUE_COOKIE, "f".repeat(64));
    expect(await canSeeStats()).toBe(false);
  });

  // The point of rotating a passphrase is that it locks out anyone still holding a
  // cookie, which only works because the token is derived from the passphrase itself.
  it("stops accepting a token once the passphrase is rotated", async () => {
    const minted = (await freshSession()).issueToken("league")!;

    process.env.LEAGUE_PASSPHRASE = "rotated";
    const { LEAGUE_COOKIE, canSeeStats } = await freshSession();
    jar.set(LEAGUE_COOKIE, minted);

    expect(await canSeeStats()).toBe(false);
  });

  it("is false when the deployment has no passphrases at all", async () => {
    delete process.env.LEAGUE_PASSPHRASE;
    delete process.env.ADMIN_PASSPHRASE;
    const { ADMIN_COOKIE, LEAGUE_COOKIE, canSeeStats } = await freshSession();

    // Even a plausible-looking cookie gets nowhere without something to check it
    // against, so an unconfigured deployment is closed rather than open.
    jar.set(LEAGUE_COOKIE, "f".repeat(64));
    jar.set(ADMIN_COOKIE, "f".repeat(64));
    expect(await canSeeStats()).toBe(false);
  });
});

describe("isAdmin", () => {
  it("is true for an admin cookie", async () => {
    const { ADMIN_COOKIE, isAdmin, issueToken } = await freshSession();

    jar.set(ADMIN_COOKIE, issueToken("admin")!);
    expect(await isAdmin()).toBe(true);
  });

  /**
   * The one that matters. The league passphrase goes to everyone who plays, so if any
   * of these passed then handing out stats access would also hand out the ability to
   * rewrite every rating on the site.
   */
  it("is false for a league member, however they hold their cookie", async () => {
    const { ADMIN_COOKIE, LEAGUE_COOKIE, isAdmin, issueToken } = await freshSession();
    const league = issueToken("league")!;

    jar.set(LEAGUE_COOKIE, league);
    expect(await isAdmin()).toBe(false);

    // Including a league token moved into the admin cookie by hand.
    jar.set(ADMIN_COOKIE, league);
    expect(await isAdmin()).toBe(false);
  });

  it("is false for a league member even when both passphrases match", async () => {
    process.env.LEAGUE_PASSPHRASE = "same";
    process.env.ADMIN_PASSPHRASE = "same";
    const { ADMIN_COOKIE, isAdmin, issueToken } = await freshSession();

    jar.set(ADMIN_COOKIE, issueToken("league")!);
    expect(await isAdmin()).toBe(false);
  });

  it("is false with no cookie, and false for a made-up one", async () => {
    const { ADMIN_COOKIE, isAdmin } = await freshSession();

    expect(await isAdmin()).toBe(false);
    jar.set(ADMIN_COOKIE, "f".repeat(64));
    expect(await isAdmin()).toBe(false);
  });

  it("is false when no admin passphrase is configured", async () => {
    delete process.env.ADMIN_PASSPHRASE;
    const { ADMIN_COOKIE, isAdmin } = await freshSession();

    jar.set(ADMIN_COOKIE, "f".repeat(64));
    expect(await isAdmin()).toBe(false);
  });
});
