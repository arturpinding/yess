import type { LiveBroadcast } from "@/server/db/schema";
import { hashDemoBroadcastSecret } from "@/server/demo-broadcast/contracts";
import { describe, expect, it, vi } from "vitest";
import { LIVE_BROADCAST_TTL_MS } from "./contracts";
import { LiveBroadcastProviderError, type LiveBroadcastProvider } from "./provider";
import type { LiveBroadcastRepository, NewLiveBroadcastRecord } from "./repository";
import { LiveBroadcastService } from "./service";

class MemoryRepository implements LiveBroadcastRepository {
  rows: LiveBroadcast[] = [];

  async insertNew(input: NewLiveBroadcastRecord): Promise<LiveBroadcast | null> {
    if (this.rows.some((row) => row.code === input.code)) return null;
    const row: LiveBroadcast = {
      id: `10000000-0000-4000-8000-${String(this.rows.length + 1).padStart(12, "0")}`,
      code: input.code,
      title: input.title,
      locale: input.locale,
      state: "provisioned",
      provider: "livekit-cloud",
      providerInputId: input.providerInputId,
      playbackUrl: input.playbackUrl,
      publisherTokenHash: input.publisherTokenHash,
      expiresAt: input.expiresAt,
      startedAt: null,
      endedAt: null,
      providerDeletedAt: null,
      version: 1,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.rows.push(row);
    return row;
  }

  async findByCode(code: string): Promise<LiveBroadcast | null> {
    return this.rows.find((row) => row.code === code) ?? null;
  }

  async listActive(now: Date): Promise<LiveBroadcast[]> {
    return this.rows.filter(
      (row) => (row.state === "provisioned" || row.state === "live") && row.expiresAt > now,
    );
  }

  async markLive(id: string, now: Date): Promise<LiveBroadcast | null> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row || row.state !== "provisioned" || row.expiresAt <= now) return null;
    Object.assign(row, {
      state: "live" as const,
      startedAt: now,
      updatedAt: now,
      version: row.version + 1,
    });
    return row;
  }

  async stop(id: string, now: Date): Promise<LiveBroadcast | null> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row || (row.state !== "provisioned" && row.state !== "live")) return null;
    Object.assign(row, {
      state: "stopped" as const,
      endedAt: now,
      updatedAt: now,
      version: row.version + 1,
    });
    return row;
  }

  async expireActive(now: Date) {
    const expired: Array<{ id: string; providerInputId: string }> = [];
    for (const row of this.rows) {
      if ((row.state === "provisioned" || row.state === "live") && row.expiresAt <= now) {
        row.state = "stopped";
        row.endedAt = now;
        row.updatedAt = now;
        row.version += 1;
        expired.push({ id: row.id, providerInputId: row.providerInputId });
      }
    }
    return expired;
  }

  async listCleanupPending(cutoff: Date, limit = 25) {
    return this.rows
      .filter(
        (row) =>
          (row.state === "stopped" || row.state === "failed") &&
          row.providerDeletedAt === null &&
          row.updatedAt <= cutoff,
      )
      .slice(0, limit)
      .map((row) => ({ id: row.id, providerInputId: row.providerInputId }));
  }

  async markProviderDeleted(id: string, now: Date): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (
      !row ||
      (row.state !== "stopped" && row.state !== "failed") ||
      row.providerDeletedAt !== null
    ) {
      return;
    }
    row.providerDeletedAt = now;
    row.updatedAt = now;
  }

  async touchProviderCleanup(id: string, now: Date): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (
      row &&
      (row.state === "stopped" || row.state === "failed") &&
      row.providerDeletedAt === null
    ) {
      row.updatedAt = now;
    }
  }
}

function fixture() {
  const repository = new MemoryRepository();
  let now = new Date("2026-08-15T10:00:00.000Z");
  let inputNumber = 0;
  let viewerNumber = 0;
  const provider: LiveBroadcastProvider = {
    createInput: vi.fn(async () => {
      inputNumber += 1;
      return {
        providerInputId: `room-${inputNumber}`,
        mediaUrl: "wss://test-project.livekit.cloud",
        mediaToken: `publisher-media-token-${inputNumber}`,
      };
    }),
    createViewerToken: vi.fn(async () => {
      viewerNumber += 1;
      return `viewer-media-token-${viewerNumber}`;
    }),
    deleteInput: vi.fn(async () => undefined),
  };
  let codeNumber = 0;
  const service = new LiveBroadcastService({
    repository,
    provider,
    now: () => now,
    generateCode: () => (codeNumber++ === 0 ? "0123WXYZ" : "ABCDEFGH"),
    generateToken: () => Buffer.alloc(32, 7).toString("base64url"),
  });
  return {
    repository,
    provider,
    service,
    setNow(value: Date) {
      now = value;
    },
  };
}

