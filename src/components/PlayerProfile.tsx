import Link from "next/link";
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";
import type { PublicRankedPlayer } from "@/lib/data";
import type { StatLine } from "@/lib/private";
import type { PublicMatch } from "@/lib/public";
import {
  currentStreak,
  games as gamesIn,
  recordByMap,
  recordByTeamSize,
  type SplitRecord,
  versusEveryone,
  winRate,
  type Record as WinLossRecord,
} from "@/lib/records";

/**
 * Individual performance, both the career numbers and the per-match line, arrives as
 * one optional prop rather than folded into the player. A public page has nothing to
 * pass here, so it cannot leak one by accident, and every performance section below
 * is inside a check on it.
 */
export type PlayerPerformance = {
  perfRating: number;
  overall: number;
  /** Keyed by match id. */
  perMatch: Record<string, StatLine>;
};

function pct(r: WinLossRecord): string {
  return gamesIn(r) === 0 ? "—" : `${Math.round(winRate(r) * 100)}%`;
}

function record(r: WinLossRecord): string {
  return `${r.wins}-${r.losses}-${r.draws}`;
}

/** +3 reads as a three-win run, -2 as a two-loss one. */
function streakLabel(streak: number): string {
  if (streak === 0) return "—";
  return `${streak > 0 ? "W" : "L"}${Math.abs(streak)}`;
}

const TH = "px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500";
const TD = "px-4 py-2 text-sm text-gray-300";

