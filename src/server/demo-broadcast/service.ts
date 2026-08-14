import type { DemoBroadcast } from "@/server/db/schema";
import {
  DEMO_BROADCAST_TTL_MS,
  demoBroadcastSecretMatches,
  formatDemoBroadcastCode,
  generateDemoBroadcastCode,
  generateDemoBroadcastToken,
  hashDemoBroadcastSecret,
  normalizeDemoBroadcastCode,
  type DemoBroadcastAnswer,
  type DemoBroadcastLocale,
  type DemoBroadcastOffer,
} from "./contracts";
import { postgresDemoBroadcastRepository, type DemoBroadcastRepository } from "./repository";

export type DemoBroadcastErrorCode =
  | "not_found"
  | "broadcast_expired"
  | "invalid_publisher_token"
  | "invalid_viewer_token"
  | "offer_conflict"
  | "offer_not_ready"
  | "viewer_already_claimed"
  | "answer_conflict"
  | "code_generation_failed";

export class DemoBroadcastError extends Error {
  constructor(
    readonly code: DemoBroadcastErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "DemoBroadcastError";
  }
}

export interface DemoBroadcastServiceDependencies {
  repository: DemoBroadcastRepository;
  now?: () => Date;
  generateCode?: () => string;
  generateToken?: () => string;
}

const MAX_CODE_ATTEMPTS = 8;

export class DemoBroadcastService {
  readonly #repository: DemoBroadcastRepository;
  readonly #now: () => Date;
  readonly #generateCode: () => string;
  readonly #generateToken: () => string;

  constructor(dependencies: DemoBroadcastServiceDependencies) {
    this.#repository = dependencies.repository;
    this.#now = dependencies.now ?? (() => new Date());
    this.#generateCode = dependencies.generateCode ?? generateDemoBroadcastCode;
    this.#generateToken = dependencies.generateToken ?? generateDemoBroadcastToken;
  }

