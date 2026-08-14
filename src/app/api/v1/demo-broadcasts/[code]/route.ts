import type { NextRequest } from "next/server";
import {
  demoBroadcastErrorResponse,
  demoBroadcastNotFoundResponse,
  enforceDemoBroadcastRateLimit,
  isDemoBroadcastAvailable,
  requireDemoBroadcastBearer,
} from "@/server/demo-broadcast/request";
import { demoBroadcastService } from "@/server/demo-broadcast/service";
import { privateJson } from "@/server/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  if (!isDemoBroadcastAvailable()) return demoBroadcastNotFoundResponse();
  const { code } = await context.params;
  const authorization = requireDemoBroadcastBearer(request);
  const rateLimit = await enforceDemoBroadcastRateLimit(request, "delete", {
    code,
    ...(authorization.authorized ? { token: authorization.token } : {}),
  });
  if (!rateLimit.allowed) return rateLimit.response;
  if (!authorization.authorized) return authorization.response;

  try {
    const data = await demoBroadcastService.delete(code, authorization.token);
    return privateJson({ data }, { headers: rateLimit.headers });
  } catch (error) {
    return demoBroadcastErrorResponse(error, rateLimit.headers);
  }
}
