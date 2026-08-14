import { and, asc, desc, eq, gte, inArray, isNull, lte, or, type SQL } from "drizzle-orm";
import {
  deriveNotificationMode,
  notificationTargetKey,
  type NotificationKind,
  type NotificationMode,
  type NotificationTargetType,
} from "@/domain/notification-preferences";
import type {
  EventCardModel,
  FollowTargetType,
  PersonSummary,
  SearchResults,
} from "@/domain/view-models";
import type { Locale } from "@/i18n/config";
import { tallinnDayKey } from "@/i18n/format";
import { db } from "@/server/db/client";
import {
  athleteTeamMemberships,
  athletes,
  auditLogs,
  competitions,
  editorialCollections,
  eventParticipants,
  events,
  follows,
  mediaAssets,
  notificationPreferences,
  notifications,
  playbackSessions,
  results,
  rightsWindows,
  sports,
  streams,
  teams,
  timelineEvents,
  users,
  venues,
} from "@/server/db/schema";

const SPORT_ACCENTS: Record<string, string> = {
  biathlon: "#76c7a5",
  basketball: "#e19a54",
  volleyball: "#cfbe62",
  fencing: "#84a7d8",
  rally: "#e36e5f",
  athletics: "#bd8bd1",
  rowing: "#4fa8b8",
  orienteering: "#7ebc65",
  football: "#6db477",
  tennis: "#d6cf54",
};

const visibleStreamStates = new Set(["ready", "live", "degraded"]);

type EventRow = {
  id: string;
  slug: string;
  titleEt: string;
  titleEn: string;
  descriptionEt: string | null;
  descriptionEn: string | null;
  state: "scheduled" | "delayed" | "live" | "paused" | "finished" | "cancelled";
  scheduledStartAt: Date;
  actualStartAt: Date | null;
  endAt: Date | null;
  statusDetailEt: string | null;
  statusDetailEn: string | null;
  version: number;
  isDemo: boolean;
  competitionId: string;
  competitionSlug: string;
  competitionName: string;
  competitionNameEt: string | null;
  competitionNameEn: string | null;
  sportId: string;
  sportSlug: string;
  sportNameEt: string;
  sportNameEn: string;
  venueId: string | null;
  venueName: string | null;
  venueCity: string | null;
};

function localized(locale: Locale, et: string | null | undefined, en: string | null | undefined) {
  return (locale === "et" ? et : en) ?? et ?? en ?? "";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase())
    .join("");
}

async function queryEventRows(
  from: Date,
  to: Date,
  limit = 160,
  extraWhere?: SQL,
): Promise<EventRow[]> {
  return db
    .select({
      id: events.id,
      slug: events.slug,
      titleEt: events.titleEt,
      titleEn: events.titleEn,
      descriptionEt: events.descriptionEt,
      descriptionEn: events.descriptionEn,
      state: events.state,
      scheduledStartAt: events.scheduledStartAt,
      actualStartAt: events.actualStartAt,
      endAt: events.endAt,
      statusDetailEt: events.statusDetailEt,
      statusDetailEn: events.statusDetailEn,
      version: events.version,
      isDemo: events.isDemo,
      competitionId: competitions.id,
      competitionSlug: competitions.slug,
      competitionName: competitions.name,
      competitionNameEt: competitions.nameEt,
      competitionNameEn: competitions.nameEn,
      sportId: sports.id,
      sportSlug: sports.slug,
      sportNameEt: sports.nameEt,
      sportNameEn: sports.nameEn,
      venueId: venues.id,
      venueName: venues.name,
      venueCity: venues.city,
    })
    .from(events)
    .innerJoin(competitions, eq(events.competitionId, competitions.id))
    .innerJoin(sports, eq(competitions.sportId, sports.id))
    .leftJoin(venues, eq(events.venueId, venues.id))
    .where(and(gte(events.scheduledStartAt, from), lte(events.scheduledStartAt, to), extraWhere))
    .orderBy(asc(events.scheduledStartAt))
    .limit(limit);
}

