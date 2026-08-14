import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { CONTENT_TYPES, type ContentType } from "@/domain/content";

export const PLAYBACK_TOKEN_ISSUER = "rada-api";
export const PLAYBACK_TOKEN_AUDIENCE = "rada-media";
export const DEFAULT_PLAYBACK_TOKEN_TTL_SECONDS = 90;

export const PLAYBACK_PROTOCOLS = ["whep", "ll-hls", "hls"] as const;
export type PlaybackProtocol = (typeof PLAYBACK_PROTOCOLS)[number];

export interface CreatePlaybackTokenInput {
  profileId: string;
  playbackSessionId: string;
  eventId: string;
  streamId: string;
  rightsWindowId: string;
  entitlementId?: string;
  countryCode: string;
  contentType: ContentType;
  protocols: readonly PlaybackProtocol[];
  policyVersion: number;
}

export interface PlaybackTokenOptions {
  secret: string;
  now?: Date;
  ttlSeconds?: number;
  tokenId?: string;
}

const verifiedClaimsSchema = z.object({
  sub: z.string().min(1),
  playbackSessionId: z.string().min(1),
  eventId: z.string().min(1),
  streamId: z.string().min(1),
  rightsWindowId: z.string().min(1),
  entitlementId: z.string().min(1).optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  contentType: z.enum(CONTENT_TYPES),
  protocols: z.array(z.enum(PLAYBACK_PROTOCOLS)).min(1),
  policyVersion: z.number().int().nonnegative(),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string().min(1),
});

export type VerifiedPlaybackClaims = z.infer<typeof verifiedClaimsSchema>;

export class InvalidPlaybackTokenError extends Error {
  constructor() {
    super("Playback token is invalid or expired");
    this.name = "InvalidPlaybackTokenError";
  }
}

function signingKey(secret: string): Uint8Array {
  const key = new TextEncoder().encode(secret);
  if (key.byteLength < 32) {
    throw new RangeError("Media signing secret must be at least 32 bytes");
  }
  return key;
}

function assertTtl(ttlSeconds: number): void {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 15 || ttlSeconds > 120) {
    throw new RangeError("Playback token TTL must be between 15 and 120 seconds");
  }
}

export async function createPlaybackToken(
  input: CreatePlaybackTokenInput,
  options: PlaybackTokenOptions,
): Promise<string> {
  const now = options.now ?? new Date();
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_PLAYBACK_TOKEN_TTL_SECONDS;
  assertTtl(ttlSeconds);
  const countryCode = input.countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new RangeError("countryCode must be an ISO 3166-1 alpha-2 code");
  }
  if (input.protocols.length === 0 || new Set(input.protocols).size !== input.protocols.length) {
    throw new RangeError("At least one unique playback protocol is required");
  }
  if (!Number.isInteger(input.policyVersion) || input.policyVersion < 0) {
    throw new RangeError("policyVersion must be a non-negative integer");
  }

  const issuedAt = Math.floor(now.getTime() / 1_000);
  return new SignJWT({
    playbackSessionId: input.playbackSessionId,
    eventId: input.eventId,
    streamId: input.streamId,
    rightsWindowId: input.rightsWindowId,
    entitlementId: input.entitlementId,
    countryCode,
    contentType: input.contentType,
    protocols: input.protocols,
    policyVersion: input.policyVersion,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(PLAYBACK_TOKEN_ISSUER)
    .setAudience(PLAYBACK_TOKEN_AUDIENCE)
    .setSubject(input.profileId)
    .setJti(options.tokenId ?? randomUUID())
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .sign(signingKey(options.secret));
}

export async function verifyPlaybackToken(
  token: string,
  options: Pick<PlaybackTokenOptions, "secret" | "now">,
): Promise<VerifiedPlaybackClaims> {
  try {
    const { payload } = await jwtVerify(token, signingKey(options.secret), {
      algorithms: ["HS256"],
      issuer: PLAYBACK_TOKEN_ISSUER,
      audience: PLAYBACK_TOKEN_AUDIENCE,
      currentDate: options.now,
      clockTolerance: 2,
    });
    return verifiedClaimsSchema.parse(payload);
  } catch {
    throw new InvalidPlaybackTokenError();
  }
}
