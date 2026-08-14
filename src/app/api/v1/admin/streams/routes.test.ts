import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/admin/stream-control", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/admin/stream-control")>();
  return {
    ...actual,
    createAdminStream: vi.fn(),
    updateAdminStream: vi.fn(),
    deleteAdminStream: vi.fn(),
  };
});

import { DELETE, PATCH } from "./[streamId]/route";
import { POST } from "./route";
import {
  AdminStreamControlError,
  createAdminStream,
  deleteAdminStream,
  updateAdminStream,
  type AdminStreamDto,
} from "@/server/admin/stream-control";
import { clearEnvironmentCacheForTests } from "@/server/environment";

const streamId = "10000000-0000-4000-8000-000000000001";
const eventId = "20000000-0000-4000-8000-000000000001";
const csrfToken = "test-csrf-token-that-is-long-enough-for-admin-routes";

const dto: AdminStreamDto = {
  id: streamId,
  eventId,
  eventTitle: { et: "Näidissündmus", en: "Demo event" },
  protocol: "hls",
  state: "ready",
  priority: 20,
  playbackLocator: "https://media.example.test/fallback.m3u8",
  externalWatchUrl: null,
  provider: "demo-origin",
  providerStreamRef: "event-fallback",
  requiresSignedAccess: true,
  dvrWindowSeconds: 0,
  captionsAvailable: false,
  isDemo: true,
  lastHealthyAt: null,
  updatedAt: "2026-08-14T12:00:00.000Z",
};

function request(method: string, body: unknown, withCsrf = true): NextRequest {
  const headers = new Headers({
    "content-type": "application/json",
    origin: "http://localhost:3000",
  });
  if (withCsrf) {
    headers.set("cookie", `rada-csrf=${csrfToken}`);
    headers.set("x-csrf-token", csrfToken);
  }
  return new NextRequest("http://localhost:3000/api/v1/admin/streams", {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

function routeContext() {
  return { params: Promise.resolve({ streamId }) };
}

describe("development admin stream API", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgres://rada:password@localhost:5432/rada");
    vi.stubEnv("SESSION_SECRET", "session-secret-that-is-at-least-thirty-two-characters");
    vi.stubEnv("MEDIA_SIGNING_SECRET", "different-media-secret-that-is-at-least-thirty-two");
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
    vi.stubEnv("DEFAULT_COUNTRY", "EE");
    clearEnvironmentCacheForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearEnvironmentCacheForTests();
  });

  it("creates a validated demo fallback and returns a private response", async () => {
    vi.mocked(createAdminStream).mockResolvedValue(dto);
    const response = await POST(
      request("POST", {
        eventId,
        reason: "Add a tested backup source",
        protocol: "hls",
        state: "ready",
        priority: 20,
        playbackLocator: dto.playbackLocator,
        externalWatchUrl: null,
        provider: dto.provider,
        providerStreamRef: dto.providerStreamRef,
        requiresSignedAccess: true,
        dvrWindowSeconds: 0,
        captionsAvailable: false,
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await response.json()).toMatchObject({ data: dto, requestId: expect.any(String) });
    expect(createAdminStream).toHaveBeenCalledOnce();
  });

  it("updates with an optimistic version and exact bilingual DTO", async () => {
    vi.mocked(updateAdminStream).mockResolvedValue({ ...dto, state: "live" });
    const response = await PATCH(
      request("PATCH", {
        reason: "Primary signal is healthy",
        expectedUpdatedAt: dto.updatedAt,
        state: "live",
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { state: "live", eventTitle: dto.eventTitle },
      requestId: expect.any(String),
    });
    expect(updateAdminStream).toHaveBeenCalledWith(
      streamId,
      expect.objectContaining({ expectedUpdatedAt: dto.updatedAt, state: "live" }),
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });

  it("surfaces safe-delete conflicts without changing the stream", async () => {
    vi.mocked(deleteAdminStream).mockRejectedValue(
      new AdminStreamControlError("stream_must_be_inactive", 409),
    );
    const response = await DELETE(
      request("DELETE", {
        reason: "Retire obsolete demo fallback",
        expectedUpdatedAt: dto.updatedAt,
      }),
      routeContext(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "stream_must_be_inactive" },
      requestId: expect.any(String),
    });
  });

  it("rejects missing CSRF and invalid locator protocols before data access", async () => {
    const csrfResponse = await POST(request("POST", {}, false));
    expect(csrfResponse.status).toBe(403);
    await expect(csrfResponse.json()).resolves.toMatchObject({ error: { code: "csrf_failed" } });

    const invalidResponse = await POST(
      request("POST", {
        eventId,
        reason: "Do not accept unsafe URLs",
        protocol: "hls",
        playbackLocator: "file:///tmp/media.m3u8",
        provider: "demo-origin",
        providerStreamRef: "unsafe",
      }),
    );
    expect(invalidResponse.status).toBe(400);
    expect(createAdminStream).not.toHaveBeenCalled();
  });

  it("returns 404 in production before CSRF, parsing, or database access", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(request("POST", {}, false));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "not_found" } });
    expect(createAdminStream).not.toHaveBeenCalled();
  });
});
