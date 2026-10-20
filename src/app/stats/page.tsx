import type { Metadata } from "next";
import Link from "next/link";
import HeadToHead from "@/components/HeadToHead";
import LeaderboardTable, { type PerformanceColumns } from "@/components/LeaderboardTable";
import SliceBoard from "@/components/SliceBoard";
import {
  Card,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { loadRankings } from "@/lib/data";
import { toPublicMatch, toPublicRating } from "@/lib/public";
import { againstMatrix, mapsPlayed, teamSizesPlayed } from "@/lib/records";

export const metadata: Metadata = { title: "Leaderboard" };

export const dynamic = "force-dynamic";

export default async function StatsLeaderboardPage() {
  // The layout already proved this request can see stats, so skip the second cookie
  // read. `loadRankings` is still the thing that refuses a caller who cannot.
  const { ranked, matches } = await loadRankings({ assumeAccess: true });

  // The players still go through the public projection and the performance numbers
  // travel in their own map, so the one path to a perf value on this page is the
  // explicit prop. Same component as the public table, two extra columns.
  const performance: PerformanceColumns = Object.fromEntries(
    ranked.map((p) => [p.playerId, { perfRating: p.perfRating, overall: p.overall }])
  );
  /**
   * Ordered by `overall`, the number that folds individual output into the team result.
   * That is what `computeRatings` already sorts its own output by and what the table
   * leads with once performance is in play. The sort happens before the projection
   * because `overall` is one of the fields the projection drops.
   */
  const players = ranked
    .slice()
    .sort((a, b) => b.overall - a.overall)
    .map((p) => ({ ...toPublicRating(p), displayName: p.displayName }));

  /**
   * The breakdowns below are win/loss only, so they run off the public projection of
   * the match log rather than the raw records. Two of the three components that consume
   * it are client components, which means this array is serialised into the page: the
   * projection is what keeps kills, damage and screenshot URLs out of that payload.
   */
  const publicMatches = matches.map(toPublicMatch);
  const names = new Map(players.map((p) => [p.playerId, p.displayName]));
  const matrix = againstMatrix(publicMatches);

  return (
    <>
      <PageHeader
        title="Leaderboard"
        subtitle={`All ${matches.length} matches, individual performance included. Nothing on this page is visible without the passphrase.`}
      />

      <Container className="space-y-6 py-8">
        {players.length === 0 ? (
          <EmptyState title="No matches yet">
            Ratings appear once the first scoreboard is submitted.{" "}
            <Link href="/submit" className="text-accent hover:underline">
              Submit a match
            </Link>
            .
          </EmptyState>
        ) : (
          <>
            <Card>
              <LeaderboardTable
                players={players}
                performance={performance}
                playerBase="/stats/players"
                breakdown={{ matches: publicMatches, names }}
              />
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>One map, one format</CardTitle>
                <span className="text-xs text-gray-500">Win/loss only</span>
              </CardHeader>
              <SliceBoard
                players={players}
                matches={publicMatches}
                maps={mapsPlayed(publicMatches)}
                sizes={teamSizesPlayed(publicMatches)}
                playerBase="/stats/players"
              />
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Head to head</CardTitle>
                <span className="text-xs text-gray-500">Row player&apos;s record</span>
              </CardHeader>
              <HeadToHead players={players} matrix={matrix} playerBase="/stats/players" />
            </Card>
          </>
        )}
      </Container>
    </>
  );
}
