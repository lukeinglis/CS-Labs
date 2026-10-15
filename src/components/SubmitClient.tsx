"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { submitMatch } from "@/app/submit/actions";
import ScreenshotPanel, { type Extraction } from "@/components/ScreenshotPanel";
import { Badge, Card, CardBody, CardHeader, CardTitle, SideBadge } from "@/components/ui";
import {
  NEW_PLAYER,
  roundsPlayed,
  validateDraft,
  type DraftMatch,
  type DraftStatLine,
  type DraftTeam,
} from "@/lib/draft";
import { editedFields } from "@/lib/extract";
import { normalizeName } from "@/lib/names";
import type { Side } from "@/lib/types";

export type RosterEntry = { playerId: string; displayName: string };

const FIELD =
  "rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none";
const LABEL = "block text-xs font-semibold uppercase tracking-wider text-gray-500";

/**
 * The passphrase gates submitting a match and nothing else, it is shared by the whole
 * group, and the alternative is typing it on a phone after every game. Remembering it
 * per device is the right trade, and the form says so rather than doing it silently.
 */
const REMEMBERED_NAME = "cs-labs.submittedBy";
const REMEMBERED_PASSPHRASE = "cs-labs.passphrase";

/** Same-tab writes do not raise a storage event, so subscribers are tracked by hand. */
const listeners = new Set<() => void>();

function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing can refuse to store. Typing it again is a smaller problem than
    // the page failing, so this is dropped rather than surfaced.
  }
  for (const notify of listeners) notify();
}

/**
 * Reads through to localStorage via useSyncExternalStore rather than an effect, so the
 * server renders a blank field and the client swaps in the stored value during hydration
 * without a mismatch.
 */
function useRemembered(key: string): [string, (next: string) => void] {
  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(key) ?? "";
      } catch {
        return "";
      }
    },
    () => ""
  );

  const set = useCallback((next: string) => remember(key, next), [key]);
  return [value, set];
}

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

