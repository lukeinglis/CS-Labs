import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Container, EmptyState, PageHeader, SideBadge } from "@/components/ui";
import { loadMatches, loadPlayers } from "@/lib/data";
import type { MatchRecord } from "@/lib/types";

export const metadata: Metadata = { title: "Matches" };

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function winnerIndex(match: MatchRecord): 0 | 1 | null {
  const [a, b] = match.teams;
  if (a.roundsWon === b.roundsWon) return null;
  return a.roundsWon > b.roundsWon ? 0 : 1;
}

export default async function MatchesPage() {
  const [matches, players] = await Promise.all([loadMatches(), loadPlayers()]);
  const names = new Map(players.map((p) => [p.id, p.displayName]));
  const newestFirst = matches.slice().reverse();

  return (
    <>
      <PageHeader
        title="Matches"
        subtitle={`${matches.length} recorded ${matches.length === 1 ? "match" : "matches"}, newest first.`}
      />

      <Container className="py-8">
        {newestFirst.length === 0 ? (
          <EmptyState title="No matches yet">
            Upload a scoreboard screenshot and the result lands here.{" "}
            <Link href="/submit" className="text-accent hover:underline">
              Submit a match
            </Link>
            .
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {newestFirst.map((match) => {
              const winner = winnerIndex(match);
              return (
                <li key={match.id}>
                  <Link href={`/matches/${match.id}`} className="block">
                    <Card hover className={match.voided ? "opacity-50" : ""}>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                        <div className="min-w-[8rem]">
                          <p className="font-heading text-base font-bold uppercase tracking-wide text-white">
                            {match.map}
                          </p>
                          <p className="text-xs text-gray-500">{formatDate(match.playedAt)}</p>
                        </div>

                        <div className="flex items-center gap-3">
                          {match.teams.map((team, i) => (
                            <div key={team.label} className="flex items-center gap-2">
                              {i === 1 && <span className="text-gray-600">vs</span>}
                              <SideBadge side={team.startingSide} />
                              <span
                                className={`font-heading text-2xl font-bold ${
                                  winner === i
                                    ? "text-win"
                                    : winner === null
                                      ? "text-gray-300"
                                      : "text-gray-500"
                                }`}
                              >
                                {team.roundsWon}
                              </span>
                            </div>
                          ))}
                          {winner === null && <Badge tone="muted">Draw</Badge>}
                        </div>

                        <p className="flex-1 truncate text-sm text-gray-400">
                          {match.teams
                            .map((t) =>
                              t.players.map((p) => names.get(p.playerId) ?? p.playerId).join(", ")
                            )
                            .join("  ·  ")}
                        </p>

                        {match.voided && <Badge tone="loss">Voided</Badge>}
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Container>
    </>
  );
}
