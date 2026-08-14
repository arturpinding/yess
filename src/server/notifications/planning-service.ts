import type { EventStatus } from "@/domain/event-status";
import type { NotificationKind } from "@/domain/notification-preferences";
import { db, postgresClient } from "@/server/db/client";
import { notifications } from "@/server/db/schema";

import {
  NOTIFICATION_TYPES,
  notificationDeduplicationKey,
  planEventNotifications,
  type NotificationType,
} from "./notification-planner";

export const PLANNED_IN_APP_KINDS = [
  "event_starting_soon",
  "event_started",
  "followed_athlete_competing",
] as const satisfies readonly NotificationKind[];

export type PlannedInAppKind = (typeof PLANNED_IN_APP_KINDS)[number];
export type PlanningLocale = "et" | "en";
export type FollowScope = "athlete" | "team" | "sport" | "competition";

const DEFAULT_LEAD_MINUTES = 15;
const DEFAULT_HORIZON_MINUTES = 24 * 60;
const DEFAULT_STARTED_LOOKBACK_MINUTES = 6 * 60;

export interface MatchedEventFollow {
  followId: string;
  notificationsEnabled: boolean;
  scope: FollowScope;
  targetId: string;
  targetName: string | null;
  userId: string;
  profileId: string;
  locale: PlanningLocale;
  profileSpoilerFree: boolean;
  eventId: string;
  eventSlug: string;
  eventRevision: number;
  eventState: Extract<EventStatus, "scheduled" | "delayed" | "live" | "paused">;
  scheduledStartAt: Date;
  actualStartAt: Date | null;
  eventTitleEt: string;
  eventTitleEn: string;
  competitionId: string;
  sportId: string;
  isDemo: boolean;
}

export interface InAppPreference {
  profileId: string;
  kind: PlannedInAppKind;
  enabled: boolean;
  leadMinutes: number;
  athleteId: string | null;
  teamId: string | null;
  sportId: string | null;
  competitionId: string | null;
}

export interface NotificationInsert {
  userId: string;
  profileId: string;
  eventId: string;
  athleteId: string | null;
  teamId: string | null;
  channel: "in_app";
  kind: PlannedInAppKind;
  state: "pending";
  deduplicationKey: string;
  locale: PlanningLocale;
  title: string;
  body: string;
  spoilerSensitive: boolean;
  payload: Record<string, unknown>;
  scheduledFor: Date;
}

export interface NotificationPlanningRepository {
  loadMatchedFollows(window: { from: Date; to: Date }): Promise<readonly MatchedEventFollow[]>;
  loadPreferences(profileIds: readonly string[]): Promise<readonly InAppPreference[]>;
  /** Must ignore conflicts on the database-unique deduplication key. */
  insertNotifications(rows: readonly NotificationInsert[]): Promise<number>;
}

export interface NotificationPlanningResult {
  matchedFollows: number;
  matchedEvents: number;
  planned: number;
  inserted: number;
  duplicates: number;
}

interface MatchRow {
  followId: string;
  notificationsEnabled: boolean;
  athleteId: string | null;
  teamId: string | null;
  sportId: string | null;
  competitionFollowId: string | null;
  targetName: string | null;
  userId: string;
  profileId: string;
  profileLocale: string;
  userLocale: string;
  profileSpoilerFree: boolean;
  eventId: string;
  eventSlug: string;
  eventRevision: number;
  eventState: MatchedEventFollow["eventState"];
  scheduledStartAt: Date;
  actualStartAt: Date | null;
  eventTitleEt: string;
  eventTitleEn: string;
  eventCompetitionId: string;
  eventSportId: string;
  isDemo: boolean;
}

interface PreferenceRow extends Omit<InAppPreference, "kind"> {
  kind: string;
}

function plannerType(kind: PlannedInAppKind): NotificationType {
  if (!(NOTIFICATION_TYPES as readonly string[]).includes(kind)) {
    throw new RangeError(`The notification planner does not support ${kind}`);
  }
  return kind;
}