function readableDate(localInput: string): string {
  const parsed = new Date(localInput);
  if (Number.isNaN(parsed.getTime())) return "Not set";
  return parsed.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Starts a draft nobody has typed into yet. The map is left blank rather than defaulting
 * to the first in the list, because a default that happens to be wrong files the match
 * under the wrong map without anyone noticing.
 */
function blankDraft(): DraftMatch {
  return {
    playedAt: toLocalInput(new Date()),
    map: "",
    teams: [emptyTeam("A", "CT"), emptyTeam("B", "T")],
  };
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
  const [submittedBy, setSubmittedBy] = useRemembered(REMEMBERED_NAME);
  const [passphrase, setPassphrase] = useRemembered(REMEMBERED_PASSPHRASE);

  /**
   * Null until there is something to review. A screenshot is the way in, so there is no
   * form to confront before one has been read: an empty grid of zeroes up front is just
   * a pile of validation errors wearing a form.
   */
  const [draft, setDraft] = useState<DraftMatch | null>(null);

  /**
   * An extracted scoreboard is shown as a scoreboard, not as fifty input boxes. Editing
   * is a thing you opt into when something is actually wrong, which for a clean read is
   * never. Typing one in by hand starts here already open.
   */
  const [editing, setEditing] = useState(false);

  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [errors, setErrors] = useState<string[]>([]);
  const [duplicate, setDuplicate] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);

  const problems = useMemo(() => (draft ? validateDraft(draft) : []), [draft]);
  const names = useMemo(
    () => new Map(roster.map((p) => [p.playerId, p.displayName])),
    [roster]
  );

  function updateTeam(index: 0 | 1, patch: Partial<DraftTeam>) {
    setDraft((d) => {
      if (!d) return d;
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
      if (!d) return d;
      const teams = [...d.teams] as [DraftTeam, DraftTeam];
      const players = [...teams[team].players];
      players[row] = { ...players[row], ...patch };
      // Typing a handle that has been seen before matches it without a trip to the
      // dropdown, which is most of the work on a repeat lineup. A handle nobody
      // recognises falls through to new player, since that is what it is.
      //
      // Editing the name always re-resolves, even over a match that was already there.
      // Keeping the old one would leave a corrected handle filed under whoever the
      // misread name happened to hit, which is worse than making someone pick again.
      if (patch.name !== undefined) {
        const hit = aliases[normalizeName(patch.name)];
        players[row].playerId = patch.name.trim() ? (hit ?? NEW_PLAYER) : undefined;
      }
      teams[team] = { ...teams[team], players };
      return { ...d, teams };
    });
  }

  async function save(acceptDuplicate = false) {
    if (!draft) return;
    setStatus("saving");
    setErrors([]);
    const result = await submitMatch({
      passphrase,
      submittedBy,
      draft,
      acceptDuplicate,
      ...(extraction && {
        origin: {
          blobUrl: extraction.blobUrl,
          extractionModel: extraction.extractionModel,
          editedFields: editedFields(extraction.original, draft),
        },
      }),
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
                setDraft(null);
                setEditing(false);
                setExtraction(null);
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
          <CardTitle>Who is submitting</CardTitle>
          <span className="text-xs uppercase tracking-wider text-gray-500">
            remembered on this device
          </span>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
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
        </CardBody>
      </Card>

      <ScreenshotPanel
        passphrase={passphrase}
        reading={!draft}
        onExtracted={(extracted, meta) => {
          setExtraction(meta);
          // A scoreboard carries no date of its own, so the camera's is the best one
          // there is. Falling back to now is right for the usual case of uploading
          // straight after the game.
          setDraft({
            ...extracted,
            playedAt: meta.photoTakenAt ?? toLocalInput(new Date()),
          });
          setEditing(false);
          setErrors([]);
        }}
      />

      {!draft && (
        <p className="text-center text-sm text-gray-500">
          No screenshot handy?{" "}
          <button
            type="button"
            onClick={() => {
              setDraft(blankDraft());
              setEditing(true);
            }}
            className="font-semibold text-gray-300 underline decoration-white/20 underline-offset-4 hover:text-accent"
          >
            Type the scoreboard in by hand
          </button>
        </p>
      )}

      {draft && !editing && (
        <MatchSummary
          draft={draft}
          photoTakenAt={extraction?.photoTakenAt ?? null}
          fromScreenshot={!!extraction}
        />
      )}

      {draft && editing && (
        <Card>
          <CardHeader>
            <CardTitle>The match</CardTitle>
            <span className="text-xs uppercase tracking-wider text-gray-500">
              {roundsPlayed(draft)} rounds
            </span>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="map">
                Map
              </label>
              <select
                id="map"
                value={draft.map}
                onChange={(e) => setDraft((d) => d && { ...d, map: e.target.value })}
                className={`mt-2 w-full ${FIELD}`}
              >
                {/* An extraction can name a map the config does not list, and silently
                    snapping it to the first option would file the match under Mirage. */}
                {!maps.includes(draft.map) && (
                  <option value={draft.map}>{draft.map || "Which map?"}</option>
                )}
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
                onChange={(e) => setDraft((d) => d && { ...d, playedAt: e.target.value })}
                className={`mt-2 w-full ${FIELD}`}
              />
            </div>
          </CardBody>
        </Card>
      )}

      {draft && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            {([0, 1] as const).map((i) =>
              editing ? (
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
              ) : (
                <TeamReview
                  key={i}
                  team={draft.teams[i]}
                  names={names}
                  rounds={roundsPlayed(draft)}
                  isWinner={
                    draft.teams[i].roundsWon >
                    draft.teams[1 - i].roundsWon
                  }
                />
              )
            )}
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
              {status === "saving" ? "Saving" : "Looks right, save it"}
            </button>
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className="rounded-lg border border-white/10 px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wider text-gray-300 hover:border-accent/30 hover:text-accent"
            >
              {editing ? "Done editing" : "Something is wrong"}
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
        </>
      )}
    </div>
  );
}

/** The map, the date and where the date came from, since a wrong date mis-files a match. */
function MatchSummary({
  draft,
  photoTakenAt,
  fromScreenshot,
}: {
  draft: DraftMatch;
  photoTakenAt: string | null;
  fromScreenshot: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{draft.map || "Which map?"}</CardTitle>
        <span className="text-xs uppercase tracking-wider text-gray-500">
          {roundsPlayed(draft)} rounds
        </span>
      </CardHeader>
      <CardBody className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm text-gray-300">{readableDate(draft.playedAt)}</span>
        <span className="text-xs text-gray-500">
          {photoTakenAt
            ? "taken from the photo"
            : fromScreenshot
              ? "the photo carried no date, so this is now"
              : "set to now"}
        </span>
      </CardBody>
    </Card>
  );
}

/** The extracted scoreboard shown as a scoreboard, so checking it is reading, not auditing. */
function TeamReview({
  team,
  names,
  rounds,
  isWinner,
}: {
  team: DraftTeam;
  names: Map<string, string>;
  rounds: number;
  isWinner: boolean;
}) {
  const ordered = team.players.slice().sort((a, b) => b.kills - a.kills);

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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px]">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th
                scope="col"
                className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                Player
              </th>
              {["K", "D", "A", "HS%", "DMG"].map((label) => (
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
            {ordered.map((line, row) => {
              const isNew = line.playerId === NEW_PLAYER;
              const known = line.playerId ? names.get(line.playerId) : undefined;
              return (
                <tr key={row} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-2.5 text-sm">
                    <span className="font-medium text-white">{line.name || "Unnamed"}</span>
                    {/* Only worth showing when the roster calls them something else,
                        which is the case a reviewer should actually check. */}
                    {known && known !== line.name && (
                      <span className="ml-2 text-xs text-gray-500">{known}</span>
                    )}
                    {isNew && (
                      <span className="ml-2">
                        <Badge tone="accent" title="Joins the roster when this match is saved">
                          New
                        </Badge>
                      </span>
                    )}
                    {!line.playerId && (
                      <span className="ml-2">
                        <Badge tone="loss">Who?</Badge>
                      </span>
                    )}
                    {line.joinedLate && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        Late
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center text-sm text-gray-300">{line.kills}</td>
                  <td className="px-3 py-2.5 text-center text-sm text-gray-300">{line.deaths}</td>
                  <td className="px-3 py-2.5 text-center text-sm text-gray-300">
                    {line.assists}
                  </td>
                  <td className="px-3 py-2.5 text-center text-sm text-gray-400">
                    {line.headshotPct ?? "-"}
                  </td>
                  <td className="px-3 py-2.5 text-center text-sm text-gray-300">{line.damage}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-xs text-gray-500">
        {(team.players.reduce((n, l) => n + l.damage, 0) / Math.max(rounds, 1)).toFixed(0)}{" "}
        damage per round across the team.
      </p>
    </Card>
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
                // Tinted rather than flagged: a handle nobody recognises is a new player
                // joining the roster, which is worth noticing but is not a mistake.
                className={`min-w-0 flex-1 ${FIELD} ${
                  line.playerId === NEW_PLAYER ? "border-accent/30 text-accent" : ""
                }`}
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
            {/* Column order mirrors the CS2 scoreboard so a row can be typed straight across. */}
            <div className="mt-2 grid grid-cols-5 gap-2">
              {(
                [
                  ["kills", "K"],
                  ["deaths", "D"],
                  ["assists", "A"],
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
              <div>
                <label className={LABEL} htmlFor={`${team.label}-${row}-headshotPct`}>
                  HS%
                </label>
                <input
                  id={`${team.label}-${row}-headshotPct`}
                  type="number"
                  min={0}
                  max={100}
                  value={line.headshotPct ?? ""}
                  onChange={(e) =>
                    onLineChange(row, {
                      headshotPct: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                  className={`mt-1 w-full text-center ${FIELD}`}
                />
              </div>
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
