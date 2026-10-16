import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The cookie jar is faked rather than the whole request, because what is worth
 * asserting is the rule, not Next's plumbing: a token only passes if it was minted
 * from the passphrase this deployment is actually holding.
 */
const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  }),
}));

// `isAdmin` is wrapped in React's `cache`, which dedupes within a render. Tests are
// not a render, so each one re-imports the module to get a fresh cache.
async function freshSession() {
  vi.resetModules();
  return import("./session");
}

const original = process.env.ADMIN_PASSPHRASE;

beforeEach(() => {
  jar.clear();
});

afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_PASSPHRASE;
  else process.env.ADMIN_PASSPHRASE = original;
});

describe("passphraseIsCorrect", () => {
  it("accepts the configured passphrase and nothing else", async () => {
    process.env.ADMIN_PASSPHRASE = "correct horse battery";
    const { passphraseIsCorrect } = await freshSession();

    expect(passphraseIsCorrect("correct horse battery")).toBe(true);
    expect(passphraseIsCorrect("correct horse batterz")).toBe(false);
  });

  // timingSafeEqual throws on a length mismatch, so a near miss of the wrong length
  // has to be handled before the compare rather than blowing up the sign-in.
  it("rejects a wrong length without throwing", async () => {
    process.env.ADMIN_PASSPHRASE = "correct horse battery";
    const { passphraseIsCorrect } = await freshSession();

    expect(passphraseIsCorrect("")).toBe(false);
    expect(passphraseIsCorrect("correct")).toBe(false);
    expect(passphraseIsCorrect("correct horse battery staple")).toBe(false);
  });

  it("refuses everything when no passphrase is configured", async () => {
    delete process.env.ADMIN_PASSPHRASE;
    const { isAdminConfigured, issueToken, passphraseIsCorrect } = await freshSession();

    expect(isAdminConfigured()).toBe(false);
    expect(issueToken()).toBeNull();
    // Notably including the empty string, which is what an empty form field sends.
    expect(passphraseIsCorrect("")).toBe(false);
    expect(passphraseIsCorrect("anything")).toBe(false);
  });
});

describe("issueToken", () => {
  it("does not contain the passphrase", async () => {
    process.env.ADMIN_PASSPHRASE = "correct horse battery";
    const { issueToken } = await freshSession();

    const token = issueToken()!;
    expect(token).not.toContain("correct");
    expect(token).not.toContain("horse");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the passphrase changes", async () => {
    process.env.ADMIN_PASSPHRASE = "one";
    const first = (await freshSession()).issueToken();
    process.env.ADMIN_PASSPHRASE = "two";
    const second = (await freshSession()).issueToken();

    expect(first).not.toEqual(second);
  });
});

describe("isAdmin", () => {
  it("is false with no cookie", async () => {
    process.env.ADMIN_PASSPHRASE = "correct horse battery";
    const { isAdmin } = await freshSession();

    expect(await isAdmin()).toBe(false);
  });

  it("is true for a token minted from the current passphrase", async () => {
    process.env.ADMIN_PASSPHRASE = "correct horse battery";
    const { ADMIN_COOKIE, isAdmin, issueToken } = await freshSession();

    jar.set(ADMIN_COOKIE, issueToken()!);
    expect(await isAdmin()).toBe(true);
  });

  it("is false for a made-up token", async () => {
    process.env.ADMIN_PASSPHRASE = "correct horse battery";
    const { ADMIN_COOKIE, isAdmin } = await freshSession();

    jar.set(ADMIN_COOKIE, "f".repeat(64));
    expect(await isAdmin()).toBe(false);
  });

  // The point of rotating the passphrase is that it locks out anyone still holding a
  // cookie, which only works because the token is derived from the passphrase itself.
  it("stops accepting a token once the passphrase is rotated", async () => {
    process.env.ADMIN_PASSPHRASE = "old passphrase";
    const minted = (await freshSession()).issueToken()!;

    process.env.ADMIN_PASSPHRASE = "new passphrase";
    const { ADMIN_COOKIE, isAdmin } = await freshSession();
    jar.set(ADMIN_COOKIE, minted);

    expect(await isAdmin()).toBe(false);
  });

  it("is false when the deployment has no passphrase at all", async () => {
    delete process.env.ADMIN_PASSPHRASE;
    const { ADMIN_COOKIE, isAdmin } = await freshSession();

    // Even a cookie that looks plausible gets nowhere without something to check it
    // against, so an unconfigured deployment is closed rather than open.
    jar.set(ADMIN_COOKIE, "f".repeat(64));
    expect(await isAdmin()).toBe(false);
  });
});
