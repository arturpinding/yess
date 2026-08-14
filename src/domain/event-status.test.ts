import {
  InvalidEventStatusTransitionError,
  assertEventStatusTransition,
  canTransitionEventStatus,
} from "./event-status";

describe("event status transitions", () => {
  it("permits normal live-event progress and idempotent updates", () => {
    expect(canTransitionEventStatus("scheduled", "live")).toBe(true);
    expect(canTransitionEventStatus("live", "paused")).toBe(true);
    expect(canTransitionEventStatus("paused", "finished")).toBe(true);
    expect(canTransitionEventStatus("live", "live")).toBe(true);
  });

  it("keeps terminal states terminal", () => {
    expect(canTransitionEventStatus("finished", "live")).toBe(false);
    expect(canTransitionEventStatus("cancelled", "scheduled")).toBe(false);
    expect(() => assertEventStatusTransition("finished", "live")).toThrow(
      InvalidEventStatusTransitionError,
    );
  });

  it("requires an explicit ingestion reconciliation for a late result", () => {
    expect(canTransitionEventStatus("scheduled", "finished")).toBe(false);
    expect(
      canTransitionEventStatus("scheduled", "finished", {
        mode: "ingestion-reconciliation",
      }),
    ).toBe(true);
  });
});
