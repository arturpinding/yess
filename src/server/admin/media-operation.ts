import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import {
  auditLogs,
  events,
  mediaProviderOperations,
  mediaProviderResources,
  streams,
} from "@/server/db/schema";
import {
  MEDIA_PROVIDER_ACTIONS,
  MediaProviderError,
  type MediaProvider,
  type MediaProviderAction,
  type MediaProviderResourceState,
  type MediaProviderResult,
} from "@/server/media-providers/contracts";
import { getConfiguredMediaProvider } from "@/server/media-providers/http-provider";
import { createLogger } from "@/server/observability/logger";
import {
  AdminStreamControlError,
  toAdminStreamDto,
  toAuditSnapshot,
  type AdminAuditContext,
  type AdminStreamDto,
  type AdminStreamRecord,
} from "./stream-control";

const reasonSchema = z.string().trim().min(3).max(500);
const expectedUpdatedAtSchema = z.string().datetime({ offset: true });
const logger = createLogger({ service: "rada-admin-media-operation" });

/** Longer than the provider timeout, leaving ample room for slow completion writes. */
export const MEDIA_OPERATION_STALE_AFTER_MS = 5 * 60_000;
export const STALE_PENDING_RECOVERY_CODE = "stale_pending_recovered_by_refresh";

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(180)
  .regex(/^[A-Za-z0-9._:-]+$/u);

export const adminMediaOperationSchema = z
  .object({
    action: z.enum(MEDIA_PROVIDER_ACTIONS),
    reason: reasonSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .strict();

export type AdminMediaOperationInput = z.infer<typeof adminMediaOperationSchema>;

export type PendingOperationRecoveryDecision =
  | { kind: "recover" }
  | {
      kind: "block";
      code:
        | "operation_in_progress"
        | "stale_operation_requires_refresh"
        | "stale_operation_requires_new_idempotency_key";
    };

/**
 * Only refresh is safe to issue after an operation's outcome became unknown.
 * It observes provider state; it never replays the abandoned state-changing
 * command. A new key keeps both attempts independently attributable.
 */
export function classifyPendingOperationRecovery(
  pending: { idempotencyKey: string; updatedAt: Date },
  requested: { action: MediaProviderAction; idempotencyKey: string },
  now: Date,
  staleAfterMs = MEDIA_OPERATION_STALE_AFTER_MS,
): PendingOperationRecoveryDecision {
  const ageMs = now.getTime() - pending.updatedAt.getTime();
  if (ageMs < staleAfterMs) return { kind: "block", code: "operation_in_progress" };
  if (requested.action !== "refresh") {
    return { kind: "block", code: "stale_operation_requires_refresh" };
  }
  if (requested.idempotencyKey === pending.idempotencyKey) {
    return {
      kind: "block",
      code: "stale_operation_requires_new_idempotency_key",
    };
  }
  return { kind: "recover" };
}

export interface AdminMediaResourceDto {
  id: string;
  streamId: string;
  providerKey: string;
  providerResourceId: string;
  desiredState: MediaProviderResourceState;
  observedState: MediaProviderResourceState;
  playbackLocator: string | null;
  generation: number;
  lastHealthyAt: string | null;
  lastErrorCode: string | null;
  updatedAt: string;
}

export interface AdminMediaOperationDto {
  id: string;
  streamId: string;
  action: MediaProviderAction;
  state: "pending" | "succeeded" | "failed";
  idempotencyKey: string;
  providerRequestId: string | null;
  errorCode: string | null;
  requestedAt: string;
  completedAt: string | null;
}

export interface AdminMediaOperationResult {
  operation: AdminMediaOperationDto;
  resource: AdminMediaResourceDto;
  stream: AdminStreamDto;
}

interface MediaOperationDependencies {
  providerFor(providerKey: string): MediaProvider;
  now(): Date;
}

const defaultDependencies: MediaOperationDependencies = {
  providerFor: getConfiguredMediaProvider,
  now: () => new Date(),
};

type ResourceRow = typeof mediaProviderResources.$inferSelect;
type OperationRow = typeof mediaProviderOperations.$inferSelect;

function desiredStateFor(
  action: MediaProviderAction,
  current: MediaProviderResourceState,
): MediaProviderResourceState {
  if (action === "provision") return "provisioned";
  if (action === "start" || action === "unpublish") return "encoding";
  if (action === "publish") return "published";
  if (action === "stop") return "stopped";
  return current;
}

export function streamStateForProviderResult(
  result: Pick<MediaProviderResult, "observedState" | "healthy">,
): "provisioning" | "live" | "degraded" | "ended" | "unavailable" {
  if (result.observedState === "published") return result.healthy ? "live" : "degraded";
  if (result.observedState === "provisioned" || result.observedState === "encoding") {
    return "provisioning";
  }
  if (result.observedState === "stopped") return "ended";
  return "unavailable";
}

export function reconcileProviderResult(
  action: MediaProviderAction,
  result: Pick<MediaProviderResult, "observedState" | "healthy" | "playbackLocator">,
  currentPlaybackLocator: string | null,
): {
  state: "provisioning" | "live" | "degraded" | "ended" | "unavailable";
  playbackLocator: string | null;
} {
  if (
    action === "refresh" &&
    (result.observedState !== "published" || result.playbackLocator === null)
  ) {
    // Internal streams have a database-level non-null locator invariant. The
    // catalogue value remains inert while unavailable; the provider-resource
    // locator is cleared by the completion transaction.
    return { state: "unavailable", playbackLocator: currentPlaybackLocator };
  }
  return {
    state: streamStateForProviderResult(result),
    playbackLocator:
      action === "refresh"
        ? result.playbackLocator
        : (result.playbackLocator ?? currentPlaybackLocator),
  };
}

function requestHash(streamId: string, input: AdminMediaOperationInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        streamId,
        action: input.action,
        expectedUpdatedAt: input.expectedUpdatedAt,
        reason: input.reason,
      }),
    )
    .digest("hex");
}

