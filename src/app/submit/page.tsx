import type { Metadata } from "next";
import { maps } from "../../../cs-labs.config";
import SubmitClient, { type RosterEntry } from "@/components/SubmitClient";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { loadPlayers } from "@/lib/data";
import { getAliases, isStoreConfigured } from "@/lib/storage";

export const metadata: Metadata = { title: "Submit a Match" };

export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const configured = isStoreConfigured();
  const [players, aliases] = await Promise.all([
    loadPlayers(),
    configured ? getAliases() : Promise.resolve({}),
  ]);

  const roster: RosterEntry[] = players.map((p) => ({
    playerId: p.id,
    displayName: p.displayName,
  }));

  return (
    <>
      <PageHeader
        title="Submit a Match"
        subtitle="Enter the scoreboard and it goes straight into the ratings."
      />

      <Container className="py-8">
        {!configured ? (
          <EmptyState title="The match store is not configured">
            Submission is unavailable until the store is reachable.
          </EmptyState>
        ) : (
          <SubmitClient roster={roster} aliases={aliases} maps={maps} />
        )}
      </Container>
    </>
  );
}
