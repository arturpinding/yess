import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearEnvironmentCacheForTests } from "@/server/environment";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  getPlayback: vi.fn(),
  markLive: vi.fn(),
  stop: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("@/server/live-broadcast/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/live-broadcast/service")>();
  return {
    ...actual,
    liveBroadcastService: {
      create: mocks.create,
      list: mocks.list,
      getPlayback: mocks.getPlayback,
      markLive: mocks.markLive,
      stop: mocks.stop,
    },
  };
});

vi.mock("@/server/security/request-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/security/request-guards")>();
  return { ...actual, consumeApiRateLimit: mocks.consumeRateLimit };
});

import { DELETE, GET as GET_PLAYBACK } from "./[code]/route";
import { POST as POST_STATUS } from "./[code]/status/route";
import { GET as GET_LIST, POST as POST_CREATE } from "./route";

const code = "0123-WXYZ";
const publisherToken = Buffer.alloc(32, 1).toString("base64url");
const csrfToken = "managed-broadcast-route-csrf-token";
const expiresAt = "2026-08-15T16:00:00.000Z";
const liveKitUrl = "wss://yess-test.livekit.cloud";
const liveKitApiSecret = "test-only-livekit-secret-with-more-than-32-characters";

function request(
  method: string,
  path: string,
  body?: unknown,
  options: { csrf?: boolean; authorization?: string } = {},
) {
  const origin = "https://rada.example";
  const headers = new Headers({ origin, "x-real-ip": "192.0.2.20" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (options.csrf) {
    headers.set("cookie", `rada-csrf=${csrfToken}`);
    headers.set("x-csrf-token", csrfToken);
  }
  if (options.authorization) headers.set("authorization", options.authorization);
  return new NextRequest(`${origin}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function context() {
  return { params: Promise.resolve({ code }) };
}

describe("managed live broadcast routes", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "https://rada.example");
    vi.stubEnv("DATABASE_URL", "postgres://rada:rada@localhost:5432/rada_test");
    vi.stubEnv("SESSION_SECRET", "session-secret-that-is-at-least-32-characters");
    vi.stubEnv("MEDIA_SIGNING_SECRET", "media-secret-that-is-at-least-32-characters");
    vi.stubEnv("DEFAULT_COUNTRY", "EE");
    vi.stubEnv("PHONE_BROADCAST_ENABLED", "true");
    vi.stubEnv("PHONE_BROADCAST_PROVIDER", "livekit-cloud");
    vi.stubEnv("PHONE_BROADCAST_ACCESS_KEY", "strong-private-broadcast-key");
    vi.stubEnv("LIVEKIT_URL", liveKitUrl);
    vi.stubEnv("LIVEKIT_API_KEY", "APItestOnlyKey123456789");
    vi.stubEnv("LIVEKIT_API_SECRET", liveKitApiSecret);
    clearEnvironmentCacheForTests();
    vi.clearAllMocks();
    mocks.consumeRateLimit.mockResolvedValue({
      allowed: true,
      limit: 90,
      remaining: 89,
      retryAfterMs: 0,
      resetAt: new Date("2026-08-15T10:01:00.000Z"),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearEnvironmentCacheForTests();
  });

  it("requires CSRF and the configured broadcaster key before provisioning", async () => {
    const withoutCsrf = await POST_CREATE(
      request("POST", "/api/v1/live-broadcasts", {
        locale: "en",
        title: "Match",
        accessKey: "strong-private-broadcast-key",
      }),
    );
    expect(withoutCsrf.status).toBe(403);

    const wrongKey = await POST_CREATE(
      request(
        "POST",
        "/api/v1/live-broadcasts",
        { locale: "en", title: "Match", accessKey: "wrong" },
        { csrf: true },
      ),
    );
    expect(wrongKey.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a broadcast without forwarding or returning the shared access key", async () => {
    mocks.create.mockResolvedValue({
      code,
      title: "Kalev v Tartu",
      publisherToken,
      mediaUrl: liveKitUrl,
      mediaToken: "signed-livekit-publisher-token",
      expiresAt,
    });
    const response = await POST_CREATE(
      request(
        "POST",
        "/api/v1/live-broadcasts",
        { locale: "en", title: "Kalev v Tartu", accessKey: "strong-private-broadcast-key" },
        { csrf: true },
      ),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    const body = await response.json();
    expect(body.data).toMatchObject({
      mediaUrl: liveKitUrl,
      mediaToken: "signed-livekit-publisher-token",
    });
    expect(JSON.stringify(body)).not.toContain("strong-private-broadcast-key");
    expect(JSON.stringify(body)).not.toContain(liveKitApiSecret);
    expect(mocks.create).toHaveBeenCalledWith({ locale: "en", title: "Kalev v Tartu" });
  });

  it("lists broadcasts and allows repeat playback lookup without a viewer claim", async () => {
    const summary = {
      code,
      title: "Match",
      state: "live",
      startedAt: "2026-08-15T10:00:00.000Z",
      expiresAt,
    };
    mocks.list.mockResolvedValue([summary]);
    mocks.getPlayback
      .mockResolvedValueOnce({
        ...summary,
        mediaUrl: liveKitUrl,
        mediaToken: "signed-livekit-viewer-token-1",
      })
      .mockResolvedValueOnce({
        ...summary,
        mediaUrl: liveKitUrl,
        mediaToken: "signed-livekit-viewer-token-2",
      });

    const list = await GET_LIST(request("GET", "/api/v1/live-broadcasts"));
    const first = await GET_PLAYBACK(request("GET", `/api/v1/live-broadcasts/${code}`), context());
    const second = await GET_PLAYBACK(request("GET", `/api/v1/live-broadcasts/${code}`), context());

    await expect(list.json()).resolves.toEqual({ data: { broadcasts: [summary] } });
    await expect(first.json()).resolves.toMatchObject({
      data: { mediaUrl: liveKitUrl, mediaToken: "signed-livekit-viewer-token-1" },
    });
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({
      data: { mediaUrl: liveKitUrl, mediaToken: "signed-livekit-viewer-token-2" },
    });
    expect(mocks.getPlayback).toHaveBeenCalledTimes(2);
  });

  it("requires the strict publisher bearer for live status and idempotent stop", async () => {
    const malformed = await POST_STATUS(
      request(
        "POST",
        `/api/v1/live-broadcasts/${code}/status`,
        { state: "live" },
        {
          authorization: `bearer ${publisherToken}`,
        },
      ),
      context(),
    );
    expect(malformed.status).toBe(401);

    mocks.markLive.mockResolvedValue({ code, state: "live" });
    const status = await POST_STATUS(
      request(
        "POST",
        `/api/v1/live-broadcasts/${code}/status`,
        { state: "live" },
        {
          authorization: `Bearer ${publisherToken}`,
        },
      ),
      context(),
    );
    expect(status.status).toBe(200);

    mocks.stop.mockResolvedValue({ stopped: true });
    const stopped = await DELETE(
      request("DELETE", `/api/v1/live-broadcasts/${code}`, undefined, {
        authorization: `Bearer ${publisherToken}`,
      }),
      context(),
    );
    expect(stopped.status).toBe(200);
    expect(mocks.stop).toHaveBeenCalledWith(code, publisherToken);
  });

  it("hard-404s every route when the managed provider is not enabled", async () => {
    vi.stubEnv("PHONE_BROADCAST_PROVIDER", "direct");
    clearEnvironmentCacheForTests();
    const responses = await Promise.all([
      GET_LIST(request("GET", "/api/v1/live-broadcasts")),
      POST_CREATE(request("POST", "/api/v1/live-broadcasts", { invalid: true })),
      GET_PLAYBACK(request("GET", `/api/v1/live-broadcasts/${code}`), context()),
      POST_STATUS(
        request("POST", `/api/v1/live-broadcasts/${code}/status`, { invalid: true }),
        context(),
      ),
      DELETE(request("DELETE", `/api/v1/live-broadcasts/${code}`), context()),
    ]);
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404]);
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
  });
});
