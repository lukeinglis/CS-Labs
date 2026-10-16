import { Card } from "@/components/ui";

/**
 * Shared by the two sign-in forms, which differ only in their copy and which action
 * they post to. Keeping them one component means the league form cannot drift into
 * looking more official than the admin one, or the other way round.
 */
export default function SignInForm({
  action,
  message,
  hint,
}: {
  action: (formData: FormData) => Promise<void>;
  message?: string;
  hint?: string;
}) {
  return (
    <Card className="mx-auto max-w-md px-6 py-6">
      <form action={action} className="space-y-4">
        <div>
          <label
            htmlFor="passphrase"
            className="block text-xs font-semibold uppercase tracking-wider text-gray-500"
          >
            Passphrase
          </label>
          <input
            id="passphrase"
            name="passphrase"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            className="mt-1 w-full rounded-lg border border-white/15 bg-ink-light/60 px-3 py-2 text-white outline-none focus:border-accent"
          />
        </div>

        {message && (
          <p role="alert" className="text-sm text-loss">
            {message}
          </p>
        )}

        {hint && !message && <p className="text-sm text-gray-500">{hint}</p>}

        <button
          type="submit"
          className="font-heading w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:bg-accent/90"
        >
          Sign in
        </button>
      </form>
    </Card>
  );
}
