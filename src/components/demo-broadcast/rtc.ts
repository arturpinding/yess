export const BROADCAST_CODE_LENGTH = 8;
export const BROADCAST_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type BroadcastErrorKind =
  | "permission_denied"
  | "camera_not_found"
  | "camera_busy"
  | "insecure_context"
  | "unsupported_browser"
  | "network"
  | "session_not_found"
  | "viewer_claimed"
  | "rate_limited"
  | "ice_failed"
  | "cancelled"
  | "unexpected";

export type BroadcastConnectionPhase =
  "idle" | "requesting" | "preparing" | "waiting" | "connecting" | "live" | "stopped" | "failed";

export class IceGatheringTimeoutError extends Error {
  readonly code = "ice_gathering_timeout";

  constructor() {
    super("ICE gathering did not complete before the non-trickle signaling deadline");
    this.name = "IceGatheringTimeoutError";
  }
}

function canonicalizeCodeCharacters(value: string) {
  return value.toUpperCase().replaceAll("O", "0").replace(/[IL]/g, "1").replace(/[\s-]/g, "");
}

export function normalizeBroadcastCode(value: string): string | null {
  const code = canonicalizeCodeCharacters(value);
  if (code.length !== BROADCAST_CODE_LENGTH) return null;
  return [...code].every((character) => BROADCAST_CODE_ALPHABET.includes(character)) ? code : null;
}

export function normalizeBroadcastCodeDraft(value: string) {
  const canonical = value
    .toUpperCase()
    .replaceAll("O", "0")
    .replace(/[IL]/g, "1")
    .replace(/[\s-]/g, "");
  return canonical.slice(0, BROADCAST_CODE_LENGTH);
}

export function formatBroadcastCode(value: string) {
  const code = canonicalizeCodeCharacters(value).slice(0, BROADCAST_CODE_LENGTH);
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function isMediaSecureContext(location: Pick<Location, "hostname">, secure: boolean) {
  return (
    secure ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "[::1]"
  );
}

export function connectionPhase(
  state: RTCPeerConnectionState,
  hasRemoteMedia = false,
): BroadcastConnectionPhase {
  switch (state) {
    case "connected":
      return hasRemoteMedia ? "live" : "connecting";
    case "connecting":
      return "connecting";
    case "failed":
      return "failed";
    case "disconnected":
      return "connecting";
    case "closed":
      return "stopped";
    case "new":
      return "waiting";
  }
}

export function classifyBroadcastError(error: unknown): BroadcastErrorKind {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "permission_denied";
      case "NotFoundError":
      case "DevicesNotFoundError":
      case "OverconstrainedError":
        return "camera_not_found";
      case "NotReadableError":
      case "TrackStartError":
        return "camera_busy";
      case "AbortError":
        return "cancelled";
    }
  }

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code).toLowerCase()
      : "";
  if (code.includes("viewer") && (code.includes("claim") || code.includes("already"))) {
    return "viewer_claimed";
  }
  if (code.includes("not_found") || code.includes("expired") || code.includes("unknown_session")) {
    return "session_not_found";
  }
  if (code.includes("rate")) return "rate_limited";
  if (code.includes("ice")) return "ice_failed";
  if (code.includes("abort") || code.includes("cancel")) return "cancelled";
  if (error instanceof TypeError || code.includes("network") || code.includes("offline")) {
    return "network";
  }
  return "unexpected";
}

export async function waitForIceGatheringComplete(
  peer: RTCPeerConnection,
  timeoutMs = 5_000,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
  if (peer.iceGatheringState === "complete") return;

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      peer.removeEventListener("icegatheringstatechange", onStateChange);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onStateChange = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("The operation was aborted", "AbortError"));
    };
    const onTimeout = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new IceGatheringTimeoutError());
    };
    const timer = globalThis.setTimeout(onTimeout, timeoutMs);

    peer.addEventListener("icegatheringstatechange", onStateChange);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function abortableDelay(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