async function hydrateEventRows(rows: EventRow[], locale: Locale): Promise<EventCardModel[]> {
  const eventIds = rows.map((row) => row.id);
  if (eventIds.length === 0) return [];

  const [participantRows, resultRows, streamRows, assetRows] = await Promise.all([
    db
      .select({
        eventId: eventParticipants.eventId,
        athleteId: eventParticipants.athleteId,
        teamId: eventParticipants.teamId,
        isEstonian: eventParticipants.isEstonian,
        athleteName: athletes.displayName,
        athleteSlug: athletes.slug,
        athleteNationality: athletes.nationalityCode,
        athletePortrait: athletes.portraitUrl,
        athleteDemo: athletes.isDemo,
        teamName: teams.name,
        teamSlug: teams.slug,
        teamShortName: teams.shortName,
        teamCountry: teams.countryCode,
        teamDemo: teams.isDemo,
      })
      .from(eventParticipants)
      .leftJoin(athletes, eq(eventParticipants.athleteId, athletes.id))
      .leftJoin(teams, eq(eventParticipants.teamId, teams.id))
      .where(inArray(eventParticipants.eventId, eventIds)),
    db
      .select({
        eventId: results.eventId,
        scoreDisplay: results.scoreDisplay,
        rank: results.rank,
        outcome: results.outcome,
      })
      .from(results)
      .where(inArray(results.eventId, eventIds))
      .orderBy(asc(results.rank)),
    db
      .select({
        id: streams.id,
        eventId: streams.eventId,
        protocol: streams.protocol,
        state: streams.state,
        priority: streams.priority,
        externalWatchUrl: streams.externalWatchUrl,
      })
      .from(streams)
      .where(inArray(streams.eventId, eventIds))
      .orderBy(asc(streams.priority)),
    db
      .select({
        id: mediaAssets.id,
        eventId: mediaAssets.eventId,
        kind: mediaAssets.kind,
        state: mediaAssets.state,
      })
      .from(mediaAssets)
      .where(and(inArray(mediaAssets.eventId, eventIds), eq(mediaAssets.state, "ready"))),
  ]);

  const competitionIds = [...new Set(rows.map((row) => row.competitionId))];
  const streamIds = streamRows.map((row) => row.id);
  const assetIds = assetRows.map((row) => row.id);
  const rightsTargets: SQL[] = [
    inArray(rightsWindows.eventId, eventIds),
    inArray(rightsWindows.competitionId, competitionIds),
  ];
  if (streamIds.length > 0) rightsTargets.push(inArray(rightsWindows.streamId, streamIds));
  if (assetIds.length > 0) rightsTargets.push(inArray(rightsWindows.mediaAssetId, assetIds));
  const rightsTarget = or(...rightsTargets);
  const rightsRows = rightsTarget
    ? await db
        .select({
          id: rightsWindows.id,
          eventId: rightsWindows.eventId,
          competitionId: rightsWindows.competitionId,
          streamId: rightsWindows.streamId,
          mediaAssetId: rightsWindows.mediaAssetId,
          contentKind: rightsWindows.contentKind,
          access: rightsWindows.access,
          countryCode: rightsWindows.countryCode,
          externalWatchUrl: rightsWindows.externalWatchUrl,
          startsAt: rightsWindows.startsAt,
          endsAt: rightsWindows.endsAt,
          priority: rightsWindows.priority,
        })
        .from(rightsWindows)
        .where(rightsTarget)
    : [];

  const participantsByEvent = new Map<string, typeof participantRows>();
  for (const row of participantRows) {
    const current = participantsByEvent.get(row.eventId) ?? [];
    current.push(row);
    participantsByEvent.set(row.eventId, current);
  }
  const resultsByEvent = new Map<string, typeof resultRows>();
  for (const row of resultRows) {
    const current = resultsByEvent.get(row.eventId) ?? [];
    current.push(row);
    resultsByEvent.set(row.eventId, current);
  }
  const streamsByEvent = new Map<string, typeof streamRows>();
  for (const row of streamRows) {
    const current = streamsByEvent.get(row.eventId) ?? [];
    current.push(row);
    streamsByEvent.set(row.eventId, current);
  }
  const assetsByEvent = new Map<string, typeof assetRows>();
  for (const row of assetRows) {
    if (!row.eventId) continue;
    const current = assetsByEvent.get(row.eventId) ?? [];
    current.push(row);
    assetsByEvent.set(row.eventId, current);
  }
  const rightsByEvent = new Map<string, typeof rightsRows>();
  for (const eventRow of rows) {
    const eventStreamIds = new Set((streamsByEvent.get(eventRow.id) ?? []).map((item) => item.id));
    const eventAssetIds = new Set((assetsByEvent.get(eventRow.id) ?? []).map((item) => item.id));
    rightsByEvent.set(
      eventRow.id,
      rightsRows.filter(
        (right) =>
          right.eventId === eventRow.id ||
          right.competitionId === eventRow.competitionId ||
          (right.streamId !== null && eventStreamIds.has(right.streamId)) ||
          (right.mediaAssetId !== null && eventAssetIds.has(right.mediaAssetId)),
      ),
    );
  }

  return rows.map((row) => {
    const eventParticipantRows = participantsByEvent.get(row.id) ?? [];
    const sportName = localized(locale, row.sportNameEt, row.sportNameEn);
    const participantSummaries = eventParticipantRows
      .filter((item) => item.athleteId || item.teamId)
      .map((item) => ({
        id: item.athleteId ?? item.teamId ?? "",
        name: item.athleteName ?? item.teamName ?? "",
        shortName: item.teamShortName ?? undefined,
        kind: (item.athleteId ? "athlete" : "team") as "athlete" | "team",
        isEstonian: item.isEstonian,
      }));
    const estonians: PersonSummary[] = eventParticipantRows
      .filter((item) => item.athleteId && item.athleteName && item.athleteSlug && item.isEstonian)
      .map((item) => ({
        id: item.athleteId!,
        slug: item.athleteSlug!,
        name: item.athleteName!,
        initials: initials(item.athleteName!),
        nationality: item.athleteNationality ?? "EE",
        isEstonian: true,
        sportName,
        portraitUrl: item.athletePortrait ?? undefined,
        demo: item.athleteDemo ?? true,
      }));
    const eventStreams = streamsByEvent.get(row.id) ?? [];
    const eventRights = rightsByEvent.get(row.id) ?? [];
    const eventAssets = assetsByEvent.get(row.id) ?? [];
    const referenceAt =
      row.state === "scheduled" || row.state === "delayed" ? row.scheduledStartAt : new Date();
    const applicableRights = eventRights.filter(
      (right) =>
        (right.countryCode === null || right.countryCode === "EE") &&
        right.startsAt <= referenceAt &&
        right.endsAt > referenceAt,
    );
    const availabilityFor = (kind: "live" | "replay" | "highlight") => {
      const candidates = applicableRights
        .filter((right) => right.contentKind === kind)
        .sort((left, right) => left.priority - right.priority);
      const bestPriority = candidates[0]?.priority;
      if (bestPriority === undefined) return "no_verified_stream" as const;
      const preferred = candidates.filter((right) => right.priority === bestPriority);
      if (preferred.some((right) => right.access === "unavailable")) {
        return "not_available_in_region" as const;
      }
      const right = preferred.find((candidate) => candidate.access !== "unavailable");
      if (!right) return "no_verified_stream" as const;
      if (right.access === "external_only" && right.externalWatchUrl) {
        return "watch_on_partner" as const;
      }
      const playableStates =
        kind === "live" ? visibleStreamStates : new Set([...visibleStreamStates, "ended"]);
      const internal = eventStreams.find(
        (stream) =>
          stream.protocol !== "external" &&
          playableStates.has(stream.state) &&
          (right.streamId === null || right.streamId === stream.id),
      );
      if (internal) return "watch_here" as const;
      const external = eventStreams.find(
        (stream) =>
          stream.protocol === "external" &&
          Boolean(stream.externalWatchUrl) &&
          (right.streamId === null || right.streamId === stream.id),
      );
      return external ? ("watch_on_partner" as const) : ("no_verified_stream" as const);
    };
    const resultItems = resultsByEvent.get(row.id) ?? [];
    const score = resultItems
      .map((item) => item.scoreDisplay)
      .filter((item): item is string => Boolean(item))
      .slice(0, 2)
      .join(" – ");
    const assetKinds = new Set(eventAssets.map((asset) => asset.kind));
    const liveAvailability = availabilityFor("live");
    const replayAvailability = availabilityFor("replay");
    const highlightAvailability = availabilityFor("highlight");
    const availability =
      row.state === "finished" && assetKinds.has("replay") ? replayAvailability : liveAvailability;
    const contentKinds: EventCardModel["contentKinds"] = [];
    if (!["no_verified_stream", "not_available_in_region"].includes(liveAvailability)) {
      contentKinds.push("live");
    }
    if (
      (assetKinds.has("replay") || assetKinds.has("recording")) &&
      !["no_verified_stream", "not_available_in_region"].includes(replayAvailability)
    ) {
      contentKinds.push("replay");
    }
    if (
      assetKinds.has("highlight") &&
      !["no_verified_stream", "not_available_in_region"].includes(highlightAvailability)
    ) {
      contentKinds.push("highlight");
    }

    return {
      id: row.id,
      slug: row.slug,
      title: localized(locale, row.titleEt, row.titleEn),
      subtitle: localized(locale, row.statusDetailEt, row.statusDetailEn) || undefined,
      sportName,
      sportId: row.sportId,
      sportSlug: row.sportSlug,
      competitionName: localized(
        locale,
        row.competitionNameEt ?? row.competitionName,
        row.competitionNameEn ?? row.competitionName,
      ),
      competitionId: row.competitionId,
      competitionSlug: row.competitionSlug,
      status: row.state,
      startAt: row.scheduledStartAt.toISOString(),
      endAt: row.endAt?.toISOString(),
      venueName: row.venueName ?? undefined,
      participants: participantSummaries,
      estonians,
      availability,
      contentKinds,
      score: score || undefined,
      resultText:
        resultItems
          .map((item) => item.outcome)
          .filter(Boolean)
          .join(", ") || undefined,
      accent: SPORT_ACCENTS[row.sportSlug] ?? "#55c9a6",
      demo: row.isDemo,
    };
  });
}

