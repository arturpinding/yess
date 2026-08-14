/** @vitest-environment jsdom */

import {
  AdminApiError,
  type AdminMediaOperationResult,
  type AdminRightsWindow,
  adminMediaIdempotencyKeySchema,
  createAdminRightsWindow,
  createAdminRightsWindowInputSchema,
  deleteAdminRightsWindow,
  operateAdminStream,
  updateAdminRightsWindow,
} from "./admin-api";

const streamId = "10000000-0000-4000-8000-000000000001";
const eventId = "20000000-0000-4000-8000-000000000001";
const rightsWindowId = "30000000-0000-4000-8000-000000000001";
const csrfToken = "admin-client-csrf-token-that-is-long-enough";

const rightsWindow: AdminRightsWindow = {
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

const operationResult: AdminMediaOperationResult = {
  operation: {
    id: "40000000-0000-4000-8000-000000000001",
    streamId,
    action: "publish",
    state: "succeeded",
    idempotencyKey: "publish-stream-0001",
    providerRequestId: "provider-request-1",
    errorCode: null,
    requestedAt: "2026-08-14T12:00:00.000Z",
    completedAt: "2026-08-14T12:00:01.000Z",
  },
  resource: {
    id: "50000000-0000-4000-8000-000000000001",
    streamId,
    providerKey: "local-ffmpeg",
    providerResourceId: "demo-source",
    desiredState: "published",
    observedState: "published",
    playbackLocator: "http://127.0.0.1:8090/media/demo-source/index.m3u8",
    generation: 3,
    lastHealthyAt: "2026-08-14T12:00:01.000Z",
    lastErrorCode: null,
    updatedAt: "2026-08-14T12:00:01.000Z",
  },
  stream: {
    id: streamId,
    eventId,
    eventTitle: { et: "Näidissündmus", en: "Demo event" },
    protocol: "hls",
    state: "live",
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

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("admin browser API", () => {
  beforeEach(() => {
    document.cookie = `rada-csrf=${csrfToken}; Path=/`;
  });

  afterEach(() => vi.unstubAllGlobals());

  it("creates rights and validates the returned DTO", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: rightsWindow, requestId: "request-rights-create" }, 201),
      );
    vi.stubGlobal("fetch", fetchMock);

    const input = {
      reason: "Publish the approved rights window",
      target: { type: "event" as const, id: eventId },
      contentKind: "live" as const,
      countryCode: "ee",
      access: "free" as const,
      startsAt: rightsWindow.startsAt,
      endsAt: rightsWindow.endsAt,
      dvrAllowed: true,
      recordingAllowed: true,
      maxConcurrentStreams: 2,
      rightsHolder: rightsWindow.rightsHolder,
      contractReference: rightsWindow.contractReference,
      priority: rightsWindow.priority,
    };

    await expect(createAdminRightsWindow(input)).resolves.toEqual(rightsWindow);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/v1/admin/rights-windows");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "X-CSRF-Token": csrfToken,
      "X-RADA-Request": "browser-mutation",
    });
    expect(JSON.parse(String(init.body))).toEqual(input);
  });

  it("updates and deletes a rights window through the item endpoint", async () => {
    const updated = {
      ...rightsWindow,
      access: "unavailable" as const,
      dvrAllowed: false,
      recordingAllowed: false,
      maxConcurrentStreams: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: updated, requestId: "request-rights-update" }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: { id: rightsWindowId, deleted: true },
          requestId: "request-rights-delete",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateAdminRightsWindow(rightsWindowId, {
        reason: "Apply an emergency legal takedown",
        expectedUpdatedAt: rightsWindow.updatedAt,
        access: "unavailable",
      }),
    ).resolves.toEqual(updated);
    await expect(
      deleteAdminRightsWindow(rightsWindowId, {
        reason: "Remove the expired demo policy",
        expectedUpdatedAt: updated.updatedAt,
      }),
    ).resolves.toEqual({ id: rightsWindowId, deleted: true });

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      `/api/v1/admin/rights-windows/${rightsWindowId}`,
      `/api/v1/admin/rights-windows/${rightsWindowId}`,
    ]);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe("PATCH");
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe("DELETE");
  });

  it("executes a provider action with the required idempotency key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: operationResult, requestId: "request-provider-operation" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      action: "publish" as const,
      reason: "Publish the tested local encoder output",
      expectedUpdatedAt: operationResult.stream.updatedAt,
    };

    await expect(operateAdminStream(streamId, input, "publish-stream-0001")).resolves.toEqual(
      operationResult,
    );
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe(`/api/v1/admin/streams/${streamId}/operations`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Idempotency-Key": "publish-stream-0001" });
    expect(JSON.parse(String(init.body))).toEqual(input);
  });

  it("mirrors cross-field rights rules and rejects malformed provider keys", () => {
    expect(
      createAdminRightsWindowInputSchema.safeParse({
        reason: "Configure external viewing",
        target: { type: "event", id: eventId },
        contentKind: "live",
        access: "external_only",
        startsAt: rightsWindow.startsAt,
        endsAt: rightsWindow.endsAt,
        rightsHolder: rightsWindow.rightsHolder,
      }).success,
    ).toBe(false);
    expect(adminMediaIdempotencyKeySchema.safeParse("spaces are unsafe").success).toBe(false);
    expect(adminMediaIdempotencyKeySchema.safeParse("publish-stream-0001").success).toBe(true);
  });

  it("fails closed when a successful response does not match its DTO", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ data: { id: rightsWindowId } })),
    );

    await expect(
      createAdminRightsWindow({
        reason: "Publish the approved rights window",
        target: { type: "event", id: eventId },
        contentKind: "live",
        access: "free",
        startsAt: rightsWindow.startsAt,
        endsAt: rightsWindow.endsAt,
        rightsHolder: rightsWindow.rightsHolder,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AdminApiError>>({ code: "invalid_response" }),
    );
  });
});