function SplitTable({ rows, label }: { rows: SplitRecord[]; label: string }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-white/10 text-left">
          <th scope="col" className={TH}>
            {label}
          </th>
          <th scope="col" className={`${TH} text-center`}>
            W-L-D
          </th>
          <th scope="col" className={`${TH} text-center`}>
            Win %
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-b border-white/5 last:border-0">
            <td className={`${TD} font-medium text-white`}>{row.key}</td>
            <td className={`${TD} text-center`}>{record(row)}</td>
            <td className={`${TD} text-center`}>{pct(row)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PlayerProfile({
  player,
  rank,
  matches,
  names,
  performance,
  playerBase,
  matchBase,
}: {
  player: PublicRankedPlayer;
  /** Position on the leaderboard, or null while provisional. */
  rank: number | null;
  /** Every match, public. The breakdowns below filter to this player themselves. */
  matches: PublicMatch[];
  names: Map<string, string>;
  /** Only ever passed on the private side of the site. */
  performance?: PlayerPerformance;
  playerBase: string;
  matchBase: string;
}) {
  const id = player.playerId;
  const byMap = recordByMap(matches, id);
  const bySize = recordByTeamSize(matches, id);
  const versus = versusEveryone(matches, id);
  const streak = currentStreak(matches, id);
  const overall: WinLossRecord = {
    wins: player.wins,
    losses: player.losses,
    draws: player.draws,
  };
  const diff = player.roundsWon - player.roundsLost;

  const played = matches
    .filter((m) => m.teams.some((t) => t.players.some((p) => p.playerId === id)))
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));

  return (
    <>
      <PageHeader
        title={player.displayName}
        subtitle={
          player.provisional
            ? `Provisional after ${player.games} ${player.games === 1 ? "game" : "games"}, so not ranked yet.`
            : rank === null
              ? "Ranked."
              : `Ranked #${rank} on the leaderboard.`
        }
        action={
          <div className="text-right">
            <p className="font-heading text-4xl font-bold text-accent">
              {Math.round(player.teamRating)}
            </p>
            <p className="text-xs uppercase tracking-wider text-gray-500">Rating</p>
          </div>
        }
      />

      <Container className="space-y-6 py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Record" value={record(overall)} hint="Wins-losses-draws" />
          <StatTile label="Win %" value={pct(overall)} tone="accent" />
          <StatTile
            label="Rounds"
            value={player.games === 0 ? "—" : diff > 0 ? `+${diff}` : String(diff)}
            hint={`${player.roundsWon} won, ${player.roundsLost} lost`}
          />
          <StatTile
            label="Streak"
            value={streakLabel(streak)}
            tone={streak > 0 ? "ct" : "white"}
          />
        </div>

        {performance && (
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile
              label="Overall"
              value={Math.round(performance.overall)}
              hint="Rating adjusted by individual performance"
              tone="ct"
            />
            <StatTile
              label="Perf"
              value={performance.perfRating.toFixed(2)}
              hint="Mean output relative to the lobby. 1.00 is average"
            />
          </div>
        )}

        {player.games === 0 ? (
          <EmptyState title="No games yet">
            Breakdowns appear once this player shows up on a scoreboard.
          </EmptyState>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>By map</CardTitle>
                </CardHeader>
                <SplitTable rows={byMap} label="Map" />
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>By lobby size</CardTitle>
                </CardHeader>
                <SplitTable rows={bySize} label="Format" />
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>With and against</CardTitle>
                <span className="text-xs text-gray-500">
                  Most-shared lobbies first
                </span>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="border-b border-white/10 text-left">
                      <th scope="col" className={TH}>
                        Player
                      </th>
                      <th scope="col" className={`${TH} text-center`} colSpan={2}>
                        On their team
                      </th>
                      <th scope="col" className={`${TH} text-center`} colSpan={2}>
                        Against them
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {versus.map((v) => (
                      <tr key={v.playerId} className="border-b border-white/5 last:border-0">
                        <td className={TD}>
                          <Link
                            href={`${playerBase}/${v.playerId}`}
                            className="font-medium text-white transition-colors hover:text-accent"
                          >
                            {names.get(v.playerId) ?? v.playerId}
                          </Link>
                        </td>
                        <td className={`${TD} text-center`}>
                          {gamesIn(v.with) === 0 ? "—" : record(v.with)}
                        </td>
                        <td className={`${TD} text-center text-gray-500`}>{pct(v.with)}</td>
                        <td className={`${TD} text-center`}>
                          {gamesIn(v.against) === 0 ? "—" : record(v.against)}
                        </td>
                        <td className={`${TD} text-center text-gray-500`}>
                          {pct(v.against)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Match history</CardTitle>
                <span className="text-xs text-gray-500">{played.length} played</span>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="border-b border-white/10 text-left">
                      <th scope="col" className={TH}>
                        Match
                      </th>
                      <th scope="col" className={`${TH} text-center`}>
                        Score
                      </th>
                      <th scope="col" className={`${TH} text-center`}>
                        Result
                      </th>
                      {performance &&
                        ["K", "A", "D", "ADR", "Perf"].map((h) => (
                          <th key={h} scope="col" className={`${TH} text-center`}>
                            {h}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {played.map((match) => {
                      const mine = match.teams[0].players.some((p) => p.playerId === id)
                        ? 0
                        : 1;
                      const for_ = match.teams[mine].roundsWon;
                      const against = match.teams[1 - mine].roundsWon;
                      const line = performance?.perMatch[match.id];

                      return (
                        <tr
                          key={match.id}
                          className={`border-b border-white/5 last:border-0 ${
                            match.voided ? "opacity-45" : ""
                          }`}
                        >
                          <td className={TD}>
                            <Link
                              href={`${matchBase}/${match.id}`}
                              className="font-medium text-white transition-colors hover:text-accent"
                            >
                              {match.map}
                            </Link>
                            <span className="ml-2 text-xs text-gray-500">
                              {new Date(match.playedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                            {match.voided && (
                              <span className="ml-2">
                                <Badge tone="loss">Void</Badge>
                              </span>
                            )}
                          </td>
                          <td className={`${TD} text-center font-heading font-bold`}>
                            {for_}
                            <span className="mx-1 text-gray-600">:</span>
                            {against}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Badge
                              tone={
                                for_ > against ? "win" : for_ < against ? "loss" : "muted"
                              }
                            >
                              {for_ > against ? "Won" : for_ < against ? "Lost" : "Draw"}
                            </Badge>
                          </td>
                          {performance && (
                            <>
                              <td className={`${TD} text-center`}>{line?.kills ?? "—"}</td>
                              <td className={`${TD} text-center`}>{line?.assists ?? "—"}</td>
                              <td className={`${TD} text-center`}>{line?.deaths ?? "—"}</td>
                              <td className={`${TD} text-center`}>
                                {line ? line.adr.toFixed(1) : "—"}
                              </td>
                              <td
                                className={`px-4 py-2 text-center text-sm font-semibold ${
                                  line && line.perf >= 1 ? "text-accent" : "text-gray-400"
                                }`}
                              >
                                {line ? line.perf.toFixed(2) : "—"}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!performance && (
                <p className="px-4 py-3 text-xs text-gray-500">
                  Everything on this page comes from who was on which team and which team
                  won more rounds. Individual stats are not part of it.
                </p>
              )}
            </Card>
          </>
        )}
      </Container>
    </>
  );
}
