import type { Metadata } from "next";
import Link from "next/link";
import MatchList from "@/components/MatchList";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { loadPlayers, loadRankings } from "@/lib/data";
import { toPublicMatch } from "@/lib/public";

export const metadata: Metadata = { title: "Matches" };

export const dynamic = "force-dynamic";

export default async function AdminMatchesPage() {
  const [{ matches }, players] = await Promise.all([
    loadRankings({ assumeAccess: true }),
    loadPlayers(),
  ]);
  const names = new Map(players.map((p) => [p.id, p.displayName]));

  return (
    <>
      <PageHeader
        title="Matches"
        subtitle={`${matches.length} recorded ${matches.length === 1 ? "match" : "matches"}. Open one for the full scoreboard.`}
      />

      <Container className="py-8">
        {matches.length === 0 ? (
          <EmptyState title="No matches yet">
            Upload a scoreboard screenshot and the result lands here.{" "}
            <Link href="/submit" className="text-accent hover:underline">
              Submit a match
            </Link>
            .
          </EmptyState>
        ) : (
          // The list itself shows nothing private, so it takes the projection here too.
          // Only the link target differs from the public page.
          <MatchList
            matches={matches.map(toPublicMatch)}
            names={names}
            matchBase="/stats/matches"
          />
        )}
      </Container>
    </>
  );
}
