import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { parseDemoBroadcastBearer } from "@/server/demo-broadcast/contracts";
import { getEnvironment } from "@/server/environment";
import { privateJson, rateLimitHeaders } from "@/server/http/api-response";
import { checkRequestCsrf, consumeApiRateLimit, sha256 } from "@/server/security/request-guards";
import { LiveBroadcastError } from "./service";

export { isManagedBroadcastAvailable } from "@/server/demo-broadcast/availability";

const RATE_LIMIT_POLICIES = {
  create: { limit: 5, windowMs: 60_000 },
  list: { limit: 60, windowMs: 60_000 },
  view: { limit: 90, windowMs: 60_000 },
  status: { limit: 30, windowMs: 60_000 },
  stop: { limit: 30, windowMs: 60_000 },
} as const;

export type LiveBroadcastOperation = keyof typeof RATE_LIMIT_POLICIES;

export function liveBroadcastNotFoundResponse() {
  return privateJson({ error: { code: "not_found" } }, { status: 404 });
}

export function requireLiveBroadcastCsrf(request: NextRequest) {
  const result = checkRequestCsrf(request);
  return result.allowed ? null : privateJson({ error: { code: "csrf_failed" } }, { status: 403 });
}

export function liveBroadcastAccessKeyMatches(accessKey: string): boolean {
  const expected = getEnvironment().PHONE_BROADCAST_ACCESS_KEY;
  if (!expected) return false;
  const actualHash = createHash("sha256").update(accessKey).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export function requireLiveBroadcastBearer(
  request: NextRequest,
):
  | { authorized: true; token: string }
  | { authorized: false; response: ReturnType<typeof privateJson> } {
  const token = parseDemoBroadcastBearer(request.headers.get("authorization"));
  return token
    ? { authorized: true, token }
    : {
        authorized: false,
        response: privateJson({ error: { code: "invalid_authorization" } }, { status: 401 }),
      };
}

function clientAddressSubject(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "local";
  return sha256(address.slice(0, 256));
}

export async function enforceLiveBroadcastRateLimit(
  request: NextRequest,
  operation: LiveBroadcastOperation,
  identifiers: { code?: string; token?: string } = {},
) {
  const policy = RATE_LIMIT_POLICIES[operation];
  const subjects: Array<[string, string]> = [["ip", clientAddressSubject(request)]];
  if (identifiers.code) subjects.push(["code", sha256(identifiers.code)]);
  if (identifiers.token) subjects.push(["token", sha256(identifiers.token)]);

  let tightestDecision;
  for (const [kind, subject] of subjects) {
    const decision = await consumeApiRateLimit(
      `live-broadcast:${operation}:${kind}`,
      subject,
      policy,
    );
    if (
      !tightestDecision ||
      decision.remaining / decision.limit < tightestDecision.remaining / tightestDecision.limit
    ) {
      tightestDecision = decision;
    }
    if (!decision.allowed) {
      return {
        allowed: false as const,
        response: privateJson(
          { error: { code: "rate_limited" } },
          { status: 429, headers: rateLimitHeaders(decision) },
        ),
      };
    }
  }

  if (!tightestDecision) throw new Error("At least one rate-limit subject is required");
  return { allowed: true as const, headers: rateLimitHeaders(tightestDecision) };
}

export async function readLiveBroadcastJson(request: NextRequest, maxBytes: number) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.isFinite(Number(contentLength)) && Number(contentLength) > maxBytes) {
    return { valid: false as const };
  }
  const raw = await request.text().catch(() => null);
  if (raw === null || Buffer.byteLength(raw, "utf8") > maxBytes) {
    return { valid: false as const };
  }
  try {
    return { valid: true as const, value: JSON.parse(raw) as unknown };
  } catch {
    return { valid: false as const };
  }
}

export function liveBroadcastErrorResponse(error: unknown, headers: Record<string, string> = {}) {
  if (error instanceof LiveBroadcastError) {
    return privateJson({ error: { code: error.code } }, { status: error.status, headers });
  }
  // Provider responses and publishing URLs are credentials; never log the error object here.
  return privateJson({ error: { code: "internal_error" } }, { status: 500, headers });
}
