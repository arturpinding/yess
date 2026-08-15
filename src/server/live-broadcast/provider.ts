import { randomUUID } from "node:crypto";
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  type CreateOptions,
  type RemoveParticipantOptions,
  type VideoGrant,
} from "livekit-server-sdk";
import { getEnvironment } from "@/server/environment";

const PROVIDER_TIMEOUT_SECONDS = 12;
const MAX_PARTICIPANT_TOKEN_TTL_SECONDS = 10 * 60;
const MAX_EMPTY_ROOM_TIMEOUT_SECONDS = 5 * 60;
const MAX_ROOM_PARTICIPANTS = 51;

export type ProvisionedLiveInput = {
  providerInputId: string;
  mediaUrl: string;
  mediaToken: string;
};

export interface LiveBroadcastProvider {
  createInput(title: string, expiresAt: Date): Promise<ProvisionedLiveInput>;
  createViewerToken(providerInputId: string, expiresAt: Date): Promise<string>;
  deleteInput(providerInputId: string): Promise<void>;
}

export class LiveBroadcastProviderError extends Error {
  constructor(readonly operation: "create" | "token" | "delete") {
    super(`live_broadcast_provider_${operation}_failed`);
    this.name = "LiveBroadcastProviderError";
  }
}

export type LiveKitConfiguration = {
  mediaUrl: string;
  apiKey: string;
  apiSecret: string;
};

interface LiveKitRoomService {
  createRoom(options: CreateOptions): Promise<unknown>;
  removeParticipant(
    room: string,
    identity: string,
    options?: RemoveParticipantOptions,
  ): Promise<void>;
  deleteRoom(room: string): Promise<void>;
}

type LiveKitRoomServiceFactory = (
  apiUrl: string,
  apiKey: string,
  apiSecret: string,
) => LiveKitRoomService;

function configuredLiveKit(): LiveKitConfiguration {
  const environment = getEnvironment();
  if (!environment.LIVEKIT_URL || !environment.LIVEKIT_API_KEY || !environment.LIVEKIT_API_SECRET) {
    throw new Error("LiveKit is not configured");
  }
  return {
    mediaUrl: environment.LIVEKIT_URL,
    apiKey: environment.LIVEKIT_API_KEY,
    apiSecret: environment.LIVEKIT_API_SECRET,
  };
}

