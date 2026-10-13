import type { Metadata } from "next";
import { Card, CardBody, CardHeader, CardTitle, Container, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Submit a Match" };

export default function SubmitPage() {
  return (
    <>
      <PageHeader
        title="Submit a Match"
        subtitle="Drop in the end-of-match scoreboard and confirm what was read off it."
      />

      <Container className="py-8">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Not wired up yet</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-sm text-gray-400">
            <p>
              The plan is one screen: upload the scoreboard screenshot, let it read the map,
              score and every stat line, then correct anything it got wrong before saving.
            </p>
            <p>
              Two things are still outstanding. Reading the screenshot needs an Anthropic API
              key configured on the deployment, and the extraction prompt needs a couple of
              real scoreboards to be tuned against, since column layout and resolution vary.
            </p>
            <p>
              Starting side is likely to need a dropdown rather than extraction: teams swap at
              half, so the final scoreboard does not reliably show who started where.
            </p>
          </CardBody>
        </Card>
      </Container>
    </>
  );
}