function databaseKind(type: string): PlannedInAppKind | null {
  return (PLANNED_IN_APP_KINDS as readonly string[]).includes(type)
    ? (type as PlannedInAppKind)
    : null;
}

function followScope(row: MatchRow): Pick<MatchedEventFollow, "scope" | "targetId"> {
  if (row.athleteId) return { scope: "athlete", targetId: row.athleteId };
  if (row.teamId) return { scope: "team", targetId: row.teamId };
  if (row.sportId) return { scope: "sport", targetId: row.sportId };
  if (row.competitionFollowId) {
    return { scope: "competition", targetId: row.competitionFollowId };
  }
  throw new Error(`Follow ${row.followId} has no target`);
}

function localeFromRow(row: MatchRow): PlanningLocale {
  if (row.profileLocale === "en" || row.profileLocale === "et") return row.profileLocale;
  return row.userLocale === "en" ? "en" : "et";
}

function asDate(value: Date | string, label: string): Date {
  const result = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(result.getTime())) throw new RangeError(`${label} must be a valid instant`);
  return result;
}

export const postgresNotificationPlanningRepository: NotificationPlanningRepository = {
  async loadMatchedFollows(window) {
    const rows = await postgresClient<MatchRow[]>`
      select follow.id as "followId",
             follow.notifications_enabled as "notificationsEnabled",
             follow.athlete_id as "athleteId",
             follow.team_id as "teamId",
             follow.sport_id as "sportId",
             follow.competition_id as "competitionFollowId",
             followed_athlete.display_name as "targetName",
             account.id as "userId",
             profile.id as "profileId",
             profile.locale as "profileLocale",
             account.preferred_locale as "userLocale",
             profile.spoiler_free as "profileSpoilerFree",
             event.id as "eventId",
             event.slug as "eventSlug",
             event.version as "eventRevision",
             event.state as "eventState",
             event.scheduled_start_at as "scheduledStartAt",
             event.actual_start_at as "actualStartAt",
             event.title_et as "eventTitleEt",
             event.title_en as "eventTitleEn",
             event.competition_id as "eventCompetitionId",
             competition.sport_id as "eventSportId",
             event.is_demo as "isDemo"
      from follows as follow
      join profiles as profile on profile.id = follow.profile_id
      join users as account on account.id = profile.user_id
      join events as event
        on event.state in ('scheduled', 'delayed', 'live', 'paused')
       and coalesce(event.actual_start_at, event.scheduled_start_at) >= ${window.from.toISOString()}::timestamptz
       and event.scheduled_start_at <= ${window.to.toISOString()}::timestamptz
      join competitions as competition on competition.id = event.competition_id
      left join athletes as followed_athlete on followed_athlete.id = follow.athlete_id
      where account.state = 'active'
        and (
          (follow.athlete_id is not null and exists (
            select 1
            from event_participants as participant
            where participant.event_id = event.id
              and participant.athlete_id = follow.athlete_id
          ))
          or (follow.team_id is not null and exists (
            select 1
            from event_participants as participant
            where participant.event_id = event.id
              and participant.team_id = follow.team_id
          ))
          or follow.sport_id = competition.sport_id
          or follow.competition_id = event.competition_id
        )
      order by profile.id, event.scheduled_start_at, event.id, follow.id
    `;

    return rows.map((row) => ({
      ...followScope(row),
      followId: row.followId,
      notificationsEnabled: row.notificationsEnabled,
      targetName: row.targetName,
      userId: row.userId,
      profileId: row.profileId,
      locale: localeFromRow(row),
      profileSpoilerFree: row.profileSpoilerFree,
      eventId: row.eventId,
      eventSlug: row.eventSlug,
      eventRevision: row.eventRevision,
      eventState: row.eventState,
      scheduledStartAt: asDate(row.scheduledStartAt, "scheduledStartAt"),
      actualStartAt: row.actualStartAt ? asDate(row.actualStartAt, "actualStartAt") : null,
      eventTitleEt: row.eventTitleEt,
      eventTitleEn: row.eventTitleEn,
      competitionId: row.eventCompetitionId,
      sportId: row.eventSportId,
      isDemo: row.isDemo,
    }));
  },

  async loadPreferences(profileIds) {
    if (profileIds.length === 0) return [];
    const rows = await postgresClient<PreferenceRow[]>`
      select preference.profile_id as "profileId",
             preference.kind::text as kind,
             preference.enabled,
             preference.lead_minutes as "leadMinutes",
             preference.athlete_id as "athleteId",
             preference.team_id as "teamId",
             preference.sport_id as "sportId",
             preference.competition_id as "competitionId"
      from notification_preferences as preference
      where preference.channel = 'in_app'
        and preference.kind in (
          'event_starting_soon',
          'event_started',
          'followed_athlete_competing'
        )
        and preference.profile_id = any(${[...profileIds]}::uuid[])
      order by preference.profile_id, preference.kind, preference.id
    `;

    return rows.flatMap((row) => {
      const kind = databaseKind(row.kind);
      return kind ? [{ ...row, kind }] : [];
    });
  },

  async insertNotifications(rows) {
    if (rows.length === 0) return 0;
    const inserted = await db
      .insert(notifications)
      .values([...rows])
      .onConflictDoNothing({ target: notifications.deduplicationKey })
      .returning({ id: notifications.id });
    return inserted.length;
  },
};