export async function getEventsBetween(
  from: Date,
  to: Date,
  locale: Locale,
  options: { limit?: number; state?: EventRow["state"] } = {},
) {
  const rows = await queryEventRows(
    from,
    to,
    options.limit,
    options.state ? eq(events.state, options.state) : undefined,
  );
  return hydrateEventRows(rows, locale);
}

export interface FollowSets {
  ids: Set<string>;
  athleteIds: Set<string>;
  teamIds: Set<string>;
  sportIds: Set<string>;
  competitionIds: Set<string>;
}

export async function getFollowSets(profileId: string): Promise<FollowSets> {
  const rows = await db
    .select({
      id: follows.id,
      athleteId: follows.athleteId,
      teamId: follows.teamId,
      sportId: follows.sportId,
      competitionId: follows.competitionId,
    })
    .from(follows)
    .where(eq(follows.profileId, profileId));
  return {
    ids: new Set(rows.map((row) => row.id)),
    athleteIds: new Set(rows.flatMap((row) => (row.athleteId ? [row.athleteId] : []))),
    teamIds: new Set(rows.flatMap((row) => (row.teamId ? [row.teamId] : []))),
    sportIds: new Set(rows.flatMap((row) => (row.sportId ? [row.sportId] : []))),
    competitionIds: new Set(rows.flatMap((row) => (row.competitionId ? [row.competitionId] : []))),
  };
}

export interface NotificationTarget {
  type: NotificationTargetType;
  targetId: string;
}

