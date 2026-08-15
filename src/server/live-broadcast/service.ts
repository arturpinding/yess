import type { LiveBroadcast } from "@/server/db/schema";
import {
  demoBroadcastSecretMatches,
  formatDemoBroadcastCode,
  generateDemoBroadcastCode,
  generateDemoBroadcastToken,
  hashDemoBroadcastSecret,
  normalizeDemoBroadcastCode,
} from "@/server/demo-broadcast/contracts";
import { LIVE_BROADCAST_TTL_MS, type LiveBroadcastLocale } from "./contracts";
import {
  liveKitCloudLiveBroadcastProvider,
  LiveBroadcastProviderError,
  type LiveBroadcastProvider,
} from "./provider";
import {
  postgresLiveBroadcastRepository,
  type LiveBroadcastRepository,
  type ProviderCleanupRecord,
} from "./repository";

export type LiveBroadcastErrorCode =
  | "not_found"
  | "broadcast_expired"
  | "broadcast_ended"
  | "invalid_publisher_token"
  | "code_generation_failed"
  | "provider_unavailable";

export class LiveBroadcastError extends Error {
  constructor(
    readonly code: LiveBroadcastErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "LiveBroadcastError";
  }
}

export interface LiveBroadcastServiceDependencies {
  repository: LiveBroadcastRepository;
  provider: LiveBroadcastProvider;
  now?: () => Date;
  generateCode?: () => string;
  generateToken?: () => string;
}

const MAX_CODE_ATTEMPTS = 8;
const MAX_PROVIDER_CLEANUPS_PER_REQUEST = 5;
const PROVIDER_CLEANUP_RETRY_DELAY_MS = 30_000;

export class LiveBroadcastService {
  readonly #repository: LiveBroadcastRepository;
  readonly #provider: LiveBroadcastProvider;
  readonly #now: () => Date;
  readonly #generateCode: () => string;
  readonly #generateToken: () => string;

  constructor(dependencies: LiveBroadcastServiceDependencies) {
    this.#repository = dependencies.repository;
    this.#provider = dependencies.provider;
    this.#now = dependencies.now ?? (() => new Date());
    this.#generateCode = dependencies.generateCode ?? generateDemoBroadcastCode;
    this.#generateToken = dependencies.generateToken ?? generateDemoBroadcastToken;
  }

