import { createHmac } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import {
  auditLogs,
  competitions,
  events,
  mediaAssets,
  products,
  rightsWindows,
  streams,
} from "@/server/db/schema";
import { getEnvironment } from "@/server/environment";

export const RIGHTS_CONTENT_KINDS = ["live", "replay", "highlight"] as const;
export const RIGHTS_ACCESS_LEVELS = ["free", "entitled", "external_only", "unavailable"] as const;
export const RIGHTS_TARGET_TYPES = ["competition", "event", "stream", "media_asset"] as const;

const reasonSchema = z.string().trim().min(3).max(500);
const expectedUpdatedAtSchema = z.string().datetime({ offset: true });
const instantSchema = z.string().datetime({ offset: true });
const nullableCountryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, "Use an ISO 3166-1 alpha-2 country code")
  .transform((value) => value.toUpperCase())
  .nullable();
const cleanText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "Control characters are not allowed");
const nullableCleanText = (maximum: number) => cleanText(maximum).nullable();
const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .superRefine((value, context) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        context.addIssue({ code: "custom", message: "Only HTTP(S) URLs are allowed" });
      }
      if (url.username || url.password) {
        context.addIssue({ code: "custom", message: "URL credentials are not allowed" });
      }
    } catch {
      context.addIssue({ code: "custom", message: "A valid absolute URL is required" });
    }
  });

export const adminRightsTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("competition"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("event"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("stream"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("media_asset"), id: z.string().uuid() }).strict(),
]);

const configurationFields = {
  target: adminRightsTargetSchema,
  contentKind: z.enum(RIGHTS_CONTENT_KINDS),
  countryCode: nullableCountryCodeSchema,
  access: z.enum(RIGHTS_ACCESS_LEVELS),
  requiredProductId: z.string().uuid().nullable(),
  startsAt: instantSchema,
  endsAt: instantSchema,
  dvrAllowed: z.boolean(),
  recordingAllowed: z.boolean(),
  maxConcurrentStreams: z.number().int().min(1).max(32_767).nullable(),
  externalWatchUrl: httpUrlSchema.nullable(),
  rightsHolder: cleanText(180),
  contractReference: nullableCleanText(180),
  priority: z.number().int().min(0).max(32_767),
} as const;

function validateRightsConfiguration(
  value: {
    contentKind: (typeof RIGHTS_CONTENT_KINDS)[number];
    access: (typeof RIGHTS_ACCESS_LEVELS)[number];
    requiredProductId: string | null;
    startsAt: string;
    endsAt: string;
    dvrAllowed: boolean;
    recordingAllowed: boolean;
    maxConcurrentStreams: number | null;
    externalWatchUrl: string | null;
  },
  context: z.RefinementCtx,
) {
  if (new Date(value.endsAt).getTime() <= new Date(value.startsAt).getTime()) {
    context.addIssue({
      code: "custom",
      path: ["endsAt"],
      message: "The rights window must end after it starts",
    });
  }
  if (value.access === "entitled" && !value.requiredProductId) {
    context.addIssue({
      code: "custom",
      path: ["requiredProductId"],
      message: "Entitled access requires a product",
    });
  }
  if (value.access !== "entitled" && value.requiredProductId !== null) {
    context.addIssue({
      code: "custom",
      path: ["requiredProductId"],
      message: "Only entitled access can require a product",
    });
  }
  if (value.access === "external_only" && !value.externalWatchUrl) {
    context.addIssue({
      code: "custom",
      path: ["externalWatchUrl"],
      message: "External-only access requires a legal viewing URL",
    });
  }
  if (value.access !== "external_only" && value.externalWatchUrl !== null) {
    context.addIssue({
      code: "custom",
      path: ["externalWatchUrl"],
      message: "Only external-only access can define a legal viewing URL",
    });
  }
  if (
    (value.access === "external_only" || value.access === "unavailable") &&
    value.maxConcurrentStreams !== null
  ) {
    context.addIssue({
      code: "custom",
      path: ["maxConcurrentStreams"],
      message: "Concurrency applies only to internal playback",
    });
  }
  if (value.contentKind !== "live" && value.dvrAllowed) {
    context.addIssue({
      code: "custom",
      path: ["dvrAllowed"],
      message: "DVR permission applies only to live content",
    });
  }
  if (value.access === "unavailable" && (value.dvrAllowed || value.recordingAllowed)) {
    context.addIssue({
      code: "custom",
      path: ["access"],
      message: "Unavailable content cannot grant DVR or recording permission",
    });
  }
}

