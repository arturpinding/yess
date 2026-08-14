import { z } from "zod";

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

export const mediaProviderActionSchema = z.enum(MEDIA_PROVIDER_ACTIONS);
export const mediaProviderResourceStateSchema = z.enum(MEDIA_PROVIDER_RESOURCE_STATES);

export const mediaProviderResultSchema = z
  .object({
    providerRequestId: z.string().min(1).max(180),
    providerKey: z.string().min(1).max(100),
    providerResourceId: z.string().min(1).max(200),
    observedState: mediaProviderResourceStateSchema,
    published: z.boolean(),
    playbackLocator: z
      .string()
      .url()
      .refine((value) => {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      }, "Playback locators must use HTTP(S)")
      .nullable(),
    healthy: z.boolean(),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type MediaProviderAction = z.infer<typeof mediaProviderActionSchema>;
export type MediaProviderResourceState = z.infer<typeof mediaProviderResourceStateSchema>;
export type MediaProviderResult = z.infer<typeof mediaProviderResultSchema>;

export interface MediaProviderOperationRequest {
  providerKey: string;
  providerResourceId: string;
  action: MediaProviderAction;
  idempotencyKey: string;
}

export interface MediaProvider {
  execute(request: MediaProviderOperationRequest): Promise<MediaProviderResult>;
}

export class MediaProviderError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 502) {
    super(code);
    this.name = "MediaProviderError";
    this.code = code;
    this.status = status;
  }
}
