/** @vitest-environment jsdom */

import { ConnectionState, RoomEvent, Track, type Room } from "livekit-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectLiveKitPublisher,
  connectLiveKitViewer,
  waitForLiveKitConnected,
} from "./livekit-transport";

type RoomListener = (...args: unknown[]) => void;

class FakeMediaStream extends EventTarget {
  private readonly tracks: MediaStreamTrack[];

  constructor(tracks: MediaStreamTrack[] = []) {
    super();
    this.tracks = [...tracks];
  }

  getTracks() {
    return [...this.tracks];
  }

  addTrack(track: MediaStreamTrack) {
    if (!this.tracks.includes(track)) this.tracks.push(track);
  }

  removeTrack(track: MediaStreamTrack) {
    const index = this.tracks.indexOf(track);
    if (index >= 0) this.tracks.splice(index, 1);
  }
}

class FakeRoom {
  state = ConnectionState.Disconnected;
  readonly publishTrack = vi.fn().mockResolvedValue({});
  readonly localParticipant = { publishTrack: this.publishTrack };
  readonly disconnect = vi.fn(async () => {
    this.setState(ConnectionState.Disconnected);
  });
  readonly connect = vi.fn(async (...args: [string, string, { autoSubscribe?: boolean }?]) => {
    void args;
    this.setState(ConnectionState.Connected);
  });
  private readonly listeners = new Map<RoomEvent, Set<RoomListener>>();

  on(event: RoomEvent, listener: RoomListener) {
    const listeners = this.listeners.get(event) ?? new Set<RoomListener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: RoomEvent, listener: RoomListener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: RoomEvent, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }

  setState(state: ConnectionState) {
    this.state = state;
    this.emit(RoomEvent.ConnectionStateChanged, state);
  }
}

