import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { mutationHeaders } from "@/components/client-security";

const descriptionSchema = z.object({
  type: z.enum(["offer", "answer"]),
  sdp: z.string().min(1).max(131_072),
});

const iceServerSchema = z.object({
  urls: z.union([z.string(), z.array(z.string()).min(1)]),
  username: z.string().optional(),
  credential: z.string().optional(),
});

const createResponseSchema = z.object({
  data: z.object({
    code: z.string(),
    publisherToken: z.string().min(16),
    expiresAt: z.string().datetime(),
    iceServers: z.array(iceServerSchema),
  }),
});

const viewerResponseSchema = z.object({
  data: z.object({
    viewerToken: z.string().min(16),
    offer: descriptionSchema.extend({ type: z.literal("offer") }),
    expiresAt: z.string().datetime(),
    iceServers: z.array(iceServerSchema),
  }),
});

const answerResponseSchema = z.object({
  data: z.object({
    answer: descriptionSchema.extend({ type: z.literal("answer") }).nullable(),
    state: z.string(),
    expiresAt: z.string().datetime(),
  }),
});

export class BroadcastApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "BroadcastApiError";
    this.code = code;
    this.status = status;
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
  throw new BroadcastApiError(code ?? `http_${response.status}`, response.status);
}

function authorizedHeaders(token: string) {
  return { ...mutationHeaders(), Authorization: `Bearer ${token}` };
}

export async function createBroadcast(locale: Locale, signal: AbortSignal) {
  const response = await assertSuccessful(
    await fetch("/api/v1/demo-broadcasts", {
      method: "POST",
      headers: mutationHeaders(),
      body: JSON.stringify({ locale }),
      signal,
    }),
  );
  const parsed = createResponseSchema.safeParse(await responseBody(response));
  if (!parsed.success) throw new BroadcastApiError("invalid_response", response.status);
  return parsed.data.data;
}

export async function submitOffer(
  code: string,
  publisherToken: string,
  offer: RTCSessionDescriptionInit,
  signal: AbortSignal,
) {
  await assertSuccessful(
    await fetch(`/api/v1/demo-broadcasts/${code}/offer`, {
      method: "POST",
      headers: authorizedHeaders(publisherToken),
      body: JSON.stringify({ type: "offer", sdp: offer.sdp }),
      signal,
    }),
  );
}

export async function claimViewer(code: string, signal: AbortSignal) {
  const response = await assertSuccessful(
    await fetch(`/api/v1/demo-broadcasts/${code}/viewer`, {
      method: "POST",
      headers: mutationHeaders(),
      body: JSON.stringify({}),
      signal,
    }),
  );
  const parsed = viewerResponseSchema.safeParse(await responseBody(response));
  if (!parsed.success) throw new BroadcastApiError("invalid_response", response.status);
  return parsed.data.data;
}

export async function submitAnswer(
  code: string,
  viewerToken: string,
  answer: RTCSessionDescriptionInit,
  signal: AbortSignal,
) {
  await assertSuccessful(
    await fetch(`/api/v1/demo-broadcasts/${code}/answer`, {
      method: "POST",
      headers: authorizedHeaders(viewerToken),
      body: JSON.stringify({ type: "answer", sdp: answer.sdp }),
      signal,
    }),
  );
}

export async function getAnswer(code: string, publisherToken: string, signal: AbortSignal) {
  const response = await assertSuccessful(
    await fetch(`/api/v1/demo-broadcasts/${code}/answer`, {
      headers: { Authorization: `Bearer ${publisherToken}` },
      cache: "no-store",
      signal,
    }),
  );
  const parsed = answerResponseSchema.safeParse(await responseBody(response));
  if (!parsed.success) throw new BroadcastApiError("invalid_response", response.status);
  return parsed.data.data;
}

export async function deleteBroadcast(
  code: string,
  publisherToken: string,
  options: { keepalive?: boolean } = {},
) {
  await assertSuccessful(
    await fetch(`/api/v1/demo-broadcasts/${code}`, {
      method: "DELETE",
      headers: authorizedHeaders(publisherToken),
      keepalive: options.keepalive,
    }),
  );
}