function isGlobalPreference(preference: InAppPreference): boolean {
  return (
    preference.athleteId === null &&
    preference.teamId === null &&
    preference.sportId === null &&
    preference.competitionId === null
  );
}

function preferenceMatchesFollow(preference: InAppPreference, follow: MatchedEventFollow): boolean {
  switch (follow.scope) {
    case "athlete":
      return preference.athleteId === follow.targetId;
    case "team":
      return preference.teamId === follow.targetId;
    case "sport":
      return preference.sportId === follow.targetId;
    case "competition":
      return preference.competitionId === follow.targetId;
  }
}

interface EffectivePreference {
  enabled: boolean;
  leadMinutes: number;
}

function effectivePreference(
  follow: MatchedEventFollow,
  kind: PlannedInAppKind,
  preferences: readonly InAppPreference[],
): EffectivePreference {
  const kindPreferences = preferences.filter(
    (preference) => preference.profileId === follow.profileId && preference.kind === kind,
  );
  const selected =
    kindPreferences.find((preference) => preferenceMatchesFollow(preference, follow)) ??
    kindPreferences.find(isGlobalPreference);
  return selected
    ? { enabled: selected.enabled, leadMinutes: selected.leadMinutes }
    : { enabled: follow.notificationsEnabled, leadMinutes: DEFAULT_LEAD_MINUTES };
}

function eventTitle(event: MatchedEventFollow): string {
  return event.locale === "et" ? event.eventTitleEt : event.eventTitleEn;
}

function notificationCopy(input: {
  kind: PlannedInAppKind;
  locale: PlanningLocale;
  eventTitle: string;
  leadMinutes?: number;
  athleteName?: string;
}): { title: string; body: string } {
  if (input.kind === "event_starting_soon") {
    if (input.locale === "et") {
      return input.leadMinutes === 0
        ? { title: "Sündmus algab peagi", body: `${input.eventTitle} algab kohe.` }
        : {
            title: "Sündmus algab peagi",
            body: `${input.eventTitle} algab ${input.leadMinutes} minuti pärast.`,
          };
    }
    return input.leadMinutes === 0
      ? { title: "Event starting soon", body: `${input.eventTitle} is about to start.` }
      : {
          title: "Event starting soon",
          body: `${input.eventTitle} starts in ${input.leadMinutes} minutes.`,
        };
  }
  if (input.kind === "event_started") {
    return input.locale === "et"
      ? { title: "Sündmus on alanud", body: `${input.eventTitle} on alanud.` }
      : { title: "Event started", body: `${input.eventTitle} has started.` };
  }
  const athleteName = input.athleteName ?? (input.locale === "et" ? "Sportlane" : "Athlete");
  return input.locale === "et"
    ? {
        title: "Jälgitav sportlane võistleb",
        body: `${athleteName} osaleb sündmusel „${input.eventTitle}”.`,
      }
    : {
        title: "A followed athlete is competing",
        body: `${athleteName} is competing in ${input.eventTitle}.`,
      };
}

