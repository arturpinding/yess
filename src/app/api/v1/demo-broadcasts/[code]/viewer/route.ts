import type { NextRequest } from "next/server";
import { emptyDemoBroadcastBodySchema } from "@/server/demo-broadcast/contracts";
import {
  demoBroadcastErrorResponse,
  demoBroadcastNotFoundResponse,
  enforceDemoBroadcastRateLimit,
  isDemoBroadcastAvailable,
  readDemoBroadcastJson,
  requireDemoBroadcastCsrf,
} from "@/server/demo-broadcast/request";
import { demoBroadcastService } from "@/server/demo-broadcast/service";
import { getDemoBroadcastIceServers } from "@/server/demo-broadcast/ice-config";
import { privateJson } from "@/server/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  if (!isDemoBroadcastAvailable()) return demoBroadcastNotFoundResponse();
  const csrfResponse = requireDemoBroadcastCsrf(request);
  if (csrfResponse) return csrfResponse;
  const { code } = await context.params;
  const rateLimit = await enforceDemoBroadcastRateLimit(request, "viewer", { code });
  if (!rateLimit.allowed) return rateLimit.response;

  const body = await readDemoBroadcastJson(request, 256);
  const parsed = body.valid ? emptyDemoBroadcastBodySchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return privateJson(
      { error: { code: "invalid_request" } },
      { status: 400, headers: rateLimit.headers },
    );
  }

  try {
    const data = {
      ...(await demoBroadcastService.claimViewer(code)),
      iceServers: getDemoBroadcastIceServers(),
    };
    return privateJson({ data }, { status: 201, headers: rateLimit.headers });
  } catch (error) {
    return demoBroadcastErrorResponse(error, rateLimit.headers);
  }
}
