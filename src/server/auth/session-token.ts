import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

export const SESSION_TOKEN_ISSUER = "rada-auth";
export const SESSION_TOKEN_AUDIENCE = "rada-web";
export const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;

export const USER_ROLES = ["viewer", "editor", "operator", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface CreateSessionTokenInput {
  userId: string;
  sessionId: string;
  profileId?: string;
  role: UserRole;
  /** Incrementing this server-side value revokes all older tokens. */
  sessionVersion: number;
}

export interface SessionTokenOptions {
  secret: string;
  now?: Date;
  ttlSeconds?: number;
}

const verifiedClaimsSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  profileId: z.string().min(1).optional(),
  role: z.enum(USER_ROLES),
  sessionVersion: z.number().int().nonnegative(),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string().min(1),
});

export type VerifiedSessionClaims = z.infer<typeof verifiedClaimsSchema>;

export class InvalidSessionTokenError extends Error {
  constructor() {
    super("Session token is invalid or expired");
    this.name = "InvalidSessionTokenError";
  }
}

function signingKey(secret: string): Uint8Array {
  const key = new TextEncoder().encode(secret);
  if (key.byteLength < 32) {
    throw new RangeError("Session signing secret must be at least 32 bytes");
  }
  return key;
}

function assertTtl(ttlSeconds: number): void {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 30 * 24 * 60 * 60) {
    throw new RangeError("Session token TTL must be between 60 seconds and 30 days");
  }
}

export async function createSessionToken(
  input: CreateSessionTokenInput,
  options: SessionTokenOptions,
): Promise<string> {
  const now = options.now ?? new Date();
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  assertTtl(ttlSeconds);
  if (input.sessionVersion < 0 || !Number.isInteger(input.sessionVersion)) {
    throw new RangeError("sessionVersion must be a non-negative integer");
  }

  const issuedAt = Math.floor(now.getTime() / 1_000);
  return new SignJWT({
    sid: input.sessionId,
    profileId: input.profileId,
    role: input.role,
    sessionVersion: input.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(SESSION_TOKEN_ISSUER)
    .setAudience(SESSION_TOKEN_AUDIENCE)
    .setSubject(input.userId)
    .setJti(input.sessionId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .sign(signingKey(options.secret));
}

export async function verifySessionToken(
  token: string,
  options: Pick<SessionTokenOptions, "secret" | "now">,
): Promise<VerifiedSessionClaims> {
  try {
    const { payload } = await jwtVerify(token, signingKey(options.secret), {
      algorithms: ["HS256"],
      issuer: SESSION_TOKEN_ISSUER,
      audience: SESSION_TOKEN_AUDIENCE,
      currentDate: options.now,
      clockTolerance: 5,
    });
    return verifiedClaimsSchema.parse(payload);
  } catch {
    throw new InvalidSessionTokenError();
  }
}

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

export function sessionCookieConfiguration(
  production: boolean,
  maxAge = DEFAULT_SESSION_TTL_SECONDS,
): { name: string; options: SessionCookieOptions } {
  return {
    // `__Host-` requires Secure and is therefore inappropriate for plain HTTP local development.
    name: production ? "__Host-rada-session" : "rada-session",
    options: {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      path: "/",
      maxAge,
    },
  };
}