function basePayload(event: MatchedEventFollow): Record<string, unknown> {
  return {
    eventId: event.eventId,
    eventSlug: event.eventSlug,
    eventRevision: event.eventRevision,
    scheduledStartAtUtc: event.scheduledStartAt.toISOString(),
    source: "follow",
    demo: event.isDemo,
  };
}

function lifecycleInsert(input: {
  event: MatchedEventFollow;
  kind: "event_starting_soon" | "event_started";
  deduplicationKey: string;
  scheduledFor: Date;
  leadMinutes: number;
}): NotificationInsert {
  const copy = notificationCopy({
    kind: input.kind,
    locale: input.event.locale,
    eventTitle: eventTitle(input.event),
    leadMinutes: input.leadMinutes,
  });
  return {
    userId: input.event.userId,
    profileId: input.event.profileId,
    eventId: input.event.eventId,
    athleteId: null,
    teamId: null,
    channel: "in_app",
    kind: input.kind,
    state: "pending",
    deduplicationKey: input.deduplicationKey,
    locale: input.event.locale,
    ...copy,
    spoilerSensitive: false,
    payload: { ...basePayload(input.event), leadMinutes: input.leadMinutes },
    scheduledFor: input.scheduledFor,
  };
}

/**
 * Converts a consistent database snapshot into notification rows. All instants
 * remain UTC Dates; Europe/Tallinn formatting is deferred to the UI at read time.
 */
export function buildInAppNotificationRows(
  matches: readonly MatchedEventFollow[],
  preferences: readonly InAppPreference[],
  now: Date,
): NotificationInsert[] {
  if (!Number.isFinite(now.getTime())) throw new RangeError("now must be a valid instant");
  const groups = new Map<string, MatchedEventFollow[]>();
  for (const match of matches) {
    const key = `${match.profileId}:${match.eventId}`;
    const group = groups.get(key);
    if (group) group.push(match);
    else groups.set(key, [match]);
  }

  const planned = new Map<string, NotificationInsert>();
  for (const group of groups.values()) {
    const event = group[0];
    if (!event) continue;

    if (
      (event.eventState === "scheduled" || event.eventState === "delayed") &&
      event.scheduledStartAt.getTime() > now.getTime()
    ) {
      const enabledSoon = group
        .map((follow) => effectivePreference(follow, "event_starting_soon", preferences))
        .filter((preference) => preference.enabled);
      if (enabledSoon.length > 0) {
        const leadMinutes = Math.max(...enabledSoon.map((preference) => preference.leadMinutes));
        const intent = planEventNotifications({
          profileId: event.profileId,
          eventId: event.eventId,
          eventRevision: event.eventRevision,
          startAt: event.scheduledStartAt,
          status: event.eventState,
          leadMinutes,
          now,
        }).find((candidate) => databaseKind(candidate.type) === "event_starting_soon");
        if (intent) {
          planned.set(
            intent.deduplicationKey,
            lifecycleInsert({
              event,
              kind: "event_starting_soon",
              deduplicationKey: intent.deduplicationKey,
              scheduledFor: intent.scheduledFor,
              leadMinutes,
            }),
          );
        }
      }
    }

    if (event.eventState === "live" || event.eventState === "paused") {
      const enabledStarted = group
        .map((follow) => effectivePreference(follow, "event_started", preferences))
        .filter((preference) => preference.enabled);
      if (enabledStarted.length > 0) {
        const identity = {
          profileId: event.profileId,
          eventId: event.eventId,
          eventRevision: event.eventRevision,
          type: plannerType("event_started"),
        };
        const leadMinutes = Math.max(...enabledStarted.map((preference) => preference.leadMinutes));
        const deduplicationKey = notificationDeduplicationKey(identity);
        planned.set(
          deduplicationKey,
          lifecycleInsert({
            event,
            kind: "event_started",
            deduplicationKey,
            scheduledFor: event.actualStartAt ?? now,
            leadMinutes,
          }),
        );
      }
    }

    const athleteFollows = new Map<string, MatchedEventFollow>();
    for (const follow of group) {
      if (follow.scope === "athlete") athleteFollows.set(follow.targetId, follow);
    }
    for (const athleteFollow of athleteFollows.values()) {
      const preference = effectivePreference(
        athleteFollow,
        "followed_athlete_competing",
        preferences,
      );
      if (!preference.enabled) continue;
      const startAt = athleteFollow.actualStartAt ?? athleteFollow.scheduledStartAt;
      const scheduledFor = new Date(
        startAt.getTime() > now.getTime()
          ? Math.max(now.getTime(), startAt.getTime() - preference.leadMinutes * 60_000)
          : now.getTime(),
      );
      const deduplicationKey = notificationDeduplicationKey({
        profileId: athleteFollow.profileId,
        eventId: athleteFollow.eventId,
        eventRevision: athleteFollow.eventRevision,
        type: plannerType("followed_athlete_competing"),
        discriminator: athleteFollow.targetId,
      });
      const copy = notificationCopy({
        kind: "followed_athlete_competing",
        locale: athleteFollow.locale,
        eventTitle: eventTitle(athleteFollow),
        athleteName: athleteFollow.targetName ?? undefined,
      });
      planned.set(deduplicationKey, {
        userId: athleteFollow.userId,
        profileId: athleteFollow.profileId,
        eventId: athleteFollow.eventId,
        athleteId: athleteFollow.targetId,
        teamId: null,
        channel: "in_app",
        kind: "followed_athlete_competing",
        state: "pending",
        deduplicationKey,
        locale: athleteFollow.locale,
        ...copy,
        spoilerSensitive: false,
        payload: {
          ...basePayload(athleteFollow),
          athleteId: athleteFollow.targetId,
          leadMinutes: preference.leadMinutes,
        },
        scheduledFor,
      });
    }
  }
  return [...planned.values()].sort(
    (left, right) =>
      left.scheduledFor.getTime() - right.scheduledFor.getTime() ||
      left.deduplicationKey.localeCompare(right.deduplicationKey),
  );
}

