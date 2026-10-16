import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignInForm from "./SignInForm";
import { signIn } from "./actions";
import { Container, PageHeader } from "@/components/ui";
import { canSeeStats, isConfigured } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sign in",
  // No reason for this to turn up in a search result.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  wrong: "That passphrase is not right.",
  unconfigured:
    "No passphrase is set on this deployment, so there is nothing to sign in to yet.",
};

type Props = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  if (await canSeeStats()) redirect("/stats");

  const { error } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  return (
    <>
      <PageHeader
        title="Player stats"
        subtitle="Kills, ADR and performance ratings, for the people who play. Ask in the group for the passphrase. Win/loss and everything else on the site stays open to everyone."
      />

      <Container className="py-8">
        <SignInForm
          action={signIn}
          message={message}
          hint={
            isConfigured("league")
              ? undefined
              : "Set LEAGUE_PASSPHRASE to enable this."
          }
        />
      </Container>
    </>
  );
}
