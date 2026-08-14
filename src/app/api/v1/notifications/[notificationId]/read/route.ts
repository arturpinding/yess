import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getViewerContext } from "@/server/auth/viewer-context";
import { notificationInboxScope } from "@/server/auth/notification-access";
import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { privateJson, rateLimitHeaders } from "@/server/http/api-response";
import { checkRequestCsrf, consumeApiRateLimit } from "@/server/security/request-guards";

const paramsSchema = z.object({ notificationId: z.string().uuid() });
const emptyBodySchema = z.object({}).strict();
const MARK_READ_RATE_LIMIT = { limit: 120, windowMs: 60_000 } as const;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ notificationId: string }> },
) {
  const viewer = await getViewerContext(request);
  if (!viewer) return privateJson({ error: { code: "authentication_required" } }, { status: 401 });
  const csrf = checkRequestCsrf(request, viewer.csrfSecretHash);
  if (!csrf.allowed) return privateJson({ error: { code: "csrf_failed" } }, { status: 403 });

  const decision = await consumeApiRateLimit(
    "notification-read",
    viewer.profileId,
    MARK_READ_RATE_LIMIT,
  );
  const headers = rateLimitHeaders(decision);
  if (!decision.allowed) {
    return privateJson({ error: { code: "rate_limited" } }, { status: 429, headers });
  }
  const parsedParams = paramsSchema.safeParse(await context.params);
  const parsedBody = emptyBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !parsedBody.success) {
    return privateJson({ error: { code: "invalid_request" } }, { status: 400, headers });
  }

  const [notification] = await db
    .update(notifications)
    .set({
      readAt: sql`coalesce(${notifications.readAt}, now())`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notifications.id, parsedParams.data.notificationId),
        notificationInboxScope(viewer.userId, viewer.profileId),
      ),
    )
    .returning({ id: notifications.id, readAt: notifications.readAt });
  if (!notification) {
    return privateJson({ error: { code: "notification_not_found" } }, { status: 404, headers });
  }
  return privateJson(
    { id: notification.id, read: true, readAt: notification.readAt?.toISOString() },
    { headers },
  );
}
