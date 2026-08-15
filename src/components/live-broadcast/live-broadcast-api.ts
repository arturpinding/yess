import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { mutationHeaders } from "@/components/client-security";

const broadcastSummarySchema = z.object({
  code: z.string(),
  title: z.string(),
  state: z.enum(["provisioned", "live"]),
  startedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime(),
});

const createResponseSchema = z.object({
  data: z.object({
    code: z.string(),
    title: z.string(),
    publisherToken: z.string().min(16),
    mediaUrl: z.string().url(),
    mediaToken: z.string().min(16),
    expiresAt: z.string().datetime(),
  }),
});

const listResponseSchema = z.object({
  data: z.object({ broadcasts: z.array(broadcastSummarySchema) }),
});

const playbackResponseSchema = z.object({
  data: broadcastSummarySchema.extend({
    mediaUrl: z.string().url(),
    mediaToken: z.string().min(16),
  }),
});

export type LiveBroadcastSummary = z.infer<typeof broadcastSummarySchema>;

export class LiveBroadcastApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "LiveBroadcastApiError";
  }
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function assertSuccessful(response: Response) {
  if (response.ok) return response;
  const body = await responseBody(response);
  const code = z.object({ error: z.object({ code: z.string() }) }).safeParse(body).data?.error.code;
  throw new LiveBroadcastApiError(code ?? `http_${response.status}`, response.status);
}

function authorizedHeaders(token: string) {
  return { ...mutationHeaders(), Authorization: `Bearer ${token}` };
}

export async function createLiveBroadcast(
  input: { locale: Locale; title: string; accessKey: string },
  signal: AbortSignal,
) {
  const response = await assertSuccessful(
    await fetch("/api/v1/live-broadcasts", {
      method: "POST",
      headers: mutationHeaders(),
      body: JSON.stringify(input),
      signal,
    }),
  );
  const parsed = createResponseSchema.safeParse(await responseBody(response));
  if (!parsed.success) throw new LiveBroadcastApiError("invalid_response", response.status);
  return parsed.data.data;
}

export async function listLiveBroadcasts(signal?: AbortSignal) {
  const response = await assertSuccessful(
    await fetch("/api/v1/live-broadcasts", { cache: "no-store", signal }),
  );
  const parsed = listResponseSchema.safeParse(await responseBody(response));
  if (!parsed.success) throw new LiveBroadcastApiError("invalid_response", response.status);
  return parsed.data.data.broadcasts;
}

export async function getLiveBroadcast(code: string, signal: AbortSignal) {
  const response = await assertSuccessful(
    await fetch(`/api/v1/live-broadcasts/${encodeURIComponent(code)}`, {
      cache: "no-store",
      signal,
    }),
  );
  const parsed = playbackResponseSchema.safeParse(await responseBody(response));
  if (!parsed.success) throw new LiveBroadcastApiError("invalid_response", response.status);
  return parsed.data.data;
}

export async function markLiveBroadcastLive(
  code: string,
  publisherToken: string,
  signal: AbortSignal,
) {
  await assertSuccessful(
    await fetch(`/api/v1/live-broadcasts/${encodeURIComponent(code)}/status`, {
      method: "POST",
      headers: authorizedHeaders(publisherToken),
      body: JSON.stringify({ state: "live" }),
      signal,
    }),
  );
}

export async function stopLiveBroadcast(
  code: string,
  publisherToken: string,
  options: { keepalive?: boolean } = {},
) {
  await assertSuccessful(
    await fetch(`/api/v1/live-broadcasts/${encodeURIComponent(code)}`, {
      method: "DELETE",
      headers: authorizedHeaders(publisherToken),
      keepalive: options.keepalive,
    }),
  );
}
