"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { submitMatch } from "@/app/submit/actions";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import {
  NEW_PLAYER,
  roundsPlayed,
  validateDraft,
  type DraftMatch,
  type DraftStatLine,
  type DraftTeam,
} from "@/lib/draft";
import { normalizeName } from "@/lib/names";
import type { Side } from "@/lib/types";

export type RosterEntry = { playerId: string; displayName: string };

const FIELD =
  "rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none";
const LABEL = "block text-xs font-semibold uppercase tracking-wider text-gray-500";

function emptyLine(): DraftStatLine {
  return { name: "", kills: 0, assists: 0, deaths: 0, damage: 0 };
}

function emptyTeam(label: string, startingSide: Side): DraftTeam {
  return { label, startingSide, roundsWon: 0, players: [emptyLine(), emptyLine()] };
}

/** datetime-local wants a local wall-clock string, not an ISO instant. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export default function SubmitClient({
  roster,
  aliases,
  maps,
}: {
  roster: RosterEntry[];
  aliases: Record<string, string>;
  maps: readonly string[];
}) {
  const [submittedBy, setSubmittedBy] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [draft, setDraft] = useState<DraftMatch>({
    playedAt: "",
    map: maps[0] ?? "",
    teams: [emptyTeam("A", "CT"), emptyTeam("B", "T")],
  });

  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [errors, setErrors] = useState<string[]>([]);
  const [duplicate, setDuplicate] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Set on mount rather than in the initial state, because a timestamp computed during
  // the server render would not match the one the browser computes on hydration.
  useEffect(() => {
    setDraft((d) => (d.playedAt ? d : { ...d, playedAt: toLocalInput(new Date()) }));
  }, []);

  const rounds = roundsPlayed(draft);
  const problems = useMemo(() => validateDraft(draft), [draft]);

  function updateTeam(index: 0 | 1, patch: Partial<DraftTeam>) {
    setDraft((d) => {
      const teams = [...d.teams] as [DraftTeam, DraftTeam];
      teams[index] = { ...teams[index], ...patch };
      // The sides are a pair, so flipping one has to flip the other.
      if (patch.startingSide) {
        teams[1 - index] = {
          ...teams[1 - index],
          startingSide: patch.startingSide === "CT" ? "T" : "CT",
        };
      }
      return { ...d, teams };
    });
  }

  function updateLine(team: 0 | 1, row: number, patch: Partial<DraftStatLine>) {
    setDraft((d) => {
      const teams = [...d.teams] as [DraftTeam, DraftTeam];
      const players = [...teams[team].players];
      players[row] = { ...players[row], ...patch };
      // Typing a handle that has been seen before matches it without a trip to the
      // dropdown, which is most of the work on a repeat lineup.
      if (patch.name !== undefined) {
        const hit = aliases[normalizeName(patch.name)];
        players[row].playerId = hit ?? (patch.name.trim() ? players[row].playerId : undefined);
      }
      teams[team] = { ...teams[team], players };
      return { ...d, teams };
    });
  }

  async function save(acceptDuplicate = false) {
    setStatus("saving");
    setErrors([]);
    const result = await submitMatch({
      passphrase,
      submittedBy,
      draft,
      acceptDuplicate,
    });
    if (result.ok) {
      setSavedId(result.matchId);
      setStatus("saved");
      return;
    }
    setErrors(result.errors);
    setDuplicate(!!result.duplicate);
    setStatus("idle");
  }

  if (status === "saved" && savedId) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Saved</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4 text-sm text-gray-400">
          <p>Ratings have been recomputed with this match included.</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/matches/${savedId}`}
              className="rounded-lg bg-accent px-4 py-2 font-heading text-sm font-bold uppercase tracking-wider text-ink"
            >
              View the match
            </Link>
            <button
              type="button"
              onClick={() => {
                setDraft({
                  playedAt: toLocalInput(new Date()),
                  map: maps[0] ?? "",
                  teams: [emptyTeam("A", "CT"), emptyTeam("B", "T")],
                });
                setSavedId(null);
                setStatus("idle");
              }}
              className="rounded-lg border border-white/10 px-4 py-2 font-heading text-sm font-bold uppercase tracking-wider text-gray-300 hover:border-accent/30"
            >
              Submit another
            </button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>The match</CardTitle>
          <span className="text-xs uppercase tracking-wider text-gray-500">
            {rounds} rounds
          </span>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={LABEL} htmlFor="submitted-by">
              Your name
            </label>
            <input
              id="submitted-by"
              value={submittedBy}
              onChange={(e) => setSubmittedBy(e.target.value)}
              placeholder="who is entering this"
              className={`mt-2 w-full ${FIELD}`}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="passphrase">
              Passphrase
            </label>
            <input
              id="passphrase"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className={`mt-2 w-full ${FIELD}`}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="map">
              Map
            </label>
            <select
              id="map"
              value={draft.map}
              onChange={(e) => setDraft((d) => ({ ...d, map: e.target.value }))}
              className={`mt-2 w-full ${FIELD}`}
            >
              {maps.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="played-at">
              Played
            </label>
            <input
              id="played-at"
              type="datetime-local"
              value={draft.playedAt}
              onChange={(e) => setDraft((d) => ({ ...d, playedAt: e.target.value }))}
              className={`mt-2 w-full ${FIELD}`}
            />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {([0, 1] as const).map((i) => (
          <TeamEditor
            key={i}
            team={draft.teams[i]}
            roster={roster}
            onTeamChange={(patch) => updateTeam(i, patch)}
            onLineChange={(row, patch) => updateLine(i, row, patch)}
            onAdd={() =>
              updateTeam(i, { players: [...draft.teams[i].players, emptyLine()] })
            }
            onRemove={(row) =>
              updateTeam(i, {
                players: draft.teams[i].players.filter((_, r) => r !== row),
              })
            }
          />
        ))}
      </div>

      {(problems.length > 0 || errors.length > 0) && (
        <Card className="border-loss/30">
          <CardBody className="space-y-1 text-sm text-loss">
            {[...new Set([...errors, ...problems])].map((p) => (
              <p key={p}>{p}</p>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={problems.length > 0 || status === "saving"}
          onClick={() => save(false)}
          className="rounded-lg bg-accent px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wider text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "saving" ? "Saving" : "Save match"}
        </button>
        {duplicate && (
          <button
            type="button"
            disabled={status === "saving"}
            onClick={() => save(true)}
            className="rounded-lg border border-loss/40 px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wider text-loss"
          >
            Save it anyway
          </button>
        )}
      </div>
    </div>
  );
}

function TeamEditor({
  team,
  roster,
  onTeamChange,
  onLineChange,
  onAdd,
  onRemove,
}: {
  team: DraftTeam;
  roster: RosterEntry[];
  onTeamChange: (patch: Partial<DraftTeam>) => void;
  onLineChange: (row: number, patch: Partial<DraftStatLine>) => void;
  onAdd: () => void;
  onRemove: (row: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Team {team.label}</CardTitle>
        <div className="flex items-center gap-2">
          <select
            aria-label={`Team ${team.label} starting side`}
            value={team.startingSide}
            onChange={(e) => onTeamChange({ startingSide: e.target.value as Side })}
            className={FIELD}
          >
            <option value="CT">Started CT</option>
            <option value="T">Started T</option>
          </select>
          <input
            aria-label={`Team ${team.label} rounds won`}
            type="number"
            min={0}
            value={team.roundsWon}
            onChange={(e) => onTeamChange({ roundsWon: Number(e.target.value) })}
            className={`w-20 text-center ${FIELD}`}
          />
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        {team.players.map((line, row) => (
          <div key={row} className="rounded-lg border border-white/5 bg-ink/40 p-3">
            <div className="flex gap-2">
              <input
                aria-label="Handle"
                value={line.name}
                onChange={(e) => onLineChange(row, { name: e.target.value })}
                placeholder="in-game name"
                className={`min-w-0 flex-1 ${FIELD}`}
              />
              <select
                aria-label="Roster match"
                value={line.playerId ?? ""}
                onChange={(e) =>
                  onLineChange(row, { playerId: e.target.value || undefined })
                }
                className={`min-w-0 flex-1 ${FIELD}`}
              >
                <option value="">Who is this?</option>
                <option value={NEW_PLAYER}>Add as a new player</option>
                {roster.map((p) => (
                  <option key={p.playerId} value={p.playerId}>
                    {p.displayName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onRemove(row)}
                aria-label={`Remove ${line.name || "row"}`}
                className="rounded-lg border border-white/10 px-2.5 text-gray-500 hover:border-loss/40 hover:text-loss"
              >
                &times;
              </button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {(
                [
                  ["kills", "K"],
                  ["assists", "A"],
                  ["deaths", "D"],
                  ["damage", "DMG"],
                ] as const
              ).map(([field, label]) => (
                <div key={field}>
                  <label className={LABEL} htmlFor={`${team.label}-${row}-${field}`}>
                    {label}
                  </label>
                  <input
                    id={`${team.label}-${row}-${field}`}
                    type="number"
                    min={0}
                    value={line[field]}
                    onChange={(e) => onLineChange(row, { [field]: Number(e.target.value) })}
                    className={`mt-1 w-full text-center ${FIELD}`}
                  />
                </div>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={!!line.joinedLate}
                onChange={(e) => onLineChange(row, { joinedLate: e.target.checked })}
              />
              Joined part way through
            </label>
          </div>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="w-full rounded-lg border border-dashed border-white/15 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:border-accent/30 hover:text-accent"
        >
          Add a player
        </button>
      </CardBody>
    </Card>
  );
}
