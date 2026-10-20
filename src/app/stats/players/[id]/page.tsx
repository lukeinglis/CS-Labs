import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlayerProfile from "@/components/PlayerProfile";
import { loadPlayers, loadRankings } from "@/lib/data";
import { statHistoryFor } from "@/lib/private";
import { toPublicMatch, toPublicRating } from "@/lib/public";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const players = await loadPlayers();
  const player = players.find((p) => p.id === id);
  return { title: player ? player.displayName : "Player not found" };
}

export default async function AdminPlayerPage({ params }: Props) {
  const { id } = await params;
  const [{ ranked, matches }, players] = await Promise.all([
    loadRankings({ assumeAccess: true }),
    loadPlayers(),
  ]);

  const player = ranked.find((p) => p.playerId === id);
  if (!player) notFound();

  // Same ordering the stats leaderboard uses, so the two never disagree on a rank.
  const byRating = ranked.slice().sort((a, b) => b.overall - a.overall);
  const index = byRating.filter((p) => !p.provisional).findIndex((p) => p.playerId === id);

  return (
    <PlayerProfile
      player={{ ...toPublicRating(player), displayName: player.displayName }}
      rank={index === -1 ? null : index + 1}
      matches={matches.map(toPublicMatch)}
      names={new Map(players.map((p) => [p.id, p.displayName]))}
      performance={{
        perfRating: player.perfRating,
        overall: player.overall,
        perMatch: statHistoryFor(matches, id),
      }}
      playerBase="/stats/players"
      matchBase="/stats/matches"
    />
  );
}
