import type { DemoBroadcast } from "@/server/db/schema";
import { describe, expect, it } from "vitest";
import { DEMO_BROADCAST_TTL_MS, hashDemoBroadcastSecret } from "./contracts";
import type { DemoBroadcastRepository, NewDemoBroadcastRecord } from "./repository";
import { DemoBroadcastService } from "./service";

const offerSdp = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=offer\r\nt=0 0\r\n";
const answerSdp = "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=answer\r\nt=0 0\r\n";

class MemoryRepository implements DemoBroadcastRepository {
  row: DemoBroadcast | null = null;
  purgedAt: Date | null = null;
  purgeCalls = 0;

  async purgeExpired(now: Date): Promise<void> {
    this.purgeCalls += 1;
    this.purgedAt = now;
    if (this.row && this.row.expiresAt.getTime() <= now.getTime()) this.row = null;
  }

  async insertNew(input: NewDemoBroadcastRecord): Promise<DemoBroadcast | null> {
    if (this.row?.code === input.code) return null;
    this.row = {
      id: "10000000-0000-4000-8000-000000000001",
      code: input.code,
      locale: input.locale,
      state: "created",
      publisherTokenHash: input.publisherTokenHash,
      viewerTokenHash: null,
      offerSdp: null,
      offerSdpHash: null,
      answerSdp: null,
      answerSdpHash: null,
      viewerClaimedAt: null,
      expiresAt: input.expiresAt,
      version: 1,
      createdAt: input.now,
      updatedAt: input.now,
    };
    return this.row;
  }

  async findByCode(code: string): Promise<DemoBroadcast | null> {
    return this.row?.code === code ? this.row : null;
  }

  async storeOffer(
    id: string,
    sdp: string,
    sdpHash: string,
    now: Date,
  ): Promise<DemoBroadcast | null> {
    if (
      !this.row ||
      this.row.id !== id ||
      this.row.expiresAt.getTime() <= now.getTime() ||
      this.row.offerSdp !== null ||
      this.row.viewerTokenHash !== null
    ) {
      return null;
    }
    this.row = {
      ...this.row,
      offerSdp: sdp,
      offerSdpHash: sdpHash,
      state: "offer_ready",
      version: this.row.version + 1,
      updatedAt: now,
    };
    return this.row;
  }

  async claimViewer(id: string, viewerTokenHash: string, now: Date): Promise<DemoBroadcast | null> {
    if (
      !this.row ||
      this.row.id !== id ||
      this.row.expiresAt.getTime() <= now.getTime() ||
      this.row.offerSdp === null ||
      this.row.viewerTokenHash !== null ||
      this.row.answerSdp !== null
    ) {
      return null;
    }
    this.row = {
      ...this.row,
      viewerTokenHash,
      viewerClaimedAt: now,
      state: "viewer_claimed",
      version: this.row.version + 1,
      updatedAt: now,
    };
    return this.row;
  }

  async storeAnswer(
    id: string,
    sdp: string,
    sdpHash: string,
    now: Date,
  ): Promise<DemoBroadcast | null> {
    if (
      !this.row ||
      this.row.id !== id ||
      this.row.expiresAt.getTime() <= now.getTime() ||
      this.row.offerSdp === null ||
      this.row.viewerTokenHash === null ||
      this.row.answerSdp !== null
    ) {
      return null;
    }
    this.row = {
      ...this.row,
      answerSdp: sdp,
      answerSdpHash: sdpHash,
      state: "connected",
      version: this.row.version + 1,
      updatedAt: now,
    };
    return this.row;
  }

  async deleteById(id: string): Promise<boolean> {
    if (this.row?.id !== id) return false;
    this.row = null;
    return true;
  }

  async deleteExpiredById(id: string, now: Date): Promise<void> {
    if (this.row?.id === id && this.row.expiresAt.getTime() <= now.getTime()) this.row = null;
  }
}

function fixture() {
  const repository = new MemoryRepository();
  let now = new Date("2026-08-14T12:00:00.000Z");
  let tokenNumber = 1;
  const service = new DemoBroadcastService({
    repository,
    now: () => now,
    generateCode: () => "0123WXYZ",
    generateToken: () => Buffer.alloc(32, tokenNumber++).toString("base64url"),
  });
  return {
    repository,
    service,
    setNow: (value: Date) => {
      now = value;
    },
  };
}

