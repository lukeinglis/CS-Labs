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
    lossClawbackWeight: 1.0,
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
