import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlayerProfile from "@/components/PlayerProfile";
import { loadPlayers, loadPublicRankings } from "@/lib/data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const players = await loadPlayers();
  const player = players.find((p) => p.id === id);
  return { title: player ? player.displayName : "Player not found" };
}

export default async function PlayerPage({ params }: Props) {
  const { id } = await params;
  const [{ ranked, matches }, players] = await Promise.all([
    loadPublicRankings(),
    loadPlayers(),
  ]);

  const player = ranked.find((p) => p.playerId === id);
  if (!player) notFound();

  // Rank is the position among qualified players only, which is the same ordering the
  // leaderboard shows, so the two never disagree.
  const qualified = ranked.filter((p) => !p.provisional);
  const index = qualified.findIndex((p) => p.playerId === id);

  return (
    <PlayerProfile
      player={player}
      rank={index === -1 ? null : index + 1}
      matches={matches}
      names={new Map(players.map((p) => [p.id, p.displayName]))}
      playerBase="/players"
      matchBase="/matches"
    />
  );
}
