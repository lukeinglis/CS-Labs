import type { Metadata } from "next";
import Link from "next/link";
import MatchList from "@/components/MatchList";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { loadPlayers, loadPublicMatches } from "@/lib/data";

export const metadata: Metadata = { title: "Matches" };

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const [matches, players] = await Promise.all([loadPublicMatches(), loadPlayers()]);
  const names = new Map(players.map((p) => [p.id, p.displayName]));

  return (
    <>
      <PageHeader
        title="Matches"
        subtitle={`${matches.length} recorded ${matches.length === 1 ? "match" : "matches"}, newest first.`}
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
          <MatchList
            matches={matches}
            names={names}
            matchBase="/matches"
          />
        )}
      </Container>
    </>
  );
}
