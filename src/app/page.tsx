import Link from "next/link";
import { ranking } from "../../cs-labs.config";
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  PageHeader,
  SideBadge,
  StatTile,
} from "@/components/ui";
import { loadPlayers, loadPublicRankings } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [{ ranked, matches }, players] = await Promise.all([
    loadPublicRankings(),
    loadPlayers(),
  ]);
  const qualified = ranked.filter((p) => !p.provisional);
  const topFive = qualified.slice(0, 5);
  const recent = matches.slice(-5).reverse();
  const names = new Map(players.map((p) => [p.id, p.displayName]));

  return (
    <>
      <PageHeader
        title={
          <>
            CS <span className="text-accent">Labs</span>
          </>
        }
        subtitle="Match history, player ratings and team balancing for our custom games. Upload the end-of-match scoreboard and everything else is derived from it."
        action={
          <Link
            href="/submit"
            className="font-heading rounded-lg bg-accent px-8 py-3 text-base font-bold uppercase tracking-wide text-ink shadow-lg shadow-accent/20 transition-all hover:bg-accent/90 hover:shadow-accent/40"
          >
            Submit Match
          </Link>
        }
      />

      <Container className="space-y-8 py-8">
        <div className="animate-fade-in-up grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Matches" value={matches.length} />
          <StatTile label="Players" value={ranked.length} tone="accent" />
          <StatTile
            label="Ranked"
            value={qualified.length}
            hint={`${ranking.provisionalGames}+ games to qualify`}
            tone="ct"
          />
          <StatTile
            label="Rounds played"
            value={matches.reduce((sum, m) => sum + m.roundsPlayed, 0)}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="animate-fade-in-up animate-delay-100">
            <CardHeader>
              <CardTitle>Top of the table</CardTitle>
              <Link href="/leaderboard" className="text-sm text-accent hover:underline">
                Full leaderboard
              </Link>
            </CardHeader>
            {topFive.length === 0 ? (
              <div className="px-5 py-4">
                <EmptyState title="Nobody ranked yet">
                  Players qualify after {ranking.provisionalGames} games.
                </EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {topFive.map((p, i) => (
                  <li key={p.playerId} className="flex items-center gap-4 px-5 py-3">
                    <span
                      className={`font-heading w-6 text-lg font-bold ${
                        i === 0
                          ? "text-gold"
                          : i === 1
                            ? "text-silver"
                            : i === 2
                              ? "text-bronze"
                              : "text-gray-500"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <Link
                      href={`/players/${p.playerId}`}
                      className="flex-1 font-medium text-white transition-colors hover:text-accent"
                    >
                      {p.displayName}
                    </Link>
                    <span className="text-xs text-gray-500">
                      {p.wins}-{p.losses}-{p.draws}
                    </span>
                    <span className="font-heading text-lg font-bold text-accent">
                      {Math.round(p.teamRating)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="animate-fade-in-up animate-delay-200">
            <CardHeader>
              <CardTitle>Recent matches</CardTitle>
              <Link href="/matches" className="text-sm text-accent hover:underline">
                All matches
              </Link>
            </CardHeader>
            {recent.length === 0 ? (
              <div className="px-5 py-4">
                <EmptyState title="No matches yet">
                  The first submitted scoreboard shows up here.
                </EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {recent.map((match) => {
                  const [a, b] = match.teams;
                  const draw = a.roundsWon === b.roundsWon;
                  return (
                    <li key={match.id}>
                      <Link
                        href={`/matches/${match.id}`}
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]"
                      >
                        <span className="font-heading w-24 shrink-0 text-sm font-bold uppercase tracking-wide text-white">
                          {match.map}
                        </span>
                        <span className="flex items-center gap-2">
                          <SideBadge side={a.startingSide} />
                          <span className="font-heading text-lg font-bold text-white">
                            {a.roundsWon}
                            <span className="mx-1 text-gray-600">:</span>
                            {b.roundsWon}
                          </span>
                          <SideBadge side={b.startingSide} />
                        </span>
                        {draw && <Badge tone="muted">Draw</Badge>}
                        <span className="flex-1 truncate text-right text-xs text-gray-500">
                          {match.teams
                            .flatMap((t) =>
                              t.players.map((p) => names.get(p.playerId) ?? p.playerId)
                            )
                            .join(", ")}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <Card className="animate-fade-in-up animate-delay-300">
          <CardHeader>
            <CardTitle>How the rating works</CardTitle>
          </CardHeader>
          <div className="grid gap-5 px-5 py-5 sm:grid-cols-3">
            <div>
              <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-ct">
                Only the result counts
              </h3>
              <p className="mt-1 text-sm text-gray-400">
                Winning moves you up and losing moves you down. A 13-2 counts for more than
                a 13-11, and beating a full team while short-handed counts for more still.
                No individual stat touches the number.
              </p>
            </div>
            <div>
              <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-accent">
                Who you beat matters
              </h3>
              <p className="mt-1 text-sm text-gray-400">
                Beating the stacked team is worth more than beating the stacked team&rsquo;s
                opponents, which is why the rating is a better read than a raw win
                percentage and why the balancer trusts it.
              </p>
            </div>
            <div>
              <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-gray-300">
                Nothing is baked in
              </h3>
              <p className="mt-1 text-sm text-gray-400">
                Every rating is recomputed from the full match log on each load, so fixing a
                mistyped scoreboard or retuning the weights corrects all of history.
              </p>
            </div>
          </div>
        </Card>
      </Container>
    </>
  );
}
