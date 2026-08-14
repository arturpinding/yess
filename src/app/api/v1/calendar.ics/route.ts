import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, lte, or, type SQL } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getViewerContext } from "@/server/auth/viewer-context";
import { serializeCalendar, type CalendarEvent } from "@/server/calendar/icalendar";
import { db } from "@/server/db/client";
import {
  competitions,
  eventParticipants,
  events,
  follows,
  sports,
  venues,
} from "@/server/db/schema";
import { getEnvironment } from "@/server/environment";
import {
  PRIVATE_NO_STORE_HEADERS,
  privateJson,
  rateLimitHeaders,
} from "@/server/http/api-response";
import { createLogger } from "@/server/observability/logger";
import { consumeApiRateLimit } from "@/server/security/request-guards";

const CALENDAR_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const;
const PAST_WINDOW_MS = 30 * 86_400_000;
const FUTURE_WINDOW_MS = 366 * 86_400_000;
const DEFAULT_EVENT_DURATION_MS = 2 * 3_600_000;
const MAX_CALENDAR_EVENTS = 1_000;
const logger = createLogger({ service: "rada-calendar-export" });

function localized(locale: "et" | "en", et: string | null, en: string | null): string {
  return (locale === "et" ? et : en) ?? et ?? en ?? "";
}

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const viewer = await getViewerContext(request);
    if (!viewer) {
      return privateJson({ error: { code: "authentication_required" } }, { status: 401 });
    }

    const rateLimit = await consumeApiRateLimit(
      "calendar-export",
      `${viewer.profileId}:${viewer.sessionId}`,
      CALENDAR_RATE_LIMIT,
    );
    const responseHeaders = rateLimitHeaders(rateLimit);
    if (!rateLimit.allowed) {
      return privateJson(
        { error: { code: "rate_limited" } },
        { status: 429, headers: responseHeaders },
      );
    }

    const followRows = await db
      .select({
        athleteId: follows.athleteId,
        teamId: follows.teamId,
        sportId: follows.sportId,
        competitionId: follows.competitionId,
      })
      .from(follows)
      .where(eq(follows.profileId, viewer.profileId));

    const athleteIds = followRows.flatMap((follow) => (follow.athleteId ? [follow.athleteId] : []));
    const teamIds = followRows.flatMap((follow) => (follow.teamId ? [follow.teamId] : []));
    const sportIds = followRows.flatMap((follow) => (follow.sportId ? [follow.sportId] : []));
    const competitionIds = followRows.flatMap((follow) =>
      follow.competitionId ? [follow.competitionId] : [],
    );

    const participantConditions: SQL[] = [];
    if (athleteIds.length > 0) {
      participantConditions.push(inArray(eventParticipants.athleteId, athleteIds));
    }
    if (teamIds.length > 0) {
      participantConditions.push(inArray(eventParticipants.teamId, teamIds));
    }
    const participantEventIds =
      participantConditions.length > 0
        ? (
            await db
              .selectDistinct({ eventId: eventParticipants.eventId })
              .from(eventParticipants)
              .where(or(...participantConditions))
          ).map((row) => row.eventId)
        : [];

    const eventConditions: SQL[] = [];
    if (participantEventIds.length > 0) {
      eventConditions.push(inArray(events.id, participantEventIds));
    }
    if (sportIds.length > 0) {
      eventConditions.push(inArray(competitions.sportId, sportIds));
    }
    if (competitionIds.length > 0) {
      eventConditions.push(inArray(events.competitionId, competitionIds));
    }

    const now = new Date();
    const rows =
      eventConditions.length > 0
        ? await db
            .select({
              id: events.id,
              slug: events.slug,
              titleEt: events.titleEt,
              titleEn: events.titleEn,
              descriptionEt: events.descriptionEt,
              descriptionEn: events.descriptionEn,
              state: events.state,
              startsAt: events.scheduledStartAt,
              endsAt: events.endAt,
              version: events.version,
              updatedAt: events.updatedAt,
              competitionName: competitions.name,
              competitionNameEt: competitions.nameEt,
              competitionNameEn: competitions.nameEn,
              sportNameEt: sports.nameEt,
              sportNameEn: sports.nameEn,
              venueName: venues.name,
              venueCity: venues.city,
            })
            .from(events)
            .innerJoin(competitions, eq(events.competitionId, competitions.id))
            .innerJoin(sports, eq(competitions.sportId, sports.id))
            .leftJoin(venues, eq(events.venueId, venues.id))
            .where(
              and(
                gte(events.scheduledStartAt, new Date(now.getTime() - PAST_WINDOW_MS)),
                lte(events.scheduledStartAt, new Date(now.getTime() + FUTURE_WINDOW_MS)),
                lte(events.ageRating, viewer.maturityLimit),
                or(...eventConditions),
              ),
            )
            .orderBy(asc(events.scheduledStartAt))
            .limit(MAX_CALENDAR_EVENTS)
        : [];

    const environment = getEnvironment();
    const appOrigin = new URL(environment.APP_ORIGIN);
    const calendarEvents: CalendarEvent[] = rows.map((event) => {
      const competition = localized(
        viewer.locale,
        event.competitionNameEt ?? event.competitionName,
        event.competitionNameEn ?? event.competitionName,
      );
      const sport = localized(viewer.locale, event.sportNameEt, event.sportNameEn);
      return {
        id: event.id,
        title: localized(viewer.locale, event.titleEt, event.titleEn),
        description:
          localized(viewer.locale, event.descriptionEt, event.descriptionEn) ||
          `${sport} · ${competition}`,
        location:
          event.venueName && event.venueCity
            ? `${event.venueName}, ${event.venueCity}`
            : event.venueName,
        url: new URL(`/${viewer.locale}/events/${event.slug}`, appOrigin).toString(),
        startsAt: event.startsAt,
        endsAt: event.endsAt ?? new Date(event.startsAt.getTime() + DEFAULT_EVENT_DURATION_MS),
        updatedAt: event.updatedAt,
        sequence: event.version,
        cancelled: event.state === "cancelled",
      };
    });
    const calendar = serializeCalendar({
      name: viewer.locale === "et" ? "RADA · Minu sport" : "RADA · My Sports",
      description:
        viewer.locale === "et"
          ? "Jälgitavate sportlaste, võistkondade, spordialade ja võistluste kava."
          : "Schedule for the athletes, teams, sports and competitions you follow.",
      domain: appOrigin.hostname,
      events: calendarEvents,
    });

    return new Response(calendar, {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        ...responseHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="rada-my-sports.ics"',
        "Content-Language": viewer.locale,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.error({ requestId, error }, "calendar export failed");
    return privateJson({ error: { code: "internal_error", requestId } }, { status: 500 });
  }
}
