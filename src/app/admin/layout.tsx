import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "../login/actions";
import { Container } from "@/components/ui";
import { isAdmin } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: "Private", template: "%s | Private | CS Labs" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * This redirect is for navigation, not for safety. Next's own guidance is that
 * render-time gating is not a security boundary, so the real refusal lives in
 * `loadRankings`, which throws for a non-admin whatever route called it. This layout
 * only means an unauthenticated visitor lands on a form instead of a stack trace.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdmin())) redirect("/login");

  return (
    <>
      <div className="border-b border-ct/20 bg-ct/5">
        <Container className="flex flex-wrap items-center gap-x-5 gap-y-2 py-2.5">
          <span className="font-heading text-xs font-bold uppercase tracking-wider text-ct">
            Private
          </span>
          <Link href="/admin" className="text-sm text-gray-300 hover:text-accent">
            Leaderboard
          </Link>
          <Link href="/admin/matches" className="text-sm text-gray-300 hover:text-accent">
            Matches
          </Link>
          <Link href="/" className="text-sm text-gray-300 hover:text-accent">
            Public site
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