function timestampsMatch(expected: string, actual: Date): boolean {
  return new Date(expected).getTime() === actual.getTime();
}

function resourceDto(resource: ResourceRow): AdminMediaResourceDto {
  return {
    id: resource.id,
    streamId: resource.streamId,
    providerKey: resource.providerKey,
    providerResourceId: resource.providerResourceId,
    desiredState: resource.desiredState,
    observedState: resource.observedState,
    playbackLocator: resource.playbackLocator,
    generation: resource.generation,
    lastHealthyAt: resource.lastHealthyAt?.toISOString() ?? null,
    lastErrorCode: resource.lastErrorCode,
    updatedAt: resource.updatedAt.toISOString(),
  };
}

function operationDto(operation: OperationRow): AdminMediaOperationDto {
  return {
    id: operation.id,
    streamId: operation.streamId,
    action: operation.action,
    state: operation.state,
    idempotencyKey: operation.idempotencyKey,
    providerRequestId: operation.providerRequestId,
    errorCode: operation.errorCode,
    requestedAt: operation.requestedAt.toISOString(),
    completedAt: operation.completedAt?.toISOString() ?? null,
  };
}

function isStoredResult(value: unknown): value is AdminMediaOperationResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AdminMediaOperationResult>;
  return Boolean(candidate.operation?.id && candidate.resource?.id && candidate.stream?.id);
}

interface PreparedOperation {
  operationId: string;
  providerKey: string;
  providerResourceId: string;
  before: AdminStreamRecord;
  cached: AdminMediaOperationResult | null;
}

