import { InMemoryIdempotencyStore } from "./idempotency";
import { notificationDeduplicationKey, reconcileScheduleChange } from "./notification-planner";

describe("notification idempotency", () => {
  it("builds stable keys while separating revisions", () => {
    const identity = {
      profileId: "profile-1",
      eventId: "event-1",
      eventRevision: 1,
      type: "event_started" as const,
    };
    expect(notificationDeduplicationKey(identity)).toBe(notificationDeduplicationKey(identity));
    expect(notificationDeduplicationKey(identity)).not.toBe(
      notificationDeduplicationKey({ ...identity, eventRevision: 2 }),
    );
  });

  it("claims an unexpired delivery key only once", async () => {
    const store = new InMemoryIdempotencyStore();
    const now = new Date("2026-08-14T10:00:00Z");
    const expiry = new Date("2026-08-15T10:00:00Z");

    await expect(store.claim("delivery-1", expiry, now)).resolves.toBe(true);
    await expect(store.claim("delivery-1", expiry, now)).resolves.toBe(false);
    await expect(store.claim("delivery-1", new Date("2026-08-16T10:00:00Z"), expiry)).resolves.toBe(
      true,
    );
  });
});

describe("schedule-change planning", () => {
  it("cancels stale pending intents and creates revised notifications", () => {
    const now = new Date("2026-08-14T10:00:00Z");
    const result = reconcileScheduleChange({
      profileId: "profile-1",
      previous: {
        eventId: "event-1",
        revision: 3,
        startAt: new Date("2026-08-14T12:00:00Z"),
        venueId: "venue-a",
        status: "scheduled",
      },
      next: {
        eventId: "event-1",
        revision: 4,
        startAt: new Date("2026-08-14T13:00:00Z"),
        venueId: "venue-b",
        status: "delayed",
      },
      leadMinutes: 15,
      now,
      existing: [
        {
          deduplicationKey: "old-pending",
          eventRevision: 3,
          type: "event_starting_soon",
          state: "pending",
        },
        {
          deduplicationKey: "already-delivered",
          eventRevision: 3,
          type: "event_started",
          state: "delivered",
        },
      ],
    });

    expect(result.cancel).toEqual(["old-pending"]);
    expect(result.create.map((intent) => intent.type)).toEqual([
      "schedule_changed",
      "event_starting_soon",
      "event_started",
    ]);
    expect(result.create[1]?.scheduledFor.toISOString()).toBe("2026-08-14T12:45:00.000Z");
    expect(new Set(result.create.map((intent) => intent.deduplicationKey)).size).toBe(3);
  });

  it("requires a revision increment for changed provider data", () => {
    expect(() =>
      reconcileScheduleChange({
        profileId: "profile-1",
        previous: {
          eventId: "event-1",
          revision: 3,
          startAt: new Date("2026-08-14T12:00:00Z"),
          venueId: null,
          status: "scheduled",
        },
        next: {
          eventId: "event-1",
          revision: 3,
          startAt: new Date("2026-08-14T13:00:00Z"),
          venueId: null,
          status: "delayed",
        },
        leadMinutes: 15,
        now: new Date("2026-08-14T10:00:00Z"),
        existing: [],
      }),
    ).toThrow(/increment/);
  });
});