export const rightsWindowConfigurationSchema = z
  .object(configurationFields)
  .strict()
  .superRefine(validateRightsConfiguration);

export const createAdminRightsWindowSchema = z
  .object({
    reason: reasonSchema,
    target: configurationFields.target,
    contentKind: configurationFields.contentKind,
    countryCode: configurationFields.countryCode.default(null),
    access: configurationFields.access,
    requiredProductId: configurationFields.requiredProductId.default(null),
    startsAt: configurationFields.startsAt,
    endsAt: configurationFields.endsAt,
    dvrAllowed: configurationFields.dvrAllowed.default(false),
    recordingAllowed: configurationFields.recordingAllowed.default(false),
    maxConcurrentStreams: configurationFields.maxConcurrentStreams.default(null),
    externalWatchUrl: configurationFields.externalWatchUrl.default(null),
    rightsHolder: configurationFields.rightsHolder,
    contractReference: configurationFields.contractReference.default(null),
    priority: configurationFields.priority.default(100),
  })
  .strict()
  .superRefine(validateRightsConfiguration);

const editablePatchFields = {
  target: configurationFields.target.optional(),
  contentKind: configurationFields.contentKind.optional(),
  countryCode: configurationFields.countryCode.optional(),
  access: configurationFields.access.optional(),
  requiredProductId: configurationFields.requiredProductId.optional(),
  startsAt: configurationFields.startsAt.optional(),
  endsAt: configurationFields.endsAt.optional(),
  dvrAllowed: configurationFields.dvrAllowed.optional(),
  recordingAllowed: configurationFields.recordingAllowed.optional(),
  maxConcurrentStreams: configurationFields.maxConcurrentStreams.optional(),
  externalWatchUrl: configurationFields.externalWatchUrl.optional(),
  rightsHolder: configurationFields.rightsHolder.optional(),
  contractReference: configurationFields.contractReference.optional(),
  priority: configurationFields.priority.optional(),
} as const;

const EDITABLE_KEYS = Object.keys(editablePatchFields) as Array<keyof typeof editablePatchFields>;

export const updateAdminRightsWindowSchema = z
  .object({
    reason: reasonSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
    ...editablePatchFields,
  })
  .strict()
  .refine((value) => EDITABLE_KEYS.some((key) => value[key] !== undefined), {
    message: "At least one editable field is required",
  });

export const deleteAdminRightsWindowSchema = z
  .object({ reason: reasonSchema, expectedUpdatedAt: expectedUpdatedAtSchema })
  .strict();

export type AdminRightsTargetInput = z.infer<typeof adminRightsTargetSchema>;
export type RightsWindowConfiguration = z.infer<typeof rightsWindowConfigurationSchema>;
export type CreateAdminRightsWindowInput = z.infer<typeof createAdminRightsWindowSchema>;
export type UpdateAdminRightsWindowInput = z.infer<typeof updateAdminRightsWindowSchema>;
export type DeleteAdminRightsWindowInput = z.infer<typeof deleteAdminRightsWindowSchema>;
type RightsWindowRow = typeof rightsWindows.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface AdminRightsTargetDto {
  type: (typeof RIGHTS_TARGET_TYPES)[number];
  id: string;
  label: { et: string; en: string };
  eventId: string | null;
}