export async function runNotificationPlanningCycle(
  options: {
    now?: Date;
    horizonMinutes?: number;
    startedLookbackMinutes?: number;
    repository?: NotificationPlanningRepository;
  } = {},
): Promise<NotificationPlanningResult> {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new RangeError("now must be a valid instant");
  const horizonMinutes = boundedMinutes(
    options.horizonMinutes,
    DEFAULT_HORIZON_MINUTES,
    "horizonMinutes",
  );
  const startedLookbackMinutes = boundedMinutes(
    options.startedLookbackMinutes,
    DEFAULT_STARTED_LOOKBACK_MINUTES,
    "startedLookbackMinutes",
  );
  const repository = options.repository ?? postgresNotificationPlanningRepository;
  const matches = await repository.loadMatchedFollows({
    from: new Date(now.getTime() - startedLookbackMinutes * 60_000),
    to: new Date(now.getTime() + horizonMinutes * 60_000),
  });
  if (matches.length === 0) {
    return { matchedFollows: 0, matchedEvents: 0, planned: 0, inserted: 0, duplicates: 0 };
  }
  const profileIds = [...new Set(matches.map((match) => match.profileId))];
  const preferences = await repository.loadPreferences(profileIds);
  const rows = buildInAppNotificationRows(matches, preferences, now);
  const inserted = await repository.insertNotifications(rows);
  return {
    matchedFollows: matches.length,
    matchedEvents: new Set(matches.map((match) => `${match.profileId}:${match.eventId}`)).size,
    planned: rows.length,
    inserted,
    duplicates: rows.length - inserted,
  };
}

function boundedMinutes(value: number | undefined, fallback: number, label: string): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < 0 || result > 7 * 24 * 60) {
    throw new RangeError(`${label} must be an integer between 0 and 10080`);
  }
  return result;
}
