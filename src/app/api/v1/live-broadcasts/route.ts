import type { NextRequest } from "next/server";
import { createLiveBroadcastSchema } from "@/server/live-broadcast/contracts";
import {
  enforceLiveBroadcastRateLimit,
  isManagedBroadcastAvailable,
  liveBroadcastAccessKeyMatches,
  liveBroadcastErrorResponse,
  liveBroadcastNotFoundResponse,
  readLiveBroadcastJson,
  requireLiveBroadcastCsrf,
} from "@/server/live-broadcast/request";
import { liveBroadcastService } from "@/server/live-broadcast/service";
import { privateJson } from "@/server/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isManagedBroadcastAvailable()) return liveBroadcastNotFoundResponse();
  const rateLimit = await enforceLiveBroadcastRateLimit(request, "list");
  if (!rateLimit.allowed) return rateLimit.response;
  try {
    const broadcasts = await liveBroadcastService.list();
    return privateJson({ data: { broadcasts } }, { headers: rateLimit.headers });
  } catch (error) {
    return liveBroadcastErrorResponse(error, rateLimit.headers);
  }
}

export async function POST(request: NextRequest) {
  if (!isManagedBroadcastAvailable()) return liveBroadcastNotFoundResponse();
  const csrfResponse = requireLiveBroadcastCsrf(request);
  if (csrfResponse) return csrfResponse;
  const rateLimit = await enforceLiveBroadcastRateLimit(request, "create");
  if (!rateLimit.allowed) return rateLimit.response;

  const body = await readLiveBroadcastJson(request, 2_048);
  const parsed = body.valid ? createLiveBroadcastSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return privateJson(
      { error: { code: "invalid_request" } },
      { status: 400, headers: rateLimit.headers },
    );
  }
  if (!liveBroadcastAccessKeyMatches(parsed.data.accessKey)) {
    return privateJson(
      { error: { code: "invalid_access_key" } },
      { status: 401, headers: rateLimit.headers },
    );
  }

  try {
    const data = await liveBroadcastService.create({
      locale: parsed.data.locale,
      title: parsed.data.title,
    });
    return privateJson({ data }, { status: 201, headers: rateLimit.headers });
  } catch (error) {
    return liveBroadcastErrorResponse(error, rateLimit.headers);
  }
}
