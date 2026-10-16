"use client";

import Link from "next/link";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import type { PublicRankedPlayer } from "@/lib/data";
import type { PublicMatch } from "@/lib/public";
import { recordByMap, recordByTeamSize, versusEveryone } from "@/lib/records";
import { SplitTable, VersusTable } from "./records-ui";

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

/**
 * A titled box for one split inside an unfolded row. Deliberately not the `Card` used
 * elsewhere: these are already sitting inside a card, and nesting the same border and
 * background again reads as a seam rather than a grouping.
 */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded border border-white/10 bg-ink">
      <p className="border-b border-white/10 px-4 py-2 font-heading text-xs font-bold uppercase tracking-wider text-gray-400">
        {title}
      </p>
      {children}
    </div>
  );
}

export default function LeaderboardTable({
  players,
  performance,
  playerBase = "/players",
  breakdown,
}: {
  players: PublicRankedPlayer[];
  /** Only ever passed on the signed-in side of the site. */
  performance?: PerformanceColumns;
  /**
   * Where a name links to, as a path prefix. The signed-in side of the site mirrors
   * these pages under `/stats`, and a prefix is all it takes to point there. It is a
   * string rather than a function because this table is a client component, and a
   * function prop cannot cross that boundary.
   */
  playerBase?: string;
  /**
   * Passing the match log turns every row into a disclosure that unfolds that player's
   * splits in place. The two halves travel as one prop because neither is any use on its
   * own: the records are keyed by player id and `names` is what turns those back into
   * people.
   *
   * These are `PublicMatch` projections, which carry no kills, deaths or damage. That is
   * not a convenience, it is the reason this is safe to render here at all: the whole
   * log is serialised into the page for any signed-in reader, so the only version of it
   * allowed across this boundary is the one with nothing private left in it.
   */
  breakdown?: { matches: PublicMatch[]; names: Map<string, string> };
}) {
  const [sortKey, setSortKey] = useState<SortKey>("teamRating");
  const [desc, setDesc] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const columns = performance ? [...PUBLIC_COLUMNS, ...PRIVATE_COLUMNS] : PUBLIC_COLUMNS;

  /**
   * Only the open player's splits are worked out, and only while they are open. Doing
   * the whole roster up front would be a pass over the match log per player for rows
   * nobody has asked to see.
   */
  const detail = useMemo(() => {
    if (!breakdown || open === null) return null;
    return {
      byMap: recordByMap(breakdown.matches, open),
      bySize: recordByTeamSize(breakdown.matches, open),
      versus: versusEveryone(breakdown.matches, open),
    };
  }, [breakdown, open]);

  // Rank, player and W-L-D sit either side of the sortable columns, and the disclosure
  // chevron adds one more when the splits are available.
  const span = 3 + columns.length + (breakdown ? 1 : 0);

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
            {breakdown && (
              <th scope="col" className="w-10 px-3 py-3">
                <span className="sr-only">Splits</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const rank = i + 1;
            const showRank = !p.provisional && sortKey === "teamRating" && desc;
            const medalColour = showRank ? medal(rank) : null;
            const perf = performance?.[p.playerId];
            const diff = roundDiff(p);
            const expanded = open === p.playerId;

            return (
              <Fragment key={p.playerId}>
                <tr
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
                  {breakdown && (
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : p.playerId)}
                        aria-expanded={expanded}
                        aria-controls={`splits-${p.playerId}`}
                        title={expanded ? "Hide splits" : `Show ${p.displayName}'s splits`}
                        className={`cursor-pointer px-1 text-[10px] transition-colors hover:text-white ${
                          expanded ? "text-accent" : "text-gray-500"
                        }`}
                      >
                        <span className="sr-only">
                          {expanded ? "Hide splits for" : "Show splits for"} {p.displayName}
                        </span>
                        <span aria-hidden>{expanded ? "▲" : "▼"}</span>
                      </button>
                    </td>
                  )}
                </tr>
                {expanded && breakdown && detail && (
                  <tr id={`splits-${p.playerId}`} className="border-b border-white/10 bg-white/[0.02]">
                    <td colSpan={span} className="px-3 py-4">
                      {p.games === 0 ? (
                        <p className="text-xs text-gray-500">
                          Nothing to break down until {p.displayName} shows up on a scoreboard.
                        </p>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <Panel title="By map">
                              <SplitTable rows={detail.byMap} label="Map" />
                            </Panel>
                            <Panel title="By lobby size">
                              <SplitTable rows={detail.bySize} label="Format" />
                            </Panel>
                          </div>
                          <Panel title="With and against">
                            <VersusTable
                              versus={detail.versus}
                              names={breakdown.names}
                              playerBase={playerBase}
                            />
                          </Panel>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <p className="px-3 py-4 text-xs text-gray-500">
        {qualifiedCount} of {players.length} players have played enough games to be ranked.
        Provisional players are greyed out and sorted last.
        {breakdown && " Open a row for that player's maps, lobby sizes and head-to-heads."}
        {!performance && " Ranking is built from games won and lost."}
      </p>
    </div>
  );
}
