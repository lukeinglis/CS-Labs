import Link from "next/link";
import {
  games,
  winRate,
  type Record as WinLossRecord,
  type SplitRecord,
  type Versus,
} from "@/lib/records";

/**
 * How a win/loss record is drawn, in one place.
 *
 * The same splits now appear on a player's own page and folded into the leaderboard, and
 * a record that reads "7-3-0" in one place and "7-3" in the other invites someone to
 * think they are different numbers. No "use client" here on purpose: this is plain
 * presentation, so a server component can render it and a client one can import it.
 */

export const TH = "px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500";
export const TD = "px-4 py-2 text-sm text-gray-300";

export function pct(r: WinLossRecord): string {
  return games(r) === 0 ? "—" : `${Math.round(winRate(r) * 100)}%`;
}

export function record(r: WinLossRecord): string {
  return `${r.wins}-${r.losses}-${r.draws}`;
}

/** +3 reads as a three-win run, -2 as a two-loss one. */
export function streakLabel(streak: number): string {
  if (streak === 0) return "—";
  return `${streak > 0 ? "W" : "L"}${Math.abs(streak)}`;
}

export function SplitTable({ rows, label }: { rows: SplitRecord[]; label: string }) {
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

/**
 * How one player has fared alongside and across from everyone else.
 *
 * `names` is a Map rather than a lookup function because this renders on both sides of
 * the client boundary: a function prop would be fine between two client components but
 * not from a server one, and a Map is serializable either way.
 */
export function VersusTable({
  versus,
  names,
  playerBase,
}: {
  versus: Versus[];
  names: Map<string, string>;
  playerBase: string;
}) {
  return (
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
                {games(v.with) === 0 ? "—" : record(v.with)}
              </td>
              <td className={`${TD} text-center text-gray-500`}>{pct(v.with)}</td>
              <td className={`${TD} text-center`}>
                {games(v.against) === 0 ? "—" : record(v.against)}
              </td>
              <td className={`${TD} text-center text-gray-500`}>{pct(v.against)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
