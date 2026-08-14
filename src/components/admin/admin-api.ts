import { z } from "zod";
import { mutationHeaders } from "@/components/client-security";

export const STREAM_PROTOCOLS = ["webrtc", "ll_hls", "hls", "external"] as const;
export const STREAM_STATES = [
  "provisioning",
  "ready",
  "live",
  "degraded",
  "ended",
  "unavailable",
] as const;
export const EVENT_STATES = [
  "scheduled",
  "delayed",
  "live",
  "paused",
  "finished",
  "cancelled",
] as const;
export const RIGHTS_CONTENT_KINDS = ["live", "replay", "highlight"] as const;
export const RIGHTS_ACCESS_LEVELS = ["free", "entitled", "external_only", "unavailable"] as const;
export const RIGHTS_TARGET_TYPES = ["competition", "event", "stream", "media_asset"] as const;
export const MEDIA_PROVIDER_ACTIONS = [
  "provision",
  "start",
  "publish",
  "unpublish",
  "stop",
  "refresh",
] as const;
export const MEDIA_PROVIDER_RESOURCE_STATES = [
  "absent",
  "provisioned",
  "encoding",
  "published",
  "stopped",
  "failed",
] as const;
export const MEDIA_OPERATION_STATES = ["pending", "succeeded", "failed"] as const;

export type StreamProtocol = (typeof STREAM_PROTOCOLS)[number];
export type StreamState = (typeof STREAM_STATES)[number];
export type AdminEventState = (typeof EVENT_STATES)[number];
export type RightsContentKind = (typeof RIGHTS_CONTENT_KINDS)[number];
export type RightsAccessLevel = (typeof RIGHTS_ACCESS_LEVELS)[number];
export type RightsAccess = RightsAccessLevel;
export type RightsTargetType = (typeof RIGHTS_TARGET_TYPES)[number];
export type MediaProviderAction = (typeof MEDIA_PROVIDER_ACTIONS)[number];
export type MediaProviderResourceState = (typeof MEDIA_PROVIDER_RESOURCE_STATES)[number];
export type MediaOperationState = (typeof MEDIA_OPERATION_STATES)[number];

const localizedTitleSchema = z.object({ et: z.string(), en: z.string() });
const instantSchema = z.string().datetime({ offset: true });
const reasonSchema = z.string().trim().min(3).max(500);
const expectedUpdatedAtSchema = z.string().datetime({ offset: true });
const cleanText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const nullableCountryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/u)
  .transform((value) => value.toUpperCase())
  .nullable();
const httpUrlSchema = z
  .string()
  .trim()
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

export const adminStreamSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  eventTitle: localizedTitleSchema,
  protocol: z.enum(STREAM_PROTOCOLS),
  state: z.enum(STREAM_STATES),
  priority: z.number().int().nonnegative(),
  playbackLocator: z.string().nullable(),
  externalWatchUrl: z.string().nullable(),
  provider: z.string(),
  providerStreamRef: z.string(),
  requiresSignedAccess: z.boolean(),
  dvrWindowSeconds: z.number().int().nonnegative(),
  captionsAvailable: z.boolean(),
  isDemo: z.boolean(),
  lastHealthyAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const adminEventSchema = z.object({
  id: z.string().uuid(),
  titleEt: z.string(),
  titleEn: z.string(),
  state: z.enum(EVENT_STATES),
  scheduledStartAt: z.string(),
  actualStartAt: z.string().nullable(),
  endAt: z.string().nullable(),
  venueId: z.string().uuid().nullable(),
  venueName: z.string().nullable(),
  statusDetailEt: z.string().nullable(),
  statusDetailEn: z.string().nullable(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
});

const competitionRightsTargetSchema = z
  .object({
    type: z.literal("competition"),
    id: z.string().uuid(),
    label: localizedTitleSchema,
    eventId: z.null(),
  })
  .strict();
const eventRightsTargetSchema = z
  .object({
    type: z.literal("event"),
    id: z.string().uuid(),
    label: localizedTitleSchema,
    eventId: z.string().uuid(),
  })
  .strict();
const streamRightsTargetSchema = z
  .object({
    type: z.literal("stream"),
    id: z.string().uuid(),
    label: localizedTitleSchema,
    eventId: z.string().uuid(),
  })
  .strict();
const mediaAssetRightsTargetSchema = z
  .object({
    type: z.literal("media_asset"),
    id: z.string().uuid(),
    label: localizedTitleSchema,
    eventId: z.string().uuid().nullable(),
  })
  .strict();

export const adminRightsTargetSchema = z
  .object({
    type: z.enum(RIGHTS_TARGET_TYPES),
    id: z.string().uuid(),
    label: localizedTitleSchema,
    eventId: z.string().uuid().nullable(),
  })
  .strict();

export const adminRightsTargetInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("competition"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("event"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("stream"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("media_asset"), id: z.string().uuid() }).strict(),
]);