export async function getNotificationModes(
  profileId: string,
  targets: readonly NotificationTarget[],
): Promise<Map<string, NotificationMode>> {
  const modes = new Map<string, NotificationMode>(
    targets.map((target) => [notificationTargetKey(target.type, target.targetId), "off"]),
  );
  const athleteIds = [
    ...new Set(targets.flatMap((target) => (target.type === "athlete" ? [target.targetId] : []))),
  ];
  const teamIds = [
    ...new Set(targets.flatMap((target) => (target.type === "team" ? [target.targetId] : []))),
  ];
  const targetConditions: SQL[] = [];
  if (athleteIds.length > 0) {
    targetConditions.push(inArray(notificationPreferences.athleteId, athleteIds));
  }
  if (teamIds.length > 0) {
    targetConditions.push(inArray(notificationPreferences.teamId, teamIds));
  }
  if (targetConditions.length === 0) return modes;

  const rows = await db
    .select({
      athleteId: notificationPreferences.athleteId,
      teamId: notificationPreferences.teamId,
      kind: notificationPreferences.kind,
      enabled: notificationPreferences.enabled,
    })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.profileId, profileId),
        eq(notificationPreferences.channel, "in_app"),
        or(...targetConditions),
      ),
    );

  const enabledKinds = new Map<string, Set<NotificationKind>>();
  for (const row of rows) {
    if (!row.enabled) continue;
    const key = row.athleteId
      ? notificationTargetKey("athlete", row.athleteId)
      : row.teamId
        ? notificationTargetKey("team", row.teamId)
        : null;
    if (!key || !modes.has(key)) continue;
    const kinds = enabledKinds.get(key) ?? new Set<NotificationKind>();
    kinds.add(row.kind);
    enabledKinds.set(key, kinds);
  }

  for (const key of modes.keys()) {
    modes.set(key, deriveNotificationMode(enabledKinds.get(key) ?? []));
  }
  return modes;
}

export async function getNotificationMode(
  profileId: string,
  type: NotificationTargetType,
  targetId: string,
): Promise<NotificationMode> {
  const modes = await getNotificationModes(profileId, [{ type, targetId }]);
  return modes.get(notificationTargetKey(type, targetId)) ?? "off";
}

export async function getGlobalNotificationMode(profileId: string): Promise<NotificationMode> {
  const rows = await db
    .select({
      kind: notificationPreferences.kind,
      enabled: notificationPreferences.enabled,
    })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.profileId, profileId),
        eq(notificationPreferences.channel, "in_app"),
        isNull(notificationPreferences.athleteId),
        isNull(notificationPreferences.teamId),
        isNull(notificationPreferences.sportId),
        isNull(notificationPreferences.competitionId),
      ),
    );

  return deriveNotificationMode(rows.flatMap((row) => (row.enabled ? [row.kind] : [])));
}

export async function getFeaturedAthletes(locale: Locale, limit = 8): Promise<PersonSummary[]> {
  const rows = await db
    .select({
      id: athletes.id,
      slug: athletes.slug,
      name: athletes.displayName,
      nationality: athletes.nationalityCode,
      portraitUrl: athletes.portraitUrl,
      demo: athletes.isDemo,
      sportNameEt: sports.nameEt,
      sportNameEn: sports.nameEn,
    })
    .from(athletes)
    .innerJoin(sports, eq(athletes.primarySportId, sports.id))
    .orderBy(desc(eq(athletes.nationalityCode, "EE")), asc(athletes.displayName))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    initials: initials(row.name),
    nationality: row.nationality,
    isEstonian: row.nationality === "EE",
    sportName: localized(locale, row.sportNameEt, row.sportNameEn),
    portraitUrl: row.portraitUrl ?? undefined,
    demo: row.demo,
  }));
}

function eventMatchesFollows(event: EventCardModel, followSets: FollowSets) {
  return (
    (followSets.athleteIds.size > 0 &&
      event.estonians.some((athlete) => followSets.athleteIds.has(athlete.id))) ||
    event.participants.some((participant) => followSets.teamIds.has(participant.id)) ||
    (event.sportId ? followSets.sportIds.has(event.sportId) : false) ||
    (event.competitionId ? followSets.competitionIds.has(event.competitionId) : false)
  );
}

export async function getHomeData(profileId: string, locale: Locale) {
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 86_400_000);
  const to = new Date(now.getTime() + 8 * 86_400_000);
  const [eventCards, followSets, featuredAthletes] = await Promise.all([
    getEventsBetween(from, to, locale),
    getFollowSets(profileId),
    getFeaturedAthletes(locale),
  ]);
  const nowMs = now.getTime();
  const todayKey = tallinnDayKey(now);
  const live = eventCards.filter((event) => event.status === "live" || event.status === "paused");
  const soon = eventCards.filter((event) => {
    const startsIn = new Date(event.startAt).getTime() - nowMs;
    return (
      ["scheduled", "delayed"].includes(event.status) &&
      startsIn >= -60_000 &&
      startsIn <= 3 * 3_600_000
    );
  });
  const estoniansToday = eventCards.filter(
    (event) => tallinnDayKey(event.startAt) === todayKey && event.estonians.length > 0,
  );
  const personalized = eventCards
    .filter((event) => eventMatchesFollows(event, followSets))
    .map((event) => ({ ...event, recommendationReason: event.estonians[0]?.name }))
    .slice(0, 6);
  const recent = [...eventCards]
    .filter(
      (event) =>
        event.status === "finished" &&
        (event.contentKinds.includes("replay") || event.contentKinds.includes("highlight")),
    )
    .sort((left, right) => new Date(right.startAt).getTime() - new Date(left.startAt).getTime())
    .slice(0, 6);
  return {
    live,
    soon,
    estoniansToday,
    personalized,
    recent,
    featuredAthletes,
    followSets,
  };
}

