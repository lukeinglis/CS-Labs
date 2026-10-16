import type { Metadata } from "next";
import SignInForm from "../SignInForm";
import { signInAsAdmin } from "../actions";
import { Container, PageHeader } from "@/components/ui";
import { isConfigured } from "@/lib/session";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  wrong: "That passphrase is not right.",
  unconfigured:
    "No admin passphrase is set on this deployment, so there is nothing to sign in to.",
};

type Props = { searchParams: Promise<{ error?: string }> };

/**
 * Unlisted on purpose. Nothing links here, because the only person who needs it knows
 * the URL, and a link would invite the league to try the one passphrase they have
 * against a form that will never accept it.
 *
 * No redirect for an already-signed-in admin, unlike the league form: coming back here
 * deliberately is how you re-sign-in after the passphrase is rotated.
 */
export default async function AdminLoginPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  return (
    <>
      <PageHeader
        title="Admin sign in"
        subtitle="For voiding and restoring matches. Separate from the passphrase the league uses to see stats."
      />

      <Container className="py-8">
        <SignInForm
          action={signInAsAdmin}
          message={message}
          hint={
            isConfigured("admin") ? undefined : "Set ADMIN_PASSPHRASE to enable this."
          }
        />
      </Container>
    </>
  );
}
