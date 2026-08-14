import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  DEFAULT_SESSION_TTL_SECONDS,
  sessionCookieConfiguration,
} from "@/server/auth/session-token";
import { getViewerContext } from "@/server/auth/viewer-context";
import { db } from "@/server/db/client";
import { DEMO_PROFILE_ID, DEMO_USER_ID } from "@/server/db/demo-ids";
import { profiles, sessions, users } from "@/server/db/schema";
import { getEnvironment } from "@/server/environment";
import { privateJson, rateLimitHeaders } from "@/server/http/api-response";
import { checkRequestCsrf, consumeApiRateLimit, sha256 } from "@/server/security/request-guards";

const emptyBodySchema = z.object({}).strict();
const SESSION_RATE_LIMIT = { limit: 12, windowMs: 60_000 } as const;

function anonymousRateLimitSubject(request: NextRequest): string {
  // The digest is only a local abuse-control key and is never logged or persisted.
  const address =
    request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
  return sha256(address.split(",", 1)[0]?.trim() || "local");
}

export async function POST(request: NextRequest) {
  const environment = getEnvironment();
  if (environment.NODE_ENV === "production") {
    return privateJson({ error: { code: "not_found" } }, { status: 404 });
  }

  const csrf = checkRequestCsrf(request);
  if (!csrf.allowed) {
    return privateJson({ error: { code: "csrf_failed" } }, { status: 403 });
  }

  const rateLimit = await consumeApiRateLimit(
    "demo-session",
    anonymousRateLimitSubject(request),
    SESSION_RATE_LIMIT,
  );
  if (!rateLimit.allowed) {
    return privateJson(
      { error: { code: "rate_limited" } },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  const body = await request.json().catch(() => null);
  if (!emptyBodySchema.safeParse(body).success) {
    return privateJson(
      { error: { code: "invalid_request" } },
      { status: 400, headers: rateLimitHeaders(rateLimit) },
    );
  }

  const existing = await getViewerContext(request);
  if (existing?.userId === DEMO_USER_ID && existing.profileId === DEMO_PROFILE_ID) {
    return privateJson(
      { authenticated: true, profileId: DEMO_PROFILE_ID },
      { headers: rateLimitHeaders(rateLimit) },
    );
  }

  const [demoIdentity] = await db
    .select({ userId: users.id, profileId: profiles.id, role: users.role })
    .from(users)
    .innerJoin(profiles, and(eq(profiles.id, DEMO_PROFILE_ID), eq(profiles.userId, users.id)))
    .where(eq(users.id, DEMO_USER_ID))
    .limit(1);
  if (!demoIdentity) {
    return privateJson(
      { error: { code: "demo_data_unavailable" } },
      { status: 503, headers: rateLimitHeaders(rateLimit) },
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_SESSION_TTL_SECONDS * 1_000);
  const sessionId = randomUUID();
  const token = await createSessionToken(
    {
      userId: demoIdentity.userId,
      profileId: demoIdentity.profileId,
      sessionId,
      role: demoIdentity.role,
      sessionVersion: 0,
    },
    { secret: environment.SESSION_SECRET, now },
  );

  await db.insert(sessions).values({
    id: sessionId,
    userId: demoIdentity.userId,
    tokenHash: sha256(token),
    csrfSecretHash: sha256(csrf.token),
    issuedAt: now,
    expiresAt,
    lastSeenAt: now,
  });

  const response = privateJson(
    { authenticated: true, profileId: demoIdentity.profileId, expiresAt: expiresAt.toISOString() },
    { status: 201, headers: rateLimitHeaders(rateLimit) },
  );
  const cookie = sessionCookieConfiguration(false);
  response.cookies.set(cookie.name, token, cookie.options);
  return response;
}