export interface AdminRightsWindowDto {
  id: string;
  target: AdminRightsTargetDto;
  contentKind: RightsWindowRow["contentKind"];
  countryCode: string | null;
  access: RightsWindowRow["access"];
  requiredProductId: string | null;
  startsAt: string;
  endsAt: string;
  dvrAllowed: boolean;
  recordingAllowed: boolean;
  maxConcurrentStreams: number | null;
  externalWatchUrl: string | null;
  rightsHolder: string;
  contractReference: string | null;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRightsRecord {
  row: RightsWindowRow;
  target: AdminRightsTargetDto;
}

export interface AdminRightsAuditContext {
  requestId: string;
  ipHash: string | null;
  userAgentSummary: string | null;
}

export class AdminRightsControlError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "AdminRightsControlError";
    this.code = code;
    this.status = status;
  }
}

function readPatchValue<K extends keyof RightsWindowConfiguration>(
  input: UpdateAdminRightsWindowInput,
  existing: RightsWindowConfiguration,
  key: K,
): RightsWindowConfiguration[K] {
  return Object.prototype.hasOwnProperty.call(input, key)
    ? (input[key] as RightsWindowConfiguration[K])
    : existing[key];
}

export function mergeRightsWindowConfiguration(
  existing: RightsWindowConfiguration,
  input: UpdateAdminRightsWindowInput,
): RightsWindowConfiguration {
  const merged = {
    target: readPatchValue(input, existing, "target"),
    contentKind: readPatchValue(input, existing, "contentKind"),
    countryCode: readPatchValue(input, existing, "countryCode"),
    access: readPatchValue(input, existing, "access"),
    requiredProductId: readPatchValue(input, existing, "requiredProductId"),
    startsAt: readPatchValue(input, existing, "startsAt"),
    endsAt: readPatchValue(input, existing, "endsAt"),
    dvrAllowed: readPatchValue(input, existing, "dvrAllowed"),
    recordingAllowed: readPatchValue(input, existing, "recordingAllowed"),
    maxConcurrentStreams: readPatchValue(input, existing, "maxConcurrentStreams"),
    externalWatchUrl: readPatchValue(input, existing, "externalWatchUrl"),
    rightsHolder: readPatchValue(input, existing, "rightsHolder"),
    contractReference: readPatchValue(input, existing, "contractReference"),
    priority: readPatchValue(input, existing, "priority"),
  };
  if (input.access === "unavailable") {
    if (input.requiredProductId === undefined) merged.requiredProductId = null;
    if (input.externalWatchUrl === undefined) merged.externalWatchUrl = null;
    if (input.maxConcurrentStreams === undefined) merged.maxConcurrentStreams = null;
    if (input.dvrAllowed === undefined) merged.dvrAllowed = false;
    if (input.recordingAllowed === undefined) merged.recordingAllowed = false;
  } else if (input.access === "external_only") {
    if (input.requiredProductId === undefined) merged.requiredProductId = null;
    if (input.maxConcurrentStreams === undefined) merged.maxConcurrentStreams = null;
  } else if (input.access === "free") {
    if (input.requiredProductId === undefined) merged.requiredProductId = null;
    if (input.externalWatchUrl === undefined) merged.externalWatchUrl = null;
  } else if (input.access === "entitled" && input.externalWatchUrl === undefined) {
    merged.externalWatchUrl = null;
  }
  return merged;
}

export function rightsConfigurationFromCreateInput(
  input: CreateAdminRightsWindowInput,
): RightsWindowConfiguration {
  return {
    target: input.target,
    contentKind: input.contentKind,
    countryCode: input.countryCode,
    access: input.access,
    requiredProductId: input.requiredProductId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    dvrAllowed: input.dvrAllowed,
    recordingAllowed: input.recordingAllowed,
    maxConcurrentStreams: input.maxConcurrentStreams,
    externalWatchUrl: input.externalWatchUrl,
    rightsHolder: input.rightsHolder,
    contractReference: input.contractReference,
    priority: input.priority,
  };
}

function targetFromRow(row: RightsWindowRow): AdminRightsTargetInput {
  if (row.competitionId) return { type: "competition", id: row.competitionId };
  if (row.eventId) return { type: "event", id: row.eventId };
  if (row.streamId) return { type: "stream", id: row.streamId };
  if (row.mediaAssetId) return { type: "media_asset", id: row.mediaAssetId };
  throw new AdminRightsControlError("invalid_rights_target", 409);
}

