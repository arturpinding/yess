/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AdminEvent, AdminStream } from "./admin-api";
import { AdminControlRoom } from "./admin-control-room";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const stream: AdminStream = {
  id: "11111111-1111-4111-8111-111111111111",
  eventId: "22222222-2222-4222-8222-222222222222",
  eventTitle: { et: "Näidisfinaal", en: "Demo final" },
  protocol: "hls",
  state: "ended",
  priority: 20,
  playbackLocator: "https://media.example/demo.m3u8",
  externalWatchUrl: null,
  provider: "Demo Media",
  providerStreamRef: "demo-final-main",
  requiresSignedAccess: true,
  dvrWindowSeconds: 1800,
  captionsAvailable: true,
  isDemo: true,
  lastHealthyAt: "2026-08-14T17:00:00.000Z",
  updatedAt: "2026-08-14T17:01:00.000Z",
};

const event: AdminEvent = {
  id: stream.eventId,
  titleEt: stream.eventTitle.et,
  titleEn: stream.eventTitle.en,
  state: "scheduled",
  scheduledStartAt: "2026-08-14T18:00:42.123Z",
  actualStartAt: null,
  endAt: null,
  venueId: null,
  venueName: null,
  statusDetailEt: null,
  statusDetailEn: null,
  version: 2,
  updatedAt: "2026-08-14T17:00:00.000Z",
};

function streamRecord() {
  const section = screen.getByRole("region", { name: "Playback sources" });
  const record = within(section).getByText("Demo final").closest("details");
  if (!record) throw new Error("stream record missing");
  fireEvent.click(within(record).getByText("Demo final"));
  return record;
}

