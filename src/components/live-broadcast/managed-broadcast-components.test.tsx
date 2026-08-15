/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LiveKitConnectionState,
  LiveKitPublisherConnection,
  LiveKitViewerConnection,
} from "./livekit-transport";
import { getLiveBroadcastCopy } from "./live-broadcast-copy";
import { ManagedBroadcastStudio } from "./managed-broadcast-studio";
import { ManagedBroadcastViewer } from "./managed-broadcast-viewer";

const mocks = vi.hoisted(() => ({
  connectLiveKitPublisher: vi.fn(),
  connectLiveKitViewer: vi.fn(),
}));

vi.mock("./livekit-transport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./livekit-transport")>();
  return {
    ...actual,
    connectLiveKitPublisher: mocks.connectLiveKitPublisher,
    connectLiveKitViewer: mocks.connectLiveKitViewer,
  };
});

const PUBLISHER_TOKEN = Buffer.alloc(32, 1).toString("base64url");
const PUBLISHER_MEDIA_TOKEN = "livekit-publisher-media-token";
const VIEWER_MEDIA_TOKEN = "livekit-viewer-media-token";
const MEDIA_URL = "wss://project.livekit.cloud";
const EXPIRES_AT = new Date(Date.now() + 60 * 60_000).toISOString();

class FakeConnection {
  state: LiveKitConnectionState = "connected";
  readonly close = vi.fn().mockResolvedValue(undefined);
  private readonly stateListeners = new Set<(state: LiveKitConnectionState) => void>();

  onStateChange(listener: (state: LiveKitConnectionState) => void) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  setState(state: LiveKitConnectionState) {
    this.state = state;
    this.stateListeners.forEach((listener) => listener(state));
  }
}

class FakeViewerConnection extends FakeConnection {
  private readonly mediaListeners = new Set<(stream: MediaStream) => void>();

  constructor(readonly stream: MediaStream) {
    super();
  }

  onMediaChange(listener: (stream: MediaStream) => void) {
    this.mediaListeners.add(listener);
    return () => this.mediaListeners.delete(listener);
  }

  emitMediaChange() {
    this.mediaListeners.forEach((listener) => listener(this.stream));
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function studioFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/v1/live-broadcasts" && init?.method === "POST") {
      return json(
        {
          data: {
            code: "ABCD-EFGH",
            title: "Live match",
            publisherToken: PUBLISHER_TOKEN,
            mediaUrl: MEDIA_URL,
            mediaToken: PUBLISHER_MEDIA_TOKEN,
            expiresAt: EXPIRES_AT,
          },
        },
        201,
      );
    }
    if (url.endsWith("/ABCDEFGH/status")) {
      return json({ data: { code: "ABCD-EFGH", state: "live" } });
    }
    if (url.endsWith("/ABCDEFGH") && init?.method === "DELETE") {
      return json({ data: { stopped: true } });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  });
}

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
const originalSecureContext = Object.getOwnPropertyDescriptor(window, "isSecureContext");

