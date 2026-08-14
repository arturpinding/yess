import {
  InvalidPlaybackTokenError,
  createPlaybackToken,
  verifyPlaybackToken,
} from "./playback-token";

const secret = "media-secret-that-is-different-and-long-enough-for-hmac";
const now = new Date("2026-08-14T10:00:00Z");

function tamper(token: string): string {
  const sections = token.split(".");
  const payload = sections[1];
  if (!payload) throw new Error("Expected JWT payload");
  const changed = `${payload[0] === "a" ? "b" : "a"}${payload.slice(1)}`;
  return `${sections[0]}.${changed}.${sections[2]}`;
}

describe("playback tokens", () => {
  it("binds authorization to stream, territory, profile, and policy version", async () => {
    const token = await createPlaybackToken(
      {
        profileId: "profile-1",
        playbackSessionId: "playback-1",
        eventId: "event-1",
        streamId: "stream-1",
        rightsWindowId: "rights-1",
        entitlementId: "entitlement-1",
        countryCode: "ee",
        contentType: "live",
        protocols: ["ll-hls", "hls"],
        policyVersion: 4,
      },
      { secret, now, ttlSeconds: 30, tokenId: "token-1" },
    );

    await expect(verifyPlaybackToken(token, { secret, now })).resolves.toMatchObject({
      sub: "profile-1",
      streamId: "stream-1",
      countryCode: "EE",
      policyVersion: 4,
      jti: "token-1",
    });
  });

  it("rejects tampering and expiry", async () => {
    const token = await createPlaybackToken(
      {
        profileId: "profile-1",
        playbackSessionId: "playback-1",
        eventId: "event-1",
        streamId: "stream-1",
        rightsWindowId: "rights-1",
        countryCode: "EE",
        contentType: "live",
        protocols: ["hls"],
        policyVersion: 1,
      },
      { secret, now, ttlSeconds: 15 },
    );

    await expect(verifyPlaybackToken(tamper(token), { secret, now })).rejects.toBeInstanceOf(
      InvalidPlaybackTokenError,
    );
    await expect(
      verifyPlaybackToken(token, { secret, now: new Date("2026-08-14T10:00:18Z") }),
    ).rejects.toBeInstanceOf(InvalidPlaybackTokenError);
  });
});