function makeTrack(kind: "audio" | "video") {
  return {
    kind,
    enabled: true,
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function asRoom(room: FakeRoom) {
  return room as unknown as Room;
}

describe("LiveKit browser transport", () => {
  beforeEach(() => {
    vi.stubGlobal("MediaStream", FakeMediaStream);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("connects a publisher without subscriptions and publishes caller tracks by source", async () => {
    const room = new FakeRoom();
    const video = makeTrack("video");
    const audio = makeTrack("audio");
    const stream = new FakeMediaStream([video, audio]) as unknown as MediaStream;

    const connection = await connectLiveKitPublisher({
      mediaUrl: "wss://project.livekit.cloud",
      mediaToken: "publisher-media-token",
      stream,
      createRoom: () => asRoom(room),
    });

    expect(room.connect).toHaveBeenCalledWith(
      "wss://project.livekit.cloud",
      "publisher-media-token",
      expect.objectContaining({ autoSubscribe: false }),
    );
    expect(room.publishTrack).toHaveBeenNthCalledWith(
      1,
      video,
      expect.objectContaining({ source: Track.Source.Camera, stream: "camera" }),
    );
    expect(room.publishTrack).toHaveBeenNthCalledWith(
      2,
      audio,
      expect.objectContaining({ source: Track.Source.Microphone, stream: "camera" }),
    );

    await connection.close();
    await connection.close();
    expect(room.disconnect).toHaveBeenCalledOnce();
    expect(room.disconnect).toHaveBeenCalledWith(false);
    expect(video.stop).not.toHaveBeenCalled();
    expect(audio.stop).not.toHaveBeenCalled();
  });

  it("connects a subscribe-only viewer and keeps all remote media in one stable stream", async () => {
    const room = new FakeRoom();
    const video = makeTrack("video");
    const audio = makeTrack("audio");
    room.connect.mockImplementationOnce(async () => {
      room.setState(ConnectionState.Connected);
      room.emit(RoomEvent.TrackSubscribed, { mediaStreamTrack: video });
    });

    const connection = await connectLiveKitViewer({
      mediaUrl: "wss://project.livekit.cloud",
      mediaToken: "viewer-media-token",
      createRoom: () => asRoom(room),
    });

    expect(room.connect).toHaveBeenCalledWith(
      "wss://project.livekit.cloud",
      "viewer-media-token",
      expect.objectContaining({ autoSubscribe: true }),
    );
    expect(connection.stream.getTracks()).toEqual([video]);

    const onMediaChange = vi.fn();
    connection.onMediaChange(onMediaChange);
    room.emit(RoomEvent.TrackSubscribed, { mediaStreamTrack: audio });
    expect(connection.stream.getTracks()).toEqual([video, audio]);
    expect(onMediaChange).toHaveBeenLastCalledWith(connection.stream);

    room.emit(RoomEvent.TrackUnsubscribed, { mediaStreamTrack: video });
    expect(connection.stream.getTracks()).toEqual([audio]);

    await connection.close();
    room.emit(RoomEvent.TrackSubscribed, { mediaStreamTrack: video });
    expect(connection.stream.getTracks()).toEqual([]);
    expect(room.disconnect).toHaveBeenCalledWith(false);
  });

  it("keeps simultaneous viewers in independent LiveKit connections", async () => {
    const firstRoom = new FakeRoom();
    const secondRoom = new FakeRoom();
    const firstTrack = makeTrack("video");
    const secondTrack = makeTrack("video");

    const [first, second] = await Promise.all([
      connectLiveKitViewer({
        mediaUrl: "wss://project.livekit.cloud",
        mediaToken: "first-viewer-media-token",
        createRoom: () => asRoom(firstRoom),
      }),
      connectLiveKitViewer({
        mediaUrl: "wss://project.livekit.cloud",
        mediaToken: "second-viewer-media-token",
        createRoom: () => asRoom(secondRoom),
      }),
    ]);
    firstRoom.emit(RoomEvent.TrackSubscribed, { mediaStreamTrack: firstTrack });
    secondRoom.emit(RoomEvent.TrackSubscribed, { mediaStreamTrack: secondTrack });

    expect(first.stream.getTracks()).toEqual([firstTrack]);
    expect(second.stream.getTracks()).toEqual([secondTrack]);
    await first.close();
    expect(first.stream.getTracks()).toEqual([]);
    expect(second.stream.getTracks()).toEqual([secondTrack]);
    expect(secondRoom.disconnect).not.toHaveBeenCalled();

    await second.close();
  });

  it("reports reconnect state changes and waits for the room to recover", async () => {
    const room = new FakeRoom();
    const connection = await connectLiveKitPublisher({
      mediaUrl: "wss://project.livekit.cloud",
      mediaToken: "publisher-media-token",
      stream: new FakeMediaStream() as unknown as MediaStream,
      createRoom: () => asRoom(room),
    });
    const onStateChange = vi.fn();
    connection.onStateChange(onStateChange);

    room.setState(ConnectionState.Reconnecting);
    const connected = waitForLiveKitConnected(connection, { timeoutMs: 1_000 });
    room.setState(ConnectionState.Connected);

    await expect(connected).resolves.toBeUndefined();
    expect(onStateChange).toHaveBeenNthCalledWith(1, "reconnecting");
    expect(onStateChange).toHaveBeenNthCalledWith(2, "connected");
  });

  it("times out a stalled connection and disconnects without stopping capture", async () => {
    vi.useFakeTimers();
    const room = new FakeRoom();
    room.connect.mockImplementationOnce(() => new Promise<void>(() => undefined));
    const video = makeTrack("video");
    const connecting = connectLiveKitPublisher({
      mediaUrl: "wss://project.livekit.cloud",
      mediaToken: "publisher-media-token",
      stream: new FakeMediaStream([video]) as unknown as MediaStream,
      timeoutMs: 1_000,
      createRoom: () => asRoom(room),
    });
    const expectation = expect(connecting).rejects.toMatchObject({
      code: "connection_timeout",
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
    expect(room.disconnect).toHaveBeenCalledWith(false);
    expect(video.stop).not.toHaveBeenCalled();
  });
});
