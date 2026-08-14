import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/admin/rights-control", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/admin/rights-control")>();
  return {
    ...actual,
    createAdminRightsWindow: vi.fn(),
    updateAdminRightsWindow: vi.fn(),
    deleteAdminRightsWindow: vi.fn(),
  };
});

import { DELETE, PATCH } from "./[rightsWindowId]/route";
import { POST } from "./route";
import {
  AdminRightsControlError,
  createAdminRightsWindow,
  deleteAdminRightsWindow,
  updateAdminRightsWindow,
  type AdminRightsWindowDto,
} from "@/server/admin/rights-control";
import { clearEnvironmentCacheForTests } from "@/server/environment";

const rightsWindowId = "30000000-0000-4000-8000-000000000001";
const eventId = "20000000-0000-4000-8000-000000000001";
const csrfToken = "rights-admin-csrf-token-that-is-long-enough";

const dto: AdminRightsWindowDto = {
  id: rightsWindowId,
  target: {
    type: "event",
    id: eventId,
    label: { et: "Näidissündmus", en: "Demo event" },
    eventId,
  },
  contentKind: "live",
  countryCode: "EE",
  access: "free",
  requiredProductId: null,
  startsAt: "2026-08-15T12:00:00.000Z",
  endsAt: "2026-08-15T16:00:00.000Z",
  dvrAllowed: true,
  recordingAllowed: true,
  maxConcurrentStreams: 2,
  externalWatchUrl: null,
  rightsHolder: "Demo rights holder",
  contractReference: "DEMO-2026-001",
  priority: 300,
  createdAt: "2026-08-14T12:00:00.000Z",
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
  return new NextRequest("http://localhost:3000/api/v1/admin/rights-windows", {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

function context(id = rightsWindowId) {
  return { params: Promise.resolve({ rightsWindowId: id }) };
}

describe("development admin rights API", () => {
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

  it("creates a validated rights window with a private response", async () => {
    vi.mocked(createAdminRightsWindow).mockResolvedValue(dto);
    const response = await POST(
      request("POST", {
        reason: "Publish the approved demo window",
        target: { type: "event", id: eventId },
        contentKind: "live",
        countryCode: "ee",
        access: "free",
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        dvrAllowed: true,
        recordingAllowed: true,
        maxConcurrentStreams: 2,
        rightsHolder: dto.rightsHolder,
        contractReference: dto.contractReference,
        priority: dto.priority,
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    await expect(response.json()).resolves.toMatchObject({
      data: dto,
      requestId: expect.any(String),
    });
    expect(createAdminRightsWindow).toHaveBeenCalledWith(
      expect.objectContaining({ countryCode: "EE", target: { type: "event", id: eventId } }),
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });

  it("supports an access-only emergency takedown with optimistic concurrency", async () => {
    vi.mocked(updateAdminRightsWindow).mockResolvedValue({ ...dto, access: "unavailable" });
    const response = await PATCH(
      request("PATCH", {
        reason: "Emergency legal takedown",
        expectedUpdatedAt: dto.updatedAt,
        access: "unavailable",
      }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(updateAdminRightsWindow).toHaveBeenCalledWith(
      rightsWindowId,
      expect.objectContaining({ access: "unavailable", expectedUpdatedAt: dto.updatedAt }),
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });

  it("reports safe-delete lifecycle conflicts", async () => {
    vi.mocked(deleteAdminRightsWindow).mockRejectedValue(
      new AdminRightsControlError("active_rights_window", 409),
    );
    const response = await DELETE(
      request("DELETE", {
        reason: "Remove the obsolete scheduled demo grant",
        expectedUpdatedAt: dto.updatedAt,
      }),
      context(),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "active_rights_window" },
      requestId: expect.any(String),
    });
  });

  it("rejects missing CSRF, unsafe external URLs, and invalid route identifiers", async () => {
    const csrfResponse = await POST(request("POST", {}, false));
    expect(csrfResponse.status).toBe(403);

    const unsafeResponse = await POST(
      request("POST", {
        reason: "Reject an unsafe legal destination",
        target: { type: "event", id: eventId },
        contentKind: "live",
        access: "external_only",
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        externalWatchUrl: "file:///tmp/watch.html",
        rightsHolder: dto.rightsHolder,
      }),
    );
    expect(unsafeResponse.status).toBe(400);

    const paramsResponse = await PATCH(
      request("PATCH", {
        reason: "Reject a malformed identifier",
        expectedUpdatedAt: dto.updatedAt,
        priority: 400,
      }),
      context("not-a-uuid"),
    );
    expect(paramsResponse.status).toBe(400);
    expect(createAdminRightsWindow).not.toHaveBeenCalled();
    expect(updateAdminRightsWindow).not.toHaveBeenCalled();
  });

  it("returns 404 in production before CSRF, parsing, or data access", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(request("POST", {}, false));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "not_found" } });
    expect(createAdminRightsWindow).not.toHaveBeenCalled();
  });
});
