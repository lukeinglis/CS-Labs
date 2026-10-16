import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "../login/actions";
import { Container } from "@/components/ui";
import { canSeeStats } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: "Player stats", template: "%s | Player stats | CS Labs" },
  // Signed-in pages, so there is nothing here for a crawler to have.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * This redirect is for navigation, not for safety. Next's own guidance is that
 * render-time gating is not a security boundary, so the real refusal lives in
 * `loadRankings`, which throws for a caller who cannot see stats whatever route it
 * came from. This layout only means a visitor without the passphrase lands on a form
 * instead of a stack trace.
 */
export default async function StatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await canSeeStats())) redirect("/login");

  return (
    <>
      <div className="border-b border-ct/20 bg-ct/5">
        <Container className="flex flex-wrap items-center gap-x-5 gap-y-2 py-2.5">
          <span className="font-heading text-xs font-bold uppercase tracking-wider text-ct">
            Player stats
          </span>
          <Link href="/stats" className="text-sm text-gray-300 hover:text-accent">
            Leaderboard
          </Link>
          <Link href="/stats/matches" className="text-sm text-gray-300 hover:text-accent">
            Matches
          </Link>
          <Link href="/" className="text-sm text-gray-300 hover:text-accent">
            Back to the public site
          </Link>
          <form action={signOut} className="ml-auto">
            <button type="submit" className="text-sm text-gray-500 hover:text-loss">
              Sign out
            </button>
          </form>
        </Container>
      </div>
      {children}
    </>
  );
}
