import { InvalidSessionTokenError, createSessionToken, verifySessionToken } from "./session-token";

const secret = "session-secret-that-is-longer-than-thirty-two-bytes";
const now = new Date("2026-08-14T10:00:00Z");

function tamper(token: string): string {
  const sections = token.split(".");
  const signature = sections[2];
  if (!signature) throw new Error("Expected JWT signature");
  const changed = `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
  return `${sections[0]}.${sections[1]}.${changed}`;
}

describe("session tokens", () => {
  it("round-trips a minimal session identity", async () => {
    const token = await createSessionToken(
      {
        userId: "user-1",
        sessionId: "session-1",
        profileId: "profile-1",
        role: "viewer",
        sessionVersion: 2,
      },
      { secret, now, ttlSeconds: 60 },
    );
    await expect(verifySessionToken(token, { secret, now })).resolves.toMatchObject({
      sub: "user-1",
      sid: "session-1",
      profileId: "profile-1",
      sessionVersion: 2,
    });
  });

  it("rejects tampering and expiry with a generic error", async () => {
    const token = await createSessionToken(
      {
        userId: "user-1",
        sessionId: "session-1",
        role: "viewer",
        sessionVersion: 0,
      },
      { secret, now, ttlSeconds: 60 },
    );
    await expect(verifySessionToken(tamper(token), { secret, now })).rejects.toBeInstanceOf(
      InvalidSessionTokenError,
    );
    await expect(
      verifySessionToken(token, { secret, now: new Date("2026-08-14T10:01:06Z") }),
    ).rejects.toBeInstanceOf(InvalidSessionTokenError);
  });
});
