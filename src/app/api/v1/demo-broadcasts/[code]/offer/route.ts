import type { NextRequest } from "next/server";
import { demoBroadcastOfferSchema, MAX_SDP_BYTES } from "@/server/demo-broadcast/contracts";
import {
  demoBroadcastErrorResponse,
  demoBroadcastNotFoundResponse,
  enforceDemoBroadcastRateLimit,
  isDemoBroadcastAvailable,
  readDemoBroadcastJson,
  requireDemoBroadcastBearer,
} from "@/server/demo-broadcast/request";
import { demoBroadcastService } from "@/server/demo-broadcast/service";
import { privateJson } from "@/server/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  if (!isDemoBroadcastAvailable()) return demoBroadcastNotFoundResponse();
  const { code } = await context.params;
  const authorization = requireDemoBroadcastBearer(request);
  const rateLimit = await enforceDemoBroadcastRateLimit(request, "signal", {
    code,
    ...(authorization.authorized ? { token: authorization.token } : {}),
  });
  if (!rateLimit.allowed) return rateLimit.response;
  if (!authorization.authorized) return authorization.response;

  const body = await readDemoBroadcastJson(request, MAX_SDP_BYTES + 1_024);
  const parsed = body.valid ? demoBroadcastOfferSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return privateJson(
      { error: { code: "invalid_request" } },
      { status: 400, headers: rateLimit.headers },
    );
  }

  try {
    const data = await demoBroadcastService.submitOffer(code, authorization.token, parsed.data);
    return privateJson({ data }, { headers: rateLimit.headers });
  } catch (error) {
    return demoBroadcastErrorResponse(error, rateLimit.headers);
  }
}
