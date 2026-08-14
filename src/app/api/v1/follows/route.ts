import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getViewerContext, type ViewerContext } from "@/server/auth/viewer-context";
import { db } from "@/server/db/client";
import { athletes, competitions, follows, sports, teams } from "@/server/db/schema";
import {
  followInsertValues,
  followMutationSchema,
  type FollowTargetType,
} from "@/server/follows/follow-target";
import { privateJson, rateLimitHeaders } from "@/server/http/api-response";
import { checkRequestCsrf, consumeApiRateLimit } from "@/server/security/request-guards";

const FOLLOW_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;

async function targetExists(targetType: FollowTargetType, targetId: string): Promise<boolean> {
  switch (targetType) {
    case "athlete":
      return Boolean(
        (
          await db
            .select({ id: athletes.id })
            .from(athletes)
            .where(eq(athletes.id, targetId))
            .limit(1)
        )[0],
      );
    case "team":
      return Boolean(
        (await db.select({ id: teams.id }).from(teams).where(eq(teams.id, targetId)).limit(1))[0],
      );
    case "sport":
      return Boolean(
        (
          await db.select({ id: sports.id }).from(sports).where(eq(sports.id, targetId)).limit(1)
        )[0],
      );
    case "competition":
      return Boolean(
        (
          await db
            .select({ id: competitions.id })
            .from(competitions)
            .where(eq(competitions.id, targetId))
            .limit(1)
        )[0],
      );
  }
}

async function authorizeMutation(
  request: NextRequest,
): Promise<
  | { viewer: ViewerContext; headers: Record<string, string> }
  | { response: ReturnType<typeof privateJson> }
> {
  const viewer = await getViewerContext(request);
  if (!viewer) {
    return {
      response: privateJson({ error: { code: "authentication_required" } }, { status: 401 }),
    };
  }
  const csrf = checkRequestCsrf(request, viewer.csrfSecretHash);
  if (!csrf.allowed) {
    return { response: privateJson({ error: { code: "csrf_failed" } }, { status: 403 }) };
  }
  const decision = await consumeApiRateLimit("follows", viewer.profileId, FOLLOW_RATE_LIMIT);
  const headers = rateLimitHeaders(decision);
  if (!decision.allowed) {
    return {
      response: privateJson({ error: { code: "rate_limited" } }, { status: 429, headers }),
    };
  }
  return { viewer, headers };
}

async function parseMutation(request: NextRequest) {
  const json = await request.json().catch(() => null);
  return followMutationSchema.safeParse(json);
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeMutation(request);
  if ("response" in authorization) return authorization.response;

  const parsed = await parseMutation(request);
  if (!parsed.success) {
    return privateJson(
      { error: { code: "invalid_request", fields: parsed.error.flatten().fieldErrors } },
      { status: 400, headers: authorization.headers },
    );
  }
  const { targetId, targetType } = parsed.data;
  if (!(await targetExists(targetType, targetId))) {
    return privateJson(
      { error: { code: "target_not_found" } },
      { status: 404, headers: authorization.headers },
    );
  }

  await db
    .insert(follows)
    .values(
      followInsertValues(
        authorization.viewer.profileId,
        targetType,
        targetId,
      ) as typeof follows.$inferInsert,
    )
    .onConflictDoNothing();

  return privateJson({ targetType, targetId, following: true }, { headers: authorization.headers });
}

export async function DELETE(request: NextRequest) {
  const authorization = await authorizeMutation(request);
  if ("response" in authorization) return authorization.response;

  const parsed = await parseMutation(request);
  if (!parsed.success) {
    return privateJson(
      { error: { code: "invalid_request", fields: parsed.error.flatten().fieldErrors } },
      { status: 400, headers: authorization.headers },
    );
  }
  const { targetId, targetType } = parsed.data;
  const profile = eq(follows.profileId, authorization.viewer.profileId);
  switch (targetType) {
    case "athlete":
      await db.delete(follows).where(and(profile, eq(follows.athleteId, targetId)));
      break;
    case "team":
      await db.delete(follows).where(and(profile, eq(follows.teamId, targetId)));
      break;
    case "sport":
      await db.delete(follows).where(and(profile, eq(follows.sportId, targetId)));
      break;
    case "competition":
      await db.delete(follows).where(and(profile, eq(follows.competitionId, targetId)));
      break;
  }

  return privateJson(
    { targetType, targetId, following: false },
    { headers: authorization.headers },
  );
}
