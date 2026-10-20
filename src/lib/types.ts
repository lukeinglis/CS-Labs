export type Side = "CT" | "T";

export type Player = {
  id: string;
  displayName: string;
  steamId?: string;
  createdAt: string;
  active: boolean;
};

export type PlayerStatLine = {
  playerId: string;
  kills: number;
  assists: number;
  deaths: number;
  /**
   * Total damage, as the CS2 scoreboard reports it. ADR is derived from this and the
   * round count, so correcting a match's rounds retroactively fixes every ADR.
   */
  damage: number;
  headshotPct?: number;
  /**
   * Set when someone joined an in-progress game. Their stats cover fewer rounds
   * than the scoreboard implies, so they get neutral performance and are kept out
   * of the lobby averages rather than dragging everyone else's baseline down.
   */
  joinedLate?: boolean;
};

export type MatchTeam = {
  label: string;
  startingSide: Side;
  roundsWon: number;
  players: PlayerStatLine[];
};

export type MatchSource =
  | { kind: "manual"; confirmedBy: string }
  | {
      kind: "screenshot";
      blobUrl: string;
      confirmedBy: string;
      extractionModel: string;
      editedFields: string[];
    };

export type MatchRecord = {
  id: string;
  playedAt: string;
  map: string;
  roundsPlayed: number;
  teams: [MatchTeam, MatchTeam];
  submittedBy: string;
  submittedAt: string;
  source: MatchSource;
  voided?: boolean;
  voidReason?: string;
  voidedBy?: string;
};

export type RankingConfig = {
  mu: number;
  sigma: number;
  /** Std deviations subtracted from mu for the displayed conservative rating. */
  z: number;
  /** Round gap tolerated before margin-of-victory amplification kicks in. */
  marginRounds: number;
  provisionalGames: number;
  /** Scale and offset applied to raw openskill ordinals for display. */
  displayAlpha: number;
  displayTarget: number;
  /** Rust: uncertainty grows back during a layoff so returning players move faster. */
  decay: {
    enabled: boolean;
    graceWeeks: number;
    sigmaGrowthPerWeek: number;
  };
  perf: {
    adr: number;
    kills: number;
    deaths: number;
    assists: number;
    /** How much performance may move a win's delta, before winCap clamps it. */
    winWeight: number;
    /** Max fraction a win's delta can be moved by performance. */
    winCap: number;
    /**
     * Sets which performance fully offsets a loss: break-even lands at `1 + 1/weight`,
     * so 2.0 means perf 1.50. Never carries a loss past break-even, whatever the weight.
     */
    lossClawbackWeight: number;
    /** Worst case multiplier on a loss, for a bad game in a loss. */
    lossFloorMultiplier: number;
    /** Bounds on each per-stat ratio, so a zero-death game cannot explode the composite. */
    termMin: number;
    termMax: number;
  };
};

export type MatchPerfBreakdown = {
  playerId: string;
  matchPerf: number;
  teamDelta: number;
  netDelta: number;
};

export type PlayerRating = {
  playerId: string;
  mu: number;
  sigma: number;
  /** Conservative team-outcome rating: mu minus z sigma. Drives team balancing. */
  teamRating: number;
  /** Mean performance relative to the lobby. 1.0 is exactly lobby average. */
  perfRating: number;
  /** Team rating adjusted by performance. The headline ranking number. */
  overall: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  roundsWon: number;
  roundsLost: number;
  lastPlayedAt: string | null;
  provisional: boolean;
};
