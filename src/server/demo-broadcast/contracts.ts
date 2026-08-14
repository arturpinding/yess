import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const DEMO_BROADCAST_TTL_MS = 30 * 60 * 1_000;
export const DEMO_BROADCAST_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const DEMO_BROADCAST_CODE_LENGTH = 8;
export const DEMO_BROADCAST_CODE_ENTROPY_BITS = 40;
export const MAX_SDP_BYTES = 128 * 1_024;

const canonicalCodePattern = /^[0-9A-HJKMNP-TV-Z]{8}$/;
const generatedTokenPattern = /^[A-Za-z0-9_-]{43}$/;

const sdpSchema = z
  .string()
  .min(4)
  .refine((value) => Buffer.byteLength(value, "utf8") <= MAX_SDP_BYTES, {
    message: `SDP must not exceed ${MAX_SDP_BYTES} bytes`,
  })
  .refine((value) => !value.includes("\0"), { message: "SDP must not contain NUL bytes" })
  .refine((value) => /^v=0(?:\r\n|\n)/.test(value), {
    message: "SDP must start with a version line",
  });

export const createDemoBroadcastSchema = z.object({ locale: z.enum(["et", "en"]) }).strict();
export const emptyDemoBroadcastBodySchema = z.object({}).strict();
export const demoBroadcastOfferSchema = z
  .object({ type: z.literal("offer"), sdp: sdpSchema })
  .strict();
export const demoBroadcastAnswerSchema = z
  .object({ type: z.literal("answer"), sdp: sdpSchema })
  .strict();

export type DemoBroadcastLocale = z.infer<typeof createDemoBroadcastSchema>["locale"];
export type DemoBroadcastOffer = z.infer<typeof demoBroadcastOfferSchema>;
export type DemoBroadcastAnswer = z.infer<typeof demoBroadcastAnswerSchema>;

/** Accepts human-entered separators/case and Crockford's O/I/L aliases. */
export function normalizeDemoBroadcastCode(value: string): string | null {
  const normalized = value
    .replace(/[\s-]+/g, "")
    .toUpperCase()
    .replaceAll("O", "0")
    .replace(/[IL]/g, "1");
  return canonicalCodePattern.test(normalized) ? normalized : null;
}

export function formatDemoBroadcastCode(canonicalCode: string): string {
  if (!canonicalCodePattern.test(canonicalCode)) {
    throw new RangeError("A canonical demo broadcast code is required");
  }
  return `${canonicalCode.slice(0, 4)}-${canonicalCode.slice(4)}`;
}

/** Eight uniformly selected base-32 symbols carry exactly 40 bits of entropy. */
export function generateDemoBroadcastCode(bytes: (size: number) => Buffer = randomBytes): string {
  const random = bytes(DEMO_BROADCAST_CODE_LENGTH);
  if (random.length < DEMO_BROADCAST_CODE_LENGTH) {
    throw new RangeError("The random byte source returned too few bytes");
  }
  let code = "";
  for (let index = 0; index < DEMO_BROADCAST_CODE_LENGTH; index += 1) {
    const value = random[index];
    if (value === undefined) throw new RangeError("Missing random byte");
    code += DEMO_BROADCAST_CODE_ALPHABET[value & 31];
  }
  return code;
}

/** A 256-bit, URL-safe credential. Only its SHA-256 digest is persisted. */
export function generateDemoBroadcastToken(bytes: (size: number) => Buffer = randomBytes): string {
  const random = bytes(32);
  if (random.length !== 32) {
    throw new RangeError("The random byte source must return exactly 32 bytes");
  }
  return random.toString("base64url");
}

export function hashDemoBroadcastSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function demoBroadcastSecretMatches(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashDemoBroadcastSecret(value), "hex");
  const expected = /^[0-9a-f]{64}$/.test(expectedHash)
    ? Buffer.from(expectedHash, "hex")
    : Buffer.alloc(actual.length);
  return timingSafeEqual(actual, expected) && /^[0-9a-f]{64}$/.test(expectedHash);
}

/** Rejects alternate auth schemes, padding, whitespace and multiple credentials. */
export function parseDemoBroadcastBearer(value: string | null): string | null {
  if (!value) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value);
  const token = match?.[1] ?? null;
  return token && generatedTokenPattern.test(token) ? token : null;
}
