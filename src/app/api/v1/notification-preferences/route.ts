import { and, eq, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { NOTIFICATION_KINDS } from "@/domain/notification-preferences";
import { getViewerContext } from "@/server/auth/viewer-context";
import { db } from "@/server/db/client";
import { athletes, notificationPreferences, teams } from "@/server/db/schema";
import { privateJson, rateLimitHeaders } from "@/server/http/api-response";
import { checkRequestCsrf, consumeApiRateLimit } from "@/server/security/request-guards";

const preferenceSchema = z
  .object({
    targetType: z.enum(["global", "athlete", "team"]).default("global"),
    targetId: z.string().uuid().optional(),
    enabled: z.boolean(),
    leadMinutes: z.number().int().min(0).max(1_440).default(15),
    categories: z.array(z.enum(NOTIFICATION_KINDS)).min(1).max(NOTIFICATION_KINDS.length),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.targetType === "global" && value.targetId) {
      context.addIssue({
        code: "custom",
        path: ["targetId"],
        message: "Global preferences have no targetId",
      });
    }
    if (value.targetType !== "global" && !value.targetId) {
      context.addIssue({ code: "custom", path: ["targetId"], message: "targetId is required" });
    }
    if (new Set(value.categories).size !== value.categories.length) {
      context.addIssue({
        code: "custom",
        path: ["categories"],
        message: "Categories must be unique",
      });
    }
  });

const PREFERENCE_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const;

export async function POST(request: NextRequest) {
  const viewer = await getViewerContext(request);
  if (!viewer) {
    return privateJson({ error: { code: "authentication_required" } }, { status: 401 });
  }
  const csrf = checkRequestCsrf(request, viewer.csrfSecretHash);
  if (!csrf.allowed) {
    return privateJson({ error: { code: "csrf_failed" } }, { status: 403 });
  }
  const decision = await consumeApiRateLimit(
    "notification-preferences",
    viewer.profileId,
    PREFERENCE_RATE_LIMIT,
  );
  const headers = rateLimitHeaders(decision);
  if (!decision.allowed) {
    return privateJson({ error: { code: "rate_limited" } }, { status: 429, headers });
  }

  const parsed = preferenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return privateJson(
      { error: { code: "invalid_request", fields: parsed.error.flatten().fieldErrors } },
      { status: 400, headers },
    );
  }
  const { targetType, targetId, enabled, leadMinutes, categories } = parsed.data;
  if (targetType === "athlete") {
    const [target] = await db
      .select({ id: athletes.id })
      .from(athletes)
      .where(eq(athletes.id, targetId!))
      .limit(1);
    if (!target)
      return privateJson({ error: { code: "target_not_found" } }, { status: 404, headers });
  }
  if (targetType === "team") {
    const [target] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, targetId!))
      .limit(1);
    if (!target)
      return privateJson({ error: { code: "target_not_found" } }, { status: 404, headers });
  }

  const preferences = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${viewer.profileId}, 1))`);
    const scope: SQL =
      targetType === "athlete"
        ? eq(notificationPreferences.athleteId, targetId!)
        : targetType === "team"
          ? eq(notificationPreferences.teamId, targetId!)
          : and(
              isNull(notificationPreferences.athleteId),
              isNull(notificationPreferences.teamId),
              isNull(notificationPreferences.sportId),
              isNull(notificationPreferences.competitionId),
            )!;
    const now = new Date();

    await tx
      .update(notificationPreferences)
      .set({ enabled: false, updatedAt: now })
      .where(
        and(
          eq(notificationPreferences.profileId, viewer.profileId),
          eq(notificationPreferences.channel, "in_app"),
          scope,
          notInArray(notificationPreferences.kind, categories),
        ),
      );

    const result: Array<{ id: string; kind: (typeof NOTIFICATION_KINDS)[number] }> = [];
    for (const kind of categories) {
      const where = and(
        eq(notificationPreferences.profileId, viewer.profileId),
        eq(notificationPreferences.channel, "in_app"),
        eq(notificationPreferences.kind, kind),
        scope,
      );
      const [existing] = await tx
        .select({ id: notificationPreferences.id })
        .from(notificationPreferences)
        .where(where)
        .limit(1);
      if (existing) {
        await tx
          .update(notificationPreferences)
          .set({ enabled, leadMinutes, updatedAt: now })
          .where(eq(notificationPreferences.id, existing.id));
        result.push({ id: existing.id, kind });
      } else {
        const [inserted] = await tx
          .insert(notificationPreferences)
          .values({
            profileId: viewer.profileId,
            channel: "in_app",
            kind,
            athleteId: targetType === "athlete" ? targetId : null,
            teamId: targetType === "team" ? targetId : null,
            enabled,
            leadMinutes,
          })
          .returning({ id: notificationPreferences.id });
        if (inserted) result.push({ id: inserted.id, kind });
      }
    }
    return result;
  });

  return privateJson(
    { targetType, targetId: targetId ?? null, enabled, leadMinutes, categories, preferences },
    { headers },
  );
}
