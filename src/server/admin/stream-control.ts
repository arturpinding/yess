import { createHmac } from "node:crypto";
import { and, count, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import {
  auditLogs,
  events,
  playbackSessions,
  rightsWindows,
  streamRenditions,
  streams,
} from "@/server/db/schema";
import { getEnvironment } from "@/server/environment";

export const STREAM_PROTOCOLS = ["webrtc", "ll_hls", "hls", "external"] as const;
export const STREAM_STATES = [
  "provisioning",
  "ready",
  "live",
  "degraded",
  "ended",
  "unavailable",
] as const;

const reasonSchema = z.string().trim().min(3).max(500);
const expectedUpdatedAtSchema = z.string().datetime({ offset: true });
const providerValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "Control characters are not allowed");
const providerReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "Control characters are not allowed");
const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .superRefine((value, context) => {
    try {
      const url = new URL(value);
      if (!(["http:", "https:"] as string[]).includes(url.protocol)) {
        context.addIssue({ code: "custom", message: "Only HTTP(S) URLs are allowed" });
      }
      if (url.username || url.password) {
        context.addIssue({ code: "custom", message: "URL credentials are not allowed" });
      }
    } catch {
      context.addIssue({ code: "custom", message: "A valid absolute URL is required" });
    }
  });

const configurationFields = {
  protocol: z.enum(STREAM_PROTOCOLS),
  state: z.enum(STREAM_STATES),
  priority: z.number().int().min(0).max(32_767),
  playbackLocator: httpUrlSchema.nullable(),
  externalWatchUrl: httpUrlSchema.nullable(),
  provider: providerValueSchema,
  providerStreamRef: providerReferenceSchema,
  requiresSignedAccess: z.boolean(),
  dvrWindowSeconds: z.number().int().min(0).max(2_592_000),
  captionsAvailable: z.boolean(),
} as const;

function validateLocatorInvariant(
  value: {
    protocol: (typeof STREAM_PROTOCOLS)[number];
    playbackLocator: string | null;
    externalWatchUrl: string | null;
  },
  context: z.RefinementCtx,
) {
  if (value.protocol === "external") {
    if (!value.externalWatchUrl) {
      context.addIssue({
        code: "custom",
        path: ["externalWatchUrl"],
        message: "External streams require an external watch URL",
      });
    }
    if (value.playbackLocator !== null) {
      context.addIssue({
        code: "custom",
        path: ["playbackLocator"],
        message: "External streams cannot have an internal playback locator",
      });
    }
    return;
  }

  if (!value.playbackLocator) {
    context.addIssue({
      code: "custom",
      path: ["playbackLocator"],
      message: "Internal streams require a playback locator",
    });
  }
  if (value.externalWatchUrl !== null) {
    context.addIssue({
      code: "custom",
      path: ["externalWatchUrl"],
      message: "Internal streams cannot have an external watch URL",
    });
  }
}

export const streamConfigurationSchema = z
  .object(configurationFields)
  .strict()
  .superRefine(validateLocatorInvariant);

export const createAdminStreamSchema = z
  .object({
    eventId: z.string().uuid(),
    reason: reasonSchema,
    protocol: configurationFields.protocol,
    state: configurationFields.state.default("provisioning"),
    priority: configurationFields.priority.default(100),
    playbackLocator: configurationFields.playbackLocator.default(null),
    externalWatchUrl: configurationFields.externalWatchUrl.default(null),
    provider: configurationFields.provider,
    providerStreamRef: configurationFields.providerStreamRef,
    requiresSignedAccess: configurationFields.requiresSignedAccess.default(true),
    dvrWindowSeconds: configurationFields.dvrWindowSeconds.default(0),
    captionsAvailable: configurationFields.captionsAvailable.default(false),
  })
  .strict()
  .superRefine(validateLocatorInvariant);

const editablePatchFields = {
  protocol: configurationFields.protocol.optional(),
  state: configurationFields.state.optional(),
  priority: configurationFields.priority.optional(),
  playbackLocator: configurationFields.playbackLocator.optional(),
  externalWatchUrl: configurationFields.externalWatchUrl.optional(),
  provider: configurationFields.provider.optional(),
  providerStreamRef: configurationFields.providerStreamRef.optional(),
  requiresSignedAccess: configurationFields.requiresSignedAccess.optional(),
  dvrWindowSeconds: configurationFields.dvrWindowSeconds.optional(),
  captionsAvailable: configurationFields.captionsAvailable.optional(),
} as const;