export async function searchCatalog(query: string, locale: Locale): Promise<SearchResults> {
  const normalized = query.trim().toLocaleLowerCase(locale === "et" ? "et-EE" : "en-GB");
  const [athleteRows, teamRows, sportRows, competitionRows, eventCards] = await Promise.all([
    getFeaturedAthletes(locale, 100),
    db
      .select({
        id: teams.id,
        slug: teams.slug,
        name: teams.name,
        countryCode: teams.countryCode,
        demo: teams.isDemo,
        sportNameEt: sports.nameEt,
        sportNameEn: sports.nameEn,
      })
      .from(teams)
      .leftJoin(sports, eq(teams.sportId, sports.id))
      .orderBy(asc(teams.name)),
    db
      .select({
        id: sports.id,
        slug: sports.slug,
        nameEt: sports.nameEt,
        nameEn: sports.nameEn,
        icon: sports.iconKey,
      })
      .from(sports)
      .orderBy(asc(sports.nameEt)),
    db
      .select({
        id: competitions.id,
        slug: competitions.slug,
        name: competitions.name,
        nameEt: competitions.nameEt,
        nameEn: competitions.nameEn,
        demo: competitions.isDemo,
        sportNameEt: sports.nameEt,
        sportNameEn: sports.nameEn,
      })
      .from(competitions)
      .innerJoin(sports, eq(competitions.sportId, sports.id))
      .orderBy(asc(competitions.name)),
    getEventsBetween(
      new Date(Date.now() - 30 * 86_400_000),
      new Date(Date.now() + 90 * 86_400_000),
      locale,
      { limit: 200 },
    ),
  ]);

  const includesQuery = (...values: Array<string | null | undefined>) =>
    !normalized ||
    values.some((value) =>
      value?.toLocaleLowerCase(locale === "et" ? "et-EE" : "en-GB").includes(normalized),
    );

  return {
    athletes: athleteRows.filter((row) => includesQuery(row.name, row.sportName)),
    teams: teamRows
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        sportName: localized(locale, row.sportNameEt, row.sportNameEn),
        countryCode: row.countryCode,
        demo: row.demo,
      }))
      .filter((row) => includesQuery(row.name, row.sportName)),
    sports: sportRows
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        name: localized(locale, row.nameEt, row.nameEn),
        icon: row.icon ?? "activity",
        demo: true,
      }))
      .filter((row) => includesQuery(row.name)),
    competitions: competitionRows
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        name: localized(locale, row.nameEt ?? row.name, row.nameEn ?? row.name),
        sportName: localized(locale, row.sportNameEt, row.sportNameEn),
        demo: row.demo,
      }))
      .filter((row) => includesQuery(row.name, row.sportName)),
    events: eventCards.filter((row) =>
      includesQuery(
        row.title,
        row.sportName,
        row.competitionName,
        ...row.estonians.map((a) => a.name),
      ),
    ),
  };
}

async function queryEventRowBySlug(slug: string): Promise<EventRow | undefined> {
  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      titleEt: events.titleEt,
      titleEn: events.titleEn,
      descriptionEt: events.descriptionEt,
      descriptionEn: events.descriptionEn,
      state: events.state,
      scheduledStartAt: events.scheduledStartAt,
      actualStartAt: events.actualStartAt,
      endAt: events.endAt,
      statusDetailEt: events.statusDetailEt,
      statusDetailEn: events.statusDetailEn,
      version: events.version,
      isDemo: events.isDemo,
      competitionId: competitions.id,
      competitionSlug: competitions.slug,
      competitionName: competitions.name,
      competitionNameEt: competitions.nameEt,
      competitionNameEn: competitions.nameEn,
      sportId: sports.id,
      sportSlug: sports.slug,
      sportNameEt: sports.nameEt,
      sportNameEn: sports.nameEn,
      venueId: venues.id,
      venueName: venues.name,
      venueCity: venues.city,
    })
    .from(events)
    .innerJoin(competitions, eq(events.competitionId, competitions.id))
    .innerJoin(sports, eq(competitions.sportId, sports.id))
    .leftJoin(venues, eq(events.venueId, venues.id))
    .where(eq(events.slug, slug))
    .limit(1);
  return rows[0];
}

export interface AthleteDetail {
  id: string;
  slug: string;
  name: string;
  initials: string;
  nationality: string;
  sportName: string;
  sportId: string;
  portraitUrl?: string;
  biography: string;
  keyFacts: Array<{ label: string; value: string }>;
  team?: { id: string; slug: string; name: string; countryCode: string };
  upcoming: EventCardModel[];
  live: EventCardModel[];
  recent: EventCardModel[];
  competitions: string[];
  demo: boolean;
}

