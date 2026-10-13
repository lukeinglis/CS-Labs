import type { Metadata } from "next";
import Link from "next/link";
import { ranking } from "../../../cs-labs.config";
import BalanceClient, { type BalanceRosterEntry } from "@/components/BalanceClient";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { buildPairCounts } from "@/lib/balance";
import { loadRankings } from "@/lib/data";

export const metadata: Metadata = { title: "Balance Teams" };

export const dynamic = "force-dynamic";

export default async function BalancePage() {
  const { ranked, matches } = await loadRankings();

  // Only recent history counts, otherwise a pairing from a year ago keeps being
  // penalised long after the lineup has moved on.
  const pairs = [...buildPairCounts(matches, 20)];

  const roster: BalanceRosterEntry[] = ranked.map((p) => ({
    playerId: p.playerId,
    displayName: p.displayName,
    // Balancing uses the pure team-outcome rating, not the performance-adjusted one,
    // because that is the number openskill can turn into a win probability.
    mu: p.mu,
    sigma: p.sigma,
    games: p.games,
    provisional: p.provisional,
  }));

  return (
    <>
      <PageHeader
        title="Balance Teams"
        subtitle="Pick who is in the lobby and this works through every legal split, scoring each on how close to a coin flip it is."
      />

      <Container className="py-8">
        {roster.length < 2 ? (
          <EmptyState title="Not enough players yet">
            The balancer needs at least two rated players.{" "}
            <Link href="/submit" className="text-accent hover:underline">
              Submit a match
            </Link>{" "}
            to build up the roster. Ratings settle after {ranking.provisionalGames} games each.
          </EmptyState>
        ) : (
          <BalanceClient roster={roster} pairs={pairs} />
        )}
      </Container>
    </>
  );
}
