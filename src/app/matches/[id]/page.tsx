import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ranking } from "../../../../cs-labs.config";
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  Container,
  PageHeader,
  SideBadge,
  StatTile,
} from "@/components/ui";
import { loadMatches, loadPlayers } from "@/lib/data";
import { computeMatchPerf } from "@/lib/ranking";
import type { MatchRecord, MatchTeam } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function findMatch(id: string): Promise<MatchRecord | undefined> {
  const matches = await loadMatches();
  return matches.find((m) => m.id === id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const match = await findMatch(id);
  if (!match) return { title: "Match not found" };
  const score = match.teams.map((t) => t.roundsWon).join("-");
  return { title: `${match.map} ${score}` };
}

function Scoreboard({
  team,
  isWinner,
  names,
  perf,
  rounds,
}: {
  team: MatchTeam;
  isWinner: boolean;
  names: Map<string, string>;
  perf: Map<string, number>;
  rounds: number;
}) {
  const ordered = team.players
    .slice()
    .sort((a, b) => (perf.get(b.playerId) ?? 0) - (perf.get(a.playerId) ?? 0));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <SideBadge side={team.startingSide} />
          <CardTitle>Team {team.label}</CardTitle>
          {isWinner && <Badge tone="win">Won</Badge>}
        </div>
        <span className="font-heading text-2xl font-bold text-white">{team.roundsWon}</span>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th scope="col" className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Player
              </th>
              {["K", "A", "D", "ADR", "K/D", "Perf"].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((line) => {
              const p = perf.get(line.playerId) ?? 1;
              return (
                <tr key={line.playerId} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-2.5 text-sm">
                    <span className="font-medium text-white">
                      {names.get(line.playerId) ?? line.playerId}
                    </span>
                    {line.joinedLate && (
                      <span
                        title="Joined an in-progress game, so their stats cover fewer rounds and are excluded from the lobby average"
                        className="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-500"
                      >
                        Late
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center text-sm text-gray-300">{line.kills}</td>
                  <td className="px-3 py-2.5 text-center text-sm text-gray-300">{line.assists}</td>
                  <td className="px-3 py-2.5 text-center text-sm text-gray-300">{line.deaths}</td>
                  <td className="px-3 py-2.5 text-center text-sm text-gray-300">{line.adr}</td>
                  <td className="px-3 py-2.5 text-center text-sm text-gray-400">
                    {(line.kills / Math.max(line.deaths, 1)).toFixed(2)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-center text-sm font-semibold ${
                      line.joinedLate ? "text-gray-500" : p >= 1 ? "text-accent" : "text-gray-400"
                    }`}
                  >
                    {p.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-xs text-gray-500">
        Perf compares each line to the average of this lobby over {rounds} rounds. 1.00 is
        exactly average.
      </p>
    </Card>
  );
}

export default async function MatchPage({ params }: Props) {
  const { id } = await params;
  const match = await findMatch(id);
  if (!match) notFound();

  const players = await loadPlayers();
  const names = new Map(players.map((p) => [p.id, p.displayName]));
  const perf = computeMatchPerf(match, ranking);

  const [a, b] = match.teams;
  const draw = a.roundsWon === b.roundsWon;
  const winner = draw ? null : a.roundsWon > b.roundsWon ? 0 : 1;

  return (
    <>
      <PageHeader
        title={match.map}
        subtitle={new Date(match.playedAt).toLocaleString("en-US", {
          dateStyle: "full",
          timeStyle: "short",
        })}
        action={
          <div className="font-heading text-4xl font-bold text-white">
            {a.roundsWon} <span className="text-gray-600">:</span> {b.roundsWon}
          </div>
        }
      />

      <Container className="space-y-6 py-8">
        {match.voided && (
          <Card className="border-loss/30 bg-loss/5 px-5 py-4">
            <p className="font-heading text-sm font-bold uppercase tracking-wide text-loss">
              Voided match
            </p>
            <p className="mt-1 text-sm text-gray-400">
              {match.voidReason || "No reason recorded."} This match is excluded from all ratings.
            </p>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Rounds played" value={match.roundsPlayed} />
          <StatTile
            label="Result"
            value={draw ? "Draw" : `Team ${match.teams[winner!].label}`}
            tone={draw ? "white" : "accent"}
          />
          <StatTile label="Submitted by" value={match.submittedBy} />
          <StatTile
            label="Source"
            value={match.source.kind === "screenshot" ? "Screenshot" : "Manual"}
            hint={
              match.source.kind === "screenshot"
                ? `Read by ${match.source.extractionModel}, confirmed by ${match.source.confirmedBy}`
                : `Entered by ${match.source.confirmedBy}`
            }
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {match.teams.map((team, i) => (
            <Scoreboard
              key={team.label}
              team={team}
              isWinner={winner === i}
              names={names}
              perf={perf}
              rounds={match.roundsPlayed}
            />
          ))}
        </div>

        {match.source.kind === "screenshot" && match.source.editedFields.length > 0 && (
          <Card className="px-5 py-4">
            <p className="font-heading text-sm font-bold uppercase tracking-wide text-gray-300">
              Corrected after extraction
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {match.source.editedFields.join(", ")}
            </p>
          </Card>
        )}
      </Container>
    </>
  );
}
