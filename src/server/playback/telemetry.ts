import { z } from "zod";

const sourceKindSchema = z.enum(["whep", "ll-hls", "hls", "external"]);

const failureReasonSchema = z.enum([
  "whep_not_configured",
  "whep_connection_failed",
  "native_hls_failed",
  "hls_library_failed",
  "hls_not_supported",
  "hls_network_failed",
  "hls_media_failed",
  "hls_fatal_error",
  "no_sources",
]);

const recoveryReasonSchema = z.enum(["offline", "buffering", "hls_network_retry"]);

const commonFields = {
  at: z.string().datetime({ offset: true }),
  eventId: z.string().uuid(),
  sourceId: z.string().uuid().optional(),
  sourceKind: sourceKindSchema.optional(),
};

const sourceAttemptSchema = z
  .object({
    ...commonFields,
    type: z.literal("source_attempt"),
  })
  .strict();

const sourceSkippedSchema = z
  .object({
    ...commonFields,
    type: z.literal("source_skipped"),
    reasonCode: z.literal("whep_not_configured"),
  })
  .strict();

const sourceFallbackSchema = z
  .object({
    ...commonFields,
    type: z.literal("source_fallback"),
    reasonCode: failureReasonSchema,
  })
  .strict();

const playbackReadySchema = z
  .object({
    ...commonFields,
    type: z.literal("playback_ready"),
    value: z.number().int().min(0).max(300_000),
  })
  .strict();

const playbackStateSchema = z
  .object({
    ...commonFields,
    type: z.enum(["playback_started", "playback_paused", "jump_to_live"]),
  })
  .strict();

const playbackEndedSchema = z
  .object({
    ...commonFields,
    type: z.literal("playback_ended"),
  })
  .strict();

const playbackRecoveringSchema = z
  .object({
    ...commonFields,
    type: z.literal("playback_recovering"),
    reasonCode: recoveryReasonSchema,
  })
  .strict();

const playbackFailedSchema = z
  .object({
    ...commonFields,
    type: z.literal("playback_failed"),
    reasonCode: failureReasonSchema,
  })
  .strict();

const qualityChangedSchema = z
  .object({
    ...commonFields,
    type: z.literal("quality_changed"),
    reasonCode: z.literal("data_saver_cap").optional(),
    value: z.number().int().min(-1).max(128),
  })
  .strict();

const frameCountSchema = z.number().int().min(0).max(2_147_483_647).nullable();

const metricsSchema = z
  .object({
    ...commonFields,
    type: z.literal("metrics"),
    metrics: z
      .object({
        bufferSeconds: z.number().finite().min(0).max(3_600),
        liveEdgeSeconds: z.number().finite().min(0).max(86_400).nullable(),
        droppedFrames: frameCountSchema,
        totalFrames: frameCountSchema,
      })
      .strict()
      .refine(
        (metrics) =>
          metrics.droppedFrames === null ||
          metrics.totalFrames === null ||
          metrics.droppedFrames <= metrics.totalFrames,
        { message: "droppedFrames cannot exceed totalFrames" },
      ),
  })
  .strict();

/**
 * Exact browser-to-server telemetry contract. It deliberately excludes URLs,
 * tokens, free-form errors, device fingerprints, and user/profile identifiers.
 */
export const playbackTelemetrySchema = z.discriminatedUnion("type", [
  sourceAttemptSchema,
  sourceSkippedSchema,
  sourceFallbackSchema,
  playbackReadySchema,
  playbackStateSchema,
  playbackEndedSchema,
  playbackRecoveringSchema,
  playbackFailedSchema,
  qualityChangedSchema,
  metricsSchema,
]);

export type PlaybackTelemetry = z.infer<typeof playbackTelemetrySchema>;