const EDITABLE_PATCH_KEYS = Object.keys(editablePatchFields) as Array<
  keyof typeof editablePatchFields
>;

export const updateAdminStreamSchema = z
  .object({
    reason: reasonSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
    ...editablePatchFields,
  })
  .strict()
  .refine((value) => EDITABLE_PATCH_KEYS.some((key) => value[key] !== undefined), {
    message: "At least one editable field is required",
  });

export const deleteAdminStreamSchema = z
  .object({ reason: reasonSchema, expectedUpdatedAt: expectedUpdatedAtSchema })
  .strict();

export type StreamConfiguration = z.infer<typeof streamConfigurationSchema>;
export type CreateAdminStreamInput = z.infer<typeof createAdminStreamSchema>;
export type UpdateAdminStreamInput = z.infer<typeof updateAdminStreamSchema>;
export type DeleteAdminStreamInput = z.infer<typeof deleteAdminStreamSchema>;

type StreamRow = typeof streams.$inferSelect;

export type AdminStreamRecord = StreamRow & {
  eventTitleEt: string;
  eventTitleEn: string;
};

export interface AdminStreamDto {
  id: string;
  eventId: string;
  eventTitle: { et: string; en: string };
  protocol: StreamRow["protocol"];
  state: StreamRow["state"];
  priority: number;
  playbackLocator: string | null;
  externalWatchUrl: string | null;
  provider: string;
  providerStreamRef: string;
  requiresSignedAccess: boolean;
  dvrWindowSeconds: number;
  captionsAvailable: boolean;
  isDemo: boolean;
  lastHealthyAt: string | null;
  updatedAt: string;
}

export interface AdminAuditContext {
  requestId: string;
  ipHash: string | null;
  userAgentSummary: string | null;
}

export class AdminStreamControlError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "AdminStreamControlError";
    this.code = code;
    this.status = status;
  }
}

export function toAdminStreamDto(record: AdminStreamRecord): AdminStreamDto {
  return {
    id: record.id,
    eventId: record.eventId,
    eventTitle: { et: record.eventTitleEt, en: record.eventTitleEn },
    protocol: record.protocol,
    state: record.state,
    priority: record.priority,
    playbackLocator: record.playbackLocator,
    externalWatchUrl: record.externalWatchUrl,
    provider: record.provider,
    providerStreamRef: record.providerStreamRef,
    requiresSignedAccess: record.requiresSignedAccess,
    dvrWindowSeconds: record.dvrWindowSeconds,
    captionsAvailable: record.captionsAvailable,
    isDemo: record.isDemo,
    lastHealthyAt: record.lastHealthyAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function readPatchValue<K extends keyof StreamConfiguration>(
  input: UpdateAdminStreamInput,
  existing: StreamConfiguration,
  key: K,
): StreamConfiguration[K] {
  return Object.prototype.hasOwnProperty.call(input, key)
    ? (input[key] as StreamConfiguration[K])
    : existing[key];
}

export function mergeStreamConfiguration(
  existing: StreamConfiguration,
  input: UpdateAdminStreamInput,
): StreamConfiguration {
  return {
    protocol: readPatchValue(input, existing, "protocol"),
    state: readPatchValue(input, existing, "state"),
    priority: readPatchValue(input, existing, "priority"),
    playbackLocator: readPatchValue(input, existing, "playbackLocator"),
    externalWatchUrl: readPatchValue(input, existing, "externalWatchUrl"),
    provider: readPatchValue(input, existing, "provider"),
    providerStreamRef: readPatchValue(input, existing, "providerStreamRef"),
    requiresSignedAccess: readPatchValue(input, existing, "requiresSignedAccess"),
    dvrWindowSeconds: readPatchValue(input, existing, "dvrWindowSeconds"),
    captionsAvailable: readPatchValue(input, existing, "captionsAvailable"),
  };
}

function redactUrlQuery(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    for (const key of new Set(url.searchParams.keys())) {
      url.searchParams.set(key, "[REDACTED]");
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "[INVALID_URL]";
  }
}

export function toAuditSnapshot(record: AdminStreamRecord): Record<string, unknown> {
  const dto = toAdminStreamDto(record);
  return {
    ...dto,
    playbackLocator: redactUrlQuery(dto.playbackLocator),
    externalWatchUrl: redactUrlQuery(dto.externalWatchUrl),
  };
}

export function createAdminAuditContext(request: Request, requestId: string): AdminAuditContext {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const clientIp = forwardedFor || realIp || null;
  const rawUserAgent = request.headers.get("user-agent")?.replace(/\s+/gu, " ").trim();
  return {
    requestId,
    ipHash: clientIp
      ? createHmac("sha256", getEnvironment().SESSION_SECRET).update(clientIp).digest("hex")
      : null,
    userAgentSummary: rawUserAgent ? rawUserAgent.slice(0, 240) : null,
  };
}

function streamConfigurationFromRecord(record: StreamRow): StreamConfiguration {
  return {
    protocol: record.protocol,
    state: record.state,
    priority: record.priority,
    playbackLocator: record.playbackLocator,
    externalWatchUrl: record.externalWatchUrl,
    provider: record.provider,
    providerStreamRef: record.providerStreamRef,
    requiresSignedAccess: record.requiresSignedAccess,
    dvrWindowSeconds: record.dvrWindowSeconds,
    captionsAvailable: record.captionsAvailable,
  };
}

function timestampsMatch(expectedUpdatedAt: string, actualUpdatedAt: Date): boolean {
  return new Date(expectedUpdatedAt).getTime() === actualUpdatedAt.getTime();
}

async function providerReferenceExists(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  provider: string,
  providerStreamRef: string,
  exceptStreamId?: string,
): Promise<boolean> {
  const condition = and(
    eq(streams.provider, provider),
    eq(streams.providerStreamRef, providerStreamRef),
    exceptStreamId ? ne(streams.id, exceptStreamId) : undefined,
  );
  const [duplicate] = await tx.select({ id: streams.id }).from(streams).where(condition).limit(1);
  return Boolean(duplicate);
}

function isPostgresCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: unknown };
  return candidate.code === code || isPostgresCode(candidate.cause, code);
}