  async create(locale: DemoBroadcastLocale) {
    const now = this.#now();
    const expiresAt = new Date(now.getTime() + DEMO_BROADCAST_TTL_MS);
    await this.#repository.purgeExpired(now);

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const canonicalCode = this.#generateCode();
      const publisherToken = this.#generateToken();
      const created = await this.#repository.insertNew({
        code: canonicalCode,
        locale,
        publisherTokenHash: hashDemoBroadcastSecret(publisherToken),
        expiresAt,
        now,
      });
      if (created) {
        return {
          code: formatDemoBroadcastCode(created.code),
          publisherToken,
          expiresAt: created.expiresAt.toISOString(),
        };
      }
    }

    throw new DemoBroadcastError("code_generation_failed", 503);
  }

  async submitOffer(codeInput: string, publisherToken: string, offer: DemoBroadcastOffer) {
    const { row, now } = await this.#authorized(codeInput, "publisher", publisherToken);
    if (row.offerSdp !== null) {
      if (row.offerSdp === offer.sdp) return this.#signalAccepted(row);
      throw new DemoBroadcastError("offer_conflict", 409);
    }

    const updated = await this.#repository.storeOffer(
      row.id,
      offer.sdp,
      hashDemoBroadcastSecret(offer.sdp),
      now,
    );
    if (updated) return this.#signalAccepted(updated);

    const current = await this.#reloadAuthorized(row.code, "publisher", publisherToken, now);
    if (current.offerSdp === offer.sdp) return this.#signalAccepted(current);
    throw new DemoBroadcastError("offer_conflict", 409);
  }

  async claimViewer(codeInput: string) {
    const code = this.#canonicalCode(codeInput);
    const now = this.#now();
    const row = await this.#active(code, now);
    if (row.offerSdp === null) throw new DemoBroadcastError("offer_not_ready", 409);
    if (row.viewerTokenHash !== null) {
      throw new DemoBroadcastError("viewer_already_claimed", 409);
    }

    const viewerToken = this.#generateToken();
    const updated = await this.#repository.claimViewer(
      row.id,
      hashDemoBroadcastSecret(viewerToken),
      now,
    );
    if (!updated) {
      const current = await this.#active(code, now);
      if (current.offerSdp === null) throw new DemoBroadcastError("offer_not_ready", 409);
      throw new DemoBroadcastError("viewer_already_claimed", 409);
    }

    // The state constraint guarantees an offer for a successfully claimed row.
    if (updated.offerSdp === null) throw new DemoBroadcastError("offer_not_ready", 409);
    return {
      viewerToken,
      offer: { type: "offer" as const, sdp: updated.offerSdp },
      expiresAt: updated.expiresAt.toISOString(),
    };
  }

  async submitAnswer(codeInput: string, viewerToken: string, answer: DemoBroadcastAnswer) {
    const { row, now } = await this.#authorized(codeInput, "viewer", viewerToken);
    if (row.answerSdp !== null) {
      if (row.answerSdp === answer.sdp) return this.#signalAccepted(row);
      throw new DemoBroadcastError("answer_conflict", 409);
    }

    const updated = await this.#repository.storeAnswer(
      row.id,
      answer.sdp,
      hashDemoBroadcastSecret(answer.sdp),
      now,
    );
    if (updated) return this.#signalAccepted(updated);

    const current = await this.#reloadAuthorized(row.code, "viewer", viewerToken, now);
    if (current.answerSdp === answer.sdp) return this.#signalAccepted(current);
    throw new DemoBroadcastError("answer_conflict", 409);
  }

  async getAnswer(codeInput: string, publisherToken: string) {
    const { row } = await this.#authorized(codeInput, "publisher", publisherToken);
    return {
      answer: row.answerSdp === null ? null : { type: "answer" as const, sdp: row.answerSdp },
      state: row.state,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  async delete(codeInput: string, publisherToken: string) {
    const { row } = await this.#authorized(codeInput, "publisher", publisherToken);
    const deleted = await this.#repository.deleteById(row.id);
    if (!deleted) throw new DemoBroadcastError("not_found", 404);
    return { deleted: true as const };
  }

  async #authorized(
    codeInput: string,
    role: "publisher" | "viewer",
    token: string,
  ): Promise<{ row: DemoBroadcast; now: Date }> {
    const code = this.#canonicalCode(codeInput);
    const now = this.#now();
    const row = await this.#active(code, now);
    this.#assertToken(row, role, token);
    return { row, now };
  }

  async #reloadAuthorized(
    code: string,
    role: "publisher" | "viewer",
    token: string,
    now: Date,
  ): Promise<DemoBroadcast> {
    const row = await this.#active(code, now);
    this.#assertToken(row, role, token);
    return row;
  }

  async #active(code: string, now: Date): Promise<DemoBroadcast> {
    const row = await this.#repository.findByCode(code);
    if (!row) {
      await this.#repository.purgeExpired(now);
      throw new DemoBroadcastError("not_found", 404);
    }
    if (row.expiresAt.getTime() <= now.getTime()) {
      await this.#repository.deleteExpiredById(row.id, now);
      await this.#repository.purgeExpired(now);
      throw new DemoBroadcastError("broadcast_expired", 410);
    }
    // A browser can disappear before its best-effort DELETE reaches us. Any
    // later signaling activity therefore also acts as an opportunistic janitor
    // for every expired room, without changing the active room being returned.
    await this.#repository.purgeExpired(now);
    return row;
  }

  #assertToken(row: DemoBroadcast, role: "publisher" | "viewer", token: string): void {
    const hash = role === "publisher" ? row.publisherTokenHash : row.viewerTokenHash;
    if (!hash || !demoBroadcastSecretMatches(token, hash)) {
      throw new DemoBroadcastError(
        role === "publisher" ? "invalid_publisher_token" : "invalid_viewer_token",
        401,
      );
    }
  }

  #canonicalCode(value: string): string {
    const code = normalizeDemoBroadcastCode(value);
    if (!code) throw new DemoBroadcastError("not_found", 404);
    return code;
  }

  #signalAccepted(row: DemoBroadcast) {
    return { accepted: true as const, state: row.state, expiresAt: row.expiresAt.toISOString() };
  }
}

export const demoBroadcastService = new DemoBroadcastService({
  repository: postgresDemoBroadcastRepository,
});
