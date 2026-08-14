import { sql, type SQL } from "drizzle-orm";
import { playbackSessions } from "@/server/db/schema";

/**
 * Sets the first observed start time without moving it on duplicate `playing`
 * events. Raw values inside an SQL template bypass Drizzle's column encoder,
 * so the timestamp column must explicitly encode the Date for Postgres.js.
 */
export function preserveFirstPlaybackStartedAt(at: Date): SQL<Date> {
  return sql<Date>`coalesce(
    ${playbackSessions.startedAt},
    ${sql.param(at, playbackSessions.startedAt)}
  )`;
}
