import Link from "next/link";
import type { PublicRankedPlayer } from "@/lib/data";
import { games, type Record as WinLossRecord } from "@/lib/records";
import { record } from "./records-ui";

/**
 * Everyone against everyone, as a grid.
 *
 * Read a row: the cell says how the player on the left has fared against the player
 * along the top. The grid is therefore antisymmetric, not symmetric. The cell at
 * (me, you) and the one at (you, me) hold the same games with wins and losses swapped,
 * which is a feature: whichever name you start from, you read your own record.
 *
 * Column headers are rotated rather than abbreviated. Three-letter stubs in a crosstab
 * are the fastest way to make two players indistinguishable, and this roster is small
 * enough that the extra header height costs nothing.
 *
 * No `"use client"`: this is a static grid with nothing to click but the links, so it
 * renders on the server and ships no JavaScript.
 */
export default function HeadToHead({
  players,
  matrix,
  playerBase = "/players",
}: {
  /** In the order they should appear. Players who have never met anyone are dropped. */
  players: PublicRankedPlayer[];
  /** As built by `againstMatrix`: `matrix.get(me)?.get(them)`. */
  matrix: Map<string, Map<string, WinLossRecord>>;
  playerBase?: string;
}) {
  const shown = players.filter((p) => (matrix.get(p.playerId)?.size ?? 0) > 0);

  if (shown.length < 2) {
    return (
      <p className="px-4 py-6 text-sm text-gray-500">
        The grid fills in once two players have been on opposite teams.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Sized to its contents rather than stretched: a `w-full` crosstab dumps all the
          slack into the name column and leaves a gulf before the first result. */}
      <table className="w-max">
        <thead>
          <tr className="border-b border-white/10">
            <th scope="col" className="px-4 py-2 text-left align-bottom">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                vs →
              </span>
            </th>
            {shown.map((p) => (
              <th key={p.playerId} scope="col" className="h-28 px-1 py-2 align-bottom">
                <span className="inline-block rotate-180 whitespace-nowrap text-xs font-medium text-gray-400 [writing-mode:vertical-rl]">
                  {p.displayName}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((me) => {
            const row = matrix.get(me.playerId);

            return (
              <tr key={me.playerId} className="border-b border-white/5 last:border-0">
                <th scope="row" className="whitespace-nowrap px-4 py-2 text-left">
                  <Link
                    href={`${playerBase}/${me.playerId}`}
                    className="text-sm font-medium text-white transition-colors hover:text-accent"
                  >
                    {me.displayName}
                  </Link>
                </th>
                {shown.map((them) => {
                  if (them.playerId === me.playerId) {
                    return (
                      <td
                        key={them.playerId}
                        className="bg-white/[0.03] px-2 py-2 text-center text-xs text-gray-700"
                      >
                        ·
                      </td>
                    );
                  }

                  const r = row?.get(them.playerId);
                  if (!r || games(r) === 0) {
                    return (
                      <td key={them.playerId} className="px-2 py-2 text-center text-xs text-gray-700">
                        —
                      </td>
                    );
                  }

                  return (
                    <td
                      key={them.playerId}
                      title={`${me.displayName} vs ${them.displayName}: ${record(r)}`}
                      className={`whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums ${
                        r.wins > r.losses
                          ? "text-win"
                          : r.wins < r.losses
                            ? "text-loss"
                            : "text-gray-400"
                      }`}
                    >
                      {record(r)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="px-4 py-3 text-xs text-gray-500">
        Each cell is the row player&apos;s record against the column player, as
        wins-losses-draws, across every match. A dash means they have never been on
        opposite teams.
      </p>
    </div>
  );
}