const rightsConfigurationFields = {
  target: adminRightsTargetInputSchema,
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
  contractReference: cleanText(180).nullable(),
  priority: z.number().int().min(0).max(32_767),
} as const;

function validateRightsConfiguration(
  value: {
    contentKind: RightsContentKind;
    access: RightsAccessLevel;
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

export const createAdminRightsWindowInputSchema = z
  .object({
    reason: reasonSchema,
    target: rightsConfigurationFields.target,
    contentKind: rightsConfigurationFields.contentKind,
    countryCode: rightsConfigurationFields.countryCode.default(null),
    access: rightsConfigurationFields.access,
    requiredProductId: rightsConfigurationFields.requiredProductId.default(null),
    startsAt: rightsConfigurationFields.startsAt,
    endsAt: rightsConfigurationFields.endsAt,
    dvrAllowed: rightsConfigurationFields.dvrAllowed.default(false),
    recordingAllowed: rightsConfigurationFields.recordingAllowed.default(false),
    maxConcurrentStreams: rightsConfigurationFields.maxConcurrentStreams.default(null),
    externalWatchUrl: rightsConfigurationFields.externalWatchUrl.default(null),
    rightsHolder: rightsConfigurationFields.rightsHolder,
    contractReference: rightsConfigurationFields.contractReference.default(null),
    priority: rightsConfigurationFields.priority.default(100),
  })
  .strict()
  .superRefine(validateRightsConfiguration);

const rightsEditablePatchFields = {
  target: rightsConfigurationFields.target.optional(),
  contentKind: rightsConfigurationFields.contentKind.optional(),
  countryCode: rightsConfigurationFields.countryCode.optional(),
  access: rightsConfigurationFields.access.optional(),
  requiredProductId: rightsConfigurationFields.requiredProductId.optional(),
  startsAt: rightsConfigurationFields.startsAt.optional(),
  endsAt: rightsConfigurationFields.endsAt.optional(),
  dvrAllowed: rightsConfigurationFields.dvrAllowed.optional(),
  recordingAllowed: rightsConfigurationFields.recordingAllowed.optional(),
  maxConcurrentStreams: rightsConfigurationFields.maxConcurrentStreams.optional(),
  externalWatchUrl: rightsConfigurationFields.externalWatchUrl.optional(),
  rightsHolder: rightsConfigurationFields.rightsHolder.optional(),
  contractReference: rightsConfigurationFields.contractReference.optional(),
  priority: rightsConfigurationFields.priority.optional(),
} as const;

const RIGHTS_EDITABLE_KEYS = Object.keys(rightsEditablePatchFields) as Array<
  keyof typeof rightsEditablePatchFields
>;

export const updateAdminRightsWindowInputSchema = z
  .object({
    reason: reasonSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
    ...rightsEditablePatchFields,
  })
  .strict()
  .refine((value) => RIGHTS_EDITABLE_KEYS.some((key) => value[key] !== undefined), {
    message: "At least one editable field is required",
  });

export const deleteAdminRightsWindowInputSchema = z
  .object({ reason: reasonSchema, expectedUpdatedAt: expectedUpdatedAtSchema })
  .strict();

export const adminRightsWindowSchema = z
  .object({
    id: z.string().uuid(),
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
    rightsHolder: z.string(),
    contractReference: z.string().nullable(),
    priority: z.number().int().min(0).max(32_767),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .superRefine(validateRightsConfiguration);

export const adminProductSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    label: localizedTitleSchema,
  })
  .strict();

export const adminRightsTargetGroupsSchema = z
  .object({
    competitions: z.array(competitionRightsTargetSchema),
    events: z.array(eventRightsTargetSchema),
    streams: z.array(streamRightsTargetSchema),
    mediaAssets: z.array(mediaAssetRightsTargetSchema),
  })
  .strict();

export const adminMediaResourceSchema = z
  .object({
    id: z.string().uuid(),
    streamId: z.string().uuid(),
    providerKey: z.string(),
    providerResourceId: z.string(),
    desiredState: z.enum(MEDIA_PROVIDER_RESOURCE_STATES),
    observedState: z.enum(MEDIA_PROVIDER_RESOURCE_STATES),
    playbackLocator: httpUrlSchema.nullable(),
    generation: z.number().int().nonnegative(),
    lastHealthyAt: instantSchema.nullable(),
    lastErrorCode: z.string().nullable(),
    updatedAt: instantSchema,
  })
  .strict();

export const adminMediaOperationSchema = z
  .object({
    id: z.string().uuid(),
    streamId: z.string().uuid(),
    action: z.enum(MEDIA_PROVIDER_ACTIONS),
    state: z.enum(MEDIA_OPERATION_STATES),
    idempotencyKey: z.string(),
    providerRequestId: z.string().nullable(),
    errorCode: z.string().nullable(),
    requestedAt: instantSchema,
    completedAt: instantSchema.nullable(),
  })
  .strict();

export const adminMediaOperationResultSchema = z
  .object({
    operation: adminMediaOperationSchema,
    resource: adminMediaResourceSchema,
    stream: adminStreamSchema,
  })
  .strict();

export const adminMediaIdempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(180)
  .regex(/^[A-Za-z0-9._:-]+$/u);

export const adminMediaOperationInputSchema = z
  .object({
    action: z.enum(MEDIA_PROVIDER_ACTIONS),
    reason: reasonSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .strict();

export const deleteAdminRightsWindowResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.literal(true) })
  .strict();

export type AdminStream = z.infer<typeof adminStreamSchema>;
export type AdminEvent = z.infer<typeof adminEventSchema>;
export type AdminRightsTarget = z.infer<typeof adminRightsTargetSchema>;
export type AdminRightsTargetInput = z.infer<typeof adminRightsTargetInputSchema>;
export type AdminRightsWindow = z.infer<typeof adminRightsWindowSchema>;
export type AdminProduct = z.infer<typeof adminProductSchema>;
export type AdminRightsTargetGroups = z.infer<typeof adminRightsTargetGroupsSchema>;
export type AdminMediaResource = z.infer<typeof adminMediaResourceSchema>;
export type AdminMediaOperation = z.infer<typeof adminMediaOperationSchema>;
export type AdminMediaOperationResult = z.infer<typeof adminMediaOperationResultSchema>;
export type AdminMediaOperationInput = z.infer<typeof adminMediaOperationInputSchema>;

export interface AdminVenue {
  id: string;
  name: string;
  city: string;
  countryCode: string;
}

export type StreamEditable = Pick<
  AdminStream,
  | "protocol"
  | "state"
  | "priority"
  | "playbackLocator"
  | "externalWatchUrl"
  | "provider"
  | "providerStreamRef"
  | "requiresSignedAccess"
  | "dvrWindowSeconds"
  | "captionsAvailable"
>;

export type CreateStreamInput = StreamEditable & {
  eventId: string;
  reason: string;
};

export type UpdateStreamInput = Partial<StreamEditable> & {
  reason: string;
  expectedUpdatedAt: string;
};

export type UpdateEventInput = Partial<
  Pick<
    AdminEvent,
    | "titleEt"
    | "titleEn"
    | "state"
    | "scheduledStartAt"
    | "actualStartAt"
    | "endAt"
    | "venueId"
    | "statusDetailEt"
    | "statusDetailEn"
  >
> & {
  reason: string;
  version: number;
  overrideInvalidTransition?: boolean;
};

export type RightsWindowEditable = Omit<
  Pick<
    AdminRightsWindow,
    | "target"
    | "contentKind"
    | "countryCode"
    | "access"
    | "requiredProductId"
    | "startsAt"
    | "endsAt"
    | "dvrAllowed"
    | "recordingAllowed"
    | "maxConcurrentStreams"
    | "externalWatchUrl"
    | "rightsHolder"
    | "contractReference"
    | "priority"
  >,
  "target"
> & { target: AdminRightsTargetInput };

export type CreateAdminRightsWindowInput = z.input<typeof createAdminRightsWindowInputSchema>;
export type UpdateAdminRightsWindowInput = z.infer<typeof updateAdminRightsWindowInputSchema>;
export type DeleteAdminRightsWindowInput = z.infer<typeof deleteAdminRightsWindowInputSchema>;
export type DeleteAdminRightsWindowResult = z.infer<typeof deleteAdminRightsWindowResultSchema>;
export type CreateRightsWindowInput = CreateAdminRightsWindowInput;
export type UpdateRightsWindowInput = UpdateAdminRightsWindowInput;

const errorEnvelopeSchema = z.object({
  error: z
    .object({
      code: z.string(),
      message: z.string().optional(),
      fields: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough(),
  requestId: z.string().optional(),
});

export class AdminApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(code);
    this.name = "AdminApiError";
  }
}

async function request<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
  schema: z.ZodType<T>,
  additionalHeaders: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { ...mutationHeaders(), ...additionalHeaders },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = errorEnvelopeSchema.safeParse(payload);
    throw new AdminApiError(
      error.success ? error.data.error.code : "request_failed",
      response.status,
      error.success ? error.data.requestId : undefined,
    );
  }
  const envelope = z.object({ data: schema, requestId: z.string().optional() }).safeParse(payload);
  if (!envelope.success) throw new AdminApiError("invalid_response", response.status);
  return envelope.data.data;
}

