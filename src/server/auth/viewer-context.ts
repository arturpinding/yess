import { and, eq, gt, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { verifySessionToken, sessionCookieConfiguration, type UserRole } from "./session-token";
import { db } from "@/server/db/client";
import { profiles, sessions, users } from "@/server/db/schema";
import { getEnvironment } from "@/server/environment";
import { sha256 } from "@/server/security/request-guards";

export interface ViewerContext {
  userId: string;
  profileId: string;
  sessionId: string;
  role: UserRole;
  locale: "et" | "en";
  timezone: string;
  maturityLimit: number;
  analyticsConsent: boolean;
  csrfSecretHash: string;
}

/**
 * A reserved UUID used only to produce an empty personalization scope for an
 * anonymous request. It is never inserted into the profiles table.
 */
export const ANONYMOUS_PROFILE_ID = "00000000-0000-0000-0000-000000000000";

export function personalizationProfileId(viewer: Pick<ViewerContext, "profileId"> | null): string {
  return viewer?.profileId ?? ANONYMOUS_PROFILE_ID;
}

/**
 * Resolves cookie authority against the current database session, user, and
 * selected profile. JWT verification alone is intentionally insufficient.
 */
export async function getViewerContextFromToken(
  token: string | null | undefined,
): Promise<ViewerContext | null> {
  const environment = getEnvironment();
  if (!token) return null;

  try {
    const claims = await verifySessionToken(token, { secret: environment.SESSION_SECRET });
    if (!claims.profileId) return null;
    const now = new Date();
    const [row] = await db
      .select({
        userId: users.id,
        role: users.role,
        userState: users.state,
        timezone: users.timezone,
        analyticsConsentAt: users.analyticsConsentAt,
        profileId: profiles.id,
        profileLocale: profiles.locale,
        maturityLimit: profiles.maturityLimit,
        csrfSecretHash: sessions.csrfSecretHash,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(
        profiles,
        and(eq(profiles.id, claims.profileId), eq(profiles.userId, sessions.userId)),
      )
      .where(
        and(
          eq(sessions.id, claims.sid),
          eq(sessions.userId, claims.sub),
          eq(sessions.tokenHash, sha256(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .limit(1);

    if (!row || row.userState !== "active") return null;
    return {
      userId: row.userId,
      profileId: row.profileId,
      sessionId: claims.sid,
      role: row.role,
      locale: row.profileLocale === "en" ? "en" : "et",
      timezone: row.timezone,
      maturityLimit: row.maturityLimit,
      analyticsConsent: row.analyticsConsentAt !== null,
      csrfSecretHash: row.csrfSecretHash,
    };
  } catch {
    return null;
  }
}

export async function getViewerContext(request: NextRequest): Promise<ViewerContext | null> {
  const environment = getEnvironment();
  const cookie = sessionCookieConfiguration(environment.NODE_ENV === "production");
  return getViewerContextFromToken(request.cookies.get(cookie.name)?.value);
}
