import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { liveBroadcasts, type LiveBroadcast } from "@/server/db/schema";
import type { LiveBroadcastLocale } from "./contracts";

export interface NewLiveBroadcastRecord {
  code: string;
  title: string;
  locale: LiveBroadcastLocale;
  providerInputId: string;
  playbackUrl: string;
  publisherTokenHash: string;
  expiresAt: Date;
  now: Date;
}

export interface ProviderCleanupRecord {
  id: string;
  providerInputId: string;
}

export interface LiveBroadcastRepository {
  insertNew(input: NewLiveBroadcastRecord): Promise<LiveBroadcast | null>;
  findByCode(code: string): Promise<LiveBroadcast | null>;
  listActive(now: Date): Promise<LiveBroadcast[]>;
  markLive(id: string, now: Date): Promise<LiveBroadcast | null>;
  stop(id: string, now: Date): Promise<LiveBroadcast | null>;
  expireActive(now: Date): Promise<ProviderCleanupRecord[]>;
  listCleanupPending(cutoff: Date, limit?: number): Promise<ProviderCleanupRecord[]>;
  markProviderDeleted(id: string, now: Date): Promise<void>;
  touchProviderCleanup(id: string, now: Date): Promise<void>;
}

const activeStates = ["provisioned", "live"] as const;
const terminalStates = ["stopped", "failed"] as const;
const LIVEKIT_PROVIDER = "livekit-cloud";

export const postgresLiveBroadcastRepository: LiveBroadcastRepository = {
  async insertNew(input) {
    const [created] = await db
      .insert(liveBroadcasts)
      .values({
        code: input.code,
        title: input.title,
        locale: input.locale,
        provider: LIVEKIT_PROVIDER,
        providerInputId: input.providerInputId,
        playbackUrl: input.playbackUrl,
        publisherTokenHash: input.publisherTokenHash,
        expiresAt: input.expiresAt,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing({ target: liveBroadcasts.code })
      .returning();
    return created ?? null;
  },

  async findByCode(code) {
    const [row] = await db
      .select()
      .from(liveBroadcasts)
      .where(and(eq(liveBroadcasts.code, code), eq(liveBroadcasts.provider, LIVEKIT_PROVIDER)))
      .limit(1);
    return row ?? null;
  },

  async listActive(now) {
    return db
      .select()
      .from(liveBroadcasts)
      .where(
        and(
          eq(liveBroadcasts.provider, LIVEKIT_PROVIDER),
          inArray(liveBroadcasts.state, [...activeStates]),
          gt(liveBroadcasts.expiresAt, now),
        ),
      )
      .orderBy(desc(liveBroadcasts.startedAt), desc(liveBroadcasts.createdAt))
      .limit(25);
  },

  async markLive(id, now) {
    const [updated] = await db
      .update(liveBroadcasts)
      .set({
        state: "live",
        startedAt: now,
        updatedAt: now,
        version: sql`${liveBroadcasts.version} + 1`,
      })
      .where(
        and(
          eq(liveBroadcasts.id, id),
          eq(liveBroadcasts.provider, LIVEKIT_PROVIDER),
          eq(liveBroadcasts.state, "provisioned"),
          gt(liveBroadcasts.expiresAt, now),
        ),
      )
      .returning();
    return updated ?? null;
  },

  async stop(id, now) {
    const [updated] = await db
      .update(liveBroadcasts)
      .set({
        state: "stopped",
        endedAt: now,
        updatedAt: now,
        version: sql`${liveBroadcasts.version} + 1`,
      })
      .where(
        and(
          eq(liveBroadcasts.id, id),
          eq(liveBroadcasts.provider, LIVEKIT_PROVIDER),
          inArray(liveBroadcasts.state, [...activeStates]),
        ),
      )
      .returning();
    return updated ?? null;
  },

  async expireActive(now) {
    return db
      .update(liveBroadcasts)
      .set({
        state: "stopped",
        endedAt: now,
        updatedAt: now,
        version: sql`${liveBroadcasts.version} + 1`,
      })
      .where(
        and(
          eq(liveBroadcasts.provider, LIVEKIT_PROVIDER),
          inArray(liveBroadcasts.state, [...activeStates]),
          lte(liveBroadcasts.expiresAt, now),
        ),
      )
      .returning({
        id: liveBroadcasts.id,
        providerInputId: liveBroadcasts.providerInputId,
      });
  },

  async listCleanupPending(cutoff, limit = 25) {
    return db
      .select({
        id: liveBroadcasts.id,
        providerInputId: liveBroadcasts.providerInputId,
      })
      .from(liveBroadcasts)
      .where(
        and(
          eq(liveBroadcasts.provider, LIVEKIT_PROVIDER),
          inArray(liveBroadcasts.state, [...terminalStates]),
          isNull(liveBroadcasts.providerDeletedAt),
          lte(liveBroadcasts.updatedAt, cutoff),
        ),
      )
      .orderBy(asc(liveBroadcasts.updatedAt), asc(liveBroadcasts.createdAt))
      .limit(limit);
  },

  async markProviderDeleted(id, now) {
    await db
      .update(liveBroadcasts)
      .set({
        providerDeletedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(liveBroadcasts.id, id),
          eq(liveBroadcasts.provider, LIVEKIT_PROVIDER),
          inArray(liveBroadcasts.state, [...terminalStates]),
          isNull(liveBroadcasts.providerDeletedAt),
        ),
      );
  },

  async touchProviderCleanup(id, now) {
    await db
      .update(liveBroadcasts)
      .set({ updatedAt: now })
      .where(
        and(
          eq(liveBroadcasts.id, id),
          eq(liveBroadcasts.provider, LIVEKIT_PROVIDER),
          inArray(liveBroadcasts.state, [...terminalStates]),
          isNull(liveBroadcasts.providerDeletedAt),
        ),
      );
  },
};
