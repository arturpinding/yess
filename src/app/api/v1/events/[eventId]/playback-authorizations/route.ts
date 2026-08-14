import { createHash, randomUUID } from "node:crypto";
import { and, count, eq, gt, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { CONTENT_TYPES } from "@/domain/content";
import { getViewerContext } from "@/server/auth/viewer-context";
import { db } from "@/server/db/client";
import {
  competitions,
  entitlements,
  events,
  mediaAssets,
  playbackSessions,
  rightsWindows,
  streamRenditions,
  streams,
} from "@/server/db/schema";
import { getEnvironment } from "@/server/environment";
import type { EntitlementGrant } from "@/server/entitlements/evaluate-entitlement";
import { privateJson, rateLimitHeaders } from "@/server/http/api-response";
import { createLogger } from "@/server/observability/logger";
import {
  appendPlaybackToken,
  mapDatabaseRightsWindow,
  normalizeHttpUrl,
  toPlayerSource,
  type AuthorizationStream,
} from "@/server/playback/authorization";
import { resolveRights } from "@/server/rights/resolve-rights";
import { createPlaybackToken } from "@/server/security/playback-token";
import { checkRequestCsrf, consumeApiRateLimit } from "@/server/security/request-guards";

const requestSchema = z.object({ contentType: z.enum(CONTENT_TYPES).default("live") }).strict();
const paramsSchema = z.object({ eventId: z.string().uuid() });
const PLAYBACK_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const;
const logger = createLogger({ service: "rada-playback-authorization" });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const requestId = randomUUID();
  try {
    const viewer = await getViewerContext(request);
    if (!viewer) {
      return privateJson({ allowed: false, reason: "unauthorized" }, { status: 401 });
    }
    const csrf = checkRequestCsrf(request, viewer.csrfSecretHash);
    if (!csrf.allowed) {
      return privateJson({ error: { code: "csrf_failed" } }, { status: 403 });
    }
    const rateLimit = await consumeApiRateLimit(
      "playback-authorization",
      viewer.profileId,
      PLAYBACK_RATE_LIMIT,
    );
    const responseHeaders = rateLimitHeaders(rateLimit);
    if (!rateLimit.allowed) {
      return privateJson(
        { error: { code: "rate_limited" } },
        { status: 429, headers: responseHeaders },
      );
    }

    const parsedParams = paramsSchema.safeParse(await context.params);
    const parsedBody = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsedParams.success || !parsedBody.success) {
      return privateJson(
        { error: { code: "invalid_request" } },
        { status: 400, headers: responseHeaders },
      );
    }

    const now = new Date();
    const environment = getEnvironment();
    return await db.transaction(async (tx) => {
      // Serializes the count-and-lease operation per profile across application replicas.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${viewer.profileId}, 0))`);

      const [event] = await tx
        .select({
          id: events.id,
          competitionId: events.competitionId,
          sportId: competitions.sportId,
          state: events.state,
          ageRating: events.ageRating,
          version: events.version,
        })
        .from(events)
        .innerJoin(competitions, eq(competitions.id, events.competitionId))
        .where(eq(events.id, parsedParams.data.eventId))
        .limit(1);
      if (!event) {
        return privateJson(
          { error: { code: "event_not_found" } },
          { status: 404, headers: responseHeaders },
        );
      }
      if (event.ageRating > viewer.maturityLimit) {
        return privateJson(
          { error: { code: "age_restricted" } },
          { status: 403, headers: responseHeaders },
        );
      }
      if (event.state === "cancelled") {
        return privateJson(
          { error: { code: "event_cancelled" } },
          { status: 409, headers: responseHeaders },
        );
      }

      const streamRows: AuthorizationStream[] = await tx
        .select({
          id: streams.id,
          protocol: streams.protocol,
          state: streams.state,
          priority: streams.priority,
          playbackLocator: streams.playbackLocator,
          externalWatchUrl: streams.externalWatchUrl,
          provider: streams.provider,
          requiresSignedAccess: streams.requiresSignedAccess,
          dvrWindowSeconds: streams.dvrWindowSeconds,
          captionsAvailable: streams.captionsAvailable,
          audioTracks: streams.audioTracks,
        })
        .from(streams)
        .where(eq(streams.eventId, event.id));
      const mediaRows = await tx
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(eq(mediaAssets.eventId, event.id));

      const targetConditions: SQL[] = [
        eq(rightsWindows.eventId, event.id),
        eq(rightsWindows.competitionId, event.competitionId),
      ];
      if (streamRows.length > 0) {
        targetConditions.push(
          inArray(
            rightsWindows.streamId,
            streamRows.map((stream) => stream.id),
          ),
        );
      }
      if (mediaRows.length > 0) {
        targetConditions.push(
          inArray(
            rightsWindows.mediaAssetId,
            mediaRows.map((asset) => asset.id),
          ),
        );
      }
      const targetCondition = or(...targetConditions);
      if (!targetCondition) {
        return privateJson(
          { error: { code: "not_available" } },
          { status: 403, headers: responseHeaders },
        );
      }

      const rightsRows = await tx
        .select()
        .from(rightsWindows)
        .where(and(eq(rightsWindows.contentKind, parsedBody.data.contentType), targetCondition));
      const entitlementRows = await tx
        .select()
        .from(entitlements)
        .where(and(eq(entitlements.userId, viewer.userId), isNull(entitlements.revokedAt)));
      const grants: EntitlementGrant[] = entitlementRows.map((entitlement) => ({
        id: entitlement.id,
        profileId: entitlement.profileId,
        productId: entitlement.productId,
        scope: { kind: "global" },
        validFrom: entitlement.startsAt,
        validUntil: entitlement.endsAt,
        revokedAt: entitlement.revokedAt,
      }));
      const [activeRow] = await tx
        .select({ value: count() })
        .from(playbackSessions)
        .where(
          and(
            eq(playbackSessions.profileId, viewer.profileId),
            isNull(playbackSessions.endedAt),
            or(
              and(
                eq(playbackSessions.state, "authorized"),
                gt(playbackSessions.authorizationExpiresAt, now),
              ),
              and(
                eq(playbackSessions.state, "playing"),
                gt(playbackSessions.lastHeartbeatAt, new Date(now.getTime() - 2 * 60_000)),
              ),
            ),
          ),
        );

      const resolution = resolveRights(
        rightsRows.map((row) =>
          mapDatabaseRightsWindow(row, event.id, event.competitionId, streamRows, event.version),
        ),
        {
          eventId: event.id,
          competitionId: event.competitionId,
          sportId: event.sportId,
          contentType: parsedBody.data.contentType,
          profileId: viewer.profileId,
          countryCode: environment.DEFAULT_COUNTRY,
          now,
          entitlements: grants,
          activePlaybackCount: Number(activeRow?.value ?? 0),
        },
      );

      if (!resolution.allowed) {
        return privateJson(
          { allowed: false, reason: resolution.reason },
          {
            status: resolution.reason === "concurrency-limit" ? 409 : 403,
            headers: responseHeaders,
          },
        );
      }
      if (resolution.delivery.kind === "external") {
        const externalDestination = normalizeHttpUrl(
          resolution.delivery.url,
          environment.APP_ORIGIN,
        );
        if (!externalDestination) {
          return privateJson(
            { allowed: false, reason: "stream_unavailable" },
            { status: 503, headers: { ...responseHeaders, "Retry-After": "10" } },
          );
        }
        return privateJson(
          {
            allowed: false,
            reason: "external-only",
            externalDestination,
          },
          { headers: responseHeaders },
        );
      }
      if (resolution.delivery.kind === "none") {
        return privateJson(
          { allowed: false, reason: "stream_unavailable" },
          { status: 503, headers: { ...responseHeaders, "Retry-After": "10" } },
        );
      }

      const internalStreamId = resolution.delivery.streamId;
      const stream = streamRows.find((candidate) => candidate.id === internalStreamId);
      if (
        !stream ||
        !stream.playbackLocator ||
        stream.state === "unavailable" ||
        stream.state === "provisioning"
      ) {
        return privateJson(
          { allowed: false, reason: "stream_unavailable" },
          { status: 503, headers: { ...responseHeaders, "Retry-After": "10" } },
        );
      }
      const playbackUrl = normalizeHttpUrl(stream.playbackLocator, environment.APP_ORIGIN);
      if (!playbackUrl) {
        return privateJson(
          { allowed: false, reason: "stream_unavailable" },
          { status: 503, headers: { ...responseHeaders, "Retry-After": "10" } },
        );
      }

      const secondsUntilRightsEnd = Math.floor(
        (resolution.window.validUntil.getTime() - now.getTime()) / 1_000,
      );
      const ttlSeconds = Math.min(90, secondsUntilRightsEnd);
      if (ttlSeconds < 15) {
        return privateJson(
          { allowed: false, reason: "rights_expiring" },
          { status: 403, headers: responseHeaders },
        );
      }

      const playbackSessionId = randomUUID();
      const tokenId = randomUUID();
      const protocol =
        stream.protocol === "webrtc" ? "whep" : stream.protocol === "ll_hls" ? "ll-hls" : "hls";
      const token = await createPlaybackToken(
        {
          profileId: viewer.profileId,
          playbackSessionId,
          eventId: event.id,
          streamId: stream.id,
          rightsWindowId: resolution.window.id,
          entitlementId: resolution.entitlementId ?? undefined,
          countryCode: environment.DEFAULT_COUNTRY,
          contentType: parsedBody.data.contentType,
          protocols: [protocol],
          policyVersion: resolution.window.policyVersion,
        },
        { secret: environment.MEDIA_SIGNING_SECRET, now, ttlSeconds, tokenId },
      );
      const authorizationExpiresAt = new Date(now.getTime() + ttlSeconds * 1_000);
      await tx.insert(playbackSessions).values({
        id: playbackSessionId,
        profileId: viewer.profileId,
        eventId: event.id,
        streamId: stream.id,
        entitlementId: resolution.entitlementId,
        tokenJtiHash: createHash("sha256").update(tokenId).digest("hex"),
        state: "authorized",
        countryCode: environment.DEFAULT_COUNTRY,
        authorizationExpiresAt,
        consentedTelemetry: viewer.analyticsConsent,
      });

      const locator = stream.requiresSignedAccess
        ? appendPlaybackToken(playbackUrl, token, environment.APP_ORIGIN)
        : playbackUrl;
      const renditions = await tx
        .select({
          id: streamRenditions.id,
          label: streamRenditions.label,
          width: streamRenditions.width,
          height: streamRenditions.height,
          videoBitrateKbps: streamRenditions.videoBitrateKbps,
          audioBitrateKbps: streamRenditions.audioBitrateKbps,
          codec: streamRenditions.codec,
          frameRate: streamRenditions.frameRate,
          dataSaver: streamRenditions.isDataSaver,
        })
        .from(streamRenditions)
        .where(eq(streamRenditions.streamId, stream.id));

      return privateJson(
        {
          allowed: true,
          delivery: stream.requiresSignedAccess ? "signed" : "public_demo",
          playbackSessionId,
          expiresAt: authorizationExpiresAt.toISOString(),
          sources: [toPlayerSource(stream, locator)],
          dvrPermitted:
            rightsRows.find((row) => row.id === resolution.window.id)?.dvrAllowed === true &&
            stream.dvrWindowSeconds > 0,
          dvrWindowSeconds:
            rightsRows.find((row) => row.id === resolution.window.id)?.dvrAllowed === true
              ? stream.dvrWindowSeconds
              : 0,
          captionsAvailable: stream.captionsAvailable,
          audioTracks: stream.audioTracks,
          renditions,
          rights: { windowId: resolution.window.id, countryCode: environment.DEFAULT_COUNTRY },
        },
        { status: 201, headers: responseHeaders },
      );
    });
  } catch (error) {
    logger.error({ requestId, error }, "playback authorization failed");
    return privateJson({ error: { code: "internal_error", requestId } }, { status: 500 });
  }
}
