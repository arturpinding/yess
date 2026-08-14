import { and, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { demoBroadcasts, type DemoBroadcast } from "@/server/db/schema";
import type { DemoBroadcastLocale } from "./contracts";

export interface NewDemoBroadcastRecord {
  code: string;
  locale: DemoBroadcastLocale;
  publisherTokenHash: string;
  expiresAt: Date;
  now: Date;
}

export interface DemoBroadcastRepository {
  purgeExpired(now: Date): Promise<void>;
  insertNew(input: NewDemoBroadcastRecord): Promise<DemoBroadcast | null>;
  findByCode(code: string): Promise<DemoBroadcast | null>;
  storeOffer(id: string, sdp: string, sdpHash: string, now: Date): Promise<DemoBroadcast | null>;
  claimViewer(id: string, viewerTokenHash: string, now: Date): Promise<DemoBroadcast | null>;
  storeAnswer(id: string, sdp: string, sdpHash: string, now: Date): Promise<DemoBroadcast | null>;
  deleteById(id: string): Promise<boolean>;
  deleteExpiredById(id: string, now: Date): Promise<void>;
}

export const postgresDemoBroadcastRepository: DemoBroadcastRepository = {
  async purgeExpired(now) {
    await db.delete(demoBroadcasts).where(lte(demoBroadcasts.expiresAt, now));
  },

  async insertNew(input) {
    const [created] = await db
      .insert(demoBroadcasts)
      .values({
        code: input.code,
        locale: input.locale,
        publisherTokenHash: input.publisherTokenHash,
        expiresAt: input.expiresAt,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing({ target: demoBroadcasts.code })
      .returning();
    return created ?? null;
  },

  async findByCode(code) {
    const [row] = await db
      .select()
      .from(demoBroadcasts)
      .where(eq(demoBroadcasts.code, code))
      .limit(1);
    return row ?? null;
  },

  async storeOffer(id, sdp, sdpHash, now) {
    const [updated] = await db
      .update(demoBroadcasts)
      .set({
        offerSdp: sdp,
        offerSdpHash: sdpHash,
        state: "offer_ready",
        updatedAt: now,
        version: sql`${demoBroadcasts.version} + 1`,
      })
      .where(
        and(
          eq(demoBroadcasts.id, id),
          gt(demoBroadcasts.expiresAt, now),
          isNull(demoBroadcasts.offerSdp),
          isNull(demoBroadcasts.viewerTokenHash),
        ),
      )
      .returning();
    return updated ?? null;
  },

  async claimViewer(id, viewerTokenHash, now) {
    const [updated] = await db
      .update(demoBroadcasts)
      .set({
        viewerTokenHash,
        viewerClaimedAt: now,
        state: "viewer_claimed",
        updatedAt: now,
        version: sql`${demoBroadcasts.version} + 1`,
      })
      .where(
        and(
          eq(demoBroadcasts.id, id),
          gt(demoBroadcasts.expiresAt, now),
          isNotNull(demoBroadcasts.offerSdp),
          isNull(demoBroadcasts.viewerTokenHash),
          isNull(demoBroadcasts.answerSdp),
        ),
      )
      .returning();
    return updated ?? null;
  },

  async storeAnswer(id, sdp, sdpHash, now) {
    const [updated] = await db
      .update(demoBroadcasts)
      .set({
        answerSdp: sdp,
        answerSdpHash: sdpHash,
        state: "connected",
        updatedAt: now,
        version: sql`${demoBroadcasts.version} + 1`,
      })
      .where(
        and(
          eq(demoBroadcasts.id, id),
          gt(demoBroadcasts.expiresAt, now),
          isNotNull(demoBroadcasts.offerSdp),
          isNotNull(demoBroadcasts.viewerTokenHash),
          isNull(demoBroadcasts.answerSdp),
        ),
      )
      .returning();
    return updated ?? null;
  },

  async deleteById(id) {
    const deleted = await db
      .delete(demoBroadcasts)
      .where(eq(demoBroadcasts.id, id))
      .returning({ id: demoBroadcasts.id });
    return deleted.length === 1;
  },

  async deleteExpiredById(id, now) {
    await db
      .delete(demoBroadcasts)
      .where(and(eq(demoBroadcasts.id, id), lte(demoBroadcasts.expiresAt, now)));
  },
};
