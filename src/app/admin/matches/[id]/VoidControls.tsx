import { Card, CardHeader, CardTitle } from "@/components/ui";
import { restoreMatchAction, voidMatchAction } from "./actions";

/**
 * Lives next to the route rather than in `components/`, because it is not shared: a
 * public page importing this would put a void button on a stranger's screen. The action
 * behind it checks admin regardless, so this is tidiness rather than the safeguard, but
 * the safeguard is easier to trust when nothing is tempted to reuse it.
 */

export const MESSAGES: Record<string, string> = {
  reason: "Give a reason. It is shown on the public match page.",
  long: "That reason is too long to fit the banner. Trim it a little.",
  missing: "That match is no longer in the store.",
  voided: "Voided. It no longer counts towards anyone's rating.",
  restored: "Restored. It counts again.",
};

const BUTTON =
  "font-heading rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wide transition-colors";

export default function VoidControls({
  matchId,
  voided,
  reason,
  notice,
  tone,
}: {
  matchId: string;
  voided: boolean;
  reason?: string;
  notice?: string;
  tone: "error" | "done" | null;
}) {
  return (
    <Card className="px-5 py-4">
      <CardHeader>
        <CardTitle>{voided ? "Restore this match" : "Void this match"}</CardTitle>
      </CardHeader>

      {notice && (
        <p
          role="status"
          className={`mb-3 text-sm ${tone === "error" ? "text-loss" : "text-ct"}`}
        >
          {notice}
        </p>
      )}

      {voided ? (
        <form action={restoreMatchAction} className="space-y-3">
          <input type="hidden" name="matchId" value={matchId} />
          <p className="text-sm text-gray-400">
            Recorded reason: {reason || "none given"}. Restoring puts it back into every
            rating and clears that note.
          </p>
          <button type="submit" className={`${BUTTON} bg-ct text-ink hover:bg-ct/90`}>
            Restore
          </button>
        </form>
      ) : (
        <form action={voidMatchAction} className="space-y-3">
          <input type="hidden" name="matchId" value={matchId} />
          <div>
            <label
              htmlFor="reason"
              className="block text-xs font-semibold uppercase tracking-wider text-gray-500"
            >
              Reason
            </label>
            <input
              id="reason"
              name="reason"
              type="text"
              required
              maxLength={200}
              placeholder="Wrong map picked, restarted after two rounds"
              className="mt-1 w-full rounded-lg border border-white/15 bg-ink-light/60 px-3 py-2 text-white outline-none focus:border-accent"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              This sits on the public match page, so write it for the group. The scores
              and the scoreboard stay where they are; the match just stops counting.
            </p>
          </div>
          <button type="submit" className={`${BUTTON} bg-loss text-white hover:bg-loss/90`}>
            Void
          </button>
        </form>
      )}
    </Card>
  );
}
