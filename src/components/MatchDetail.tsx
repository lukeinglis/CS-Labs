import type { ReactNode } from "react";
import { Card, Container, PageHeader, StatTile } from "@/components/ui";
import MatchScoreboard from "@/components/MatchScoreboard";
import type { StatColumns } from "@/lib/private";
import type { PublicMatch } from "@/lib/public";

/**
 * The body of a match page, shared by the public route and the admin one. It takes a
 * `PublicMatch` either way; the private extras come in as separate optional props, so
 * the public route leaks nothing by simply not passing them.
 */
export default function MatchDetail({
  match,
  names,
  stats,
  playerBase,
  screenshot,
  controls,
}: {
  match: PublicMatch;
  names: Map<string, string>;
  /** Only ever passed on the private side of the site. */
  stats?: StatColumns;
  playerBase: string;
  /** Only ever passed on the private side: the image is the scoreboard. */
  screenshot?: { url: string; extractionModel: string; editedFields: string[] };
  /**
   * Admin-only controls, rendered last so they sit inside this page's container rather
   * than dangling underneath it. A slot rather than a flag, so this file needs to know
   * nothing about voiding and the public route has nothing to pass.
   */
  controls?: ReactNode;
}) {
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
              {match.voidReason || "No reason recorded."} This match is excluded from all
              ratings.
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
            hint={`Confirmed by ${match.source.confirmedBy}`}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {match.teams.map((team, i) => (
            <MatchScoreboard
              key={team.label}
              team={team}
              isWinner={winner === i}
              names={names}
              rounds={match.roundsPlayed}
              stats={stats}
              playerBase={playerBase}
            />
          ))}
        </div>

        {screenshot && (
          <Card className="px-5 py-4">
            <p className="font-heading text-sm font-bold uppercase tracking-wide text-gray-300">
              Original scoreboard
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Read by {screenshot.extractionModel}.{" "}
              {screenshot.editedFields.length > 0
                ? `Corrected afterwards: ${screenshot.editedFields.join(", ")}.`
                : "Accepted without corrections."}
            </p>
            <a
              href={screenshot.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm text-accent hover:underline"
            >
              Open the image
            </a>
          </Card>
        )}

        {controls}
      </Container>
    </>
  );
}
