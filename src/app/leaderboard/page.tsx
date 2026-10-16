import type { Metadata } from "next";
import Link from "next/link";
import { ranking } from "../../../cs-labs.config";
import LeaderboardTable from "@/components/LeaderboardTable";
import { Card, Container, EmptyState, PageHeader } from "@/components/ui";
import { loadPublicRankings } from "@/lib/data";

export const metadata: Metadata = { title: "Leaderboard" };

// Ratings are derived from the whole match log in KV, so there is nothing to cache.
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const { ranked, matches } = await loadPublicRankings();

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
              Rating
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              Built from games won and lost, nothing else. The round gap sizes each move
              and the strength of the other team scales it, so beating the stacked side is
              worth more than beating the players they beat. Ranked after{" "}
              {ranking.provisionalGames} games.
            </p>
          </Card>
          <Card className="p-5">
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-ct">
              Why not just win percentage
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              Because it has no idea who you played. Someone who keeps landing on the
              stacked team and goes 50% has done more than someone who farmed a 60%
              against the bottom of the table. Both numbers are in the table, so judge for
              yourself.
            </p>
          </Card>
          <Card className="p-5">
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-gray-300">
              No personal stats
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              Kills, deaths and damage are deliberately left out of all of this. Click a
              name for the full win/loss picture: by map, by lobby size, and against every
              individual person.
            </p>
          </Card>
        </div>
      </Container>
    </>
  );
}
