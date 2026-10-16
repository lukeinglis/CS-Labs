/**
 * The privacy boundary, as a type.
 *
 * Hiding a column in a component is not enough here. This site server-renders, and the
 * whole props tree is serialized into the HTML, so anything a public page *receives*
 * can be read in view-source whether or not it is drawn. The only way the gate means
 * something is if the sensitive fields never reach a public page at all, which is what
 * these projections are for: public pages take `PublicMatch`, and `PublicMatch` has
 * nowhere to put a kill count.
 *
 * Three things are sensitive, and the third is the one that is easy to miss:
 *   1. The per-player stat lines.
 *   2. The performance-derived ratings, `perfRating` and `overall`.
 *   3. The screenshot URL. The blob is world-readable and the image *is* the
 *      scoreboard, so leaking the link leaks every number on it.
 */
import type {
  MatchRecord,
  MatchTeam,
  PlayerRating,
  PlayerStatLine,
} from "./types";

/** Who played, and nothing about how they did. */
export type PublicStatLine = Pick<PlayerStatLine, "playerId" | "joinedLate">;

export type PublicMatchTeam = Omit<MatchTeam, "players"> & {
  players: PublicStatLine[];
};

/** Provenance without the image, so "where did this come from" survives the strip. */
export type PublicMatchSource = { kind: "manual" | "screenshot"; confirmedBy: string };

export type PublicMatch = Omit<MatchRecord, "teams" | "source"> & {
  teams: [PublicMatchTeam, PublicMatchTeam];
  source: PublicMatchSource;
};

/** A rating built only from games won and lost. `teamRating` is the headline number. */
export type PublicRating = Omit<PlayerRating, "perfRating" | "overall">;

function publicTeam(team: MatchTeam): PublicMatchTeam {
  return {
    label: team.label,
    startingSide: team.startingSide,
    roundsWon: team.roundsWon,
    players: team.players.map((line) => ({
      playerId: line.playerId,
      ...(line.joinedLate ? { joinedLate: true } : {}),
    })),
  };
}

/**
 * Rebuilt field by field rather than by deleting from a copy, so a field added to
 * `MatchRecord` later is private by default. Forgetting to strip a new stat is a much
 * easier mistake to make than forgetting to publish one.
 */
export function toPublicMatch(match: MatchRecord): PublicMatch {
  return {
    id: match.id,
    playedAt: match.playedAt,
    map: match.map,
    roundsPlayed: match.roundsPlayed,
    teams: [publicTeam(match.teams[0]), publicTeam(match.teams[1])],
    submittedBy: match.submittedBy,
    submittedAt: match.submittedAt,
    source: { kind: match.source.kind, confirmedBy: match.source.confirmedBy },
    ...(match.voided ? { voided: true } : {}),
    ...(match.voidReason ? { voidReason: match.voidReason } : {}),
    ...(match.voidedBy ? { voidedBy: match.voidedBy } : {}),
  };
}

/** Listed out for the same reason `toPublicMatch` is: new fields start out private. */
export function toPublicRating(rating: PlayerRating): PublicRating {
  return {
    playerId: rating.playerId,
    mu: rating.mu,
    sigma: rating.sigma,
    teamRating: rating.teamRating,
    games: rating.games,
    wins: rating.wins,
    losses: rating.losses,
    draws: rating.draws,
    roundsWon: rating.roundsWon,
    roundsLost: rating.roundsLost,
    lastPlayedAt: rating.lastPlayedAt,
    provisional: rating.provisional,
  };
}