describe("AdminControlRoom", () => {
  beforeEach(() => {
    refresh.mockReset();
    document.cookie = "rada-csrf=test-csrf-token-that-is-long-enough-for-browser-mutations; Path=/";
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends an audited stream update with its optimistic-concurrency timestamp and refreshes", async () => {
    const updated = { ...stream, state: "ready" as const, updatedAt: "2026-08-14T17:02:00.000Z" };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: updated, requestId: "request-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminControlRoom
        locale="en"
        initialStreams={[stream]}
        initialEvents={[event]}
        venues={[]}
      />,
    );

    const record = streamRecord();
    fireEvent.change(within(record).getByLabelText("State"), { target: { value: "ready" } });
    fireEvent.change(within(record).getByLabelText("Reason for change"), {
      target: { value: "Recover primary origin" },
    });
    fireEvent.click(within(record).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      state: "ready",
      reason: "Recover primary origin",
      expectedUpdatedAt: stream.updatedAt,
    });
    expect(refresh).toHaveBeenCalled();
    expect(screen.getAllByText("Change saved and view refreshed.").length).toBeGreaterThan(0);
  });

  it("localizes lifecycle choices and states the rights boundary in Estonian", () => {
    render(
      <AdminControlRoom
        locale="et"
        initialStreams={[stream]}
        initialEvents={[event]}
        venues={[]}
      />,
    );

    const section = screen.getByRole("region", { name: "Ülekandeallikad" });
    const record = within(section).getByText("Näidisfinaal").closest("details");
    if (!record) throw new Error("stream record missing");
    fireEvent.click(within(record).getByText("Näidisfinaal"));

    expect(within(record).getByRole("option", { name: "Valmis" })).toHaveValue("ready");
    expect(
      within(section).getByText(/Allika lisamine ei loo ega pikenda vaatamisõigusi/),
    ).toBeVisible();
  });

  it("creates a complete fallback source for the selected event", async () => {
    const created: AdminStream = {
      ...stream,
      id: "33333333-3333-4333-8333-333333333333",
      state: "ready",
      priority: 100,
      provider: "Backup Edge",
      providerStreamRef: "demo-final-backup",
      playbackLocator: "https://backup.example/live.m3u8",
      dvrWindowSeconds: 0,
      captionsAvailable: false,
      updatedAt: "2026-08-14T17:03:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: created, requestId: "request-create" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminControlRoom
        locale="en"
        initialStreams={[stream]}
        initialEvents={[event]}
        venues={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add fallback source" }));
    const createButton = screen.getByRole("button", { name: "Create source" });
    const form = createButton.closest("form");
    if (!form) throw new Error("create form missing");
    fireEvent.change(within(form).getByLabelText("Provider"), {
      target: { value: created.provider },
    });
    fireEvent.change(within(form).getByLabelText("Provider stream reference"), {
      target: { value: created.providerStreamRef },
    });
    fireEvent.change(within(form).getByLabelText("Playback URL"), {
      target: { value: created.playbackLocator },
    });
    fireEvent.change(within(form).getByLabelText("Reason for change"), {
      target: { value: "Add secondary origin" },
    });
    fireEvent.click(createButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/v1/admin/streams");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      eventId: event.id,
      protocol: "hls",
      state: "ready",
      priority: 100,
      playbackLocator: created.playbackLocator,
      externalWatchUrl: null,
      provider: created.provider,
      providerStreamRef: created.providerStreamRef,
      requiresSignedAccess: true,
      dvrWindowSeconds: 0,
      captionsAvailable: false,
      reason: "Add secondary origin",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("requires the exact provider reference before deleting an inactive demo source", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { id: stream.id, deleted: true, cascaded: { rightsWindows: 1, renditions: 2 } },
          requestId: "request-2",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminControlRoom
        locale="en"
        initialStreams={[stream]}
        initialEvents={[event]}
        venues={[]}
      />,
    );

    const record = streamRecord();
    fireEvent.change(within(record).getByLabelText("Reason for change"), {
      target: { value: "Remove retired fallback" },
    });
    fireEvent.click(within(record).getByRole("button", { name: "Delete demo source" }));

    const dialog = screen.getByRole("alertdialog", { name: "Delete demo source?" });
    const confirm = within(dialog).getByRole("button", { name: "Delete source" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Type the stream reference to confirm"), {
      target: { value: stream.providerStreamRef },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toEqual({
      reason: "Remove retired fallback",
      expectedUpdatedAt: stream.updatedAt,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("creates a fallback source with the complete operator configuration", async () => {
    const created: AdminStream = {
      ...stream,
      id: "33333333-3333-4333-8333-333333333333",
      state: "ready",
      provider: "Backup Origin",
      providerStreamRef: "demo-final-backup",
      playbackLocator: "https://media.example/backup.m3u8",
      updatedAt: "2026-08-14T17:03:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: created, requestId: "request-create" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminControlRoom
        locale="en"
        initialStreams={[stream]}
        initialEvents={[event]}
        venues={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add fallback source" }));
    const createButton = screen.getByRole("button", { name: "Create source" });
    const form = createButton.closest("form");
    if (!form) throw new Error("create stream form missing");
    fireEvent.change(within(form).getByLabelText("Provider", { exact: true }), {
      target: { value: created.provider },
    });
    fireEvent.change(within(form).getByLabelText("Provider stream reference"), {
      target: { value: created.providerStreamRef },
    });
    fireEvent.change(within(form).getByLabelText("Playback URL"), {
      target: { value: created.playbackLocator },
    });
    fireEvent.change(within(form).getByLabelText("Reason for change"), {
      target: { value: "Provision a tested backup" },
    });
    fireEvent.click(createButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/v1/admin/streams");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      eventId: event.id,
      protocol: "hls",
      state: "ready",
      playbackLocator: created.playbackLocator,
      externalWatchUrl: null,
      provider: created.provider,
      providerStreamRef: created.providerStreamRef,
      requiresSignedAccess: true,
      reason: "Provision a tested backup",
    });
    expect(screen.getAllByText("New fallback source added.").length).toBeGreaterThan(0);
  });

  it("edits event metadata without resending untouched minute-truncated timestamps", async () => {
    const updated: AdminEvent = {
      ...event,
      statusDetailEn: "Warm-up delayed by five minutes",
      version: 3,
      updatedAt: "2026-08-14T17:04:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: updated, requestId: "request-event" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminControlRoom
        locale="en"
        initialStreams={[stream]}
        initialEvents={[event]}
        venues={[]}
      />,
    );

    const section = screen.getByRole("region", { name: "Event control" });
    const record = within(section).getByText("Demo final").closest("details");
    if (!record) throw new Error("event record missing");
    fireEvent.click(within(record).getByText("Demo final"));
    fireEvent.change(within(record).getByLabelText("English status detail"), {
      target: { value: updated.statusDetailEn },
    });
    fireEvent.change(within(record).getByLabelText("Reason for change"), {
      target: { value: "Publish the organiser update" },
    });
    fireEvent.click(within(record).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe(`/api/v1/admin/events/${event.id}`);
    expect(JSON.parse(String(init.body))).toEqual({
      statusDetailEn: updated.statusDetailEn,
      reason: "Publish the organiser update",
      version: event.version,
    });
    expect(String(init.body)).not.toContain("scheduledStartAt");
    expect(screen.getAllByText("Change saved and view refreshed.").length).toBeGreaterThan(0);
  });

  it("normalizes an internal source when switching to an official external destination", async () => {
    const external: AdminStream = {
      ...stream,
      protocol: "external",
      playbackLocator: null,
      externalWatchUrl: "https://rights-holder.example/watch/demo-final",
      requiresSignedAccess: false,
      dvrWindowSeconds: 0,
      updatedAt: "2026-08-14T17:05:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: external, requestId: "request-external" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminControlRoom
        locale="en"
        initialStreams={[stream]}
        initialEvents={[event]}
        venues={[]}
      />,
    );

    const record = streamRecord();
    fireEvent.change(within(record).getByLabelText("Protocol"), {
      target: { value: "external" },
    });
    fireEvent.change(within(record).getByLabelText("Official viewing destination URL"), {
      target: { value: external.externalWatchUrl },
    });
    fireEvent.change(within(record).getByLabelText("Reason for change"), {
      target: { value: "Use the verified rights-holder page" },
    });
    fireEvent.click(within(record).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      protocol: "external",
      playbackLocator: null,
      externalWatchUrl: external.externalWatchUrl,
      requiresSignedAccess: false,
      dvrWindowSeconds: 0,
      reason: "Use the verified rights-holder page",
    });
  });

  it("shows a recoverable optimistic-concurrency error without replacing local data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "version_conflict" }, requestId: "request-conflict" }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminControlRoom
        locale="en"
        initialStreams={[stream]}
        initialEvents={[event]}
        venues={[]}
      />,
    );

    const record = streamRecord();
    fireEvent.change(within(record).getByLabelText("State"), { target: { value: "ready" } });
    fireEvent.change(within(record).getByLabelText("Reason for change"), {
      target: { value: "Recover the primary source" },
    });
    fireEvent.click(within(record).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(
        within(record).getByText("Someone changed this record. Refresh the view and try again."),
      ).toBeVisible(),
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(within(record).getByLabelText("State")).toHaveValue("ready");
  });
});
