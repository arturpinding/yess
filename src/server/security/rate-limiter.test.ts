import { InMemoryRateLimiter } from "./rate-limiter";

describe("in-memory rate limiter", () => {
  it("limits and refills a token bucket deterministically", async () => {
    let now = 0;
    const limiter = new InMemoryRateLimiter({ clock: () => now });
    const policy = { limit: 2, windowMs: 1_000 };

    await expect(limiter.consume("login", policy)).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
    await expect(limiter.consume("login", policy)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(limiter.consume("login", policy)).resolves.toMatchObject({
      allowed: false,
      retryAfterMs: 500,
    });

    now = 500;
    await expect(limiter.consume("login", policy)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });
});
