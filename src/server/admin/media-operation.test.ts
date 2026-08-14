import { describe, expect, it } from "vitest";
import {
  MEDIA_OPERATION_STALE_AFTER_MS,
  adminMediaOperationSchema,
  classifyPendingOperationRecovery,
  reconcileProviderResult,
  streamStateForProviderResult,
} from "./media-operation";

describe("admin media operation policy", () => {
  it("exposes only a published provider resource as live or degraded", () => {
    expect(streamStateForProviderResult({ observedState: "published", healthy: true })).toBe(
      "live",
    );
    expect(streamStateForProviderResult({ observedState: "published", healthy: false })).toBe(
      "degraded",
    );
    expect(streamStateForProviderResult({ observedState: "encoding", healthy: true })).toBe(
      "provisioning",
    );
    expect(streamStateForProviderResult({ observedState: "stopped", healthy: false })).toBe(
      "ended",
    );
    expect(streamStateForProviderResult({ observedState: "failed", healthy: false })).toBe(
      "unavailable",
    );
  });

  it("requires a reason and optimistic stream timestamp", () => {
    expect(
      adminMediaOperationSchema.safeParse({
        action: "publish",
        reason: "Publish the verified local manifest",
        expectedUpdatedAt: "2026-08-14T12:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(adminMediaOperationSchema.safeParse({ action: "publish", reason: "x" }).success).toBe(
      false,
    );
  });

  it("keeps a fresh pending operation blocked", () => {
    const now = new Date("2026-08-14T12:05:00.000Z");
    expect(
      classifyPendingOperationRecovery(
        {
          idempotencyKey: "original-operation-key",
          updatedAt: new Date(now.getTime() - MEDIA_OPERATION_STALE_AFTER_MS + 1),
        },
        { action: "refresh", idempotencyKey: "recovery-refresh-key" },
        now,
      ),
    ).toEqual({ kind: "block", code: "operation_in_progress" });
  });

  it("never replays a stale state-changing operation", () => {
    const now = new Date("2026-08-14T12:05:00.000Z");
    expect(
      classifyPendingOperationRecovery(
        {
          idempotencyKey: "original-publish-key",
          updatedAt: new Date(now.getTime() - MEDIA_OPERATION_STALE_AFTER_MS),
        },
        { action: "publish", idempotencyKey: "second-publish-key" },
        now,
      ),
    ).toEqual({ kind: "block", code: "stale_operation_requires_refresh" });
  });

  it("requires a new idempotency key for a stale refresh", () => {
    const now = new Date("2026-08-14T12:05:00.000Z");
    expect(
      classifyPendingOperationRecovery(
        {
          idempotencyKey: "original-refresh-key",
          updatedAt: new Date(now.getTime() - MEDIA_OPERATION_STALE_AFTER_MS),
        },
        { action: "refresh", idempotencyKey: "original-refresh-key" },
        now,
      ),
    ).toEqual({
      kind: "block",
      code: "stale_operation_requires_new_idempotency_key",
    });
  });

  it("permits only a new-key refresh after the stale boundary", () => {
    const now = new Date("2026-08-14T12:05:00.000Z");
    expect(
      classifyPendingOperationRecovery(
        {
          idempotencyKey: "original-start-key",
          updatedAt: new Date(now.getTime() - MEDIA_OPERATION_STALE_AFTER_MS),
        },
        { action: "refresh", idempotencyKey: "recovery-refresh-key" },
        now,
      ),
    ).toEqual({ kind: "recover" });
  });

  it("makes definitive non-published refresh results unavailable", () => {
    expect(
      reconcileProviderResult(
        "refresh",
        { observedState: "failed", healthy: false, playbackLocator: null },
        "https://media.invalid/stale.m3u8",
      ),
    ).toEqual({
      state: "unavailable",
      playbackLocator: "https://media.invalid/stale.m3u8",
    });
    expect(
      reconcileProviderResult(
        "refresh",
        {
          observedState: "stopped",
          healthy: false,
          playbackLocator: "https://media.invalid/provider-stale.m3u8",
        },
        "https://media.invalid/stale.m3u8",
      ),
    ).toEqual({
      state: "unavailable",
      playbackLocator: "https://media.invalid/stale.m3u8",
    });
  });

  it("keeps the provider locator only when refresh observes a published resource", () => {
    expect(
      reconcileProviderResult(
        "refresh",
        {
          observedState: "published",
          healthy: true,
          playbackLocator: "https://media.invalid/live.m3u8",
        },
        "https://media.invalid/stale.m3u8",
      ),
    ).toEqual({ state: "live", playbackLocator: "https://media.invalid/live.m3u8" });

    expect(
      reconcileProviderResult(
        "refresh",
        { observedState: "published", healthy: true, playbackLocator: null },
        "https://media.invalid/stale.m3u8",
      ),
    ).toEqual({
      state: "unavailable",
      playbackLocator: "https://media.invalid/stale.m3u8",
    });
  });
});