export async function getAthleteDetail(
  slug: string,
  locale: Locale,
): Promise<AthleteDetail | null> {
  const athleteRows = await db
    .select({
      id: athletes.id,
      slug: athletes.slug,
      name: athletes.displayName,
      nationality: athletes.nationalityCode,
      portraitUrl: athletes.portraitUrl,
      biographyEt: athletes.biographyEt,
      biographyEn: athletes.biographyEn,
      keyFacts: athletes.keyFacts,
      demo: athletes.isDemo,
      sportId: sports.id,
      sportNameEt: sports.nameEt,
      sportNameEn: sports.nameEn,
    })
    .from(athletes)
    .innerJoin(sports, eq(athletes.primarySportId, sports.id))
    .where(eq(athletes.slug, slug))
    .limit(1);
  const athlete = athleteRows[0];
  if (!athlete) return null;

  const [membershipRows, participationRows] = await Promise.all([
    db
      .select({
        id: teams.id,
        slug: teams.slug,
        name: teams.name,
        countryCode: teams.countryCode,
      })
      .from(athleteTeamMemberships)
      .innerJoin(teams, eq(athleteTeamMemberships.teamId, teams.id))
      .where(eq(athleteTeamMemberships.athleteId, athlete.id))
      .orderBy(desc(athleteTeamMemberships.startsAt))
      .limit(1),
    db
      .select({ eventId: eventParticipants.eventId })
      .from(eventParticipants)
      .where(eq(eventParticipants.athleteId, athlete.id)),
  ]);

  const eventIds = participationRows.map((row) => row.eventId);
  const eventRows =
    eventIds.length > 0
      ? await queryEventRows(
          new Date(Date.now() - 90 * 86_400_000),
          new Date(Date.now() + 180 * 86_400_000),
          120,
          inArray(events.id, eventIds),
        )
      : [];
  const eventCards = await hydrateEventRows(eventRows, locale);
  const now = Date.now();
  const upcoming = eventCards.filter(
    (event) =>
      ["scheduled", "delayed"].includes(event.status) && new Date(event.startAt).getTime() >= now,
  );
  const live = eventCards.filter((event) => ["live", "paused"].includes(event.status));
  const recent = [...eventCards]
    .filter((event) => event.status === "finished")
    .sort((left, right) => new Date(right.startAt).getTime() - new Date(left.startAt).getTime());

  return {
    id: athlete.id,
    slug: athlete.slug,
    name: athlete.name,
    initials: initials(athlete.name),
    nationality: athlete.nationality,
    sportName: localized(locale, athlete.sportNameEt, athlete.sportNameEn),
    sportId: athlete.sportId,
    portraitUrl: athlete.portraitUrl ?? undefined,
    biography: localized(locale, athlete.biographyEt, athlete.biographyEn),
    keyFacts: athlete.keyFacts.map((fact) => ({
      label: localized(locale, fact.labelEt, fact.labelEn),
      value: fact.value,
    })),
    team: membershipRows[0],
    upcoming,
    live,
    recent,
    competitions: [...new Set(eventCards.map((event) => event.competitionName))],
    demo: athlete.demo,
  };
}

export interface TeamDetail {
  id: string;
  slug: string;
  name: string;
  shortName?: string;
  countryCode: string;
  city?: string;
  sportName: string;
  athletes: PersonSummary[];
  events: EventCardModel[];
  demo: boolean;
}

export async function getTeamDetail(slug: string, locale: Locale): Promise<TeamDetail | null> {
  const rows = await db
    .select({
      id: teams.id,
      slug: teams.slug,
      name: teams.name,
      shortName: teams.shortName,
      countryCode: teams.countryCode,
      city: teams.city,
      demo: teams.isDemo,
      sportNameEt: sports.nameEt,
      sportNameEn: sports.nameEn,
    })
    .from(teams)
    .leftJoin(sports, eq(teams.sportId, sports.id))
    .where(eq(teams.slug, slug))
    .limit(1);
  const team = rows[0];
  if (!team) return null;
  const [memberRows, participationRows] = await Promise.all([
    db
      .select({
        id: athletes.id,
        slug: athletes.slug,
        name: athletes.displayName,
        nationality: athletes.nationalityCode,
        portraitUrl: athletes.portraitUrl,
        demo: athletes.isDemo,
      })
      .from(athleteTeamMemberships)
      .innerJoin(athletes, eq(athleteTeamMemberships.athleteId, athletes.id))
      .where(eq(athleteTeamMemberships.teamId, team.id))
      .orderBy(asc(athletes.displayName)),
    db
      .select({ eventId: eventParticipants.eventId })
      .from(eventParticipants)
      .where(eq(eventParticipants.teamId, team.id)),
  ]);
  const eventIds = participationRows.map((row) => row.eventId);
  const eventRows =
    eventIds.length > 0
      ? await queryEventRows(
          new Date(Date.now() - 30 * 86_400_000),
          new Date(Date.now() + 180 * 86_400_000),
          100,
          inArray(events.id, eventIds),
        )
      : [];
  const sportName = localized(locale, team.sportNameEt, team.sportNameEn);
  return {
    id: team.id,
    slug: team.slug,
    name: team.name,
    shortName: team.shortName ?? undefined,
    countryCode: team.countryCode,
    city: team.city ?? undefined,
    sportName,
    athletes: memberRows.map((athlete) => ({
      id: athlete.id,
      slug: athlete.slug,
      name: athlete.name,
      initials: initials(athlete.name),
      nationality: athlete.nationality,
      isEstonian: athlete.nationality === "EE",
      sportName,
      portraitUrl: athlete.portraitUrl ?? undefined,
      demo: athlete.demo,
    })),
    events: await hydrateEventRows(eventRows, locale),
    demo: team.demo,
  };
}

export interface EventDetail {
  card: EventCardModel;
  description: string;
  competitionId: string;
  sportId: string;
  eventVersion: number;
  venue?: { id: string; name: string; city: string };
  timeline: Array<{
    id: string;
    sequence: number;
    occurredAt: string;
    eventClock?: string;
    kind: string;
    text: string;
    spoilerSensitive: boolean;
  }>;
  results: Array<{
    rank?: number;
    score?: string;
    outcome?: string;
    participantName: string;
  }>;
  streamSummary: Array<{
    id: string;
    protocol: "webrtc" | "ll_hls" | "hls" | "external";
    state: string;
    provider: string;
    dvrWindowSeconds: number;
  }>;
  rights: Array<{
    id: string;
    access: string;
    countryCode?: string;
    startsAt: string;
    endsAt: string;
    rightsHolder: string;
    dvrAllowed: boolean;
  }>;
  related: EventCardModel[];
}