function normalizeLiveKitUrl(value: string): { mediaUrl: string; apiUrl: string } {
  const url = new URL(value);
  if (
    url.protocol !== "wss:" ||
    !/(^|\.)livekit\.cloud$/i.test(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid LiveKit Cloud URL");
  }

  const mediaUrl = url.origin;
  url.protocol = "https:";
  return { mediaUrl, apiUrl: url.origin };
}

function defaultRoomServiceFactory(
  apiUrl: string,
  apiKey: string,
  apiSecret: string,
): LiveKitRoomService {
  return new RoomServiceClient(apiUrl, apiKey, apiSecret, {
    requestTimeout: PROVIDER_TIMEOUT_SECONDS,
  });
}

function hasStatus(error: unknown, status: number): boolean {
  return (
    typeof error === "object" && error !== null && "status" in error && error.status === status
  );
}

export class LiveKitCloudLiveBroadcastProvider implements LiveBroadcastProvider {
  readonly #configuration: () => LiveKitConfiguration;
  readonly #createRoomService: LiveKitRoomServiceFactory;
  readonly #generateId: () => string;
  readonly #now: () => Date;

  constructor(
    dependencies: {
      configuration?: () => LiveKitConfiguration;
      createRoomService?: LiveKitRoomServiceFactory;
      generateId?: () => string;
      now?: () => Date;
    } = {},
  ) {
    this.#configuration = dependencies.configuration ?? configuredLiveKit;
    this.#createRoomService = dependencies.createRoomService ?? defaultRoomServiceFactory;
    this.#generateId = dependencies.generateId ?? randomUUID;
    this.#now = dependencies.now ?? (() => new Date());
  }

  async createInput(title: string, expiresAt: Date): Promise<ProvisionedLiveInput> {
    let roomService: LiveKitRoomService | undefined;
    let roomName: string | undefined;
    try {
      const configuration = this.#configuration();
      const { mediaUrl, apiUrl } = normalizeLiveKitUrl(configuration.mediaUrl);
      const emptyTimeout = Math.min(
        this.#remainingSeconds(expiresAt),
        MAX_EMPTY_ROOM_TIMEOUT_SECONDS,
      );
      roomService = this.#createRoomService(apiUrl, configuration.apiKey, configuration.apiSecret);
      roomName = `broadcast-${this.#generateId()}`;
      await roomService.createRoom({
        name: roomName,
        emptyTimeout,
        maxParticipants: MAX_ROOM_PARTICIPANTS,
        metadata: JSON.stringify({ title }),
      });
      const mediaToken = await this.#participantToken(
        configuration,
        roomName,
        expiresAt,
        "publisher",
      );
      return { providerInputId: roomName, mediaUrl, mediaToken };
    } catch {
      if (roomService && roomName) {
        await roomService.deleteRoom(roomName).catch(() => undefined);
      }
      throw new LiveBroadcastProviderError("create");
    }
  }

  async createViewerToken(providerInputId: string, expiresAt: Date): Promise<string> {
    try {
      const configuration = this.#configuration();
      normalizeLiveKitUrl(configuration.mediaUrl);
      return await this.#participantToken(configuration, providerInputId, expiresAt, "viewer");
    } catch {
      throw new LiveBroadcastProviderError("token");
    }
  }

  async deleteInput(providerInputId: string): Promise<void> {
    try {
      const configuration = this.#configuration();
      const { apiUrl } = normalizeLiveKitUrl(configuration.mediaUrl);
      const roomService = this.#createRoomService(
        apiUrl,
        configuration.apiKey,
        configuration.apiSecret,
      );
      try {
        await roomService.removeParticipant(
          providerInputId,
          this.#publisherIdentity(providerInputId),
          {
            revokeTokenTs: BigInt(Math.floor(this.#now().getTime() / 1_000) + 1),
          },
        );
      } catch (error) {
        if (!hasStatus(error, 404)) throw error;
      }
      try {
        await roomService.deleteRoom(providerInputId);
      } catch (error) {
        if (!hasStatus(error, 404)) throw error;
      }
    } catch (error) {
      if (hasStatus(error, 404)) return;
      throw new LiveBroadcastProviderError("delete");
    }
  }

  async #participantToken(
    configuration: LiveKitConfiguration,
    roomName: string,
    expiresAt: Date,
    role: "publisher" | "viewer",
  ): Promise<string> {
    const token = new AccessToken(configuration.apiKey, configuration.apiSecret, {
      identity:
        role === "publisher" ? this.#publisherIdentity(roomName) : `viewer-${this.#generateId()}`,
      ttl: this.#tokenTtlSeconds(expiresAt),
    });
    token.addGrant(this.#participantGrant(roomName, role));
    return token.toJwt();
  }

  #participantGrant(roomName: string, role: "publisher" | "viewer"): VideoGrant {
    if (role === "publisher") {
      return {
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
        canSubscribe: false,
        canPublishData: false,
      };
    }
    return {
      roomJoin: true,
      room: roomName,
      canPublish: false,
      canSubscribe: true,
      canPublishData: false,
    };
  }

  #tokenTtlSeconds(expiresAt: Date): number {
    return Math.min(this.#remainingSeconds(expiresAt), MAX_PARTICIPANT_TOKEN_TTL_SECONDS);
  }

  #remainingSeconds(expiresAt: Date): number {
    const remainingSeconds = Math.floor((expiresAt.getTime() - this.#now().getTime()) / 1_000);
    if (!Number.isSafeInteger(remainingSeconds) || remainingSeconds <= 0) {
      throw new Error("Broadcast has expired");
    }
    return remainingSeconds;
  }

  #publisherIdentity(roomName: string): string {
    return `publisher-${roomName}`;
  }
}

export const liveKitCloudLiveBroadcastProvider = new LiveKitCloudLiveBroadcastProvider();
