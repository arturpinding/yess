export interface IdempotencyStore {
  /** Atomically claims a key. Returns false when an unexpired claim already exists. */
  claim(key: string, expiresAt: Date, now?: Date): Promise<boolean>;
  release(key: string): Promise<void>;
}

/** Local/test adapter only. Production delivery uses a database unique key. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  readonly #claims = new Map<string, number>();

  async claim(key: string, expiresAt: Date, now = new Date()): Promise<boolean> {
    if (key.length === 0) {
      throw new RangeError("Idempotency key must not be empty");
    }
    const expiresAtMs = expiresAt.getTime();
    const nowMs = now.getTime();
    if (!Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs) || expiresAtMs <= nowMs) {
      throw new RangeError("Idempotency expiry must be a valid future instant");
    }

    const existingExpiry = this.#claims.get(key);
    if (existingExpiry !== undefined && existingExpiry > nowMs) {
      return false;
    }
    this.#claims.set(key, expiresAtMs);
    return true;
  }

  async release(key: string): Promise<void> {
    this.#claims.delete(key);
  }
}
