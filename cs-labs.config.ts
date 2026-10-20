import type { RankingConfig } from "./src/lib/types";

export const ranking: RankingConfig = {
  mu: 25,
  sigma: 25 / 3,
  z: 2,
  marginRounds: 2,
  provisionalGames: 3,
  displayAlpha: 40,
  displayTarget: 1000,
  decay: {
    enabled: true,
    graceWeeks: 3,
    sigmaGrowthPerWeek: 0.2,
  },
  perf: {
    adr: 0.4,
    kills: 0.25,
    deaths: 0.2,
    assists: 0.15,
    winWeight: 0.5,
    winCap: 0.25,
    // Break-even on a loss needs `(perf - 1) * weight >= 1`, so this number is really a
    // statement about which performance fully offsets a defeat: at 2.0 that is perf 1.50,
    // half again the lobby average. At the old 1.0 it was perf 2.00, which nobody has ever
    // come near in a lobby of six, so the clawback the code advertised could not actually
    // be reached. Raising it below 1.72 would not have helped either.
    lossClawbackWeight: 2.0,
    lossFloorMultiplier: 1.25,
    termMin: 0.25,
    termMax: 2.5,
  },
};

export const maps = [
  "Mirage",
  "Inferno",
  "Nuke",
  "Overpass",
  "Ancient",
  "Anubis",
  "Dust II",
  "Train",
  "Vertigo",
  "Office",
  "Italy",
] as const;
