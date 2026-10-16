"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PublicRankedPlayer } from "@/lib/data";

/**
 * Individual performance never reaches this component unless someone has signed in,
 * and then it arrives as a separate `performance` map rather than on the player. The
 * public props type has nowhere to put a perf number, so a public page cannot leak
 * one by accident, and the extra columns appear only when that map is passed.
 */
export type PerformanceColumns = Record<
  string,
  { perfRating: number; overall: number }
>;

type SortKey = "teamRating" | "winRate" | "games" | "roundDiff" | "overall" | "perfRating";

type Column = { key: SortKey; label: string; short: string; title: string };

const PUBLIC_COLUMNS: Column[] = [
  {
    key: "teamRating",
    label: "Rating",
    short: "RTG",
    title: "Built from games won and lost, weighted by who you played and the round gap",
  },
  { key: "winRate", label: "Win %", short: "W%", title: "Wins as a share of games played, a draw counting as half" },
  { key: "games", label: "Games", short: "G", title: "Matches played" },
  { key: "roundDiff", label: "Rounds", short: "+/-", title: "Rounds won minus rounds lost" },
];

const PRIVATE_COLUMNS: Column[] = [
  { key: "overall", label: "Overall", short: "OVR", title: "Team rating adjusted by individual performance" },
  { key: "perfRating", label: "Perf", short: "PERF", title: "Mean output relative to the lobby. 1.00 is exactly average" },
];

function winRate(p: PublicRankedPlayer): number {
  const n = p.wins + p.losses + p.draws;
  return n === 0 ? 0 : (p.wins + p.draws * 0.5) / n;
}

function roundDiff(p: PublicRankedPlayer): number {
  return p.roundsWon - p.roundsLost;
}

function medal(rank: number): string | null {
  return rank === 1 ? "text-gold" : rank === 2 ? "text-silver" : rank === 3 ? "text-bronze" : null;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export default function LeaderboardTable({
  players,
  performance,
  playerBase = "/players",
}: {
  players: PublicRankedPlayer[];
  /** Only ever passed on the private side of the site. */
  performance?: PerformanceColumns;
  /**
   * Where a name links to, as a path prefix. The private side of the site mirrors
   * these pages under `/admin`, and a prefix is all it takes to point there. It is a
   * string rather than a function because this table is a client component, and a
   * function prop cannot cross that boundary.
   */
  playerBase?: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("teamRating");
  const [desc, setDesc] = useState(true);

  const columns = performance ? [...PUBLIC_COLUMNS, ...PRIVATE_COLUMNS] : PUBLIC_COLUMNS;

  const rows = useMemo(() => {
    const value = (p: PublicRankedPlayer): number => {
      switch (sortKey) {
        case "winRate":
          return winRate(p);
        case "roundDiff":
          return roundDiff(p);
        case "overall":
          return performance?.[p.playerId]?.overall ?? 0;
        case "perfRating":
          return performance?.[p.playerId]?.perfRating ?? 0;
        default:
          return p[sortKey];
      }
    };

    const direction = desc ? -1 : 1;
    const sorted = (group: PublicRankedPlayer[]) =>
      group
        .slice()
        .sort(
          (a, b) =>
            direction * (value(a) - value(b)) || a.displayName.localeCompare(b.displayName)
        );

    // Provisional players always sit below the qualified ones. A single lucky game
    // would otherwise park a newcomer at the top of the table.
    return [
      ...sorted(players.filter((p) => !p.provisional)),
      ...sorted(players.filter((p) => p.provisional)),
    ];
  }, [players, sortKey, desc, performance]);

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setDesc((v) => !v);
    } else {
      setSortKey(key);
      setDesc(true);
    }
  }

  const qualifiedCount = players.filter((p) => !p.provisional).length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead className="sticky top-0 z-10 bg-ink">
          <tr className="border-b border-white/10 text-left">
            <th scope="col" className="w-12 px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              #
            </th>
            <th scope="col" className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Player
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={sortKey === col.key ? (desc ? "descending" : "ascending") : "none"}
                className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider"
              >
                <button
                  type="button"
                  onClick={() => toggle(col.key)}
                  title={col.title}
                  className={`cursor-pointer transition-colors hover:text-white ${
                    sortKey === col.key ? "text-accent" : "text-gray-500"
                  }`}
                >
                  <span className="hidden sm:inline">{col.label}</span>
                  <span className="sm:hidden">{col.short}</span>
                  <span aria-hidden className="ml-1 text-[9px]">
                    {sortKey === col.key ? (desc ? "▼" : "▲") : ""}
                  </span>
                </button>
              </th>
            ))}
            <th scope="col" className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
              <span className="hidden sm:inline">W-L-D</span>
              <span className="sm:hidden">WLD</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const rank = i + 1;
            const showRank = !p.provisional && sortKey === "teamRating" && desc;
            const medalColour = showRank ? medal(rank) : null;
            const perf = performance?.[p.playerId];
            const diff = roundDiff(p);

            return (
              <tr
                key={p.playerId}
                className={`border-b border-white/5 transition-colors hover:bg-white/[0.02] ${
                  p.provisional ? "opacity-45" : ""
                }`}
              >
                <td className="px-3 py-3">
                  <span className={`font-heading text-lg font-bold ${medalColour ?? "text-gray-500"}`}>
                    {showRank ? rank : "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={`${playerBase}/${p.playerId}`}
                    className="font-medium text-white transition-colors hover:text-accent"
                  >
                    {p.displayName}
                  </Link>
                  {p.provisional && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Provisional
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-center">
                  <span className="font-heading text-lg font-bold text-accent">
                    {Math.round(p.teamRating)}
                  </span>
                </td>
                <td className="px-3 py-3 text-center text-sm text-gray-300">
                  {p.games === 0 ? "—" : `${Math.round(winRate(p) * 100)}%`}
                </td>
                <td className="px-3 py-3 text-center text-sm text-gray-300">{p.games}</td>
                <td
                  className={`px-3 py-3 text-center text-sm ${
                    diff > 0 ? "text-win" : diff < 0 ? "text-loss" : "text-gray-400"
                  }`}
                >
                  {p.games === 0 ? "—" : signed(diff)}
                </td>
                {perf && (
                  <>
                    <td className="px-3 py-3 text-center">
                      <span className="font-heading text-base font-bold text-ct">
                        {Math.round(perf.overall)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-sm text-gray-300">
                      {perf.perfRating.toFixed(2)}
                    </td>
                  </>
                )}
                <td className="px-3 py-3 text-center text-sm text-gray-400">
                  {p.wins}-{p.losses}-{p.draws}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="px-3 py-4 text-xs text-gray-500">
        {qualifiedCount} of {players.length} players have played enough games to be ranked.
        Provisional players are greyed out and sorted last.
        {!performance && " Ranking is built from games won and lost."}
      </p>
    </div>
  );
}
