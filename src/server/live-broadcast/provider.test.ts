import { TokenVerifier } from "livekit-server-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LiveBroadcastProviderError,
  LiveKitCloudLiveBroadcastProvider,
  type LiveKitConfiguration,
} from "./provider";

const NOW = new Date("2026-08-15T10:00:00.000Z");
const EXPIRES_AT = new Date("2026-08-15T16:00:00.000Z");
const configuration: LiveKitConfiguration = {
  mediaUrl: "wss://yess-uw69rax1.livekit.cloud",
  apiKey: "test-api-key",
  apiSecret: "test-api-secret-that-is-long-enough",
};

function fixture(ids: string[] = ["room-id", "viewer-id-1", "viewer-id-2"]) {
  const roomService = {
    createRoom: vi.fn(async () => ({})),
    removeParticipant: vi.fn(async () => undefined),
    deleteRoom: vi.fn(async () => undefined),
  };
  const createRoomService = vi.fn(() => roomService);
  const generateId = vi.fn(() => ids.shift() ?? "fallback-id");
  const provider = new LiveKitCloudLiveBroadcastProvider({
    configuration: () => configuration,
    createRoomService,
    generateId,
    now: () => NOW,
  });
  return { provider, roomService, createRoomService };
}

describe("LiveKit Cloud live broadcast provider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates an explicit room and a short-lived publish-only camera/microphone token", async () => {
    const { provider, roomService, createRoomService } = fixture();

    const provisioned = await provider.createInput("Kalev v Tartu", EXPIRES_AT);

    expect(provisioned).toMatchObject({
      providerInputId: "broadcast-room-id",
      mediaUrl: configuration.mediaUrl,
      mediaToken: expect.any(String),
    });
    expect(createRoomService).toHaveBeenCalledWith(
      "https://yess-uw69rax1.livekit.cloud",
      configuration.apiKey,
      configuration.apiSecret,
    );
    expect(roomService.createRoom).toHaveBeenCalledWith({
      name: "broadcast-room-id",
      emptyTimeout: 5 * 60,
      maxParticipants: 51,
      metadata: JSON.stringify({ title: "Kalev v Tartu" }),
    });

    const claims = await new TokenVerifier(configuration.apiKey, configuration.apiSecret).verify(
      provisioned.mediaToken,
    );
    expect(claims.sub).toBe("publisher-broadcast-room-id");
    expect(claims.video).toMatchObject({
      roomJoin: true,
      room: "broadcast-room-id",
      canPublish: true,
      canPublishSources: ["camera", "microphone"],
      canSubscribe: false,
      canPublishData: false,
    });
    expect((claims.exp ?? 0) - (claims.nbf ?? 0)).toBe(10 * 60);
    expect((claims.exp ?? Infinity) * 1_000).toBeLessThanOrEqual(EXPIRES_AT.getTime());
  });

  it("issues a unique subscribe-only token for every viewer request", async () => {
    const { provider } = fixture(["viewer-id-1", "viewer-id-2"]);

    const first = await provider.createViewerToken("broadcast-room-id", EXPIRES_AT);
    const second = await provider.createViewerToken("broadcast-room-id", EXPIRES_AT);

    expect(first).not.toBe(second);
    const verifier = new TokenVerifier(configuration.apiKey, configuration.apiSecret);
    const firstClaims = await verifier.verify(first);
    const secondClaims = await verifier.verify(second);
    expect(firstClaims.sub).toBe("viewer-viewer-id-1");
    expect(secondClaims.sub).toBe("viewer-viewer-id-2");
    expect(firstClaims.video).toMatchObject({
      roomJoin: true,
      room: "broadcast-room-id",
      canPublish: false,
      canSubscribe: true,
      canPublishData: false,
    });
    expect(firstClaims.video?.canPublishSources).toBeUndefined();
  });

  it("never lets a participant token outlive the broadcast", async () => {
    const { provider } = fixture(["viewer-id"]);
    const expiresSoon = new Date(NOW.getTime() + 90_900);

    const token = await provider.createViewerToken("broadcast-room-id", expiresSoon);
    const claims = await new TokenVerifier(configuration.apiKey, configuration.apiSecret).verify(
      token,
    );

    expect((claims.exp ?? 0) - (claims.nbf ?? 0)).toBe(90);
    expect((claims.exp ?? Infinity) * 1_000).toBeLessThanOrEqual(expiresSoon.getTime());
  });

  it("revokes the deterministic publisher identity before deleting the room", async () => {
    const { provider, roomService } = fixture();

    await expect(provider.deleteInput("broadcast-room-id")).resolves.toBeUndefined();

    expect(roomService.removeParticipant).toHaveBeenCalledWith(
      "broadcast-room-id",
      "publisher-broadcast-room-id",
      { revokeTokenTs: 1_786_788_001n },
    );
    expect(roomService.removeParticipant.mock.invocationCallOrder[0]).toBeLessThan(
      roomService.deleteRoom.mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(roomService.deleteRoom).toHaveBeenCalledWith("broadcast-room-id");
  });

  it("treats missing participants and rooms as successful cleanup", async () => {
    const { provider, roomService } = fixture();
    roomService.removeParticipant.mockRejectedValueOnce({ status: 404 });
    roomService.deleteRoom.mockRejectedValueOnce({ status: 404 });

    await expect(provider.deleteInput("broadcast-room-id")).resolves.toBeUndefined();
  });

  it("does not suppress non-not-found cleanup failures", async () => {
    const { provider, roomService } = fixture();
    roomService.removeParticipant.mockRejectedValueOnce({
      status: 503,
      message: `secret was ${configuration.apiSecret}`,
    });

    const error = await provider
      .deleteInput("broadcast-room-id")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LiveBroadcastProviderError);
    expect(String(error)).not.toContain(configuration.apiSecret);
    expect(roomService.deleteRoom).not.toHaveBeenCalled();
  });

  it("redacts room-creation failures and rejects untrusted project URLs", async () => {
    const { provider, roomService } = fixture();
    roomService.createRoom.mockRejectedValueOnce(
      new Error(`credential ${configuration.apiSecret} rejected`),
    );

    const error = await provider
      .createInput("Match", EXPIRES_AT)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LiveBroadcastProviderError);
    expect(String(error)).not.toContain(configuration.apiSecret);

    const untrusted = new LiveKitCloudLiveBroadcastProvider({
      configuration: () => ({ ...configuration, mediaUrl: "wss://attacker.example" }),
      createRoomService: vi.fn(() => roomService),
      now: () => NOW,
    });
    await expect(untrusted.createViewerToken("room", EXPIRES_AT)).rejects.toBeInstanceOf(
      LiveBroadcastProviderError,
    );
  });
});
