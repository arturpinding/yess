/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AdminMediaOperationResult, AdminMediaResource, AdminStream } from "./admin-api";
import { AdminMediaOperationsPanel } from "./admin-media-operations-panel";

const stream: AdminStream = {
  id: "10000000-0000-4000-8000-000000000001",
  eventId: "20000000-0000-4000-8000-000000000001",
  eventTitle: { et: "Näidisfinaal", en: "Demo final" },
  protocol: "hls",
  state: "provisioning",
  priority: 50,
  playbackLocator: "http://127.0.0.1:8090/media/demo-source/index.m3u8",
  externalWatchUrl: null,
  provider: "local-ffmpeg",
  providerStreamRef: "demo-source",
  requiresSignedAccess: false,
  dvrWindowSeconds: 0,
  captionsAvailable: false,
  isDemo: true,
  lastHealthyAt: null,
  updatedAt: "2026-08-14T12:00:00.000Z",
};

const provisionedResource: AdminMediaResource = {
  id: "30000000-0000-4000-8000-000000000001",
  streamId: stream.id,
  providerKey: "local-ffmpeg",
  providerResourceId: stream.providerStreamRef,
  desiredState: "provisioned",
  observedState: "provisioned",
  playbackLocator: stream.playbackLocator,
  generation: 1,
  lastHealthyAt: "2026-08-14T12:01:00.000Z",
  lastErrorCode: null,
  updatedAt: "2026-08-14T12:01:00.000Z",
};

function result(
  action: "provision" | "publish",
  resource: AdminMediaResource,
): AdminMediaOperationResult {
  return {
    operation: {
      id: "40000000-0000-4000-8000-000000000001",
      streamId: stream.id,
      action,
      state: "succeeded",
      idempotencyKey: `admin-ui-${action}`,
      providerRequestId: "provider-request-1",
      errorCode: null,
      requestedAt: "2026-08-14T12:01:00.000Z",
      completedAt: "2026-08-14T12:01:01.000Z",
    },
    resource,
    stream: {
      ...stream,
      state: resource.observedState === "published" ? "live" : "provisioning",
      lastHealthyAt: resource.lastHealthyAt,
      updatedAt: resource.updatedAt,
    },
  };
}

function response(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AdminMediaOperationsPanel", () => {
  beforeEach(() => {
    document.cookie = "rada-csrf=provider-panel-csrf-token-that-is-long-enough; Path=/";
  });

  afterEach(() => vi.unstubAllGlobals());

  it("provisions with an idempotency key and replaces absent with observed state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        data: result("provision", provisionedResource),
        requestId: "provider-provision",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminMediaOperationsPanel
        locale="en"
        initialStreams={[stream]}
        initialResources={[]}
        initialOperations={[]}
      />,
    );

    expect(screen.getByText(/not a production encoder, origin, or CDN/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Operation reason"), {
      target: { value: "Prepare synthetic test output" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Provision" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe(`/api/v1/admin/streams/${stream.id}/operations`);
    expect(init.headers).toMatchObject({ "Idempotency-Key": expect.stringMatching(/^admin-ui:/) });
    expect(JSON.parse(String(init.body))).toEqual({
      action: "provision",
      reason: "Prepare synthetic test output",
      expectedUpdatedAt: stream.updatedAt,
    });
    await waitFor(() =>
      expect(screen.getAllByText("Provisioned").length).toBeGreaterThanOrEqual(3),
    );
  });

  it("requires confirmation before publishing an encoding source", async () => {
    const encoding: AdminMediaResource = {
      ...provisionedResource,
      desiredState: "encoding",
      observedState: "encoding",
      generation: 2,
      updatedAt: "2026-08-14T12:02:00.000Z",
    };
    const published: AdminMediaResource = {
      ...encoding,
      desiredState: "published",
      observedState: "published",
      generation: 3,
      updatedAt: "2026-08-14T12:03:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response({ data: result("publish", published), requestId: "provider-publish" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminMediaOperationsPanel
        locale="en"
        initialStreams={[{ ...stream, updatedAt: encoding.updatedAt }]}
        initialResources={[encoding]}
        initialOperations={[]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Operation reason"), {
      target: { value: "Publish verified synthetic manifest" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish local stream" }));
    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", {
      name: "Publish the local synthetic stream?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm operation" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({
      action: "publish",
      expectedUpdatedAt: encoding.updatedAt,
    });
    await waitFor(() => expect(screen.getAllByText("Published").length).toBeGreaterThanOrEqual(3));
  });

  it("directs an operator to refresh an outcome-unknown stale operation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "stale_operation_requires_refresh" } }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    render(
      <AdminMediaOperationsPanel
        locale="en"
        initialStreams={[stream]}
        initialResources={[]}
        initialOperations={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Operation reason"), {
      target: { value: "Retry after an interrupted provider request" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Provision" }));

    expect(await screen.findByText(/Use Refresh status to reconcile it safely/)).toBeVisible();
  });
});