describe("demo broadcast service", () => {
  it("creates a 30-minute room, purges expired rows and persists only the publisher hash", async () => {
    const { repository, service } = fixture();
    const created = await service.create("et");

    expect(created).toEqual({
      code: "0123-WXYZ",
      publisherToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expiresAt: "2026-08-14T12:30:00.000Z",
    });
    expect(Date.parse(created.expiresAt) - Date.parse("2026-08-14T12:00:00.000Z")).toBe(
      DEMO_BROADCAST_TTL_MS,
    );
    expect(repository.purgedAt?.toISOString()).toBe("2026-08-14T12:00:00.000Z");
    expect(repository.row?.publisherTokenHash).toBe(
      hashDemoBroadcastSecret(created.publisherToken),
    );
    expect(repository.row?.publisherTokenHash).not.toContain(created.publisherToken);
    expect(repository.row?.viewerTokenHash).toBeNull();
  });

  it("rejects the wrong publisher token and makes an exact offer retry idempotent", async () => {
    const { repository, service } = fixture();
    const created = await service.create("en");

    await expect(
      service.submitOffer("0123-WXYZ", Buffer.alloc(32, 9).toString("base64url"), {
        type: "offer",
        sdp: offerSdp,
      }),
    ).rejects.toMatchObject({ code: "invalid_publisher_token", status: 401 });

    const first = await service.submitOffer("0123-WXYZ", created.publisherToken, {
      type: "offer",
      sdp: offerSdp,
    });
    const versionAfterFirst = repository.row?.version;
    const retry = await service.submitOffer("0123 WXYZ", created.publisherToken, {
      type: "offer",
      sdp: offerSdp,
    });
    expect(first.state).toBe("offer_ready");
    expect(repository.purgeCalls).toBeGreaterThan(1);
    expect(retry).toEqual(first);
    expect(repository.row?.version).toBe(versionAfterFirst);

    await expect(
      service.submitOffer("0123-WXYZ", created.publisherToken, {
        type: "offer",
        sdp: `${offerSdp}a=sendonly\r\n`,
      }),
    ).rejects.toMatchObject({ code: "offer_conflict", status: 409 });
  });

  it("requires an offer and atomically allows only one of two concurrent viewers", async () => {
    const { repository, service } = fixture();
    const created = await service.create("et");
    await expect(service.claimViewer(created.code)).rejects.toMatchObject({
      code: "offer_not_ready",
      status: 409,
    });
    await service.submitOffer(created.code, created.publisherToken, {
      type: "offer",
      sdp: offerSdp,
    });

    const claims = await Promise.allSettled([
      service.claimViewer("0123-WXYZ"),
      service.claimViewer("0123-WXYZ"),
    ]);
    const fulfilled = claims.filter(
      (claim): claim is PromiseFulfilledResult<Awaited<ReturnType<typeof service.claimViewer>>> =>
        claim.status === "fulfilled",
    );
    const rejected = claims.filter((claim) => claim.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: { code: "viewer_already_claimed", status: 409 },
    });
    expect(fulfilled[0]?.value.offer).toEqual({ type: "offer", sdp: offerSdp });
    expect(repository.row?.viewerTokenHash).toBe(
      hashDemoBroadcastSecret(fulfilled[0]?.value.viewerToken ?? ""),
    );
  });

  it("accepts one viewer answer, supports publisher polling, and makes exact retries idempotent", async () => {
    const { repository, service } = fixture();
    const created = await service.create("et");
    await service.submitOffer(created.code, created.publisherToken, {
      type: "offer",
      sdp: offerSdp,
    });
    const viewer = await service.claimViewer(created.code);

    expect(await service.getAnswer(created.code, created.publisherToken)).toMatchObject({
      answer: null,
      state: "viewer_claimed",
    });
    const first = await service.submitAnswer(created.code, viewer.viewerToken, {
      type: "answer",
      sdp: answerSdp,
    });
    const versionAfterFirst = repository.row?.version;
    const retry = await service.submitAnswer(created.code, viewer.viewerToken, {
      type: "answer",
      sdp: answerSdp,
    });
    expect(first.state).toBe("connected");
    expect(retry).toEqual(first);
    expect(repository.row?.version).toBe(versionAfterFirst);
    expect(await service.getAnswer(created.code, created.publisherToken)).toMatchObject({
      answer: { type: "answer", sdp: answerSdp },
      state: "connected",
    });

    await expect(
      service.submitAnswer(created.code, viewer.viewerToken, {
        type: "answer",
        sdp: `${answerSdp}a=recvonly\r\n`,
      }),
    ).rejects.toMatchObject({ code: "answer_conflict", status: 409 });
  });

  it("purges an expired room on access and deletes SDP immediately on publisher request", async () => {
    const first = fixture();
    const expired = await first.service.create("et");
    first.setNow(new Date(Date.parse(expired.expiresAt) + 1));
    await expect(
      first.service.submitOffer(expired.code, expired.publisherToken, {
        type: "offer",
        sdp: offerSdp,
      }),
    ).rejects.toMatchObject({ code: "broadcast_expired", status: 410 });
    expect(first.repository.row).toBeNull();

    const second = fixture();
    const active = await second.service.create("en");
    await second.service.submitOffer(active.code, active.publisherToken, {
      type: "offer",
      sdp: offerSdp,
    });
    await expect(second.service.delete(active.code, active.publisherToken)).resolves.toEqual({
      deleted: true,
    });
    expect(second.repository.row).toBeNull();
    await expect(
      second.service.getAnswer(active.code, active.publisherToken),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });
});