export function rightsConfigurationFromRow(row: RightsWindowRow): RightsWindowConfiguration {
  return {
    target: targetFromRow(row),
    contentKind: row.contentKind,
    countryCode: row.countryCode,
    access: row.access,
    requiredProductId: row.requiredProductId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    dvrAllowed: row.dvrAllowed,
    recordingAllowed: row.recordingAllowed,
    maxConcurrentStreams: row.maxConcurrentStreams,
    externalWatchUrl: row.externalWatchUrl,
    rightsHolder: row.rightsHolder,
    contractReference: row.contractReference,
    priority: row.priority,
  };
}

export function toAdminRightsWindowDto(record: AdminRightsRecord): AdminRightsWindowDto {
  return {
    id: record.row.id,
    target: record.target,
    contentKind: record.row.contentKind,
    countryCode: record.row.countryCode,
    access: record.row.access,
    requiredProductId: record.row.requiredProductId,
    startsAt: record.row.startsAt.toISOString(),
    endsAt: record.row.endsAt.toISOString(),
    dvrAllowed: record.row.dvrAllowed,
    recordingAllowed: record.row.recordingAllowed,
    maxConcurrentStreams: record.row.maxConcurrentStreams,
    externalWatchUrl: record.row.externalWatchUrl,
    rightsHolder: record.row.rightsHolder,
    contractReference: record.row.contractReference,
    priority: record.row.priority,
    createdAt: record.row.createdAt.toISOString(),
    updatedAt: record.row.updatedAt.toISOString(),
  };
}

function redactUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    for (const key of new Set(url.searchParams.keys())) url.searchParams.set(key, "[REDACTED]");
    url.hash = "";
    return url.toString();
  } catch {
    return "[INVALID_URL]";
  }
}

export function toRightsAuditSnapshot(record: AdminRightsRecord): Record<string, unknown> {
  return {
    ...toAdminRightsWindowDto(record),
    externalWatchUrl: redactUrl(record.row.externalWatchUrl),
  };
}

export function createAdminRightsAuditContext(
  request: Request,
  requestId: string,
): AdminRightsAuditContext {
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    null;
  const rawUserAgent = request.headers.get("user-agent")?.replace(/\s+/gu, " ").trim();
  return {
    requestId,
    ipHash: clientIp
      ? createHmac("sha256", getEnvironment().SESSION_SECRET).update(clientIp).digest("hex")
      : null,
    userAgentSummary: rawUserAgent ? rawUserAgent.slice(0, 240) : null,
  };
}

interface EffectiveScope {
  kind: "competition" | "event" | "media_asset";
  id: string;
}

interface ResolvedTarget {
  dto: AdminRightsTargetDto;
  effectiveScope: EffectiveScope;
  isDemo: boolean;
}

