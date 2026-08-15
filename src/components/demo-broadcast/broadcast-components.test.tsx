/** @vitest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getBroadcastCopy } from "./broadcast-copy";
import { BroadcastStudio } from "./broadcast-studio";
import { BroadcastViewer } from "./broadcast-viewer";

const PUBLISHER_TOKEN = "publisher_token_abcdefghijklmnopqrstuvwxyz12345";
const VIEWER_TOKEN = "viewer_token_abcdefghijklmnopqrstuvwxyz123456789";
const EXPIRES_AT = new Date(Date.now() + 5 * 60_000).toISOString();
const OFFER_SDP = "v=0\r\no=publisher 1 1 IN IP4 127.0.0.1\r\n";
const ANSWER_SDP = "v=0\r\no=viewer 1 1 IN IP4 127.0.0.1\r\n";

class FakePeerConnection extends EventTarget {
  static instances: FakePeerConnection[] = [];
  static initialIceGatheringState: RTCIceGatheringState = "complete";

  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  iceGatheringState: RTCIceGatheringState = FakePeerConnection.initialIceGatheringState;
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onconnectionstatechange: ((event: Event) => void) | null = null;
  oniceconnectionstatechange: ((event: Event) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  readonly configuration: RTCConfiguration | undefined;
  readonly addTrack = vi.fn();
  readonly close = vi.fn(() => {
    this.connectionState = "closed";
  });

  constructor(configuration?: RTCConfiguration) {
    super();
    this.configuration = configuration;
    FakePeerConnection.instances.push(this);
  }

  async createOffer() {
    return { type: "offer" as const, sdp: OFFER_SDP };
  }

  async createAnswer() {
    return { type: "answer" as const, sdp: ANSWER_SDP };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
const originalSecureContext = Object.getOwnPropertyDescriptor(window, "isSecureContext");

describe("direct-device broadcast components", () => {
  beforeEach(() => {
    FakePeerConnection.instances = [];
    FakePeerConnection.initialIceGatheringState = "complete";
    document.cookie = "rada-csrf=broadcast-test-csrf-token-that-is-long-enough; Path=/";
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalMediaDevices)
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    else Reflect.deleteProperty(navigator, "mediaDevices");
    if (originalSecureContext) {
      Object.defineProperty(window, "isSecureContext", originalSecureContext);
    } else Reflect.deleteProperty(window, "isSecureContext");
  });

  it("publishes the phone camera, reaches live, mutes, and releases every track on stop", async () => {
    const videoTrack = {
      kind: "video",
      enabled: true,
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    const audioTrack = {
      kind: "audio",
      enabled: true,
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    const stream = {
      getTracks: () => [videoTrack, audioTrack],
      getAudioTracks: () => [audioTrack],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/demo-broadcasts" && init?.method === "POST") {
        return json(
          {
            data: {
              code: "ABCD-EFGH",
              publisherToken: PUBLISHER_TOKEN,
              expiresAt: EXPIRES_AT,
              iceServers: [
                {
                  urls: "turns:turn.example.test:443?transport=tcp",
                  username: "publisher-user",
                  credential: "publisher-credential",
                },
              ],
            },
          },
          201,
        );
      }
      if (url.endsWith("/ABCDEFGH/offer")) return json({ data: { accepted: true } });
      if (url.endsWith("/ABCDEFGH/answer") && !init?.method) {
        return json({
          data: {
            answer: { type: "answer", sdp: ANSWER_SDP },
            state: "connected",
            expiresAt: EXPIRES_AT,
          },
        });
      }
      if (url.endsWith("/ABCDEFGH") && init?.method === "DELETE") {
        return json({ data: { deleted: true } });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BroadcastStudio locale="en" copy={getBroadcastCopy("en")} />);
    const start = screen.getByRole("button", { name: "Allow camera and start" });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);

    expect(await screen.findByTestId("publisher-code")).toHaveTextContent("ABCD-EFGH");
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: { ideal: "environment" } }),
        audio: expect.objectContaining({ echoCancellation: true }),
      }),
    );
    const peer = FakePeerConnection.instances[0];
    expect(peer).toBeDefined();
    expect(peer?.configuration?.iceServers).toEqual([
      {
        urls: "turns:turn.example.test:443?transport=tcp",
        username: "publisher-user",
        credential: "publisher-credential",
      },
    ]);
    expect(peer?.addTrack).toHaveBeenCalledTimes(2);
    expect(peer?.remoteDescription).toEqual({ type: "answer", sdp: ANSWER_SDP });
    expect(screen.queryByText("LIVE")).not.toBeInTheDocument();

    await act(async () => {
      if (!peer) return;
      peer.connectionState = "connected";
      peer.onconnectionstatechange?.(new Event("connectionstatechange"));
    });
    expect(screen.getByTestId("publisher-connection-state")).toHaveTextContent(
      "Direct connection is live",
    );
    expect(screen.getByText("LIVE")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mute microphone" }));
    expect(audioTrack.enabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Stop broadcast" }));
    expect(videoTrack.stop).toHaveBeenCalledOnce();
    expect(audioTrack.stop).toHaveBeenCalledOnce();
    expect(peer?.close).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/demo-broadcasts/ABCDEFGH",
        expect.objectContaining({ method: "DELETE", keepalive: true }),
      ),
    );

    const requests = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requests.every((url) => !url.includes(PUBLISHER_TOKEN))).toBe(true);
  });

  it("joins from a formatted code, attaches remote media, and releases it on leave", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    const remoteTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const remoteStream = { getTracks: () => [remoteTrack] } as unknown as MediaStream;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/ABCDEFGH/viewer")) {
        return json(
          {
            data: {
              viewerToken: VIEWER_TOKEN,
              offer: { type: "offer", sdp: OFFER_SDP },
              expiresAt: EXPIRES_AT,
              iceServers: [{ urls: "stun:stun.example.test:3478" }],
            },
          },
          201,
        );
      }
      if (url.endsWith("/ABCDEFGH/answer") && init?.method === "POST") {
        return json({ data: { accepted: true } });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BroadcastViewer locale="en" copy={getBroadcastCopy("en")} initialCode="ABCDEFGH" />);
    expect(screen.getByTestId("viewer-code-input")).toHaveValue("ABCD-EFGH");
    fireEvent.click(screen.getByRole("button", { name: "Join broadcast" }));
    await waitFor(() =>
      expect(screen.getByTestId("viewer-connection-state")).toHaveTextContent(
        "Connecting the devices",
      ),
    );

    const peer = FakePeerConnection.instances[0];
    expect(peer?.configuration?.iceServers).toEqual([{ urls: "stun:stun.example.test:3478" }]);
    expect(peer?.remoteDescription).toEqual({ type: "offer", sdp: OFFER_SDP });
    await act(async () => {
      peer?.ontrack?.({ streams: [remoteStream], track: remoteTrack } as unknown as RTCTrackEvent);
      if (!peer) return;
      peer.connectionState = "connected";
      peer.onconnectionstatechange?.(new Event("connectionstatechange"));
    });
    expect(screen.getByTestId("viewer-connection-state")).toHaveTextContent(
      "Direct connection is live",
    );
    expect((screen.getByTestId("remote-video") as HTMLVideoElement).srcObject).toBe(remoteStream);

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(remoteTrack.stop).toHaveBeenCalledOnce();
    expect(peer?.close).toHaveBeenCalledOnce();
    const answerCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/answer"));
    expect(answerCall?.[1]?.headers).toMatchObject({ Authorization: `Bearer ${VIEWER_TOKEN}` });
    expect(String(answerCall?.[0])).not.toContain(VIEWER_TOKEN);
  });

  it("reuses an in-memory viewer claim after a transient failure and clears it for a new code", async () => {
    let answerAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/viewer")) {
        return json(
          {
            data: {
              viewerToken: VIEWER_TOKEN,
              offer: { type: "offer", sdp: OFFER_SDP },
              expiresAt: EXPIRES_AT,
              iceServers: [],
            },
          },
          201,
        );
      }
      if (url.endsWith("/answer") && init?.method === "POST") {
        answerAttempts += 1;
        if (answerAttempts === 1) throw new TypeError("temporary network failure");
        return json({ data: { accepted: true } });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BroadcastViewer locale="en" copy={getBroadcastCopy("en")} initialCode="ABCDEFGH" />);
    fireEvent.click(screen.getByRole("button", { name: "Join broadcast" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "signaling server could not be reached",
    );

    fireEvent.click(screen.getByRole("button", { name: "Join broadcast" }));
    await waitFor(() =>
      expect(screen.getByTestId("viewer-connection-state")).toHaveTextContent(
        "Connecting the devices",
      ),
    );
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/viewer")),
    ).toHaveLength(1);
    expect(answerAttempts).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    fireEvent.change(screen.getByTestId("viewer-code-input"), {
      target: { value: "QRST-VWXY" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join broadcast" }));
    await waitFor(() => expect(answerAttempts).toBe(3));
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/viewer")),
    ).toHaveLength(2);
  });

  it("does not publish partial SDP when non-trickle ICE gathering times out", async () => {
    vi.useFakeTimers();
    FakePeerConnection.initialIceGatheringState = "gathering";
    const track = { kind: "video", stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = {
      getTracks: () => [track],
      getAudioTracks: () => [],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/demo-broadcasts" && init?.method === "POST") {
        return json(
          {
            data: {
              code: "ABCD-EFGH",
              publisherToken: PUBLISHER_TOKEN,
              expiresAt: EXPIRES_AT,
              iceServers: [],
            },
          },
          201,
        );
      }
      if (url.endsWith("/ABCDEFGH") && init?.method === "DELETE") {
        return json({ data: { deleted: true } });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BroadcastStudio locale="en" copy={getBroadcastCopy("en")} />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(screen.getByRole("button", { name: "Allow camera and start" }));
    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(FakePeerConnection.instances).toHaveLength(1);

    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    await act(async () => {
      for (let index = 0; index < 4; index += 1) await Promise.resolve();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("could not find a direct connection path");
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/offer"))).toBe(false);
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("stops local media and deletes the session at the server expiry time", async () => {
    const track = { kind: "video", stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = {
      getTracks: () => [track],
      getAudioTracks: () => [],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    const expiresAt = new Date(Date.now() + 400).toISOString();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/demo-broadcasts" && init?.method === "POST") {
        return json(
          {
            data: {
              code: "ABCD-EFGH",
              publisherToken: PUBLISHER_TOKEN,
              expiresAt,
              iceServers: [],
            },
          },
          201,
        );
      }
      if (url.endsWith("/ABCDEFGH/offer")) return json({ data: { accepted: true } });
      if (url.endsWith("/ABCDEFGH/answer") && !init?.method) {
        return json({ data: { answer: null, state: "offer_ready", expiresAt } });
      }
      if (url.endsWith("/ABCDEFGH") && init?.method === "DELETE") {
        return json({ data: { deleted: true } });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BroadcastStudio locale="en" copy={getBroadcastCopy("en")} />);
    const start = screen.getByRole("button", { name: "Allow camera and start" });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    expect(await screen.findByTestId("publisher-code")).toHaveTextContent("ABCD-EFGH");
    expect(screen.queryByText("LIVE")).not.toBeInTheDocument();

    await waitFor(
      () =>
        expect(screen.getByTestId("publisher-connection-state")).toHaveTextContent(
          "Broadcast stopped",
        ),
      { timeout: 1_500 },
    );
    expect(track.stop).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/demo-broadcasts/ABCDEFGH",
      expect.objectContaining({ method: "DELETE", keepalive: true }),
    );
    expect(screen.queryByTestId("publisher-code")).not.toBeInTheDocument();
  });

  it("rejects an invalid viewer code before claiming a session", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<BroadcastViewer locale="en" copy={getBroadcastCopy("en")} initialCode="" />);

    fireEvent.change(screen.getByTestId("viewer-code-input"), { target: { value: "ABCD-UFGH" } });
    fireEvent.click(screen.getByRole("button", { name: "Join broadcast" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("eight-character code");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