export async function getEventDetail(slug: string, locale: Locale): Promise<EventDetail | null> {
  const row = await queryEventRowBySlug(slug);
  if (!row) return null;
  const [card] = await hydrateEventRows([row], locale);
  if (!card) return null;

  const [timelineRows, resultRows, streamRows, rightRows, relatedRows] = await Promise.all([
    db
      .select({
        id: timelineEvents.id,
        sequence: timelineEvents.sequence,
        occurredAt: timelineEvents.occurredAt,
        eventClock: timelineEvents.eventClock,
        kind: timelineEvents.kind,
        textEt: timelineEvents.textEt,
        textEn: timelineEvents.textEn,
        spoilerSensitive: timelineEvents.spoilerSensitive,
      })
      .from(timelineEvents)
      .where(eq(timelineEvents.eventId, row.id))
      .orderBy(asc(timelineEvents.sequence)),
    db
      .select({
        rank: results.rank,
        score: results.scoreDisplay,
        outcome: results.outcome,
        athleteName: athletes.displayName,
        teamName: teams.name,
      })
      .from(results)
      .innerJoin(eventParticipants, eq(results.eventParticipantId, eventParticipants.id))
      .leftJoin(athletes, eq(eventParticipants.athleteId, athletes.id))
      .leftJoin(teams, eq(eventParticipants.teamId, teams.id))
      .where(eq(results.eventId, row.id))
      .orderBy(asc(results.rank)),
    db
      .select({
        id: streams.id,
        protocol: streams.protocol,
        state: streams.state,
        provider: streams.provider,
        dvrWindowSeconds: streams.dvrWindowSeconds,
      })
      .from(streams)
      .where(eq(streams.eventId, row.id))
      .orderBy(asc(streams.priority)),
    db
      .select({
        id: rightsWindows.id,
        access: rightsWindows.access,
        countryCode: rightsWindows.countryCode,
        startsAt: rightsWindows.startsAt,
        endsAt: rightsWindows.endsAt,
        rightsHolder: rightsWindows.rightsHolder,
        dvrAllowed: rightsWindows.dvrAllowed,
      })
      .from(rightsWindows)
      .where(
        or(
          eq(rightsWindows.eventId, row.id),
          eq(rightsWindows.competitionId, row.competitionId),
          inArray(
            rightsWindows.streamId,
            db.select({ id: streams.id }).from(streams).where(eq(streams.eventId, row.id)),
          ),
          inArray(
            rightsWindows.mediaAssetId,
            db
              .select({ id: mediaAssets.id })
              .from(mediaAssets)
              .where(eq(mediaAssets.eventId, row.id)),
          ),
        ),
      )
      .orderBy(desc(rightsWindows.priority)),
    queryEventRows(
      new Date(Date.now() - 14 * 86_400_000),
      new Date(Date.now() + 45 * 86_400_000),
      8,
      and(
        eq(events.competitionId, row.competitionId),
        or(eq(events.state, "scheduled"), eq(events.state, "live")),
      ),
    ),
  ]);
  const related = (await hydrateEventRows(relatedRows, locale)).filter(
    (event) => event.id !== row.id,
  );
  return {
    card,
    description: localized(locale, row.descriptionEt, row.descriptionEn),
    competitionId: row.competitionId,
    sportId: row.sportId,
    eventVersion: row.version,
    venue:
      row.venueId && row.venueName && row.venueCity
        ? { id: row.venueId, name: row.venueName, city: row.venueCity }
        : undefined,
    timeline: timelineRows.map((item) => ({
      id: item.id,
      sequence: item.sequence,
      occurredAt: item.occurredAt.toISOString(),
      eventClock: item.eventClock ?? undefined,
      kind: item.kind,
      text: localized(locale, item.textEt, item.textEn),
      spoilerSensitive: item.spoilerSensitive,
    })),
    results: resultRows.map((item) => ({
      rank: item.rank ?? undefined,
      score: item.score ?? undefined,
      outcome: item.outcome ?? undefined,
      participantName: item.athleteName ?? item.teamName ?? "—",
    })),
    streamSummary: streamRows,
    rights: rightRows.map((item) => ({
      id: item.id,
      access: item.access,
      countryCode: item.countryCode ?? undefined,
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt.toISOString(),
      rightsHolder: item.rightsHolder,
      dvrAllowed: item.dvrAllowed,
    })),
    related,
  };
}

export interface FollowedEntity {
  id: string;
  targetId: string;
  type: FollowTargetType;
  name: string;
  subtitle: string;
  slug: string;
  notificationMode: NotificationMode;
}

