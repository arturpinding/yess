import { NextResponse } from "next/server";
import type { RateLimitDecision } from "@/server/security/rate-limiter";

export const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
} as const;

export const PUBLIC_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export function privateJson(body: unknown, init: ResponseInit = {}): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { ...PRIVATE_NO_STORE_HEADERS, ...Object.fromEntries(new Headers(init.headers)) },
  });
}

export function publicNoStoreJson(body: unknown, init: ResponseInit = {}): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { ...PUBLIC_NO_STORE_HEADERS, ...Object.fromEntries(new Headers(init.headers)) },
  });
}

export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(decision.limit),
    "RateLimit-Remaining": String(decision.remaining),
    "RateLimit-Reset": String(Math.ceil(decision.resetAt.getTime() / 1_000)),
  };
  if (!decision.allowed) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(decision.retryAfterMs / 1_000)));
  }
  return headers;
}
