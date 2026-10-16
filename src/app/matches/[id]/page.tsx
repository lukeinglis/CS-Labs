import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MatchDetail from "@/components/MatchDetail";
import { loadPlayers, loadPublicMatches } from "@/lib/data";
import type { PublicMatch } from "@/lib/public";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function findMatch(id: string): Promise<PublicMatch | undefined> {
  const matches = await loadPublicMatches();
  return matches.find((m) => m.id === id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const match = await findMatch(id);
  if (!match) return { title: "Match not found" };
  const score = match.teams.map((t) => t.roundsWon).join("-");
  return { title: `${match.map} ${score}` };
}

export default async function MatchPage({ params }: Props) {
  const { id } = await params;
  const match = await findMatch(id);
  if (!match) notFound();

  const players = await loadPlayers();
  const names = new Map(players.map((p) => [p.id, p.displayName]));

  // No `stats` and no `screenshot`, which is the whole point: the scoreboard numbers
  // never reach this page, so they are not in its HTML either.
  return (
    <MatchDetail
      match={match}
      names={names}
      playerBase="/players"
    />
  );
}
