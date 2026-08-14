import { describe, expect, it } from "vitest";
import {
  DEMO_BROADCAST_CODE_ALPHABET,
  DEMO_BROADCAST_CODE_ENTROPY_BITS,
  demoBroadcastAnswerSchema,
  demoBroadcastOfferSchema,
  demoBroadcastSecretMatches,
  formatDemoBroadcastCode,
  generateDemoBroadcastCode,
  generateDemoBroadcastToken,
  hashDemoBroadcastSecret,
  MAX_SDP_BYTES,
  normalizeDemoBroadcastCode,
  parseDemoBroadcastBearer,
} from "./contracts";

describe("demo broadcast signaling contracts", () => {
  it("generates an eight-symbol Crockford code with exactly 40 bits of entropy", () => {
    expect(DEMO_BROADCAST_CODE_ALPHABET).toHaveLength(32);
    expect(Math.log2(DEMO_BROADCAST_CODE_ALPHABET.length ** 8)).toBe(40);
    expect(DEMO_BROADCAST_CODE_ENTROPY_BITS).toBe(40);

    const code = generateDemoBroadcastCode(() => Buffer.from([0, 1, 2, 3, 28, 29, 30, 31]));
    expect(code).toBe("0123WXYZ");
    expect(formatDemoBroadcastCode(code)).toBe("0123-WXYZ");
  });

  it("normalizes separators, case and Crockford aliases without accepting other characters", () => {
    expect(normalizeDemoBroadcastCode(" oiLl-abcd ")).toBe("0111ABCD");
    expect(normalizeDemoBroadcastCode("0123 wxyz")).toBe("0123WXYZ");
    expect(normalizeDemoBroadcastCode("0123-UWXY")).toBeNull();
    expect(normalizeDemoBroadcastCode("0123_WXYZ")).toBeNull();
    expect(normalizeDemoBroadcastCode("123-WXYZ")).toBeNull();
    expect(() => formatDemoBroadcastCode("too-short")).toThrow(RangeError);
  });

  it("creates a 256-bit bearer token and compares only fixed-length SHA-256 digests", () => {
    const token = generateDemoBroadcastToken(() => Buffer.alloc(32, 0xa5));
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);

    const digest = hashDemoBroadcastSecret(token);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(demoBroadcastSecretMatches(token, digest)).toBe(true);
    expect(demoBroadcastSecretMatches(`${token.slice(0, -1)}A`, digest)).toBe(false);
    expect(demoBroadcastSecretMatches(token, "not-a-digest")).toBe(false);
    expect(parseDemoBroadcastBearer(`Bearer ${token}`)).toBe(token);
    expect(parseDemoBroadcastBearer(`bearer ${token}`)).toBeNull();
    expect(parseDemoBroadcastBearer(`Bearer  ${token}`)).toBeNull();
    expect(parseDemoBroadcastBearer(`Bearer ${token} extra`)).toBeNull();
  });

  it("accepts only strict, plausible and bounded offer/answer descriptions", () => {
    const sdp = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=RADA demo\r\nt=0 0\r\n";
    expect(demoBroadcastOfferSchema.safeParse({ type: "offer", sdp }).success).toBe(true);
    expect(demoBroadcastAnswerSchema.safeParse({ type: "answer", sdp }).success).toBe(true);
    expect(
      demoBroadcastOfferSchema.safeParse({ type: "offer", sdp, unexpected: true }).success,
    ).toBe(false);
    expect(demoBroadcastOfferSchema.safeParse({ type: "answer", sdp }).success).toBe(false);
    expect(demoBroadcastOfferSchema.safeParse({ type: "offer", sdp: "not-sdp" }).success).toBe(
      false,
    );
    expect(demoBroadcastOfferSchema.safeParse({ type: "offer", sdp: "v=0\n\0" }).success).toBe(
      false,
    );
    expect(
      demoBroadcastOfferSchema.safeParse({
        type: "offer",
        sdp: `v=0\n${"a".repeat(MAX_SDP_BYTES)}`,
      }).success,
    ).toBe(false);
  });
});
