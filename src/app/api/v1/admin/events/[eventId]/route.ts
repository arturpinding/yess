import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { type NextRequest } from "next/server";
import {
  adminEventParamsSchema,
  adminEventPatchSchema,
  auditEventSnapshot,
  planAdminEventUpdate,
  serializeAdminEvent,
  type AdminEventSnapshot,
} from "@/server/admin/event-control";
import { db } from "@/server/db/client";
import { auditLogs, events, venues } from "@/server/db/schema";
import { privateJson, rateLimitHeaders } from "@/server/http/api-response";
import { createLogger } from "@/server/observability/logger";
import { checkRequestCsrf, consumeApiRateLimit } from "@/server/security/request-guards";

const EVENT_CONTROL_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const;
const logger = createLogger({ service: "rada-admin-event-control" });

type MutationResult =
  | { kind: "success"; event: AdminEventSnapshot; action: string }
  | { kind: "event_not_found" }
  | { kind: "venue_not_found" }
  | { kind: "version_conflict"; currentVersion: number }
  | {
      kind: "invalid_transition";
      from: AdminEventSnapshot["state"];
      to: AdminEventSnapshot["state"];
    }
  | { kind: "invalid_schedule"; message: string };

function summarizeUserAgent(request: NextRequest): string | undefined {
  const value = request.headers
    .get("user-agent")
    ?.replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
  return value ? value.slice(0, 240) : undefined;
}

function csrfRateLimitSubject(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function responseForMutationError(
  result: Exclude<MutationResult, { kind: "success" }>,
  headers: Record<string, string>,
  requestId: string,
) {
  switch (result.kind) {
    case "event_not_found":
      return privateJson(
        { error: { code: "event_not_found" }, requestId },
        { status: 404, headers },
      );
    case "venue_not_found":
      return privateJson(
        { error: { code: "venue_not_found" }, requestId },
        { status: 404, headers },
      );
    case "version_conflict":
      return privateJson(
        {
          error: { code: "version_conflict", currentVersion: result.currentVersion },
          requestId,
        },
        { status: 409, headers },
      );
    case "invalid_transition":
      return privateJson(
        {
          error: { code: "invalid_transition", from: result.from, to: result.to },
          requestId,
        },
        { status: 409, headers },
      );
    case "invalid_schedule":
      return privateJson(
        { error: { code: "invalid_schedule", message: result.message }, requestId },
        { status: 409, headers },
      );
  }
}

/**
 * Development control-room mutation. Production deliberately responds as if
 * this capability does not exist until operator SSO and RBAC are connected.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  if (process.env.NODE_ENV === "production") {
    return privateJson({ error: { code: "not_found" } }, { status: 404 });
  }

  const requestId = randomUUID();
  const csrf = checkRequestCsrf(request);
  if (!csrf.allowed) {
    return privateJson({ error: { code: "csrf_failed" }, requestId }, { status: 403 });
  }

  const rateLimit = await consumeApiRateLimit(
    "admin-event-control",
    csrfRateLimitSubject(csrf.token),
    EVENT_CONTROL_RATE_LIMIT,
  );
  const responseHeaders = rateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return privateJson(
      { error: { code: "rate_limited" }, requestId },
      { status: 429, headers: responseHeaders },
    );
  }

  const [parsedParams, parsedBody] = await Promise.all([
    context.params.then((params) => adminEventParamsSchema.safeParse(params)),
    request
      .json()
      .catch(() => null)
      .then((body) => adminEventPatchSchema.safeParse(body)),
  ]);
  if (!parsedParams.success || !parsedBody.success) {
    return privateJson(
      {
        error: {
          code: "invalid_request",
          fields: {
            ...(parsedParams.success ? {} : parsedParams.error.flatten().fieldErrors),
            ...(parsedBody.success ? {} : parsedBody.error.flatten().fieldErrors),
          },
        },
        requestId,
      },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const result: MutationResult = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: events.id,
          titleEt: events.titleEt,
          titleEn: events.titleEn,
          state: events.state,
          scheduledStartAt: events.scheduledStartAt,
          actualStartAt: events.actualStartAt,
          endAt: events.endAt,
          venueId: events.venueId,
          venueName: venues.name,
          statusDetailEt: events.statusDetailEt,
          statusDetailEn: events.statusDetailEn,
          version: events.version,
          updatedAt: events.updatedAt,
        })
        .from(events)
        .leftJoin(venues, eq(venues.id, events.venueId))
        .where(eq(events.id, parsedParams.data.eventId))
        .limit(1);
      if (!current) return { kind: "event_not_found" };
      if (current.version !== parsedBody.data.version) {
        return { kind: "version_conflict", currentVersion: current.version };
      }

      let nextVenueName = current.venueName;
      if (
        parsedBody.data.venueId !== undefined &&
        parsedBody.data.venueId !== null &&
        parsedBody.data.venueId !== current.venueId
      ) {
        const [venue] = await tx
          .select({ id: venues.id, name: venues.name })
          .from(venues)
          .where(eq(venues.id, parsedBody.data.venueId))
          .limit(1);
        if (!venue) return { kind: "venue_not_found" };
        nextVenueName = venue.name;
      } else if (parsedBody.data.venueId === null) {
        nextVenueName = null;
      }

      const now = new Date();
      const plan = planAdminEventUpdate(current, parsedBody.data, now);
      if (!plan.ok) {
        if (plan.conflict.code === "invalid_transition") {
          return {
            kind: "invalid_transition",
            from: plan.conflict.from,
            to: plan.conflict.to,
          };
        }
        return { kind: "invalid_schedule", message: plan.conflict.message };
      }

      const [updated] = await tx
        .update(events)
        .set({
          ...plan.values,
          version: current.version + 1,
          updatedAt: now,
        })
        .where(and(eq(events.id, current.id), eq(events.version, parsedBody.data.version)))
        .returning({
          id: events.id,
          titleEt: events.titleEt,
          titleEn: events.titleEn,
          state: events.state,
          scheduledStartAt: events.scheduledStartAt,
          actualStartAt: events.actualStartAt,
          endAt: events.endAt,
          venueId: events.venueId,
          statusDetailEt: events.statusDetailEt,
          statusDetailEn: events.statusDetailEn,
          version: events.version,
          updatedAt: events.updatedAt,
        });
      if (!updated) return { kind: "version_conflict", currentVersion: current.version };

      const updatedSnapshot: AdminEventSnapshot = { ...updated, venueName: nextVenueName };
      const action = plan.transitionOverride
        ? "event.manual_transition_override"
        : "event.manual_update";
      await tx.insert(auditLogs).values({
        actorUserId: null,
        action,
        entityType: "event",
        entityId: current.id,
        requestId,
        reason: parsedBody.data.reason,
        before: auditEventSnapshot(current),
        after: auditEventSnapshot(updatedSnapshot),
        userAgentSummary: summarizeUserAgent(request),
      });

      return { kind: "success", event: updatedSnapshot, action };
    });

    if (result.kind !== "success") {
      return responseForMutationError(result, responseHeaders, requestId);
    }

    logger.info(
      {
        requestId,
        eventId: result.event.id,
        action: result.action,
        version: result.event.version,
      },
      "Admin event update committed",
    );
    return privateJson(
      { data: serializeAdminEvent(result.event), requestId },
      { headers: responseHeaders },
    );
  } catch (error) {
    logger.error(
      { error, requestId, eventId: parsedParams.data.eventId },
      "Admin event update failed",
    );
    return privateJson(
      { error: { code: "internal_error" }, requestId },
      { status: 500, headers: responseHeaders },
    );
  }
}
