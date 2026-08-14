import { describe, expect, it } from "vitest";
import { privateJson, rateLimitHeaders } from "./api-response";

describe("private API responses", () => {
  it("prevents shared or browser caching of personalized data", async () => {
    const response = privateJson({ ok: true });
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("Cookie");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("adds retry guidance only when a request is denied", () => {
    expect(
      rateLimitHeaders({
        allowed: false,
        limit: 10,
        remaining: 0,
        retryAfterMs: 1_200,
        resetAt: new Date("2026-08-14T10:00:00.000Z"),
      }),
    ).toMatchObject({ "RateLimit-Limit": "10", "RateLimit-Remaining": "0", "Retry-After": "2" });
  });
});
