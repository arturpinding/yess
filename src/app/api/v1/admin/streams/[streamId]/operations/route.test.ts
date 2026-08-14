import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/admin/media-operation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/admin/media-operation")>();
  return { ...actual, operateAdminStream: vi.fn() };
});

import { POST } from "./route";
import { operateAdminStream, type AdminMediaOperationResult } from "@/server/admin/media-operation";
import { clearEnvironmentCacheForTests } from "@/server/environment";

const streamId = "10000000-0000-4000-8000-000000000001";
const csrfToken = "test-csrf-token-that-is-long-enough-for-admin-routes";

function request(
  body: unknown,
  options: { csrf?: boolean; idempotency?: string } = {},
): NextRequest {
  const headers = new Headers({
    "content-type": "application/json",
    origin: "http://localhost:3000",
  });
  if (options.csrf !== false) {
    headers.set("cookie", `rada-csrf=${csrfToken}`);
    headers.set("x-csrf-token", csrfToken);
  }
  if (options.idempotency !== "") {
    headers.set("idempotency-key", options.idempotency ?? "admin-media-operation-0001");
  }
  return new NextRequest(`http://localhost:3000/api/v1/admin/streams/${streamId}/operations`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const input = {
  action: "provision" as const,
  reason: "Provision the local synthetic encoder",
  expectedUpdatedAt: "2026-08-14T12:00:00.000Z",
};

const result: AdminMediaOperationResult = {
  operation: {
    id: "30000000-0000-4000-8000-000000000001",
    streamId,
    action: "provision",
    state: "succeeded",
    idempotencyKey: "admin-media-operation-0001",
    providerRequestId: "provider-request-1",
    errorCode: null,
    requestedAt: "2026-08-14T12:00:00.000Z",
    completedAt: "2026-08-14T12:00:01.000Z",
  },
  resource: {
    id: "40000000-0000-4000-8000-000000000001",
    streamId,
    providerKey: "local-ffmpeg",
    providerResourceId: "demo-source",
    desiredState: "provisioned",
    observedState: "provisioned",
    playbackLocator: "http://127.0.0.1:8090/media/demo-source/index.m3u8",
    generation: 2,
    lastHealthyAt: "2026-08-14T12:00:01.000Z",
    lastErrorCode: null,
    updatedAt: "2026-08-14T12:00:01.000Z",
  },
  stream: {
    id: streamId,
    eventId: "20000000-0000-4000-8000-000000000001",
    eventTitle: { et: "Demo", en: "Demo" },
    protocol: "hls",
    state: "provisioning",
    priority: 10,
    playbackLocator: "http://127.0.0.1:8090/media/demo-source/index.m3u8",
    externalWatchUrl: null,
    provider: "local-ffmpeg",
    providerStreamRef: "demo-source",
    requiresSignedAccess: false,
    dvrWindowSeconds: 0,
    captionsAvailable: false,
    isDemo: true,
    lastHealthyAt: "2026-08-14T12:00:01.000Z",
    updatedAt: "2026-08-14T12:00:01.000Z",
  },
};

describe("development admin media-operation API", () => {
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

  it("executes a validated idempotent provider operation", async () => {
    vi.mocked(operateAdminStream).mockResolvedValue(result);
    const response = await POST(request(input), { params: Promise.resolve({ streamId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    await expect(response.json()).resolves.toMatchObject({
      data: { operation: { state: "succeeded" }, resource: { observedState: "provisioned" } },
      requestId: expect.any(String),
    });
    expect(operateAdminStream).toHaveBeenCalledWith(
      streamId,
      input,
      "admin-media-operation-0001",
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });

  it("rejects missing idempotency proof and missing CSRF before provider access", async () => {
    const missingKey = await POST(request(input, { idempotency: "" }), {
      params: Promise.resolve({ streamId }),
    });
    expect(missingKey.status).toBe(400);

    const missingCsrf = await POST(request(input, { csrf: false }), {
      params: Promise.resolve({ streamId }),
    });
    expect(missingCsrf.status).toBe(403);
    expect(operateAdminStream).not.toHaveBeenCalled();
  });

  it("returns a private 404 in production before parsing or provider access", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(request({}, { csrf: false, idempotency: "" }), {
      params: Promise.resolve({ streamId }),
    });
    expect(response.status).toBe(404);
    expect(operateAdminStream).not.toHaveBeenCalled();
  });
});
