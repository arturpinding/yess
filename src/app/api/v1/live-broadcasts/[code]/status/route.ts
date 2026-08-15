import type { NextRequest } from "next/server";
import { updateLiveBroadcastStatusSchema } from "@/server/live-broadcast/contracts";
import {
  enforceLiveBroadcastRateLimit,
  isManagedBroadcastAvailable,
  liveBroadcastErrorResponse,
  liveBroadcastNotFoundResponse,
  readLiveBroadcastJson,
  requireLiveBroadcastBearer,
} from "@/server/live-broadcast/request";
import { liveBroadcastService } from "@/server/live-broadcast/service";
import { privateJson } from "@/server/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isManagedBroadcastAvailable()) return liveBroadcastNotFoundResponse();
  const authorization = requireLiveBroadcastBearer(request);
  if (!authorization.authorized) return authorization.response;
  const { code } = await context.params;
  const rateLimit = await enforceLiveBroadcastRateLimit(request, "status", {
    code,
    token: authorization.token,
  });
  if (!rateLimit.allowed) return rateLimit.response;

  const body = await readLiveBroadcastJson(request, 256);
  const parsed = body.valid ? updateLiveBroadcastStatusSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return privateJson(
      { error: { code: "invalid_request" } },
      { status: 400, headers: rateLimit.headers },
    );
  }

  try {
    const data = await liveBroadcastService.markLive(code, authorization.token);
    return privateJson({ data }, { headers: rateLimit.headers });
  } catch (error) {
    return liveBroadcastErrorResponse(error, rateLimit.headers);
  }
}
