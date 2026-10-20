"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PublicRankedPlayer } from "@/lib/data";
import type { PublicMatch } from "@/lib/public";
import { games, matchesIn, overallRecord, winRate } from "@/lib/records";
import { pct, record, TD, TH } from "./records-ui";

/**
 * The leaderboard, narrowed to one map or one lobby shape.
 *
 * There is no rating column here, and that absence is the point. A rating is built from
 * the whole match log, every opponent weighted against every other, so there is no such
 * thing as "your rating on Mirage" to show: slicing the log and re-running the ratings
 * over a handful of games would produce a number that looks like the one on the
 * leaderboard and means something entirely different. Wins, losses and draws do slice
 * cleanly, so those are what this shows.
 */
export default function SliceBoard({
  players,
  matches,
  maps,
  sizes,
  playerBase = "/players",
}: {
  players: PublicRankedPlayer[];
  /** Public projections only. This is a client component. */
  matches: PublicMatch[];
  /** Offered in the controls, most played first. Derived from the log, so never empty options. */
  maps: string[];
  sizes: string[];
  playerBase?: string;
}) {
  const [map, setMap] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);

  const { sliced, rows } = useMemo(() => {
    const sliced = matchesIn(matches, {
      map: map ?? undefined,
      teamSize: size ?? undefined,
    });

    // Anyone who never played the slice is left out rather than listed at 0-0-0, which
    // would otherwise read as a losing record on a map they have never loaded.
    const rows = players
      .map((p) => ({ player: p, r: overallRecord(sliced, p.playerId) }))
      .filter((row) => games(row.r) > 0)
      .sort(
        (a, b) =>
          winRate(b.r) - winRate(a.r) ||
          games(b.r) - games(a.r) ||
          a.player.displayName.localeCompare(b.player.displayName)
      );

    return { sliced, rows };
  }, [players, matches, map, size]);

  return (
    <div>
      <div className="space-y-2 border-b border-white/10 px-4 py-3">
        <Chips label="Map" options={maps} value={map} onChange={setMap} allLabel="All maps" />
        <Chips
          label="Size"
          options={sizes}
          value={size}
          onChange={setSize}
          allLabel="Any size"
        />
      </div>

      {sliced.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">
          No matches played on that combination yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px]">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th scope="col" className={TH}>
                  Player
                </th>
                <th scope="col" className={`${TH} text-center`}>
                  Games
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
              {rows.map(({ player, r }) => (
                <tr key={player.playerId} className="border-b border-white/5 last:border-0">
                  <td className={TD}>
                    <Link
                      href={`${playerBase}/${player.playerId}`}
                      className="font-medium text-white transition-colors hover:text-accent"
                    >
                      {player.displayName}
                    </Link>
                  </td>
                  <td className={`${TD} text-center`}>{games(r)}</td>
                  <td className={`${TD} text-center`}>{record(r)}</td>
                  <td className={`${TD} text-center font-semibold text-accent`}>{pct(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="px-4 py-3 text-xs text-gray-500">
        {sliced.length} {sliced.length === 1 ? "match" : "matches"} in this slice, sorted by
        win rate. Slices get small quickly, so a 2-0 here is a good night rather than a
        track record.
      </p>
    </div>
  );
}

/** One row of filter buttons, with the unfiltered state as the first option. */
function Chips({
  label,
  options,
  value,
  onChange,
  allLabel,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (next: string | null) => void;
  allLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
        {label}
      </span>
      {[null, ...options].map((option) => {
        const active = option === value;
        return (
          <button
            key={option ?? "__all"}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={active}
            className={`cursor-pointer rounded-full px-2.5 py-1 text-xs transition-colors ${
              active
                ? "bg-accent font-semibold text-ink"
                : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            {option ?? allLabel}
          </button>
        );
      })}
    </div>
  );
}
