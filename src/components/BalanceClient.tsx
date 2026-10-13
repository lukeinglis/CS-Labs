"use client";

import { useMemo, useState } from "react";
import { Badge, Card, CardHeader, CardTitle } from "@/components/ui";
import { generateSplits, type BalancePlayer, type SplitCandidate } from "@/lib/balance";

export type BalanceRosterEntry = {
  playerId: string;
  displayName: string;
  mu: number;
  sigma: number;
  games: number;
  provisional: boolean;
};

type Constraint = { a: string; b: string; kind: "together" | "apart" };

function pairLabel(
  constraint: Constraint,
  nameOf: (id: string) => string
): string {
  return `${nameOf(constraint.a)} ${constraint.kind === "together" ? "+" : "vs"} ${nameOf(constraint.b)}`;
}

export default function BalanceClient({
  roster,
  pairs,
}: {
  roster: BalanceRosterEntry[];
  /** Teammate history as [pairKey, count] entries, since a Map is not serialisable. */
  pairs: [string, number][];
}) {
  const pairCounts = useMemo(() => new Map(pairs), [pairs]);
  const [selected, setSelected] = useState<string[]>(() =>
    roster.slice(0, 10).map((p) => p.playerId)
  );
  const [varietyWeight, setVarietyWeight] = useState(0.25);
  const [teamSize, setTeamSize] = useState<number | "auto">("auto");
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [pickA, setPickA] = useState("");
  const [pickB, setPickB] = useState("");

  const nameOf = (id: string) =>
    roster.find((p) => p.playerId === id)?.displayName ?? id;

  const { splits, error } = useMemo(() => {
    const players: BalancePlayer[] = roster
      .filter((p) => selected.includes(p.playerId))
      .map(({ playerId, mu, sigma }) => ({ playerId, mu, sigma }));

    if (players.length < 2) return { splits: [], error: null };

    try {
      return {
        splits: generateSplits(players, {
          pairCounts,
          varietyWeight,
          teamSize: teamSize === "auto" ? undefined : teamSize,
          constraints: {
            together: constraints
              .filter((c) => c.kind === "together")
              .map((c) => [c.a, c.b] as [string, string]),
            apart: constraints
              .filter((c) => c.kind === "apart")
              .map((c) => [c.a, c.b] as [string, string]),
          },
          limit: 5,
        }),
        error: null,
      };
    } catch (err) {
      return { splits: [], error: (err as Error).message };
    }
  }, [roster, selected, pairCounts, varietyWeight, teamSize, constraints]);

  function toggle(playerId: string) {
    setSelected((prev) =>
      prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]
    );
  }

  function addConstraint(kind: Constraint["kind"]) {
    if (!pickA || !pickB || pickA === pickB) return;
    const exists = constraints.some(
      (c) =>
        (c.a === pickA && c.b === pickB) || (c.a === pickB && c.b === pickA)
    );
    if (!exists) setConstraints((prev) => [...prev, { a: pickA, b: pickB, kind }]);
    setPickA("");
    setPickB("");
  }

  const maxTeamSize = Math.max(1, selected.length - 1);

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Who is playing</CardTitle>
            <span className="text-sm text-gray-500">{selected.length} in</span>
          </CardHeader>
          <div className="flex flex-wrap gap-2 px-5 py-4">
            {roster.map((p) => {
              const on = selected.includes(p.playerId);
              return (
                <button
                  key={p.playerId}
                  type="button"
                  onClick={() => toggle(p.playerId)}
                  aria-pressed={on}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    on
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-white/10 bg-white/[0.02] text-gray-400 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {p.displayName}
                  {p.provisional && <span className="ml-1.5 text-[10px] text-gray-500">?</span>}
                </button>
              );
            })}
          </div>
          <p className="border-t border-white/10 px-5 py-3 text-xs text-gray-500">
            A <span className="text-gray-400">?</span> marks a provisional player whose rating is
            still a rough guess, so expect their side of the split to be less reliable.
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dials</CardTitle>
          </CardHeader>
          <div className="space-y-5 px-5 py-4">
            <div>
              <label
                htmlFor="variety"
                className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                Variety
                <span className="text-accent">{varietyWeight.toFixed(2)}</span>
              </label>
              <input
                id="variety"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={varietyWeight}
                onChange={(e) => setVarietyWeight(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--color-accent)]"
              />
              <p className="mt-1 text-xs text-gray-500">
                At 0 the split is purely the fairest matchup. Turn it up to trade some
                fairness for breaking apart teammates who always end up together.
              </p>
            </div>

            <div>
              <label
                htmlFor="team-size"
                className="block text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                Team size
              </label>
              <select
                id="team-size"
                value={teamSize}
                onChange={(e) =>
                  setTeamSize(e.target.value === "auto" ? "auto" : Number(e.target.value))
                }
                className="mt-2 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
              >
                <option value="auto">Even split</option>
                {Array.from({ length: maxTeamSize }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} v {selected.length - n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Constraints</CardTitle>
          </CardHeader>
          <div className="space-y-3 px-5 py-4">
            <div className="flex gap-2">
              {[
                { value: pickA, set: setPickA, label: "First player" },
                { value: pickB, set: setPickB, label: "Second player" },
              ].map((field, i) => (
                <select
                  key={i}
                  aria-label={field.label}
                  value={field.value}
                  onChange={(e) => field.set(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink px-2 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
                >
                  <option value="">{field.label}</option>
                  {roster
                    .filter((p) => selected.includes(p.playerId))
                    .map((p) => (
                      <option key={p.playerId} value={p.playerId}>
                        {p.displayName}
                      </option>
                    ))}
                </select>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addConstraint("together")}
                className="flex-1 rounded-lg border border-ct/40 px-3 py-2 text-xs font-bold uppercase tracking-wide text-ct transition-colors hover:bg-ct/10"
              >
                Same team
              </button>
              <button
                type="button"
                onClick={() => addConstraint("apart")}
                className="flex-1 rounded-lg border border-accent/40 px-3 py-2 text-xs font-bold uppercase tracking-wide text-accent transition-colors hover:bg-accent/10"
              >
                Split up
              </button>
            </div>

            {constraints.length > 0 && (
              <ul className="flex flex-wrap gap-2 pt-1">
                {constraints.map((c, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() =>
                        setConstraints((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      title="Remove this constraint"
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        c.kind === "together"
                          ? "border-ct/20 bg-ct/10 text-ct hover:bg-ct/20"
                          : "border-accent/20 bg-accent/10 text-accent hover:bg-accent/20"
                      }`}
                    >
                      {pairLabel(c, nameOf)}
                      <span aria-hidden>×</span>
                      <span className="sr-only">Remove</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        {error && (
          <Card className="border-loss/30 bg-loss/5 px-5 py-4 text-sm text-gray-300">{error}</Card>
        )}

        {!error && splits.length === 0 && (
          <Card className="px-5 py-12 text-center">
            <p className="font-heading text-lg font-bold uppercase tracking-wide text-gray-300">
              {selected.length < 2 ? "Pick at least two players" : "No legal split"}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
              {selected.length < 2
                ? "Select everyone who is in the lobby and the options appear here."
                : "Those constraints contradict each other. Try removing one."}
            </p>
          </Card>
        )}

        {splits.map((split, i) => (
          <SplitCard
            key={`${split.teamA.join()}-${i}`}
            split={split}
            rank={i + 1}
            nameOf={nameOf}
          />
        ))}
      </div>
    </div>
  );
}

function SplitCard({
  split,
  rank,
  nameOf,
}: {
  split: SplitCandidate;
  rank: number;
  nameOf: (id: string) => string;
}) {
  const percentA = Math.round(split.winProbability * 100);

  return (
    <Card hover={rank === 1} className={rank === 1 ? "border-accent/30" : ""}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle>{rank === 1 ? "Best split" : `Option ${rank}`}</CardTitle>
          <Badge tone={split.fairness > 0.85 ? "win" : split.fairness > 0.6 ? "accent" : "loss"}>
            {Math.round(split.fairness * 100)}% fair
          </Badge>
        </div>
        {split.repeats > 0 && (
          <span className="text-xs text-gray-500" title="Total past games shared by these teammates">
            {split.repeats} repeat pairings
          </span>
        )}
      </CardHeader>

      <div className="grid gap-px bg-white/10 sm:grid-cols-2">
        {[
          { ids: split.teamA, label: "Team A", pct: percentA, tone: "text-ct" },
          { ids: split.teamB, label: "Team B", pct: 100 - percentA, tone: "text-accent" },
        ].map((side) => (
          <div key={side.label} className="bg-ink-light/80 px-5 py-4">
            <div className="flex items-baseline justify-between">
              <p className="font-heading text-sm font-bold uppercase tracking-wide text-gray-400">
                {side.label}
              </p>
              <p className={`font-heading text-xl font-bold ${side.tone}`}>{side.pct}%</p>
            </div>
            <ul className="mt-2 space-y-1">
              {side.ids.map((id) => (
                <li key={id} className="text-sm text-white">
                  {nameOf(id)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="px-5 py-3">
        <div
          className="flex h-1.5 overflow-hidden rounded-full bg-ink"
          role="img"
          aria-label={`Team A has a ${percentA} percent chance of winning`}
        >
          <div className="bg-ct" style={{ width: `${percentA}%` }} />
          <div className="bg-accent" style={{ width: `${100 - percentA}%` }} />
        </div>
      </div>
    </Card>
  );
}
