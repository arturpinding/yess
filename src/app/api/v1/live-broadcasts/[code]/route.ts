import type { NextRequest } from "next/server";
import {
  enforceLiveBroadcastRateLimit,
  isManagedBroadcastAvailable,
  liveBroadcastErrorResponse,
  liveBroadcastNotFoundResponse,
  requireLiveBroadcastBearer,
} from "@/server/live-broadcast/request";
import { liveBroadcastService } from "@/server/live-broadcast/service";
import { privateJson } from "@/server/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!isManagedBroadcastAvailable()) return liveBroadcastNotFoundResponse();
  const { code } = await context.params;
  const rateLimit = await enforceLiveBroadcastRateLimit(request, "view", { code });
  if (!rateLimit.allowed) return rateLimit.response;
  try {
    const data = await liveBroadcastService.getPlayback(code);
    return privateJson({ data }, { headers: rateLimit.headers });
  } catch (error) {
    return liveBroadcastErrorResponse(error, rateLimit.headers);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isManagedBroadcastAvailable()) return liveBroadcastNotFoundResponse();
  const authorization = requireLiveBroadcastBearer(request);
  if (!authorization.authorized) return authorization.response;
  const { code } = await context.params;
  const rateLimit = await enforceLiveBroadcastRateLimit(request, "stop", {
    code,
    token: authorization.token,
  });
  if (!rateLimit.allowed) return rateLimit.response;
  try {
    const data = await liveBroadcastService.stop(code, authorization.token);
    return privateJson({ data }, { headers: rateLimit.headers });
  } catch (error) {
    return liveBroadcastErrorResponse(error, rateLimit.headers);
  }
}