async function resolveTarget(
  tx: Transaction,
  target: AdminRightsTargetInput,
  requirePlayableMedia = true,
): Promise<ResolvedTarget> {
  switch (target.type) {
    case "competition": {
      const [row] = await tx
        .select({
          id: competitions.id,
          name: competitions.name,
          et: competitions.nameEt,
          en: competitions.nameEn,
          isDemo: competitions.isDemo,
        })
        .from(competitions)
        .where(eq(competitions.id, target.id))
        .limit(1);
      if (!row) throw new AdminRightsControlError("competition_not_found", 404);
      return {
        dto: {
          type: target.type,
          id: row.id,
          label: { et: row.et ?? row.name, en: row.en ?? row.name },
          eventId: null,
        },
        effectiveScope: { kind: "competition", id: row.id },
        isDemo: row.isDemo,
      };
    }
    case "event": {
      const [row] = await tx
        .select({ id: events.id, et: events.titleEt, en: events.titleEn, isDemo: events.isDemo })
        .from(events)
        .where(eq(events.id, target.id))
        .limit(1);
      if (!row) throw new AdminRightsControlError("event_not_found", 404);
      return {
        dto: { type: target.type, id: row.id, label: { et: row.et, en: row.en }, eventId: row.id },
        effectiveScope: { kind: "event", id: row.id },
        isDemo: row.isDemo,
      };
    }
    case "stream": {
      const [row] = await tx
        .select({
          id: streams.id,
          eventId: streams.eventId,
          provider: streams.provider,
          reference: streams.providerStreamRef,
          isDemo: streams.isDemo,
        })
        .from(streams)
        .where(eq(streams.id, target.id))
        .limit(1);
      if (!row) throw new AdminRightsControlError("stream_not_found", 404);
      const label = `${row.provider} / ${row.reference}`;
      return {
        dto: {
          type: target.type,
          id: row.id,
          label: { et: label, en: label },
          eventId: row.eventId,
        },
        effectiveScope: { kind: "event", id: row.eventId },
        isDemo: row.isDemo,
      };
    }
    case "media_asset": {
      const [row] = await tx
        .select({
          id: mediaAssets.id,
          eventId: mediaAssets.eventId,
          kind: mediaAssets.kind,
          et: mediaAssets.titleEt,
          en: mediaAssets.titleEn,
          isDemo: mediaAssets.isDemo,
        })
        .from(mediaAssets)
        .where(eq(mediaAssets.id, target.id))
        .limit(1);
      if (!row) throw new AdminRightsControlError("media_asset_not_found", 404);
      if (!row.eventId && requirePlayableMedia) {
        throw new AdminRightsControlError("media_asset_event_required", 409);
      }
      const fallback = row.kind.replaceAll("_", " ");
      return {
        dto: {
          type: target.type,
          id: row.id,
          label: { et: row.et ?? fallback, en: row.en ?? fallback },
          eventId: row.eventId,
        },
        effectiveScope: row.eventId
          ? { kind: "event", id: row.eventId }
          : { kind: "media_asset", id: row.id },
        isDemo: row.isDemo,
      };
    }
  }
}

async function assertProductExists(tx: Transaction, productId: string | null): Promise<void> {
  if (!productId) return;
  const [product] = await tx
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) throw new AdminRightsControlError("product_not_found", 404);
}

function targetValues(target: AdminRightsTargetInput) {
  return {
    competitionId: target.type === "competition" ? target.id : null,
    eventId: target.type === "event" ? target.id : null,
    streamId: target.type === "stream" ? target.id : null,
    mediaAssetId: target.type === "media_asset" ? target.id : null,
  };
}

function scopeCondition(tx: Transaction, scope: EffectiveScope): SQL {
  if (scope.kind === "competition") return eq(rightsWindows.competitionId, scope.id);
  if (scope.kind === "media_asset") return eq(rightsWindows.mediaAssetId, scope.id);
  const eventStreamIds = tx
    .select({ id: streams.id })
    .from(streams)
    .where(eq(streams.eventId, scope.id));
  const eventAssetIds = tx
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.eventId, scope.id));
  return or(
    eq(rightsWindows.eventId, scope.id),
    inArray(rightsWindows.streamId, eventStreamIds),
    inArray(rightsWindows.mediaAssetId, eventAssetIds),
  )!;
}

async function assertNoEqualRankOverlap(
  tx: Transaction,
  configuration: RightsWindowConfiguration,
  scope: EffectiveScope,
  exceptId?: string,
): Promise<void> {
  const countryCondition = configuration.countryCode
    ? or(
        isNull(rightsWindows.countryCode),
        eq(rightsWindows.countryCode, configuration.countryCode),
      )
    : undefined;
  const filters = [
    eq(rightsWindows.contentKind, configuration.contentKind),
    eq(rightsWindows.priority, configuration.priority),
    countryCondition,
    lt(rightsWindows.startsAt, new Date(configuration.endsAt)),
    gt(rightsWindows.endsAt, new Date(configuration.startsAt)),
    scopeCondition(tx, scope),
  ];
  if (exceptId) filters.push(ne(rightsWindows.id, exceptId));
  const [overlap] = await tx
    .select({ id: rightsWindows.id })
    .from(rightsWindows)
    .where(and(...filters))
    .limit(1);
  if (overlap) throw new AdminRightsControlError("overlapping_policy_conflict", 409);
}

