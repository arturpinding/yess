import { z } from "zod";

export const LIVE_BROADCAST_TTL_MS = 6 * 60 * 60 * 1_000;

export const createLiveBroadcastSchema = z
  .object({
    locale: z.enum(["et", "en"]),
    title: z.string().trim().min(1).max(120),
    accessKey: z.string().min(1).max(256),
  })
  .strict();

export const updateLiveBroadcastStatusSchema = z.object({ state: z.literal("live") }).strict();

export type LiveBroadcastLocale = z.infer<typeof createLiveBroadcastSchema>["locale"];