export function isProviderReferenceConflict(error: unknown): boolean {
  return isPostgresCode(error, "23505");
}

export async function createAdminStream(
  input: CreateAdminStreamInput,
  audit: AdminAuditContext,
): Promise<AdminStreamDto> {
  return db.transaction(async (tx) => {
    const [event] = await tx
      .select({ id: events.id, titleEt: events.titleEt, titleEn: events.titleEn })
      .from(events)
      .where(eq(events.id, input.eventId))
      .limit(1);
    if (!event) throw new AdminStreamControlError("event_not_found", 404);

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`stream-provider:${input.provider}:${input.providerStreamRef}`}, 0))`,
    );
    if (await providerReferenceExists(tx, input.provider, input.providerStreamRef)) {
      throw new AdminStreamControlError("provider_reference_conflict", 409);
    }

    const now = new Date();
    const [inserted] = await tx
      .insert(streams)
      .values({
        eventId: input.eventId,
        protocol: input.protocol,
        state: input.state,
        priority: input.priority,
        playbackLocator: input.playbackLocator,
        externalWatchUrl: input.externalWatchUrl,
        provider: input.provider,
        providerStreamRef: input.providerStreamRef,
        requiresSignedAccess: input.requiresSignedAccess,
        dvrWindowSeconds: input.dvrWindowSeconds,
        captionsAvailable: input.captionsAvailable,
        isDemo: true,
        updatedAt: now,
      })
      .returning();
    if (!inserted) throw new Error("Stream insert returned no row");

    const record: AdminStreamRecord = {
      ...inserted,
      eventTitleEt: event.titleEt,
      eventTitleEn: event.titleEn,
    };
    await tx.insert(auditLogs).values({
      actorUserId: null,
      action: "stream.created",
      entityType: "stream",
      entityId: inserted.id,
      requestId: audit.requestId,
      reason: input.reason,
      before: null,
      after: toAuditSnapshot(record),
      ipHash: audit.ipHash,
      userAgentSummary: audit.userAgentSummary,
    });
    return toAdminStreamDto(record);
  });
}

export async function updateAdminStream(
  streamId: string,
  input: UpdateAdminStreamInput,
  audit: AdminAuditContext,
): Promise<AdminStreamDto> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`stream:${streamId}`}, 0))`,
    );
    const [existing] = await tx
      .select({
        stream: streams,
        eventTitleEt: events.titleEt,
        eventTitleEn: events.titleEn,
      })
      .from(streams)
      .innerJoin(events, eq(events.id, streams.eventId))
      .where(eq(streams.id, streamId))
      .limit(1);
    if (!existing) throw new AdminStreamControlError("stream_not_found", 404);
    if (!timestampsMatch(input.expectedUpdatedAt, existing.stream.updatedAt)) {
      throw new AdminStreamControlError("version_conflict", 409);
    }

    const configuration = mergeStreamConfiguration(
      streamConfigurationFromRecord(existing.stream),
      input,
    );
    const validatedConfiguration = streamConfigurationSchema.safeParse(configuration);
    if (!validatedConfiguration.success) {
      throw new AdminStreamControlError("invalid_stream_configuration", 400);
    }

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`stream-provider:${configuration.provider}:${configuration.providerStreamRef}`}, 0))`,
    );
    if (
      await providerReferenceExists(
        tx,
        configuration.provider,
        configuration.providerStreamRef,
        streamId,
      )
    ) {
      throw new AdminStreamControlError("provider_reference_conflict", 409);
    }

    const before: AdminStreamRecord = {
      ...existing.stream,
      eventTitleEt: existing.eventTitleEt,
      eventTitleEn: existing.eventTitleEn,
    };
    const [updated] = await tx
      .update(streams)
      .set({ ...validatedConfiguration.data, updatedAt: new Date() })
      .where(eq(streams.id, streamId))
      .returning();
    if (!updated) throw new Error("Stream update returned no row");

    const after: AdminStreamRecord = {
      ...updated,
      eventTitleEt: existing.eventTitleEt,
      eventTitleEn: existing.eventTitleEn,
    };
    await tx.insert(auditLogs).values({
      actorUserId: null,
      action: "stream.updated",
      entityType: "stream",
      entityId: streamId,
      requestId: audit.requestId,
      reason: input.reason,
      before: toAuditSnapshot(before),
      after: toAuditSnapshot(after),
      ipHash: audit.ipHash,
      userAgentSummary: audit.userAgentSummary,
    });
    return toAdminStreamDto(after);
  });
}

export interface DeleteAdminStreamResult {
  id: string;
  deleted: true;
  cascaded: { rightsWindows: number; renditions: number; playbackSessions: number };
}

export async function deleteAdminStream(
  streamId: string,
  input: DeleteAdminStreamInput,
  audit: AdminAuditContext,
): Promise<DeleteAdminStreamResult> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`stream:${streamId}`}, 0))`,
    );
    const [existing] = await tx
      .select({
        stream: streams,
        eventTitleEt: events.titleEt,
        eventTitleEn: events.titleEn,
      })
      .from(streams)
      .innerJoin(events, eq(events.id, streams.eventId))
      .where(eq(streams.id, streamId))
      .limit(1);
    if (!existing) throw new AdminStreamControlError("stream_not_found", 404);
    if (!timestampsMatch(input.expectedUpdatedAt, existing.stream.updatedAt)) {
      throw new AdminStreamControlError("version_conflict", 409);
    }
    if (!existing.stream.isDemo) {
      throw new AdminStreamControlError("demo_stream_required", 403);
    }
    if (existing.stream.state !== "ended" && existing.stream.state !== "unavailable") {
      throw new AdminStreamControlError("stream_must_be_inactive", 409);
    }

    const now = new Date();
    const [activePlayback] = await tx
      .select({ value: count() })
      .from(playbackSessions)
      .where(
        and(
          eq(playbackSessions.streamId, streamId),
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
    if (Number(activePlayback?.value ?? 0) > 0) {
      throw new AdminStreamControlError("active_playback_exists", 409);
    }

    const [rightsCount] = await tx
      .select({ value: count() })
      .from(rightsWindows)
      .where(eq(rightsWindows.streamId, streamId));
    const [renditionCount] = await tx
      .select({ value: count() })
      .from(streamRenditions)
      .where(eq(streamRenditions.streamId, streamId));
    const [playbackCount] = await tx
      .select({ value: count() })
      .from(playbackSessions)
      .where(eq(playbackSessions.streamId, streamId));
    const cascaded = {
      rightsWindows: Number(rightsCount?.value ?? 0),
      renditions: Number(renditionCount?.value ?? 0),
      playbackSessions: Number(playbackCount?.value ?? 0),
    };

    const before: AdminStreamRecord = {
      ...existing.stream,
      eventTitleEt: existing.eventTitleEt,
      eventTitleEn: existing.eventTitleEn,
    };
    await tx.delete(streams).where(eq(streams.id, streamId));
    await tx.insert(auditLogs).values({
      actorUserId: null,
      action: "stream.deleted",
      entityType: "stream",
      entityId: streamId,
      requestId: audit.requestId,
      reason: input.reason,
      before: toAuditSnapshot(before),
      after: { deleted: true, cascaded },
      ipHash: audit.ipHash,
      userAgentSummary: audit.userAgentSummary,
    });
    return { id: streamId, deleted: true, cascaded };
  });
}