describe("managed live broadcast service", () => {
  it("returns the publisher media credential once and persists only its URL and app-token hash", async () => {
    const { provider, repository, service } = fixture();
    const created = await service.create({ locale: "et", title: "Kalev – Tartu" });

    expect(created).toMatchObject({
      code: "0123-WXYZ",
      title: "Kalev – Tartu",
      mediaUrl: "wss://test-project.livekit.cloud",
      mediaToken: "publisher-media-token-1",
      expiresAt: "2026-08-15T16:00:00.000Z",
    });
    expect(Date.parse(created.expiresAt) - Date.parse("2026-08-15T10:00:00.000Z")).toBe(
      LIVE_BROADCAST_TTL_MS,
    );
    expect(provider.createInput).toHaveBeenCalledWith(
      "Kalev – Tartu",
      new Date("2026-08-15T16:00:00.000Z"),
    );
    expect(repository.rows[0]).toMatchObject({
      provider: "livekit-cloud",
      providerInputId: "room-1",
      playbackUrl: "wss://test-project.livekit.cloud",
      publisherTokenHash: hashDemoBroadcastSecret(created.publisherToken),
    });
    expect(JSON.stringify(repository.rows[0])).not.toContain(created.mediaToken);
    expect(JSON.stringify(repository.rows[0])).not.toContain(created.publisherToken);
  });

  it("returns a fresh viewer media credential for every public playback lookup", async () => {
    const { provider, repository, service } = fixture();
    const created = await service.create({ locale: "en", title: "Live match" });
    await service.markLive(created.code, created.publisherToken);

    const first = await service.getPlayback(created.code);
    const second = await service.getPlayback(created.code);
    expect(first).toMatchObject({
      state: "live",
      title: "Live match",
      mediaUrl: "wss://test-project.livekit.cloud",
      mediaToken: "viewer-media-token-1",
    });
    expect(second).toMatchObject({
      mediaUrl: "wss://test-project.livekit.cloud",
      mediaToken: "viewer-media-token-2",
    });
    expect(first.mediaToken).not.toBe(second.mediaToken);
    expect(provider.createViewerToken).toHaveBeenNthCalledWith(
      1,
      "room-1",
      new Date("2026-08-15T16:00:00.000Z"),
    );
    expect(provider.createViewerToken).toHaveBeenCalledTimes(2);
    expect(repository.rows[0]?.version).toBe(2);
  });

  it("maps viewer-token failures to a redacted provider-unavailable response", async () => {
    const { provider, service } = fixture();
    const created = await service.create({ locale: "en", title: "Live match" });
    await service.markLive(created.code, created.publisherToken);
    vi.mocked(provider.createViewerToken).mockRejectedValueOnce(
      new LiveBroadcastProviderError("token"),
    );

    await expect(service.getPlayback(created.code)).rejects.toMatchObject({
      code: "provider_unavailable",
      status: 503,
      message: "provider_unavailable",
    });
  });

  it("rejects a wrong publisher credential and makes stopping idempotent", async () => {
    const { provider, service } = fixture();
    const created = await service.create({ locale: "en", title: "Match" });

    await expect(
      service.stop(created.code, Buffer.alloc(32, 9).toString("base64url")),
    ).rejects.toMatchObject({ code: "invalid_publisher_token", status: 401 });
    await expect(service.stop(created.code, created.publisherToken)).resolves.toEqual({
      stopped: true,
    });
    await expect(service.stop(created.code, created.publisherToken)).resolves.toEqual({
      stopped: true,
    });
    expect(provider.deleteInput).toHaveBeenCalledTimes(1);
    await expect(service.getPlayback(created.code)).rejects.toMatchObject({
      code: "broadcast_ended",
      status: 410,
    });
  });

  it("expires abandoned broadcasts and deletes their provider inputs opportunistically", async () => {
    const { provider, repository, service, setNow } = fixture();
    await service.create({ locale: "et", title: "Old match" });
    setNow(new Date("2026-08-15T16:00:01.000Z"));

    await expect(service.list()).resolves.toEqual([]);
    expect(provider.deleteInput).toHaveBeenCalledWith("room-1");
    expect(repository.rows[0]?.providerDeletedAt).toEqual(new Date("2026-08-15T16:00:01.000Z"));
  });

  it("retries a failed provider deletion on later traffic and records success once", async () => {
    const { provider, repository, service, setNow } = fixture();
    const deleteInput = vi.mocked(provider.deleteInput);
    deleteInput.mockRejectedValueOnce(new Error("temporary provider failure"));
    const created = await service.create({ locale: "en", title: "Match" });

    await expect(service.stop(created.code, created.publisherToken)).resolves.toEqual({
      stopped: true,
    });
    expect(deleteInput).toHaveBeenCalledTimes(1);
    expect(repository.rows[0]).toMatchObject({
      state: "stopped",
      providerDeletedAt: null,
    });

    await expect(service.list()).resolves.toEqual([]);
    expect(deleteInput).toHaveBeenCalledTimes(1);

    setNow(new Date("2026-08-15T10:00:31.000Z"));
    await expect(service.list()).resolves.toEqual([]);
    expect(deleteInput).toHaveBeenCalledTimes(2);
    expect(repository.rows[0]?.providerDeletedAt).toEqual(new Date("2026-08-15T10:00:31.000Z"));

    await expect(service.stop(created.code, created.publisherToken)).resolves.toEqual({
      stopped: true,
    });
    await service.list();
    expect(deleteInput).toHaveBeenCalledTimes(2);
  });

  it("allows an authenticated repeated stop to retry cleanup immediately", async () => {
    const { provider, repository, service } = fixture();
    const deleteInput = vi.mocked(provider.deleteInput);
    deleteInput.mockRejectedValueOnce(new Error("temporary provider failure"));
    const created = await service.create({ locale: "en", title: "Match" });

    await service.stop(created.code, created.publisherToken);
    expect(deleteInput).toHaveBeenCalledTimes(1);
    expect(repository.rows[0]?.providerDeletedAt).toBeNull();

    await service.stop(created.code, created.publisherToken);
    expect(deleteInput).toHaveBeenCalledTimes(2);
    expect(repository.rows[0]?.providerDeletedAt).toEqual(new Date("2026-08-15T10:00:00.000Z"));
  });
});
