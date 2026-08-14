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

export type StreamProtocol = (typeof STREAM_PROTOCOLS)[number];
export type StreamState = (typeof STREAM_STATES)[number];
export type AdminEventState = (typeof EVENT_STATES)[number];

const localizedTitleSchema = z.object({ et: z.string(), en: z.string() });

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

export type AdminStream = z.infer<typeof adminStreamSchema>;
export type AdminEvent = z.infer<typeof adminEventSchema>;

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
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: mutationHeaders(),
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
