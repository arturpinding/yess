import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, or, type SQL } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getViewerContext } from "@/server/auth/viewer-context";
import { db } from "@/server/db/client";
import { playbackSessions } from "@/server/db/schema";
import { privateJson, rateLimitHeaders } from "@/server/http/api-response";
import { createLogger } from "@/server/observability/logger";
import { preserveFirstPlaybackStartedAt } from "@/server/playback/session-state";
import { playbackTelemetrySchema } from "@/server/playback/telemetry";
import { checkRequestCsrf, consumeApiRateLimit } from "@/server/security/request-guards";

const TELEMETRY_RATE_LIMIT = { limit: 240, windowMs: 60_000 } as const;
const logger = createLogger({ service: "rada-playback-telemetry" });

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const viewer = await getViewerContext(request);
    if (!viewer) {
      return privateJson({ error: { code: "authentication_required" } }, { status: 401 });
    }

    const csrf = checkRequestCsrf(request, viewer.csrfSecretHash);
    if (!csrf.allowed) {
      return privateJson({ error: { code: "csrf_failed" } }, { status: 403 });
    }

    const rateLimit = await consumeApiRateLimit(
      "playback-telemetry",
      `${viewer.profileId}:${viewer.sessionId}`,
      TELEMETRY_RATE_LIMIT,
    );
    const responseHeaders = rateLimitHeaders(rateLimit);
    if (!rateLimit.allowed) {
      return privateJson(
        { error: { code: "rate_limited" } },
        { status: 429, headers: responseHeaders },
      );
    }

    const parsed = playbackTelemetrySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return privateJson(
        { error: { code: "invalid_request" } },
        { status: 400, headers: responseHeaders },
      );
    }

    const telemetry = parsed.data;
    const now = new Date();
    const activeSession: SQL | undefined = or(
      eq(playbackSessions.state, "playing"),
      and(
        eq(playbackSessions.state, "authorized"),
        gt(playbackSessions.authorizationExpiresAt, now),
      ),
    );
    const conditions: SQL[] = [
      eq(playbackSessions.profileId, viewer.profileId),
      eq(playbackSessions.eventId, telemetry.eventId),
      isNull(playbackSessions.endedAt),
    ];
    if (activeSession) conditions.push(activeSession);
    if (telemetry.sourceId) conditions.push(eq(playbackSessions.streamId, telemetry.sourceId));

    const [session] = await db
      .select({ id: playbackSessions.id })
      .from(playbackSessions)
      .where(and(...conditions))
      .orderBy(desc(playbackSessions.createdAt))
      .limit(1);
    if (!session) {
      return privateJson(
        { error: { code: "playback_session_not_found" } },
        { status: 404, headers: responseHeaders },
      );
    }

    const updateConditions = and(
      eq(playbackSessions.id, session.id),
      eq(playbackSessions.profileId, viewer.profileId),
      eq(playbackSessions.eventId, telemetry.eventId),
      isNull(playbackSessions.endedAt),
    );
    const commonUpdate = { lastHeartbeatAt: now, updatedAt: now };

    switch (telemetry.type) {
      case "playback_ready":
        await db
          .update(playbackSessions)
          .set({ ...commonUpdate, startupMilliseconds: telemetry.value })
          .where(updateConditions);
        break;
      case "playback_started":
        await db
          .update(playbackSessions)
          .set({
            ...commonUpdate,
            state: "playing",
            startedAt: preserveFirstPlaybackStartedAt(now),
            fatalErrorCode: null,
          })
          .where(updateConditions);
        break;
      case "playback_failed":
        await db
          .update(playbackSessions)
          .set({ ...commonUpdate, fatalErrorCode: telemetry.reasonCode })
          .where(updateConditions);
        break;
      case "playback_ended":
        await db
          .update(playbackSessions)
          .set({ ...commonUpdate, state: "ended", endedAt: now })
          .where(updateConditions);
        break;
      default:
        await db.update(playbackSessions).set(commonUpdate).where(updateConditions);
        break;
    }

    return privateJson({ accepted: true }, { status: 202, headers: responseHeaders });
  } catch (error) {
    logger.error({ requestId, error }, "playback telemetry failed");
    return privateJson({ error: { code: "internal_error", requestId } }, { status: 500 });
  }
}