export async function getMySports(profileId: string, locale: Locale) {
  const followRows = await db
    .select({
      id: follows.id,
      athleteId: follows.athleteId,
      athleteName: athletes.displayName,
      athleteSlug: athletes.slug,
      teamId: follows.teamId,
      teamName: teams.name,
      teamSlug: teams.slug,
      sportId: follows.sportId,
      sportNameEt: sports.nameEt,
      sportNameEn: sports.nameEn,
      sportSlug: sports.slug,
      competitionId: follows.competitionId,
      competitionName: competitions.name,
      competitionNameEt: competitions.nameEt,
      competitionNameEn: competitions.nameEn,
      competitionSlug: competitions.slug,
    })
    .from(follows)
    .leftJoin(athletes, eq(follows.athleteId, athletes.id))
    .leftJoin(teams, eq(follows.teamId, teams.id))
    .leftJoin(sports, eq(follows.sportId, sports.id))
    .leftJoin(competitions, eq(follows.competitionId, competitions.id))
    .where(eq(follows.profileId, profileId))
    .orderBy(asc(follows.createdAt));
  const notificationTargets: NotificationTarget[] = [];
  for (const row of followRows) {
    if (row.athleteId) notificationTargets.push({ type: "athlete", targetId: row.athleteId });
    if (row.teamId) notificationTargets.push({ type: "team", targetId: row.teamId });
  }
  const notificationModes = await getNotificationModes(profileId, notificationTargets);
  const entities: FollowedEntity[] = followRows.map((row) => {
    if (row.athleteId) {
      return {
        id: row.id,
        targetId: row.athleteId,
        type: "athlete",
        name: row.athleteName ?? "",
        subtitle: locale === "et" ? "Sportlane" : "Athlete",
        slug: row.athleteSlug ?? "",
        notificationMode:
          notificationModes.get(notificationTargetKey("athlete", row.athleteId)) ?? "off",
      };
    }
    if (row.teamId) {
      return {
        id: row.id,
        targetId: row.teamId,
        type: "team",
        name: row.teamName ?? "",
        subtitle: locale === "et" ? "Võistkond" : "Team",
        slug: row.teamSlug ?? "",
        notificationMode: notificationModes.get(notificationTargetKey("team", row.teamId)) ?? "off",
      };
    }
    if (row.sportId) {
      return {
        id: row.id,
        targetId: row.sportId,
        type: "sport",
        name: localized(locale, row.sportNameEt, row.sportNameEn),
        subtitle: locale === "et" ? "Spordiala" : "Sport",
        slug: row.sportSlug ?? "",
        notificationMode: "off",
      };
    }
    return {
      id: row.id,
      targetId: row.competitionId ?? "",
      type: "competition",
      name: localized(
        locale,
        row.competitionNameEt ?? row.competitionName,
        row.competitionNameEn ?? row.competitionName,
      ),
      subtitle: locale === "et" ? "Võistlus" : "Competition",
      slug: row.competitionSlug ?? "",
      notificationMode: "off",
    };
  });
  const followSets = await getFollowSets(profileId);
  const allEvents = await getEventsBetween(
    new Date(Date.now() - 2 * 86_400_000),
    new Date(Date.now() + 60 * 86_400_000),
    locale,
    { limit: 240 },
  );
  return {
    entities,
    calendar: allEvents.filter((event) => eventMatchesFollows(event, followSets)),
  };
}

export async function getNotificationInbox(profileId: string, spoilerFree: boolean) {
  const rows = await db
    .select({
      id: notifications.id,
      eventId: notifications.eventId,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      spoilerSensitive: notifications.spoilerSensitive,
      sentAt: notifications.sentAt,
      scheduledFor: notifications.scheduledFor,
      readAt: notifications.readAt,
      state: notifications.state,
    })
    .from(notifications)
    .where(eq(notifications.profileId, profileId))
    .orderBy(desc(notifications.createdAt))
    .limit(80);
  return rows.map((row) => ({
    ...row,
    title: spoilerFree && row.spoilerSensitive ? "••••••••" : row.title,
    body: spoilerFree && row.spoilerSensitive ? "••••••••••••••••" : row.body,
    sentAt: row.sentAt?.toISOString(),
    scheduledFor: row.scheduledFor.toISOString(),
    readAt: row.readAt?.toISOString(),
  }));
}

export async function getAdminOverview() {
  const [eventRows, streamRows, auditRows, collectionRows, userRows, playbackRows] =
    await Promise.all([
      db
        .select({
          id: events.id,
          title: events.titleEt,
          state: events.state,
          startAt: events.scheduledStartAt,
        })
        .from(events)
        .where(
          and(
            gte(events.scheduledStartAt, new Date(Date.now() - 12 * 3_600_000)),
            lte(events.scheduledStartAt, new Date(Date.now() + 36 * 3_600_000)),
          ),
        )
        .orderBy(asc(events.scheduledStartAt)),
      db
        .select({
          id: streams.id,
          eventId: streams.eventId,
          protocol: streams.protocol,
          state: streams.state,
          provider: streams.provider,
          lastHealthyAt: streams.lastHealthyAt,
        })
        .from(streams)
        .orderBy(asc(streams.priority)),
      db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          occurredAt: auditLogs.occurredAt,
          reason: auditLogs.reason,
        })
        .from(auditLogs)
        .orderBy(desc(auditLogs.occurredAt))
        .limit(10),
      db
        .select({ id: editorialCollections.id, state: editorialCollections.state })
        .from(editorialCollections),
      db.select({ id: users.id }).from(users),
      db
        .select({ id: playbackSessions.id, state: playbackSessions.state })
        .from(playbackSessions)
        .where(or(eq(playbackSessions.state, "authorized"), eq(playbackSessions.state, "playing"))),
    ]);
  return {
    events: eventRows.map((row) => ({ ...row, startAt: row.startAt.toISOString() })),
    streams: streamRows.map((row) => ({
      ...row,
      lastHealthyAt: row.lastHealthyAt?.toISOString(),
    })),
    audits: auditRows.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() })),
    metrics: {
      activeStreams: streamRows.filter((row) => row.state === "live").length,
      degradedStreams: streamRows.filter((row) => row.state === "degraded").length,
      activePlaybacks: playbackRows.length,
      users: userRows.length,
      publishedCollections: collectionRows.filter((row) => row.state === "published").length,
    },
  };
}
