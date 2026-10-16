import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signIn } from "./actions";
import { Card, Container, PageHeader } from "@/components/ui";
import { isAdmin, isAdminConfigured } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sign in",
  // No reason for this to turn up in a search result.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  wrong: "That passphrase is not right.",
  unconfigured:
    "No passphrase is set on this deployment, so there is nothing to sign in to yet.",
};

type Props = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  if (await isAdmin()) redirect("/admin");

  const { error } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  return (
    <>
      <PageHeader
        title="Sign in"
        subtitle="Individual performance stats live behind this. Everything else on the site is open to everyone."
      />

      <Container className="py-8">
        <Card className="mx-auto max-w-md px-6 py-6">
          <form action={signIn} className="space-y-4">
            <div>
              <label
                htmlFor="passphrase"
                className="block text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                Passphrase
              </label>
              <input
                id="passphrase"
                name="passphrase"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
                className="mt-1 w-full rounded-lg border border-white/15 bg-ink-light/60 px-3 py-2 text-white outline-none focus:border-accent"
              />
            </div>

            {message && (
              <p role="alert" className="text-sm text-loss">
                {message}
              </p>
            )}

            {!isAdminConfigured() && !message && (
              <p className="text-sm text-gray-500">
                Set <code className="text-gray-300">ADMIN_PASSPHRASE</code> to enable this.
              </p>
            )}

            <button
              type="submit"
              className="font-heading w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:bg-accent/90"
            >
              Sign in
            </button>
          </form>
        </Card>
      </Container>
    </>
  );
}
