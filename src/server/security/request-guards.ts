import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getEnvironment } from "@/server/environment";
import { checkCsrfProtection, type CsrfFailureReason } from "./csrf";
import { InMemoryRateLimiter, type RateLimitDecision, type RateLimitPolicy } from "./rate-limiter";

export const CSRF_COOKIE_NAME = "rada-csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

const globalRateLimiter = globalThis as typeof globalThis & {
  radaApiRateLimiter?: InMemoryRateLimiter;
};

export const apiRateLimiter =
  globalRateLimiter.radaApiRateLimiter ?? new InMemoryRateLimiter({ maxEntries: 20_000 });

if (process.env.NODE_ENV !== "production") {
  globalRateLimiter.radaApiRateLimiter = apiRateLimiter;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type RequestCsrfResult =
  | { allowed: true; token: string }
  | { allowed: false; reason: CsrfFailureReason | "session-token-mismatch" };

/**
 * Applies same-origin plus double-submit protection. When a session hash is
 * supplied, the browser token must also be the token bound to that session.
 */
export function checkRequestCsrf(
  request: NextRequest,
  expectedTokenHash?: string,
): RequestCsrfResult {
  const token = request.cookies.get(CSRF_COOKIE_NAME)?.value ?? null;
  const result = checkCsrfProtection({
    method: request.method,
    authenticationMode: request.cookies.size > 0 ? "cookie" : "none",
    originHeader: request.headers.get("origin"),
    allowedOrigins: [getEnvironment().APP_ORIGIN],
    csrfCookieToken: token,
    csrfHeaderToken: request.headers.get(CSRF_HEADER_NAME),
  });

  if (!result.allowed) return result;
  if (!token) return { allowed: false, reason: "missing-token" };
  if (expectedTokenHash && sha256(token) !== expectedTokenHash) {
    return { allowed: false, reason: "session-token-mismatch" };
  }
  return { allowed: true, token };
}

export async function consumeApiRateLimit(
  namespace: string,
  subject: string,
  policy: RateLimitPolicy,
): Promise<RateLimitDecision> {
  return apiRateLimiter.consume(`${namespace}:${subject}`, policy);
}
