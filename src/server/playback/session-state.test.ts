import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { preserveFirstPlaybackStartedAt } from "./session-state";

describe("preserveFirstPlaybackStartedAt", () => {
  it("atomically preserves the first start and encodes Date for Postgres.js", () => {
    const at = new Date("2026-08-14T12:00:00.000Z");
    const compiled = new PgDialect().sqlToQuery(preserveFirstPlaybackStartedAt(at));

    expect(compiled.sql.replaceAll(/\s+/g, " ").trim()).toBe(
      'coalesce( "playback_sessions"."started_at", $1 )',
    );
    expect(compiled.params).toEqual(["2026-08-14T12:00:00.000Z"]);
    expect(compiled.typings).toEqual(["timestamp"]);
  });
});
