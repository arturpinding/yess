import { describe, expect, it } from "vitest";
import { playbackTelemetrySchema } from "./telemetry";

const common = {
  at: "2026-08-14T09:15:30.123Z",
  eventId: "70000000-0000-4000-8000-000000000001",
  sourceId: "91000000-0000-4000-8000-000000000001",
  sourceKind: "ll-hls" as const,
};

describe("playbackTelemetrySchema", () => {
  it("accepts the bare events emitted by AuthorizedPlayer", () => {
    expect(
      playbackTelemetrySchema.safeParse({
        ...common,
        type: "playback_ready",
        value: 842,
      }).success,
    ).toBe(true);
    expect(
      playbackTelemetrySchema.safeParse({
        ...common,
        type: "playback_ended",
      }).success,
    ).toBe(true);
    expect(
      playbackTelemetrySchema.safeParse({
        ...common,
        type: "playback_recovering",
        reasonCode: "buffering",
      }).success,
    ).toBe(true);
    expect(
      playbackTelemetrySchema.safeParse({
        ...common,
        type: "metrics",
        metrics: {
          bufferSeconds: 3.25,
          liveEdgeSeconds: 2.8,
          droppedFrames: 2,
          totalFrames: 2_400,
        },
      }).success,
    ).toBe(true);
  });

  it("rejects free-form or identifying additions", () => {
    expect(
      playbackTelemetrySchema.safeParse({
        ...common,
        type: "playback_failed",
        reasonCode: "server returned a private URL",
      }).success,
    ).toBe(false);
    expect(
      playbackTelemetrySchema.safeParse({
        ...common,
        type: "playback_started",
        email: "viewer@example.test",
      }).success,
    ).toBe(false);
  });

  it("rejects impossible frame counters", () => {
    expect(
      playbackTelemetrySchema.safeParse({
        ...common,
        type: "metrics",
        metrics: {
          bufferSeconds: 3,
          liveEdgeSeconds: null,
          droppedFrames: 11,
          totalFrames: 10,
        },
      }).success,
    ).toBe(false);
  });
});