async function lock(tx: Transaction, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

function scopeKey(scope: EffectiveScope): string {
  return `rights-policy:${scope.kind}:${scope.id}`;
}

function timestampsMatch(expected: string, actual: Date): boolean {
  return new Date(expected).getTime() === actual.getTime();
}

export function nextRightsUpdatedAt(previous: Date, now = new Date()): Date {
  return new Date(Math.max(now.getTime(), previous.getTime() + 1));
}

function validatedConfiguration(input: RightsWindowConfiguration): RightsWindowConfiguration {
  const parsed = rightsWindowConfigurationSchema.safeParse(input);
  if (!parsed.success) throw new AdminRightsControlError("invalid_rights_configuration", 400);
  return parsed.data;
}

function insertValues(configuration: RightsWindowConfiguration) {
  return {
    ...targetValues(configuration.target),
    contentKind: configuration.contentKind,
    countryCode: configuration.countryCode,
    access: configuration.access,
    requiredProductId: configuration.requiredProductId,
    startsAt: new Date(configuration.startsAt),
    endsAt: new Date(configuration.endsAt),
    dvrAllowed: configuration.dvrAllowed,
    recordingAllowed: configuration.recordingAllowed,
    maxConcurrentStreams: configuration.maxConcurrentStreams,
    externalWatchUrl: configuration.externalWatchUrl,
    rightsHolder: configuration.rightsHolder,
    contractReference: configuration.contractReference,
    priority: configuration.priority,
  };
}

export async function createAdminRightsWindow(
  input: CreateAdminRightsWindowInput,
  audit: AdminRightsAuditContext,
): Promise<AdminRightsWindowDto> {
  return db.transaction(async (tx) => {
    const configuration = validatedConfiguration(rightsConfigurationFromCreateInput(input));
    const resolved = await resolveTarget(tx, configuration.target);
    await lock(tx, scopeKey(resolved.effectiveScope));
    await assertProductExists(tx, configuration.requiredProductId);
    await assertNoEqualRankOverlap(tx, configuration, resolved.effectiveScope);
    const now = new Date();
    const [inserted] = await tx
      .insert(rightsWindows)
      .values({ ...insertValues(configuration), createdAt: now, updatedAt: now })
      .returning();
    if (!inserted) throw new Error("Rights window insert returned no row");
    const record = { row: inserted, target: resolved.dto };
    await tx.insert(auditLogs).values({
      actorUserId: null,
      action: "rights_window.created",
      entityType: "rights_window",
      entityId: inserted.id,
      requestId: audit.requestId,
      reason: input.reason,
      before: null,
      after: toRightsAuditSnapshot(record),
      ipHash: audit.ipHash,
      userAgentSummary: audit.userAgentSummary,
    });
    return toAdminRightsWindowDto(record);
  });
}

export async function updateAdminRightsWindow(
  rightsWindowId: string,
  input: UpdateAdminRightsWindowInput,
  audit: AdminRightsAuditContext,
): Promise<AdminRightsWindowDto> {
  return db.transaction(async (tx) => {
    await lock(tx, `rights-window:${rightsWindowId}`);
    const [existing] = await tx
      .select()
      .from(rightsWindows)
      .where(eq(rightsWindows.id, rightsWindowId))
      .limit(1);
    if (!existing) throw new AdminRightsControlError("rights_window_not_found", 404);
    if (!timestampsMatch(input.expectedUpdatedAt, existing.updatedAt)) {
      throw new AdminRightsControlError("version_conflict", 409);
    }

    const currentConfiguration = rightsConfigurationFromRow(existing);
    const configuration = validatedConfiguration(
      mergeRightsWindowConfiguration(currentConfiguration, input),
    );
    const [beforeTarget, afterTarget] = await Promise.all([
      resolveTarget(tx, currentConfiguration.target, false),
      resolveTarget(tx, configuration.target),
    ]);
    const keys = [
      ...new Set([scopeKey(beforeTarget.effectiveScope), scopeKey(afterTarget.effectiveScope)]),
    ].sort();
    for (const key of keys) await lock(tx, key);
    await assertProductExists(tx, configuration.requiredProductId);
    await assertNoEqualRankOverlap(tx, configuration, afterTarget.effectiveScope, rightsWindowId);

    const now = nextRightsUpdatedAt(existing.updatedAt);
    const [updated] = await tx
      .update(rightsWindows)
      .set({ ...insertValues(configuration), updatedAt: now })
      .where(
        and(eq(rightsWindows.id, rightsWindowId), eq(rightsWindows.updatedAt, existing.updatedAt)),
      )
      .returning();
    if (!updated) throw new AdminRightsControlError("version_conflict", 409);
    const before = { row: existing, target: beforeTarget.dto };
    const after = { row: updated, target: afterTarget.dto };
    await tx.insert(auditLogs).values({
      actorUserId: null,
      action: "rights_window.updated",
      entityType: "rights_window",
      entityId: rightsWindowId,
      requestId: audit.requestId,
      reason: input.reason,
      before: toRightsAuditSnapshot(before),
      after: toRightsAuditSnapshot(after),
      ipHash: audit.ipHash,
      userAgentSummary: audit.userAgentSummary,
    });
    return toAdminRightsWindowDto(after);
  });
}

export interface DeleteAdminRightsWindowResult {
  id: string;
  deleted: true;
}

export function assertRightsWindowDeletable(
  window: Pick<RightsWindowRow, "startsAt" | "endsAt">,
  targetIsDemo: boolean,
  now: Date,
): void {
  if (!targetIsDemo) throw new AdminRightsControlError("demo_target_required", 403);
  if (window.startsAt <= now && now < window.endsAt) {
    throw new AdminRightsControlError("active_rights_window", 409);
  }
}

export async function deleteAdminRightsWindow(
  rightsWindowId: string,
  input: DeleteAdminRightsWindowInput,
  audit: AdminRightsAuditContext,
): Promise<DeleteAdminRightsWindowResult> {
  return db.transaction(async (tx) => {
    await lock(tx, `rights-window:${rightsWindowId}`);
    const [existing] = await tx
      .select()
      .from(rightsWindows)
      .where(eq(rightsWindows.id, rightsWindowId))
      .limit(1);
    if (!existing) throw new AdminRightsControlError("rights_window_not_found", 404);
    if (!timestampsMatch(input.expectedUpdatedAt, existing.updatedAt)) {
      throw new AdminRightsControlError("version_conflict", 409);
    }
    const resolved = await resolveTarget(tx, targetFromRow(existing), false);
    assertRightsWindowDeletable(existing, resolved.isDemo, new Date());
    await lock(tx, scopeKey(resolved.effectiveScope));
    await tx.delete(rightsWindows).where(eq(rightsWindows.id, rightsWindowId));
    await tx.insert(auditLogs).values({
      actorUserId: null,
      action: "rights_window.deleted",
      entityType: "rights_window",
      entityId: rightsWindowId,
      requestId: audit.requestId,
      reason: input.reason,
      before: toRightsAuditSnapshot({ row: existing, target: resolved.dto }),
      after: { deleted: true },
      ipHash: audit.ipHash,
      userAgentSummary: audit.userAgentSummary,
    });
    return { id: rightsWindowId, deleted: true };
  });
}

export async function listAdminRightsWindows(): Promise<AdminRightsWindowDto[]> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(rightsWindows)
      .orderBy(desc(rightsWindows.updatedAt), desc(rightsWindows.createdAt));
    return Promise.all(
      rows.map(async (row) => ({
        row,
        target: (await resolveTarget(tx, targetFromRow(row), false)).dto,
      })),
    ).then((records) => records.map(toAdminRightsWindowDto));
  });
}