describe("managed phone broadcast components", () => {
  beforeEach(() => {
    document.cookie = "rada-csrf=managed-broadcast-test-csrf-token-that-is-long-enough; Path=/";
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    vi.stubGlobal("RTCPeerConnection", class {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    mocks.connectLiveKitPublisher.mockReset();
    mocks.connectLiveKitViewer.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
    if (originalSecureContext) {
      Object.defineProperty(window, "isSecureContext", originalSecureContext);
    } else {
      Reflect.deleteProperty(window, "isSecureContext");
    }
  });

  it("publishes the selected phone camera through LiveKit only before marking it live", async () => {
    const videoTrack = Object.assign(new EventTarget(), {
      kind: "video",
      enabled: true,
      stop: vi.fn(),
    }) as unknown as MediaStreamTrack;
    const audioTrack = {
      kind: "audio",
      enabled: true,
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    const stream = {
      getTracks: () => [videoTrack, audioTrack],
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [audioTrack],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const connection = new FakeConnection();
    let finishConnecting: ((connection: LiveKitPublisherConnection) => void) | undefined;
    mocks.connectLiveKitPublisher.mockReturnValue(
      new Promise<LiveKitPublisherConnection>((resolve) => {
        finishConnecting = resolve;
      }),
    );
    const fetchMock = studioFetch();
    vi.stubGlobal("fetch", fetchMock);

    render(<ManagedBroadcastStudio locale="en" copy={getLiveBroadcastCopy("en")} />);
    fireEvent.change(screen.getByLabelText("Camera"), { target: { value: "user" } });
    fireEvent.change(screen.getByLabelText(/Broadcast key/), {
      target: { value: "strong-private-broadcast-key" },
    });
    const startButton = screen.getByRole("button", { name: "Allow camera and start" });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);

    await waitFor(() => expect(mocks.connectLiveKitPublisher).toHaveBeenCalledOnce());
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: { ideal: "user" } }),
      }),
    );
    expect(mocks.connectLiveKitPublisher).toHaveBeenCalledWith({
      mediaUrl: MEDIA_URL,
      mediaToken: PUBLISHER_MEDIA_TOKEN,
      stream,
      signal: expect.any(AbortSignal),
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/v1/live-broadcasts/ABCDEFGH/status",
      expect.anything(),
    );

    finishConnecting?.(connection as LiveKitPublisherConnection);
    await waitFor(() => expect(screen.getByText("Live", { selector: "strong" })).toBeVisible());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/live-broadcasts/ABCDEFGH/status",
      expect.objectContaining({ method: "POST" }),
    );
    const preview = screen
      .getAllByLabelText("Phone camera preview")
      .find((element): element is HTMLVideoElement => element instanceof HTMLVideoElement)!;
    expect(preview.srcObject).toBe(stream);

    fireEvent.click(screen.getByRole("button", { name: "Mute microphone" }));
    expect(audioTrack.enabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Turn microphone on" }));
    expect(audioTrack.enabled).toBe(true);

    connection.setState("reconnecting");
    await waitFor(() =>
      expect(screen.getByText("Connecting", { selector: "strong" })).toBeVisible(),
    );
    connection.setState("connected");
    await waitFor(() => expect(screen.getByText("Live", { selector: "strong" })).toBeVisible());

    fireEvent.click(screen.getByRole("button", { name: "Stop broadcast" }));
    await waitFor(() => {
      expect(connection.close).toHaveBeenCalledOnce();
      expect(videoTrack.stop).toHaveBeenCalledOnce();
      expect(audioTrack.stop).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/live-broadcasts/ABCDEFGH",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("ends the LiveKit session when the selected camera track stops", async () => {
    const videoTrack = Object.assign(new EventTarget(), {
      kind: "video",
      enabled: true,
      stop: vi.fn(),
    }) as unknown as MediaStreamTrack;
    const audioTrack = {
      kind: "audio",
      enabled: true,
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    const stream = {
      getTracks: () => [videoTrack, audioTrack],
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [audioTrack],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    const connection = new FakeConnection();
    mocks.connectLiveKitPublisher.mockResolvedValue(connection as LiveKitPublisherConnection);
    const fetchMock = studioFetch();
    vi.stubGlobal("fetch", fetchMock);

    render(<ManagedBroadcastStudio locale="en" copy={getLiveBroadcastCopy("en")} />);
    fireEvent.change(screen.getByLabelText(/Broadcast key/), {
      target: { value: "strong-private-broadcast-key" },
    });
    const startButton = screen.getByRole("button", { name: "Allow camera and start" });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);
    await waitFor(() => expect(screen.getByText("Live", { selector: "strong" })).toBeVisible());

    videoTrack.dispatchEvent(new Event("ended"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("The camera stopped sending video");
      expect(connection.close).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/live-broadcasts/ABCDEFGH",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("lists a live match and opens its subscribe-only LiveKit media stream", async () => {
    const videoTrack = { kind: "video" } as MediaStreamTrack;
    const audioTrack = { kind: "audio" } as MediaStreamTrack;
    const remoteStream = {
      getTracks: () => [videoTrack, audioTrack],
    } as unknown as MediaStream;
    const connection = new FakeViewerConnection(remoteStream);
    mocks.connectLiveKitViewer.mockResolvedValue(connection as LiveKitViewerConnection);
    const summary = {
      code: "ABCD-EFGH",
      title: "Kalev v Tartu",
      state: "live",
      startedAt: new Date().toISOString(),
      expiresAt: EXPIRES_AT,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/live-broadcasts") {
        return json({ data: { broadcasts: [summary] } });
      }
      if (url === "/api/v1/live-broadcasts/ABCDEFGH") {
        return json({
          data: {
            ...summary,
            mediaUrl: MEDIA_URL,
            mediaToken: VIEWER_MEDIA_TOKEN,
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ManagedBroadcastViewer locale="en" copy={getLiveBroadcastCopy("en")} initialCode="" />);
    const matchButton = await screen.findByRole("button", { name: /Kalev v Tartu/ });
    fireEvent.click(matchButton);

    await waitFor(() => expect(screen.getByText("Live", { selector: "strong" })).toBeVisible());
    expect(mocks.connectLiveKitViewer).toHaveBeenCalledWith({
      mediaUrl: MEDIA_URL,
      mediaToken: VIEWER_MEDIA_TOKEN,
      signal: expect.any(AbortSignal),
    });
    const player = screen
      .getAllByLabelText("Live match video")
      .find((element): element is HTMLVideoElement => element instanceof HTMLVideoElement)!;
    expect(player.srcObject).toBe(remoteStream);
    expect(player).not.toHaveAttribute("muted");
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("viewer"),
      expect.anything(),
    );

    connection.setState("reconnecting");
    await waitFor(() =>
      expect(screen.getByText("Connecting", { selector: "strong" })).toBeVisible(),
    );
    connection.setState("connected");
    await waitFor(() => expect(screen.getByText("Live", { selector: "strong" })).toBeVisible());

    fireEvent.click(screen.getByRole("button", { name: "Close broadcast" }));
    await waitFor(() => expect(connection.close).toHaveBeenCalledOnce());
  });
});
