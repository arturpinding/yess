import {
  classifyBroadcastError,
  connectionPhase,
  formatBroadcastCode,
  isMediaSecureContext,
  normalizeBroadcastCode,
  normalizeBroadcastCodeDraft,
  waitForIceGatheringComplete,
} from "./rtc";

class IcePeer extends EventTarget {
  iceGatheringState: RTCIceGatheringState = "gathering";
}

describe("demo broadcast RTC helpers", () => {
  it("normalizes Crockford aliases and displays a manual-entry separator", () => {
    expect(normalizeBroadcastCode(" oiLl-2345 ")).toBe("0111" + "2345");
    expect(formatBroadcastCode("01112345")).toBe("0111-2345");
    expect(normalizeBroadcastCodeDraft("abCd-efgh")).toBe("ABCDEFGH");
  });

  it("rejects incomplete codes and symbols outside the Crockford alphabet", () => {
    expect(normalizeBroadcastCode("ABCD-EFG")).toBeNull();
    expect(normalizeBroadcastCode("ABCD-UFGH")).toBeNull();
    expect(normalizeBroadcastCode("ABCD_1234")).toBeNull();
  });

  it("treats browser-trusted loopback origins as usable for camera tests", () => {
    expect(isMediaSecureContext({ hostname: "192.168.1.20" } as Location, false)).toBe(false);
    expect(isMediaSecureContext({ hostname: "localhost" } as Location, false)).toBe(true);
    expect(isMediaSecureContext({ hostname: "192.168.1.20" } as Location, true)).toBe(true);
  });

  it("maps browser and peer failures to stable UI states", () => {
    expect(classifyBroadcastError(new DOMException("Denied", "NotAllowedError"))).toBe(
      "permission_denied",
    );
    expect(classifyBroadcastError(new DOMException("Busy", "NotReadableError"))).toBe(
      "camera_busy",
    );
    expect(classifyBroadcastError({ code: "viewer_already_claimed" })).toBe("viewer_claimed");
    expect(classifyBroadcastError(new TypeError("Failed to fetch"))).toBe("network");
    expect(connectionPhase("connected", true)).toBe("live");
    expect(connectionPhase("disconnected", true)).toBe("connecting");
    expect(connectionPhase("failed", false)).toBe("failed");
  });

  it("finishes when ICE gathering completes", async () => {
    const peer = new IcePeer();
    const waiting = waitForIceGatheringComplete(peer as unknown as RTCPeerConnection, 500);
    peer.iceGatheringState = "complete";
    peer.dispatchEvent(new Event("icegatheringstatechange"));
    await expect(waiting).resolves.toBeUndefined();
  });

  it("fails a non-trickle offer when ICE gathering times out and supports cancellation", async () => {
    vi.useFakeTimers();
    const peer = new IcePeer();
    const waiting = waitForIceGatheringComplete(peer as unknown as RTCPeerConnection, 250);
    const timedOut = expect(waiting).rejects.toMatchObject({
      code: "ice_gathering_timeout",
      name: "IceGatheringTimeoutError",
    });
    await vi.advanceTimersByTimeAsync(250);
    await timedOut;
    await expect(waiting.catch((error: unknown) => classifyBroadcastError(error))).resolves.toBe(
      "ice_failed",
    );

    const controller = new AbortController();
    const cancelled = waitForIceGatheringComplete(
      peer as unknown as RTCPeerConnection,
      1_000,
      controller.signal,
    );
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    vi.useRealTimers();
  });
});
