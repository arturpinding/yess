import { and, isNull, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getViewerContext } from "@/server/auth/viewer-context";
import { notificationInboxScope } from "@/server/auth/notification-access";
import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { privateJson, rateLimitHeaders } from "@/server/http/api-response";
import { checkRequestCsrf, consumeApiRateLimit } from "@/server/security/request-guards";

const requestSchema = z.object({ all: z.literal(true) }).strict();
const MARK_ALL_READ_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;

export async function POST(request: NextRequest) {
  const viewer = await getViewerContext(request);
  if (!viewer) return privateJson({ error: { code: "authentication_required" } }, { status: 401 });
  const csrf = checkRequestCsrf(request, viewer.csrfSecretHash);
  if (!csrf.allowed) return privateJson({ error: { code: "csrf_failed" } }, { status: 403 });

  const decision = await consumeApiRateLimit(
    "notifications-read-all",
    viewer.profileId,
    MARK_ALL_READ_RATE_LIMIT,
  );
  const headers = rateLimitHeaders(decision);
  if (!decision.allowed) {
    return privateJson({ error: { code: "rate_limited" } }, { status: 429, headers });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return privateJson({ error: { code: "invalid_request" } }, { status: 400, headers });
  }

  const updated = await db
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())`, updatedAt: new Date() })
    .where(
      and(notificationInboxScope(viewer.userId, viewer.profileId), isNull(notifications.readAt)),
    )
    .returning({ id: notifications.id });
  return privateJson({ all: true, updated: updated.length }, { headers });
}
