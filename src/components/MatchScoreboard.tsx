import Link from "next/link";
import { Badge, Card, CardHeader, CardTitle, SideBadge } from "@/components/ui";
import type { StatColumns } from "@/lib/private";
import type { PublicMatchTeam } from "@/lib/public";

const STAT_HEADERS = ["K", "A", "D", "ADR", "K/D", "Perf"];

const LATE_TITLE =
  "Joined an in-progress game, so their stats cover fewer rounds and are excluded from the lobby average";

export default function MatchScoreboard({
  team,
  isWinner,
  names,
  rounds,
  stats,
  playerBase,
}: {
  team: PublicMatchTeam;
  isWinner: boolean;
  names: Map<string, string>;
  rounds: number;
  /** Only ever passed on the private side of the site. */
  stats?: StatColumns;
  playerBase: string;
}) {
  // Best game first when there are stats to sort by, otherwise alphabetical, which
  // beats leaving the roster in whatever order the scoreboard happened to be read in.
  const ordered = team.players.slice().sort((a, b) => {
    if (stats) {
      return (stats[b.playerId]?.perf ?? 0) - (stats[a.playerId]?.perf ?? 0);
    }
    const nameA = names.get(a.playerId) ?? a.playerId;
    const nameB = names.get(b.playerId) ?? b.playerId;
    return nameA.localeCompare(nameB);
  });

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

      {stats ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th scope="col" className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Player
                </th>
                {STAT_HEADERS.map((label) => (
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
                const s = stats[line.playerId];
                if (!s) return null;
                return (
                  <tr key={line.playerId} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-2.5 text-sm">
                      <Link
                        href={`${playerBase}/${line.playerId}`}
                        className="font-medium text-white transition-colors hover:text-accent"
                      >
                        {names.get(line.playerId) ?? line.playerId}
                      </Link>
                      {line.joinedLate && (
                        <span
                          title={LATE_TITLE}
                          className="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-500"
                        >
                          Late
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-300">{s.kills}</td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-300">{s.assists}</td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-300">{s.deaths}</td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-300">
                      {s.adr.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-400">
                      {(s.kills / Math.max(s.deaths, 1)).toFixed(2)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-center text-sm font-semibold ${
                        line.joinedLate
                          ? "text-gray-500"
                          : s.perf >= 1
                            ? "text-accent"
                            : "text-gray-400"
                      }`}
                    >
                      {s.perf.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {ordered.map((line) => (
            <li key={line.playerId} className="px-5 py-2.5 text-sm">
              <Link
                href={`${playerBase}/${line.playerId}`}
                className="font-medium text-white transition-colors hover:text-accent"
              >
                {names.get(line.playerId) ?? line.playerId}
              </Link>
              {line.joinedLate && (
                <span
                  title={LATE_TITLE}
                  className="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-500"
                >
                  Late
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {stats && (
        <p className="px-5 py-3 text-xs text-gray-500">
          Perf compares each line to the average of this lobby over {rounds} rounds. 1.00
          is exactly average.
        </p>
      )}
    </Card>
  );
}