export function createAdminStream(input: CreateStreamInput): Promise<AdminStream> {
  return request("/api/v1/admin/streams", "POST", input, adminStreamSchema);
}

export function updateAdminStream(
  streamId: string,
  input: UpdateStreamInput,
): Promise<AdminStream> {
  return request(
    `/api/v1/admin/streams/${encodeURIComponent(streamId)}`,
    "PATCH",
    input,
    adminStreamSchema,
  );
}

export async function deleteAdminStream(
  streamId: string,
  input: { reason: string; expectedUpdatedAt: string },
): Promise<void> {
  const deletedSchema = z.object({ id: z.string().uuid(), deleted: z.literal(true) }).passthrough();
  await request(
    `/api/v1/admin/streams/${encodeURIComponent(streamId)}`,
    "DELETE",
    input,
    deletedSchema,
  );
}

export function updateAdminEvent(eventId: string, input: UpdateEventInput): Promise<AdminEvent> {
  return request(
    `/api/v1/admin/events/${encodeURIComponent(eventId)}`,
    "PATCH",
    input,
    adminEventSchema,
  );
}

export function createAdminRightsWindow(
  input: CreateAdminRightsWindowInput,
): Promise<AdminRightsWindow> {
  return request("/api/v1/admin/rights-windows", "POST", input, adminRightsWindowSchema);
}

export function updateAdminRightsWindow(
  rightsWindowId: string,
  input: UpdateAdminRightsWindowInput,
): Promise<AdminRightsWindow> {
  return request(
    `/api/v1/admin/rights-windows/${encodeURIComponent(rightsWindowId)}`,
    "PATCH",
    input,
    adminRightsWindowSchema,
  );
}

export function deleteAdminRightsWindow(
  rightsWindowId: string,
  input: DeleteAdminRightsWindowInput,
): Promise<DeleteAdminRightsWindowResult> {
  return request(
    `/api/v1/admin/rights-windows/${encodeURIComponent(rightsWindowId)}`,
    "DELETE",
    input,
    deleteAdminRightsWindowResultSchema,
  );
}

export function operateAdminStream(
  streamId: string,
  input: AdminMediaOperationInput,
  idempotencyKey: string,
): Promise<AdminMediaOperationResult> {
  return request(
    `/api/v1/admin/streams/${encodeURIComponent(streamId)}/operations`,
    "POST",
    input,
    adminMediaOperationResultSchema,
    { "Idempotency-Key": idempotencyKey },
  );
}
