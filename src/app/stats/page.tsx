import type { Metadata } from "next";
import Link from "next/link";
import LeaderboardTable, { type PerformanceColumns } from "@/components/LeaderboardTable";
import { Card, Container, EmptyState, PageHeader } from "@/components/ui";
import { loadRankings } from "@/lib/data";
import { toPublicRating } from "@/lib/public";

export const metadata: Metadata = { title: "Leaderboard" };

export const dynamic = "force-dynamic";

export default async function AdminLeaderboardPage() {
  // The layout already proved this request is admin, so skip the second cookie read.
  const { ranked, matches } = await loadRankings({ assumeAccess: true });

  // The players still go through the public projection and the performance numbers
  // travel in their own map, so the one path to a perf value on this page is the
  // explicit prop. Same component as the public table, two extra columns.
  const performance: PerformanceColumns = Object.fromEntries(
    ranked.map((p) => [p.playerId, { perfRating: p.perfRating, overall: p.overall }])
  );
  const players = ranked
    .map((p) => ({ ...toPublicRating(p), displayName: p.displayName }))
    .sort((a, b) => b.teamRating - a.teamRating);

  return (
    <>
      <PageHeader
        title="Leaderboard"
        subtitle={`All ${matches.length} matches, individual performance included. Nothing on this page is visible without the passphrase.`}
      />

      <Container className="py-8">
        {players.length === 0 ? (
          <EmptyState title="No matches yet">
            Ratings appear once the first scoreboard is submitted.{" "}
            <Link href="/submit" className="text-accent hover:underline">
              Submit a match
            </Link>
            .
          </EmptyState>
        ) : (
          <Card>
            <LeaderboardTable
              players={players}
              performance={performance}
              playerBase="/stats/players"
            />
          </Card>
        )}
      </Container>
    </>
  );
}
