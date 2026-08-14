/**
 * Stable identifiers for the clearly fictional development dataset.
 *
 * Application code may import these for deterministic demos and tests. Production
 * authorization must never infer privileges from one of these identifiers.
 */
export const DEMO_USER_ID = "10000000-0000-4000-8000-000000000001";
export const DEMO_PROFILE_ID = "11000000-0000-4000-8000-000000000001";

export const DEMO_SPORT_IDS = {
  basketball: "20000000-0000-4000-8000-000000000001",
  biathlon: "20000000-0000-4000-8000-000000000002",
  athletics: "20000000-0000-4000-8000-000000000003",
  rowing: "20000000-0000-4000-8000-000000000004",
  volleyball: "20000000-0000-4000-8000-000000000005",
  football: "20000000-0000-4000-8000-000000000006",
} as const;

export const DEMO_TEAM_IDS = {
  tartuTorm: "30000000-0000-4000-8000-000000000001",
  rheinburg: "30000000-0000-4000-8000-000000000002",
  nordhavn: "30000000-0000-4000-8000-000000000003",
  tallinnLaine: "30000000-0000-4000-8000-000000000004",
  rigaVektors: "30000000-0000-4000-8000-000000000005",
} as const;

export const DEMO_ATHLETE_IDS = {
  mariMets: "40000000-0000-4000-8000-000000000001",
  ainoLaine: "40000000-0000-4000-8000-000000000002",
  karlKask: "40000000-0000-4000-8000-000000000003",
  liisTamm: "40000000-0000-4000-8000-000000000004",
  martaKowalska: "40000000-0000-4000-8000-000000000005",
  anuSaar: "40000000-0000-4000-8000-000000000006",
  sofiaLind: "40000000-0000-4000-8000-000000000007",
  rasmusPoder: "40000000-0000-4000-8000-000000000008",
} as const;

export const DEMO_COMPETITION_IDS = {
  winterSeries: "50000000-0000-4000-8000-000000000001",
  basketballCup: "50000000-0000-4000-8000-000000000002",
  trackNight: "50000000-0000-4000-8000-000000000003",
  indoorRowing: "50000000-0000-4000-8000-000000000004",
  coastalVolleyball: "50000000-0000-4000-8000-000000000005",
} as const;

export const DEMO_EVENT_IDS = {
  liveBiathlon: "70000000-0000-4000-8000-000000000001",
  startingSoonBasketball: "70000000-0000-4000-8000-000000000002",
  upcomingAthletics: "70000000-0000-4000-8000-000000000003",
  replayRowing: "70000000-0000-4000-8000-000000000004",
  delayedVolleyball: "70000000-0000-4000-8000-000000000005",
  cancelledVolleyball: "70000000-0000-4000-8000-000000000006",
} as const;

export const DEMO_PRIMARY_ATHLETE_ID = DEMO_ATHLETE_IDS.mariMets;
export const DEMO_LIVE_EVENT_ID = DEMO_EVENT_IDS.liveBiathlon;
export const DEMO_UPCOMING_EVENT_ID = DEMO_EVENT_IDS.startingSoonBasketball;
export const DEMO_REPLAY_EVENT_ID = DEMO_EVENT_IDS.replayRowing;
