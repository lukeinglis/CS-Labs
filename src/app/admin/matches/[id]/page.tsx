import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MatchDetail from "@/components/MatchDetail";
import { loadPlayers, loadRankings } from "@/lib/data";
import { statColumnsFor } from "@/lib/private";
import { toPublicMatch } from "@/lib/public";
import type { MatchRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function findMatch(id: string): Promise<MatchRecord | undefined> {
  const { matches } = await loadRankings({ assumeAdmin: true });
  return matches.find((m) => m.id === id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const match = await findMatch(id);
  if (!match) return { title: "Match not found" };
  const score = match.teams.map((t) => t.roundsWon).join("-");
  return { title: `${match.map} ${score}` };
}

export default async function AdminMatchPage({ params }: Props) {
  const { id } = await params;
  const match = await findMatch(id);
  if (!match) notFound();

  const players = await loadPlayers();

  return (
    <MatchDetail
      match={toPublicMatch(match)}
      names={new Map(players.map((p) => [p.id, p.displayName]))}
      stats={statColumnsFor(match)}
      playerBase="/admin/players"
      screenshot={
        match.source.kind === "screenshot"
          ? {
              url: match.source.blobUrl,
              extractionModel: match.source.extractionModel,
              editedFields: match.source.editedFields,
            }
          : undefined
      }
    />
  );
}
