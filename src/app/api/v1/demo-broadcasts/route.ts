import type { NextRequest } from "next/server";
import { createDemoBroadcastSchema } from "@/server/demo-broadcast/contracts";
import {
  demoBroadcastErrorResponse,
  demoBroadcastNotFoundResponse,
  enforceDemoBroadcastRateLimit,
  isDemoBroadcastAvailable,
  readDemoBroadcastJson,
  requireDemoBroadcastCsrf,
} from "@/server/demo-broadcast/request";
import { demoBroadcastService } from "@/server/demo-broadcast/service";
import { privateJson } from "@/server/http/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Deliberately precedes CSRF, body parsing, rate limiting and data access.
  if (!isDemoBroadcastAvailable()) return demoBroadcastNotFoundResponse();

  const csrfResponse = requireDemoBroadcastCsrf(request);
  if (csrfResponse) return csrfResponse;
  const rateLimit = await enforceDemoBroadcastRateLimit(request, "create");
  if (!rateLimit.allowed) return rateLimit.response;

  const body = await readDemoBroadcastJson(request, 1_024);
  const parsed = body.valid ? createDemoBroadcastSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return privateJson(
      { error: { code: "invalid_request" } },
      { status: 400, headers: rateLimit.headers },
    );
  }

  try {
    const data = await demoBroadcastService.create(parsed.data.locale);
    return privateJson({ data }, { status: 201, headers: rateLimit.headers });
  } catch (error) {
    return demoBroadcastErrorResponse(error, rateLimit.headers);
  }
}
