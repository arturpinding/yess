import { ConnectionState, Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

export type LiveKitConnectionState = "connected" | "reconnecting" | "disconnected";

export type LiveKitTransportErrorCode = "connection_failed" | "connection_timeout";

export class LiveKitTransportError extends Error {
  constructor(
    readonly code: LiveKitTransportErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LiveKitTransportError";
  }
}

type RoomFactory = () => Room;

type ConnectOptions = {
  mediaUrl: string;
  mediaToken: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  createRoom?: RoomFactory;
};

export type LiveKitConnection = {
  readonly state: LiveKitConnectionState;
  onStateChange(listener: (state: LiveKitConnectionState) => void): () => void;
  /** Disconnects from LiveKit without stopping caller-owned capture tracks. */
  close(): Promise<void>;
};

export type LiveKitPublisherConnection = LiveKitConnection;

export type LiveKitViewerConnection = LiveKitConnection & {
  /** A stable stream populated with every subscribed remote audio/video track. */
  readonly stream: MediaStream;
  onMediaChange(listener: (stream: MediaStream) => void): () => void;
};

export type ConnectLiveKitPublisherOptions = ConnectOptions & {
  stream: MediaStream;
};

export type ConnectLiveKitViewerOptions = ConnectOptions;

const DEFAULT_CONNECTION_TIMEOUT_MS = 15_000;

function defaultRoomFactory() {
  return new Room({
    disconnectOnPageLeave: false,
    stopLocalTrackOnUnpublish: false,
  });
}

function normalizedRoomState(state: ConnectionState): LiveKitConnectionState {
  if (state === ConnectionState.Connected) return "connected";
  if (
    state === ConnectionState.Connecting ||
    state === ConnectionState.Reconnecting ||
    state === ConnectionState.SignalReconnecting
  ) {
    return "reconnecting";
  }
  return "disconnected";
}

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

async function disconnectRoom(room: Room) {
  try {
    await room.disconnect(false);
  } catch {
    // Local capture belongs to the caller, so cleanup remains safe to retry there.
  }
}

async function runWithConnectionDeadline<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<T> {
  if (signal?.aborted) throw abortReason(signal);

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(abortReason(signal!)));
    const timeout = window.setTimeout(
      () =>
        finish(() =>
          reject(
            new LiveKitTransportError(
              "connection_timeout",
              "The LiveKit connection did not become ready in time",
            ),
          ),
        ),
      timeoutMs,
    );

    signal?.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (cause) => finish(() => reject(cause)),
    );
  });
}

async function connectRoom(
  room: Room,
  options: ConnectOptions,
  autoSubscribe: boolean,
): Promise<void> {
  try {
    await runWithConnectionDeadline(
      room.connect(options.mediaUrl, options.mediaToken, {
        autoSubscribe,
        peerConnectionTimeout: options.timeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
        websocketTimeout: options.timeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
      }),
      options.signal,
      options.timeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
    );
  } catch (cause) {
    await disconnectRoom(room);
    if (
      cause instanceof LiveKitTransportError ||
      (cause instanceof DOMException && cause.name === "AbortError")
    ) {
      throw cause;
    }
    throw new LiveKitTransportError(
      "connection_failed",
      "The LiveKit connection could not be established",
      { cause },
    );
  }
}

function baseConnection(room: Room): LiveKitConnection {
  let closing: Promise<void> | undefined;
  return {
    get state() {
      return normalizedRoomState(room.state);
    },
    onStateChange(listener) {
      const onStateChanged = (state: ConnectionState) => listener(normalizedRoomState(state));
      room.on(RoomEvent.ConnectionStateChanged, onStateChanged);
      return () => room.off(RoomEvent.ConnectionStateChanged, onStateChanged);
    },
    close() {
      closing ??= disconnectRoom(room);
      return closing;
    },
  };
}

export async function connectLiveKitPublisher(
  options: ConnectLiveKitPublisherOptions,
): Promise<LiveKitPublisherConnection> {
  const room = (options.createRoom ?? defaultRoomFactory)();
  await connectRoom(room, options, false);

  try {
    await runWithConnectionDeadline(
      Promise.all(
        options.stream.getTracks().map((track) =>
          room.localParticipant.publishTrack(track, {
            source: track.kind === "video" ? Track.Source.Camera : Track.Source.Microphone,
            stream: "camera",
          }),
        ),
      ),
      options.signal,
      options.timeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
    );
  } catch (cause) {
    await disconnectRoom(room);
    if (
      cause instanceof LiveKitTransportError ||
      (cause instanceof DOMException && cause.name === "AbortError")
    ) {
      throw cause;
    }
    throw new LiveKitTransportError(
      "connection_failed",
      "The camera tracks could not be published to LiveKit",
      { cause },
    );
  }

  return baseConnection(room);
}

export async function connectLiveKitViewer(
  options: ConnectLiveKitViewerOptions,
): Promise<LiveKitViewerConnection> {
  const room = (options.createRoom ?? defaultRoomFactory)();
  const stream = new MediaStream();
  const mediaListeners = new Set<(nextStream: MediaStream) => void>();
  const notifyMediaChange = () => mediaListeners.forEach((listener) => listener(stream));
  const onTrackSubscribed = (track: RemoteTrack) => {
    const mediaTrack = track.mediaStreamTrack;
    if (!stream.getTracks().includes(mediaTrack)) stream.addTrack(mediaTrack);
    notifyMediaChange();
  };
  const onTrackUnsubscribed = (track: RemoteTrack) => {
    stream.removeTrack(track.mediaStreamTrack);
    notifyMediaChange();
  };
  room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
  room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);

  try {
    await connectRoom(room, options, true);
  } catch (error) {
    room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    throw error;
  }

  const base = baseConnection(room);
  let closing: Promise<void> | undefined;
  return {
    get state() {
      return base.state;
    },
    stream,
    onStateChange: base.onStateChange,
    onMediaChange(listener) {
      mediaListeners.add(listener);
      return () => mediaListeners.delete(listener);
    },
    close() {
      if (closing) return closing;
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
      mediaListeners.clear();
      stream.getTracks().forEach((track) => stream.removeTrack(track));
      closing = base.close();
      return closing;
    },
  };
}

export function waitForLiveKitConnected(
  connection: LiveKitConnection,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<void> {
  if (connection.state === "connected") return Promise.resolve();
  if (connection.state === "disconnected") {
    return Promise.reject(
      new LiveKitTransportError(
        "connection_failed",
        "The LiveKit connection could not be established",
      ),
    );
  }

  let cleanup: () => void = () => undefined;
  const connected = new Promise<void>((resolve, reject) => {
    const stopListening = connection.onStateChange((state) => {
      if (state === "connected") {
        cleanup();
        resolve();
      } else if (state === "disconnected") {
        cleanup();
        reject(
          new LiveKitTransportError(
            "connection_failed",
            "The LiveKit connection could not be established",
          ),
        );
      }
    });
    cleanup = stopListening;
  });

  return runWithConnectionDeadline(
    connected,
    options.signal,
    options.timeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
  ).finally(cleanup);
}
