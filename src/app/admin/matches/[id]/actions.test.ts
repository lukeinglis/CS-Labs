import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A Server Action is a POST endpoint on the page that renders it, so the `/admin` layout
 * redirect does nothing to protect these. The test that matters is therefore not "does a
 * non-admin get an error" but "does a non-admin reach the store at all": the refusal has
 * to happen before the mutation, not alongside it.
 */
let admin = false;

const voidMatch = vi.fn(async (id: string) => ({ id, voided: true }));
const restoreMatch = vi.fn(async (id: string) => ({ id }));
const revalidatePath = vi.fn();

vi.mock("@/lib/session", () => ({ isAdmin: async () => admin }));
vi.mock("@/lib/storage", () => ({
  voidMatch: (...args: unknown[]) => voidMatch(...(args as [string])),
  restoreMatch: (...args: unknown[]) => restoreMatch(...(args as [string])),
}));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

/** `redirect` throws in Next, and the actions lean on that to stop. Keep that shape. */
class Redirected extends Error {
  constructor(public to: string) {
    super(`redirect:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

const { restoreMatchAction, voidMatchAction } = await import("./actions");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

/** Returns where the action redirected to, or throws anything that was not a redirect. */
async function redirectOf(run: Promise<void>): Promise<string> {
  try {
    await run;
  } catch (err) {
    if (err instanceof Redirected) return err.to;
    throw err;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  admin = false;
  voidMatch.mockClear();
  restoreMatch.mockClear();
  revalidatePath.mockClear();
});

describe("the void gate", () => {
  it("refuses a signed-out caller before touching the store", async () => {
    await expect(
      voidMatchAction(form({ matchId: "m-1", reason: "wrong map" }))
    ).rejects.toThrow(/admin only/i);
    expect(voidMatch).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller for a restore too", async () => {
    await expect(restoreMatchAction(form({ matchId: "m-1" }))).rejects.toThrow(
      /admin only/i
    );
    expect(restoreMatch).not.toHaveBeenCalled();
  });

  it("does not leak whether the match exists to a signed-out caller", async () => {
    await expect(
      voidMatchAction(form({ matchId: "nonsense", reason: "x" }))
    ).rejects.toThrow(/admin only/i);
    expect(voidMatch).not.toHaveBeenCalled();
  });
});

describe("voiding", () => {
  beforeEach(() => {
    admin = true;
  });

  it("stores the reason and who did it", async () => {
    expect(await redirectOf(voidMatchAction(form({ matchId: "m-1", reason: "wrong map" }))))
      .toBe("/admin/matches/m-1?done=voided");
    expect(voidMatch).toHaveBeenCalledWith("m-1", "wrong map", "admin");
  });

  it("trims the reason, so whitespace does not pass for one", async () => {
    expect(
      await redirectOf(voidMatchAction(form({ matchId: "m-1", reason: "   \n  " })))
    ).toBe("/admin/matches/m-1?error=reason");
    expect(voidMatch).not.toHaveBeenCalled();
  });

  it("requires a reason, because the public page shows it", async () => {
    expect(await redirectOf(voidMatchAction(form({ matchId: "m-1" })))).toBe(
      "/admin/matches/m-1?error=reason"
    );
    expect(voidMatch).not.toHaveBeenCalled();
  });

  it("rejects a reason too long for the banner", async () => {
    const reason = "x".repeat(201);
    expect(await redirectOf(voidMatchAction(form({ matchId: "m-1", reason })))).toBe(
      "/admin/matches/m-1?error=long"
    );
    expect(voidMatch).not.toHaveBeenCalled();
  });

  it("accepts a reason of exactly the limit", async () => {
    await redirectOf(voidMatchAction(form({ matchId: "m-1", reason: "x".repeat(200) })));
    expect(voidMatch).toHaveBeenCalled();
  });

  it("throws on a missing id rather than redirecting nowhere", async () => {
    await expect(voidMatchAction(form({ reason: "wrong map" }))).rejects.toThrow(
      /match id/i
    );
  });

  it("reports a match that is no longer there", async () => {
    voidMatch.mockResolvedValueOnce(null as never);
    expect(await redirectOf(voidMatchAction(form({ matchId: "gone", reason: "x" })))).toBe(
      "/admin/matches/gone?error=missing"
    );
  });

  it("refreshes the pages a rating change touches, player pages included", async () => {
    await redirectOf(voidMatchAction(form({ matchId: "m-1", reason: "wrong map" })));
    const paths = revalidatePath.mock.calls.map((c) => c[0]);
    for (const p of ["/", "/leaderboard", "/matches", "/balance", "/matches/m-1"]) {
      expect(paths).toContain(p);
    }
    // A dynamic segment needs the explicit type, or Next throws rather than matching.
    expect(revalidatePath).toHaveBeenCalledWith("/players/[id]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/players/[id]", "page");
  });
});

describe("restoring", () => {
  beforeEach(() => {
    admin = true;
  });

  it("puts the match back and says so", async () => {
    expect(await redirectOf(restoreMatchAction(form({ matchId: "m-1" })))).toBe(
      "/admin/matches/m-1?done=restored"
    );
    expect(restoreMatch).toHaveBeenCalledWith("m-1");
  });

  it("needs no reason, since it is removing one", async () => {
    await redirectOf(restoreMatchAction(form({ matchId: "m-1" })));
    expect(restoreMatch).toHaveBeenCalledWith("m-1");
  });

  it("refreshes the same pages voiding does", async () => {
    await redirectOf(restoreMatchAction(form({ matchId: "m-1" })));
    expect(revalidatePath.mock.calls.map((c) => c[0])).toContain("/leaderboard");
  });
});