  async create(input: { locale: LiveBroadcastLocale; title: string }) {
    const now = this.#now();
    const expiresAt = new Date(now.getTime() + LIVE_BROADCAST_TTL_MS);
    await this.#cleanupExpired(now);

    let provisioned;
    try {
      provisioned = await this.#provider.createInput(input.title, expiresAt);
    } catch (error) {
      if (error instanceof LiveBroadcastProviderError) {
        throw new LiveBroadcastError("provider_unavailable", 503);
      }
      throw error;
    }

    let persisted = false;
    try {
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        const publisherToken = this.#generateToken();
        const created = await this.#repository.insertNew({
          code: this.#generateCode(),
          title: input.title,
          locale: input.locale,
          providerInputId: provisioned.providerInputId,
          playbackUrl: provisioned.mediaUrl,
          publisherTokenHash: hashDemoBroadcastSecret(publisherToken),
          expiresAt,
          now,
        });
        if (!created) continue;
        persisted = true;
        return {
          code: formatDemoBroadcastCode(created.code),
          title: created.title,
          publisherToken,
          mediaUrl: provisioned.mediaUrl,
          mediaToken: provisioned.mediaToken,
          expiresAt: created.expiresAt.toISOString(),
        };
      }
      throw new LiveBroadcastError("code_generation_failed", 503);
    } finally {
      if (!persisted) {
        await this.#provider.deleteInput(provisioned.providerInputId).catch(() => undefined);
      }
    }
  }

  async list() {
    const now = this.#now();
    await this.#cleanupExpired(now);
    const rows = await this.#repository.listActive(now);
    return rows.map((row) => this.#publicSummary(row));
  }

  async getPlayback(codeInput: string) {
    const { row } = await this.#active(codeInput);
    let mediaToken: string;
    try {
      mediaToken = await this.#provider.createViewerToken(row.providerInputId, row.expiresAt);
    } catch (error) {
      if (error instanceof LiveBroadcastProviderError) {
        throw new LiveBroadcastError("provider_unavailable", 503);
      }
      throw error;
    }
    return {
      ...this.#publicSummary(row),
      mediaUrl: row.playbackUrl,
      mediaToken,
    };
  }

  async markLive(codeInput: string, publisherToken: string) {
    const { row, now } = await this.#authorized(codeInput, publisherToken);
    if (row.state === "live") return this.#publicSummary(row);
    if (row.state !== "provisioned") throw new LiveBroadcastError("broadcast_ended", 410);
    const updated = await this.#repository.markLive(row.id, now);
    if (updated) return this.#publicSummary(updated);
    const current = await this.#repository.findByCode(row.code);
    if (current?.state === "live") return this.#publicSummary(current);
    throw new LiveBroadcastError("broadcast_ended", 410);
  }

  async stop(codeInput: string, publisherToken: string) {
    const code = this.#canonicalCode(codeInput);
    const row = await this.#repository.findByCode(code);
    if (!row) throw new LiveBroadcastError("not_found", 404);
    this.#assertPublisherToken(row, publisherToken);

    const now = this.#now();
    const stopped = await this.#repository.stop(row.id, now);
    const cleanupTarget =
      stopped ??
      (row.providerDeletedAt === null && (row.state === "stopped" || row.state === "failed")
        ? row
        : null);
    if (cleanupTarget) await this.#deleteProviderInput(cleanupTarget, now);
    await this.#cleanupExpired(now);
    return { stopped: true as const };
  }

  async #active(codeInput: string): Promise<{ row: LiveBroadcast; now: Date }> {
    const code = this.#canonicalCode(codeInput);
    const now = this.#now();
    const row = await this.#repository.findByCode(code);
    await this.#cleanupExpired(now);
    if (!row) throw new LiveBroadcastError("not_found", 404);
    if (row.expiresAt.getTime() <= now.getTime()) {
      throw new LiveBroadcastError("broadcast_expired", 410);
    }
    if (row.state === "stopped" || row.state === "failed") {
      throw new LiveBroadcastError("broadcast_ended", 410);
    }
    return { row, now };
  }

  async #authorized(codeInput: string, publisherToken: string) {
    const active = await this.#active(codeInput);
    this.#assertPublisherToken(active.row, publisherToken);
    return active;
  }

  #assertPublisherToken(row: LiveBroadcast, publisherToken: string): void {
    if (!demoBroadcastSecretMatches(publisherToken, row.publisherTokenHash)) {
      throw new LiveBroadcastError("invalid_publisher_token", 401);
    }
  }

  #canonicalCode(value: string): string {
    const code = normalizeDemoBroadcastCode(value);
    if (!code) throw new LiveBroadcastError("not_found", 404);
    return code;
  }

  async #cleanupExpired(now: Date): Promise<void> {
    const expired = await this.#repository.expireActive(now);
    await Promise.allSettled(expired.map((row) => this.#deleteProviderInput(row, now)));
    const cutoff = new Date(now.getTime() - PROVIDER_CLEANUP_RETRY_DELAY_MS);
    const cleanupPending = await this.#repository.listCleanupPending(
      cutoff,
      MAX_PROVIDER_CLEANUPS_PER_REQUEST,
    );
    await Promise.allSettled(cleanupPending.map((row) => this.#deleteProviderInput(row, now)));
  }

  async #deleteProviderInput(row: ProviderCleanupRecord, now: Date): Promise<void> {
    try {
      await this.#provider.deleteInput(row.providerInputId);
    } catch {
      await this.#repository.touchProviderCleanup(row.id, now);
      return;
    }
    await this.#repository.markProviderDeleted(row.id, now);
  }

  #publicSummary(row: LiveBroadcast) {
    return {
      code: formatDemoBroadcastCode(row.code),
      title: row.title,
      state: row.state as "provisioned" | "live",
      startedAt: row.startedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt.toISOString(),
    };
  }
}

export const liveBroadcastService = new LiveBroadcastService({
  repository: postgresLiveBroadcastRepository,
  provider: liveKitCloudLiveBroadcastProvider,
});