async function prepareOperation(
  streamId: string,
  input: AdminMediaOperationInput,
  idempotencyKey: string,
  audit: AdminAuditContext,
  now: Date,
): Promise<PreparedOperation> {
  const hash = requestHash(streamId, input);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`media-operation:${idempotencyKey}`}, 0))`,
    );
    const [existingOperation] = await tx
      .select()
      .from(mediaProviderOperations)
      .where(eq(mediaProviderOperations.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existingOperation) {
      if (existingOperation.requestHash !== hash) {
        throw new AdminStreamControlError("idempotency_conflict", 409);
      }
      if (existingOperation.state === "pending") {
        const decision = classifyPendingOperationRecovery(
          existingOperation,
          { action: input.action, idempotencyKey },
          now,
        );
        if (decision.kind === "block") {
          throw new AdminStreamControlError(decision.code, 409);
        }
        // An existing operation necessarily owns this key, so recovery cannot
        // create a separately attributable replacement with it.
        throw new AdminStreamControlError("stale_operation_requires_new_idempotency_key", 409);
      }
      if (existingOperation.state === "failed") {
        throw new AdminStreamControlError(
          existingOperation.errorCode ?? "previous_operation_failed",
          409,
        );
      }
      if (isStoredResult(existingOperation.safeResult)) {
        return {
          operationId: existingOperation.id,
          providerKey: "",
          providerResourceId: "",
          before: {} as AdminStreamRecord,
          cached: existingOperation.safeResult,
        };
      }
      throw new AdminStreamControlError("operation_result_unavailable", 409);
    }

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
    if (existing.stream.provider !== "local-ffmpeg") {
      throw new AdminStreamControlError("provider_not_configured", 422);
    }
    if (existing.stream.protocol !== "hls") {
      throw new AdminStreamControlError("provider_protocol_unsupported", 422);
    }

    const [pending] = await tx
      .select({
        id: mediaProviderOperations.id,
        action: mediaProviderOperations.action,
        idempotencyKey: mediaProviderOperations.idempotencyKey,
        requestedAt: mediaProviderOperations.requestedAt,
        updatedAt: mediaProviderOperations.updatedAt,
      })
      .from(mediaProviderOperations)
      .where(
        and(
          eq(mediaProviderOperations.streamId, streamId),
          eq(mediaProviderOperations.state, "pending"),
        ),
      )
      .limit(1);
    let recoveredPending:
      | {
          id: string;
          action: MediaProviderAction;
          requestedAt: Date;
          updatedAt: Date;
        }
      | undefined;
    if (pending) {
      const decision = classifyPendingOperationRecovery(
        pending,
        { action: input.action, idempotencyKey },
        now,
      );
      if (decision.kind === "block") {
        throw new AdminStreamControlError(decision.code, 409);
      }

      const [recovered] = await tx
        .update(mediaProviderOperations)
        .set({
          state: "failed",
          errorCode: STALE_PENDING_RECOVERY_CODE,
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(mediaProviderOperations.id, pending.id),
            eq(mediaProviderOperations.state, "pending"),
          ),
        )
        .returning({
          id: mediaProviderOperations.id,
          action: mediaProviderOperations.action,
          requestedAt: mediaProviderOperations.requestedAt,
          updatedAt: mediaProviderOperations.updatedAt,
        });
      if (!recovered) throw new AdminStreamControlError("operation_already_completed", 409);
      recoveredPending = recovered;
    }

    let [resource] = await tx
      .select()
      .from(mediaProviderResources)
      .where(eq(mediaProviderResources.streamId, streamId))
      .limit(1);
    if (resource) {
      if (
        resource.providerKey !== existing.stream.provider ||
        resource.providerResourceId !== existing.stream.providerStreamRef
      ) {
        throw new AdminStreamControlError("provider_resource_mismatch", 409);
      }
    } else {
      [resource] = await tx
        .insert(mediaProviderResources)
        .values({
          streamId,
          providerKey: existing.stream.provider,
          providerResourceId: existing.stream.providerStreamRef,
          desiredState: "absent",
          observedState: "absent",
          updatedAt: now,
        })
        .returning();
    }
    if (!resource) throw new Error("Provider resource insert returned no row");

    const desiredState = desiredStateFor(input.action, resource.desiredState);
    [resource] = await tx
      .update(mediaProviderResources)
      .set({
        desiredState,
        generation:
          input.action === "refresh"
            ? resource.generation
            : sql`${mediaProviderResources.generation} + 1`,
        lastErrorCode: recoveredPending ? STALE_PENDING_RECOVERY_CODE : resource.lastErrorCode,
        updatedAt: now,
      })
      .where(eq(mediaProviderResources.id, resource.id))
      .returning();
    if (!resource) throw new Error("Provider resource update returned no row");

    const [operation] = await tx
      .insert(mediaProviderOperations)
      .values({
        streamId,
        resourceId: resource.id,
        action: input.action,
        idempotencyKey,
        requestHash: hash,
        reason: input.reason,
        attempts: 1,
        requestedAt: now,
        updatedAt: now,
      })
      .returning();
    if (!operation) throw new Error("Provider operation insert returned no row");

    if (recoveredPending) {
      await tx.insert(auditLogs).values({
        actorUserId: null,
        action: "stream.provider.stale_pending.recovered",
        entityType: "stream",
        entityId: existing.stream.id,
        requestId: audit.requestId,
        reason: input.reason,
        before: {
          stream: {
            id: existing.stream.id,
            state: existing.stream.state,
            updatedAt: existing.stream.updatedAt.toISOString(),
          },
          abandonedOperation: {
            id: recoveredPending.id,
            action: recoveredPending.action,
            state: "pending",
            requestedAt: recoveredPending.requestedAt.toISOString(),
          },
        },
        after: {
          abandonedOperation: {
            id: recoveredPending.id,
            state: "failed",
            errorCode: STALE_PENDING_RECOVERY_CODE,
          },
          recoveryOperation: {
            id: operation.id,
            action: "refresh",
            state: "pending",
          },
        },
        ipHash: audit.ipHash,
        userAgentSummary: audit.userAgentSummary,
      });
    }

    return {
      operationId: operation.id,
      providerKey: existing.stream.provider,
      providerResourceId: existing.stream.providerStreamRef,
      before: {
        ...existing.stream,
        eventTitleEt: existing.eventTitleEt,
        eventTitleEn: existing.eventTitleEn,
      },
      cached: null,
    };
  });
}

async function completeSuccess(
  prepared: PreparedOperation,
  providerResult: MediaProviderResult,
  input: AdminMediaOperationInput,
  audit: AdminAuditContext,
  now: Date,
): Promise<AdminMediaOperationResult> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`stream:${prepared.before.id}`}, 0))`,
    );
    const [current] = await tx
      .select({
        stream: streams,
        eventTitleEt: events.titleEt,
        eventTitleEn: events.titleEn,
      })
      .from(streams)
      .innerJoin(events, eq(events.id, streams.eventId))
      .where(eq(streams.id, prepared.before.id))
      .limit(1);
    if (!current) throw new AdminStreamControlError("stream_not_found", 404);
    const reconciliation = reconcileProviderResult(
      input.action,
      providerResult,
      current.stream.playbackLocator,
    );
    const [resource] = await tx
      .update(mediaProviderResources)
      .set({
        observedState: providerResult.observedState,
        playbackLocator:
          input.action === "refresh"
            ? providerResult.observedState === "published"
              ? providerResult.playbackLocator
              : null
            : providerResult.playbackLocator,
        lastHealthyAt: providerResult.healthy ? new Date(providerResult.occurredAt) : null,
        lastErrorCode: null,
        updatedAt: now,
      })
      .where(eq(mediaProviderResources.streamId, prepared.before.id))
      .returning();
    if (!resource) throw new Error("Provider resource completion returned no row");

    const [updatedStream] = await tx
      .update(streams)
      .set({
        state: reconciliation.state,
        playbackLocator: reconciliation.playbackLocator,
        lastHealthyAt: providerResult.healthy
          ? new Date(providerResult.occurredAt)
          : current.stream.lastHealthyAt,
        updatedAt: now,
      })
      .where(eq(streams.id, prepared.before.id))
      .returning();
    if (!updatedStream) throw new Error("Stream operation completion returned no row");
    const after: AdminStreamRecord = {
      ...updatedStream,
      eventTitleEt: current.eventTitleEt,
      eventTitleEn: current.eventTitleEn,
    };

    const [operation] = await tx
      .update(mediaProviderOperations)
      .set({
        state: "succeeded",
        providerRequestId: providerResult.providerRequestId,
        errorCode: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(mediaProviderOperations.id, prepared.operationId),
          eq(mediaProviderOperations.state, "pending"),
        ),
      )
      .returning();
    if (!operation) throw new AdminStreamControlError("operation_already_completed", 409);

    const result: AdminMediaOperationResult = {
      operation: operationDto(operation),
      resource: resourceDto(resource),
      stream: toAdminStreamDto(after),
    };
    const [storedOperation] = await tx
      .update(mediaProviderOperations)
      .set({ safeResult: result as unknown as Record<string, unknown>, updatedAt: now })
      .where(eq(mediaProviderOperations.id, operation.id))
      .returning();
    if (!storedOperation) throw new Error("Provider result persistence returned no row");
    result.operation = operationDto(storedOperation);

    await tx.insert(auditLogs).values({
      actorUserId: null,
      action: `stream.provider.${input.action}`,
      entityType: "stream",
      entityId: prepared.before.id,
      requestId: audit.requestId,
      reason: input.reason,
      before: toAuditSnapshot(prepared.before),
      after: {
        ...toAuditSnapshot(after),
        providerOperation: {
          id: operation.id,
          action: input.action,
          observedState: providerResult.observedState,
          providerRequestId: providerResult.providerRequestId,
        },
      },
      ipHash: audit.ipHash,
      userAgentSummary: audit.userAgentSummary,
    });
    return result;
  });
}

