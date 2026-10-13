"use client";

import { useMemo, useState } from "react";
import type { RankedPlayer } from "@/lib/data";

type SortKey = "overall" | "teamRating" | "perfRating" | "games" | "winRate";

const COLUMNS: {
  key: SortKey;
  label: string;
  short: string;
  title: string;
}[] = [
  { key: "overall", label: "Overall", short: "OVR", title: "Team rating adjusted by performance" },
  { key: "teamRating", label: "Team", short: "TEAM", title: "Pure team-outcome rating, used for balancing" },
  { key: "perfRating", label: "Perf", short: "PERF", title: "Mean output relative to the lobby. 1.00 is exactly average" },
  { key: "winRate", label: "Win %", short: "W%", title: "Wins as a share of games played" },
  { key: "games", label: "Games", short: "G", title: "Matches played" },
];

function winRate(p: RankedPlayer): number {
  return p.games === 0 ? 0 : p.wins / p.games;
}

function value(p: RankedPlayer, key: SortKey): number {
  return key === "winRate" ? winRate(p) : p[key];
}

function medal(rank: number): string | null {
  return rank === 1 ? "text-gold" : rank === 2 ? "text-silver" : rank === 3 ? "text-bronze" : null;
}

export default function LeaderboardTable({ players }: { players: RankedPlayer[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [desc, setDesc] = useState(true);

  const rows = useMemo(() => {
    const direction = desc ? -1 : 1;
    const sorted = (group: RankedPlayer[]) =>
      group
        .slice()
        .sort(
          (a, b) =>
            direction * (value(a, sortKey) - value(b, sortKey)) ||
            a.displayName.localeCompare(b.displayName)
        );

    // Provisional players always sit below the qualified ones. A single lucky game
    // would otherwise park a newcomer at the top of the table.
    return [
      ...sorted(players.filter((p) => !p.provisional)),
      ...sorted(players.filter((p) => p.provisional)),
    ];
  }, [players, sortKey, desc]);

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
            {COLUMNS.map((col) => (
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
            const showRank = !p.provisional && sortKey === "overall" && desc;
            const medalColour = showRank ? medal(rank) : null;

            return (
              <tr
                key={p.playerId}
                className={`border-b border-white/5 transition-colors hover:bg-white/[0.02] ${
                  p.provisional ? "opacity-45" : ""
                }`}
              >
                <td className="px-3 py-3">
                  <span
                    className={`font-heading text-lg font-bold ${medalColour ?? "text-gray-500"}`}
                  >
                    {showRank ? rank : "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="font-medium text-white">{p.displayName}</span>
                  {p.provisional && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Provisional
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-center">
                  <span className="font-heading text-lg font-bold text-accent">
                    {Math.round(p.overall)}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className="font-heading text-base font-bold text-ct">
                    {Math.round(p.teamRating)}
                  </span>
                </td>
                <td className="px-3 py-3 text-center text-sm text-gray-300">
                  {p.perfRating.toFixed(2)}
                </td>
                <td className="px-3 py-3 text-center text-sm text-gray-300">
                  {p.games === 0 ? "—" : `${Math.round(winRate(p) * 100)}%`}
                </td>
                <td className="px-3 py-3 text-center text-sm text-gray-300">{p.games}</td>
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
      </p>
    </div>
  );
}
