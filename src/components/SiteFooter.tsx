import { Container } from "./ui";

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-ink-dark/50 py-8">
      <Container className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
        <p>CS Labs, a scoreboard for our custom games.</p>
        <p>Ratings are recomputed from the full match history on every load.</p>
      </Container>
    </footer>
  );
}
