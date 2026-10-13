import type { Metadata } from "next";
import Link from "next/link";
import { ranking } from "../../../cs-labs.config";
import LeaderboardTable from "@/components/LeaderboardTable";
import { Card, Container, EmptyState, PageHeader } from "@/components/ui";
import { loadRankings } from "@/lib/data";

export const metadata: Metadata = { title: "Leaderboard" };

// Ratings are derived from the whole match log in KV, so there is nothing to cache.
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const { ranked, matches } = await loadRankings();

  return (
    <>
      <PageHeader
        title="Leaderboard"
        subtitle={`Every rating is replayed from all ${matches.length} recorded matches, so correcting an old scoreboard updates the whole table.`}
      />

      <Container className="py-8">
        {ranked.length === 0 ? (
          <EmptyState title="No matches yet">
            Ratings appear once the first scoreboard is submitted.{" "}
            <Link href="/submit" className="text-accent hover:underline">
              Submit a match
            </Link>{" "}
            to get started.
          </EmptyState>
        ) : (
          <Card>
            <LeaderboardTable players={ranked} />
          </Card>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-accent">
              Overall
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              The headline number. Team result sets the direction, then individual output
              nudges the size of the move. A big game on a loss can claw back to
              break-even, never into a gain.
            </p>
          </Card>
          <Card className="p-5">
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-ct">
              Team
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              Wins and round margins only, ignoring personal stats. This is the number the
              team balancer uses, because it is the one that predicts results.
            </p>
          </Card>
          <Card className="p-5">
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-gray-300">
              Perf
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              Kills, assists, deaths and ADR measured against the rest of that lobby, so a
              sweaty game does not inflate everyone. 1.00 is exactly average. Ranked after{" "}
              {ranking.provisionalGames} games.
            </p>
          </Card>
        </div>
      </Container>
    </>
  );
}
