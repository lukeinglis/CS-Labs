import type { Metadata } from "next";
import { notFound } from "next/navigation";
import VoidControls, { MESSAGES } from "./VoidControls";
import MatchDetail from "@/components/MatchDetail";
import { loadPlayers, loadRankings } from "@/lib/data";
import { statColumnsFor } from "@/lib/private";
import { toPublicMatch } from "@/lib/public";
import { isAdmin } from "@/lib/session";
import type { MatchRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
};

async function findMatch(id: string): Promise<MatchRecord | undefined> {
  const { matches } = await loadRankings({ assumeAccess: true });
  return matches.find((m) => m.id === id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const match = await findMatch(id);
  if (!match) return { title: "Match not found" };
  const score = match.teams.map((t) => t.roundsWon).join("-");
  return { title: `${match.map} ${score}` };
}

export default async function StatsMatchPage({ params, searchParams }: Props) {
  const { id } = await params;
  const match = await findMatch(id);
  if (!match) notFound();

  const [players, { error, done }, admin] = await Promise.all([
    loadPlayers(),
    searchParams,
    isAdmin(),
  ]);
  const key = error ?? done;

  /**
   * Everyone in the league reads this page; only an admin gets the controls. Leaving
   * them out is tidiness rather than the safeguard, since a form that is merely absent
   * is still a reachable POST endpoint. The action checks for itself.
   */
  const controls = admin ? (
    <VoidControls
      matchId={match.id}
      voided={Boolean(match.voided)}
      reason={match.voidReason}
      notice={key ? MESSAGES[key] : undefined}
      tone={error ? "error" : done ? "done" : null}
    />
  ) : undefined;

  return (
    <MatchDetail
      match={toPublicMatch(match)}
      names={new Map(players.map((p) => [p.id, p.displayName]))}
      stats={statColumnsFor(match)}
      playerBase="/stats/players"
      screenshot={
        match.source.kind === "screenshot"
          ? {
              url: match.source.blobUrl,
              extractionModel: match.source.extractionModel,
              editedFields: match.source.editedFields,
            }
          : undefined
      }
      controls={controls}
    />
  );
}
