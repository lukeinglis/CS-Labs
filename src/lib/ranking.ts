import { ordinal, rate, rating } from "openskill";
import type {
  MatchRecord,
  PlayerRating,
  PlayerStatLine,
  RankingConfig,
} from "./types";

type MutableRating = {
  playerId: string;
  mu: number;
  sigma: number;
  perfSum: number;
  perfSamples: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  roundsWon: number;
  roundsLost: number;
  overall: number;
  lastPlayedAt: string | null;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** A lobby where nobody recorded the stat at all is neutral, not infinitely good. */
function ratio(value: number, lobbyMean: number, min: number, max: number): number {
  if (lobbyMean <= 1e-6) return 1;
  return clamp(value / lobbyMean, min, max);
}

function displayOrdinal(r: { mu: number; sigma: number }, config: RankingConfig): number {
  return ordinal(r, {
    z: config.z,
    alpha: config.displayAlpha,
    target: config.displayTarget,
  });
}

export function adr(line: PlayerStatLine, rounds: number): number {
  return line.damage / Math.max(1, rounds);
}

function perRound(line: PlayerStatLine, rounds: number) {
  return {
    playerId: line.playerId,
    kpr: line.kills / rounds,
    apr: line.assists / rounds,
    dpr: line.deaths / rounds,
    adr: adr(line, rounds),
  };
}

/**
 * Each player's output relative to the other players in that same match, so a
 * sweaty lobby does not inflate everyone. 1.0 means exactly lobby average.
 */
export function computeMatchPerf(
  match: MatchRecord,
  config: RankingConfig
): Map<string, number> {
  const lines: PlayerStatLine[] = match.teams.flatMap((t) => t.players);
  const rounds = Math.max(1, match.roundsPlayed);
  const w = config.perf;

  const full = lines.filter((l) => !l.joinedLate).map((l) => perRound(l, rounds));
  const reference = full.length > 0 ? full : lines.map((l) => perRound(l, rounds));

  const meanKpr = mean(reference.map((p) => p.kpr));
  const meanApr = mean(reference.map((p) => p.apr));
  const meanDpr = mean(reference.map((p) => p.dpr));
  const meanAdr = mean(reference.map((p) => p.adr));

  const out = new Map<string, number>();
  for (const line of lines) {
    if (line.joinedLate) {
      out.set(line.playerId, 1);
      continue;
    }

    const p = perRound(line, rounds);
    const adrRel = ratio(p.adr, meanAdr, w.termMin, w.termMax);
    const kprRel = ratio(p.kpr, meanKpr, w.termMin, w.termMax);
    const aprRel = ratio(p.apr, meanApr, w.termMin, w.termMax);
    // Inverted: dying less than the lobby average should score above 1.0.
    const dprRel = ratio(meanDpr, Math.max(p.dpr, 1e-6), w.termMin, w.termMax);

    out.set(
      p.playerId,
      w.adr * adrRel + w.kills * kprRel + w.deaths * dprRel + w.assists * aprRel
    );
  }
  return out;
}

/**
 * Folds individual performance into a team-outcome delta. Team result always
 * sets the sign: a loss can be clawed back to break-even but never into a gain.
 *
 * The clawback is linear up to that break-even point, which sits at perf
 * `1 + 1 / lossClawbackWeight`. Worth keeping in view when tuning that weight, because
 * perf is lobby-relative and therefore bounded by how far one player can pull ahead of
 * five others: a threshold set above roughly 1.75 is one nobody can reach, and the
 * clawback quietly stops existing.
 */
export function blendDelta(
  teamDelta: number,
  matchPerf: number,
  config: RankingConfig
): number {
  const w = config.perf;
  const deviation = matchPerf - 1;

  if (teamDelta < 0) {
    const magnitude = Math.abs(teamDelta);
    // Only an exceptional game earns the full clawback. A poor game is penalised at
    // the gentler win weight, otherwise weaker players spiral without a floor.
    const bonus =
      deviation > 0
        ? Math.min(deviation * w.lossClawbackWeight, 1) * magnitude
        : deviation * w.winWeight * magnitude;
    return clamp(teamDelta + bonus, teamDelta * w.lossFloorMultiplier, 0);
  }

  const bonus = deviation * w.winWeight * teamDelta;
  return clamp(
    teamDelta + bonus,
    teamDelta * (1 - w.winCap),
    teamDelta * (1 + w.winCap)
  );
}

function applyDecay(st: MutableRating, at: string, config: RankingConfig): void {
  if (!config.decay.enabled || !st.lastPlayedAt) return;
  const weeksIdle =
    (new Date(at).getTime() - new Date(st.lastPlayedAt).getTime()) / WEEK_MS;
  const beyondGrace = weeksIdle - config.decay.graceWeeks;
  if (beyondGrace <= 0) return;
  st.sigma = Math.min(
    config.sigma,
    st.sigma + beyondGrace * config.decay.sigmaGrowthPerWeek
  );
}

/**
 * Replays the whole match log in chronological order. Every weight lives in config,
 * so ratings can be recomputed from scratch after a retune.
 */
export function computeRatings(
  matches: MatchRecord[],
  config: RankingConfig,
  asOf?: string
): PlayerRating[] {
  const state = new Map<string, MutableRating>();
  const baseline = displayOrdinal({ mu: config.mu, sigma: config.sigma }, config);

  const ordered = matches
    .filter((m) => !m.voided)
    .slice()
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt));

  for (const match of ordered) {
    const perfByPlayer = computeMatchPerf(match, config);

    for (const team of match.teams) {
      for (const line of team.players) {
        if (!state.has(line.playerId)) {
          const seed = rating({ mu: config.mu, sigma: config.sigma });
          state.set(line.playerId, {
            playerId: line.playerId,
            mu: seed.mu,
            sigma: seed.sigma,
            perfSum: 0,
            perfSamples: 0,
            games: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            roundsWon: 0,
            roundsLost: 0,
            overall: baseline,
            lastPlayedAt: null,
          });
        }
        applyDecay(state.get(line.playerId)!, match.playedAt, config);
      }
    }

    const teams = match.teams.map((team) =>
      team.players.map((line) => {
        const st = state.get(line.playerId)!;
        return { mu: st.mu, sigma: st.sigma };
      })
    );

    const before = teams.map((team) => team.map((r) => displayOrdinal(r, config)));

    // score is negated into rank internally, so more rounds won is the winner and
    // equal rounds is a genuine draw. margin adds logarithmic amplification once the
    // round gap exceeds the threshold, so a 13-2 counts for more than a 13-11.
    const after = rate(teams, {
      mu: config.mu,
      sigma: config.sigma,
      score: match.teams.map((t) => t.roundsWon),
      margin: config.marginRounds,
    });

    match.teams.forEach((team, i) => {
      const opponentRounds = match.teams[1 - i].roundsWon;

      team.players.forEach((line, j) => {
        const st = state.get(line.playerId)!;
        const updated = after[i][j];
        const teamDelta = displayOrdinal(updated, config) - before[i][j];
        const matchPerf = perfByPlayer.get(line.playerId) ?? 1;

        st.mu = updated.mu;
        st.sigma = updated.sigma;
        st.overall += blendDelta(teamDelta, matchPerf, config);
        st.games += 1;
        st.roundsWon += team.roundsWon;
        st.roundsLost += opponentRounds;
        st.lastPlayedAt = match.playedAt;

        if (!line.joinedLate) {
          st.perfSum += matchPerf;
          st.perfSamples += 1;
        }

        if (team.roundsWon > opponentRounds) st.wins += 1;
        else if (team.roundsWon < opponentRounds) st.losses += 1;
        else st.draws += 1;
      });
    });
  }

  return [...state.values()]
    .map((st) => {
      if (asOf) applyDecay(st, asOf, config);
      return {
        playerId: st.playerId,
        mu: st.mu,
        sigma: st.sigma,
        teamRating: displayOrdinal({ mu: st.mu, sigma: st.sigma }, config),
        perfRating: st.perfSamples > 0 ? st.perfSum / st.perfSamples : 1,
        overall: st.overall,
        games: st.games,
        wins: st.wins,
        losses: st.losses,
        draws: st.draws,
        roundsWon: st.roundsWon,
        roundsLost: st.roundsLost,
        lastPlayedAt: st.lastPlayedAt,
        provisional: st.games < config.provisionalGames,
      };
    })
    .sort((a, b) => b.overall - a.overall);
}