async function completeFailure(
  prepared: PreparedOperation,
  input: AdminMediaOperationInput,
  audit: AdminAuditContext,
  code: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`stream:${prepared.before.id}`}, 0))`,
    );
    const [operation] = await tx
      .update(mediaProviderOperations)
      .set({ state: "failed", errorCode: code, completedAt: now, updatedAt: now })
      .where(
        and(
          eq(mediaProviderOperations.id, prepared.operationId),
          eq(mediaProviderOperations.state, "pending"),
        ),
      )
      .returning({ id: mediaProviderOperations.id });
    // A recovery refresh may already have superseded this unknown operation.
    // A late failure must not overwrite the newer observed state.
    if (!operation) return;
    const resourceFailure =
      input.action === "refresh"
        ? {
            observedState: "failed" as const,
            playbackLocator: null,
            lastErrorCode: code,
            updatedAt: now,
          }
        : { lastErrorCode: code, updatedAt: now };
    await tx
      .update(mediaProviderResources)
      .set(resourceFailure)
      .where(eq(mediaProviderResources.streamId, prepared.before.id));
    if (input.action === "refresh") {
      await tx
        .update(streams)
        .set({ state: "unavailable", updatedAt: now })
        .where(eq(streams.id, prepared.before.id));
    }
    await tx.insert(auditLogs).values({
      actorUserId: null,
      action: `stream.provider.${input.action}.failed`,
      entityType: "stream",
      entityId: prepared.before.id,
      requestId: audit.requestId,
      reason: input.reason,
      before: toAuditSnapshot(prepared.before),
      after: {
        operationId: prepared.operationId,
        state: "failed",
        errorCode: code,
        ...(input.action === "refresh"
          ? { resourceObservedState: "failed", streamState: "unavailable" }
          : {}),
      },
      ipHash: audit.ipHash,
      userAgentSummary: audit.userAgentSummary,
    });
  });
}

export async function operateAdminStream(
  streamId: string,
  input: AdminMediaOperationInput,
  idempotencyKey: string,
  audit: AdminAuditContext,
  dependencies: MediaOperationDependencies = defaultDependencies,
): Promise<AdminMediaOperationResult> {
  const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
  if (!parsedKey.success) throw new AdminStreamControlError("invalid_idempotency_key", 400);
  const startedAt = dependencies.now();
  const prepared = await prepareOperation(streamId, input, parsedKey.data, audit, startedAt);
  if (prepared.cached) return prepared.cached;

  try {
    const provider = dependencies.providerFor(prepared.providerKey);
    const providerResult = await provider.execute({
      providerKey: prepared.providerKey,
      providerResourceId: prepared.providerResourceId,
      action: input.action,
      idempotencyKey: parsedKey.data,
    });
    return await completeSuccess(prepared, providerResult, input, audit, dependencies.now());
  } catch (error) {
    const code =
      error instanceof MediaProviderError || error instanceof AdminStreamControlError
        ? error.code
        : "provider_operation_failed";
    await completeFailure(prepared, input, audit, code, dependencies.now());
    if (error instanceof AdminStreamControlError) throw error;
    if (error instanceof MediaProviderError) {
      throw new AdminStreamControlError(error.code, error.status);
    }
    logger.error(
      { err: error, requestId: audit.requestId, streamId, action: input.action },
      "Media provider operation completion failed",
    );
    throw new AdminStreamControlError("provider_operation_failed", 502);
  }
}

export async function listAdminMediaResources(): Promise<{
  resources: AdminMediaResourceDto[];
  operations: AdminMediaOperationDto[];
}> {
  const [resourceRows, operationRows] = await Promise.all([
    db.select().from(mediaProviderResources).orderBy(desc(mediaProviderResources.updatedAt)),
    db
      .select()
      .from(mediaProviderOperations)
      .orderBy(desc(mediaProviderOperations.requestedAt))
      .limit(100),
  ]);
  return {
    resources: resourceRows.map(resourceDto),
    operations: operationRows.map(operationDto),
  };
}
