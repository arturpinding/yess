import {
  buildInAppNotificationRows,
  runNotificationPlanningCycle,
  type InAppPreference,
  type MatchedEventFollow,
  type NotificationInsert,
  type NotificationPlanningRepository,
} from "./planning-service";

const NOW = new Date("2026-08-14T10:00:00.000Z");

function match(overrides: Partial<MatchedEventFollow> = {}): MatchedEventFollow {
  return {
    followId: "follow-athlete",
    notificationsEnabled: true,
    scope: "athlete",
    targetId: "athlete-mari",
    targetName: "Mari Mets",
    userId: "user-1",
    profileId: "profile-1",
    locale: "et",
    profileSpoilerFree: true,
    eventId: "event-1",
    eventSlug: "demo-event",
    eventRevision: 3,
    eventState: "scheduled",
    scheduledStartAt: new Date("2026-08-14T12:00:00.000Z"),
    actualStartAt: null,
    eventTitleEt: "Laskesuusatamise sprint — DEMO",
    eventTitleEn: "Biathlon sprint — DEMO",
    competitionId: "competition-1",
    sportId: "sport-1",
    isDemo: true,
    ...overrides,
  };
}

function preference(
  kind: InAppPreference["kind"],
  overrides: Partial<InAppPreference> = {},
): InAppPreference {
  return {
    profileId: "profile-1",
    kind,
    enabled: true,
    leadMinutes: 15,
    athleteId: null,
    teamId: null,
    sportId: null,
    competitionId: null,
    ...overrides,
  };
}

describe("in-app notification planning", () => {
  it("uses localized copy, UTC instants, and athlete-specific lead-time overrides", () => {
    const rows = buildInAppNotificationRows(
      [match()],
      [
        preference("event_starting_soon"),
        preference("event_started", { enabled: false }),
        preference("followed_athlete_competing", {
          athleteId: "athlete-mari",
          leadMinutes: 30,
        }),
      ],
      NOW,
    );

    expect(rows.map((row) => row.kind)).toEqual([
      "followed_athlete_competing",
      "event_starting_soon",
    ]);
    expect(rows[0]?.scheduledFor.toISOString()).toBe("2026-08-14T11:30:00.000Z");
    expect(rows[1]?.scheduledFor.toISOString()).toBe("2026-08-14T11:45:00.000Z");
    expect(rows[0]).toMatchObject({
      locale: "et",
      athleteId: "athlete-mari",
      channel: "in_app",
      spoilerSensitive: false,
      title: "Jälgitav sportlane võistleb",
    });
    expect(rows[0]?.body).toContain("Mari Mets");
    expect(rows[1]?.payload).toMatchObject({
      eventRevision: 3,
      scheduledStartAtUtc: "2026-08-14T12:00:00.000Z",
      leadMinutes: 15,
    });
  });

  it("lets scoped preferences override global settings for team, sport, and competition follows", () => {
    const liveBase = {
      eventState: "live" as const,
      scheduledStartAt: new Date("2026-08-14T09:55:00.000Z"),
      actualStartAt: new Date("2026-08-14T09:58:00.000Z"),
      locale: "en" as const,
    };
    const matches = [
      match({
        ...liveBase,
        followId: "follow-team",
        scope: "team",
        targetId: "team-1",
        targetName: null,
      }),
      match({
        ...liveBase,
        followId: "follow-sport",
        profileId: "profile-2",
        userId: "user-2",
        scope: "sport",
        targetId: "sport-1",
        targetName: null,
      }),
      match({
        ...liveBase,
        followId: "follow-competition",
        profileId: "profile-3",
        userId: "user-3",
        scope: "competition",
        targetId: "competition-1",
        targetName: null,
      }),
    ];
    const rows = buildInAppNotificationRows(
      matches,
      [
        preference("event_started", { enabled: false }),
        preference("event_started", { teamId: "team-1", enabled: true }),
        preference("event_started", { profileId: "profile-2", enabled: true }),
      ],
      NOW,
    );

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.kind === "event_started")).toBe(true);
    expect(rows.map((row) => row.profileId).sort()).toEqual([
      "profile-1",
      "profile-2",
      "profile-3",
    ]);
    expect(rows.every((row) => row.title === "Event started")).toBe(true);
    expect(rows.every((row) => row.scheduledFor.toISOString() === "2026-08-14T09:58:00.000Z")).toBe(
      true,
    );
  });

  it("suppresses a target whose explicit preference is disabled even when global is enabled", () => {
    const rows = buildInAppNotificationRows(
      [match()],
      [
        preference("event_starting_soon", { enabled: true }),
        preference("event_starting_soon", {
          athleteId: "athlete-mari",
          enabled: false,
        }),
        preference("followed_athlete_competing", {
          athleteId: "athlete-mari",
          enabled: false,
        }),
      ],
      NOW,
    );

    expect(rows).toEqual([]);
  });

  it("lets current preferences override a legacy-disabled follow flag", () => {
    const legacyDisabled = match({ notificationsEnabled: false });
    const rows = buildInAppNotificationRows(
      [legacyDisabled],
      [
        preference("event_starting_soon", { enabled: true }),
        preference("followed_athlete_competing", { enabled: false }),
      ],
      NOW,
    );

    expect(rows.map((row) => row.kind)).toEqual(["event_starting_soon"]);
    expect(buildInAppNotificationRows([legacyDisabled], [], NOW)).toEqual([]);
  });
});

class MemoryPlanningRepository implements NotificationPlanningRepository {
  readonly inserted = new Map<string, NotificationInsert>();
  readonly windows: Array<{ from: Date; to: Date }> = [];
  readonly requestedProfiles: string[][] = [];

  constructor(
    private readonly matches: readonly MatchedEventFollow[],
    private readonly preferences: readonly InAppPreference[],
  ) {}

  async loadMatchedFollows(window: { from: Date; to: Date }) {
    this.windows.push(window);
    return this.matches;
  }

  async loadPreferences(profileIds: readonly string[]) {
    this.requestedProfiles.push([...profileIds]);
    return this.preferences;
  }

  async insertNotifications(rows: readonly NotificationInsert[]) {
    let inserted = 0;
    for (const row of rows) {
      if (this.inserted.has(row.deduplicationKey)) continue;
      this.inserted.set(row.deduplicationKey, row);
      inserted += 1;
    }
    return inserted;
  }
}

describe("notification planning cycle", () => {
  it("is idempotent through the repository's unique deduplication claim", async () => {
    const repository = new MemoryPlanningRepository([match()], []);

    const first = await runNotificationPlanningCycle({ now: NOW, repository });
    const second = await runNotificationPlanningCycle({ now: NOW, repository });

    expect(first).toEqual({
      matchedFollows: 1,
      matchedEvents: 1,
      planned: 2,
      inserted: 2,
      duplicates: 0,
    });
    expect(second).toEqual({
      matchedFollows: 1,
      matchedEvents: 1,
      planned: 2,
      inserted: 0,
      duplicates: 2,
    });
    expect(repository.inserted).toHaveLength(2);
    expect(repository.windows[0]?.from.toISOString()).toBe("2026-08-14T04:00:00.000Z");
    expect(repository.windows[0]?.to.toISOString()).toBe("2026-08-15T10:00:00.000Z");
    expect(repository.requestedProfiles[0]).toEqual(["profile-1"]);
  });
});
