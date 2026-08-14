import {
  adminEventPatchSchema,
  planAdminEventUpdate,
  serializeAdminEvent,
  type AdminEventSnapshot,
} from "./event-control";

const current: AdminEventSnapshot = {
  id: "10000000-0000-4000-8000-000000000001",
  titleEt: "Eesti – Soome",
  titleEn: "Estonia vs Finland",
  state: "scheduled",
  scheduledStartAt: new Date("2026-08-14T15:00:00.000Z"),
  actualStartAt: null,
  endAt: new Date("2026-08-14T17:00:00.000Z"),
  venueId: "20000000-0000-4000-8000-000000000001",
  venueName: "Tondiraba jäähall",
  statusDetailEt: null,
  statusDetailEn: null,
  version: 3,
  updatedAt: new Date("2026-08-14T10:00:00.000Z"),
};

function parsePatch(value: unknown) {
  return adminEventPatchSchema.parse(value);
}

describe("admin event-control policy", () => {
  it("accepts strict UTC instants and transforms them to Dates", () => {
    const patch = parsePatch({
      reason: "Start time confirmed",
      version: 3,
      scheduledStartAt: "2026-08-14T15:15:00.000Z",
    });

    expect(patch.scheduledStartAt).toEqual(new Date("2026-08-14T15:15:00.000Z"));
  });

  it("rejects offsets, unknown fields, and reason-only requests", () => {
    expect(
      adminEventPatchSchema.safeParse({
        reason: "Changed by organiser",
        version: 3,
        scheduledStartAt: "2026-08-14T18:00:00+03:00",
      }).success,
    ).toBe(false);
    expect(adminEventPatchSchema.safeParse({ reason: "No actual edit", version: 3 }).success).toBe(
      false,
    );
    expect(
      adminEventPatchSchema.safeParse({
        reason: "No hidden fields",
        version: 3,
        titleEn: "Updated",
        published: true,
      }).success,
    ).toBe(false);
  });

  it("sets actualStartAt when an event first becomes live", () => {
    const now = new Date("2026-08-14T15:01:23.000Z");
    const plan = planAdminEventUpdate(
      current,
      parsePatch({ reason: "The event has started", version: 3, state: "live" }),
      now,
    );

    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.values.actualStartAt).toEqual(now);
      expect(plan.values.state).toBe("live");
      expect(plan.transitionOverride).toBe(false);
    }
  });

  it("supports bilingual editorial fields and clearing the venue", () => {
    const plan = planAdminEventUpdate(
      current,
      parsePatch({
        reason: "Venue assignment was incorrect",
        version: 3,
        titleEt: "Eesti ja Soome kohtumine",
        titleEn: "Estonia and Finland match",
        venueId: null,
        statusDetailEt: "Toimumiskoht täpsustamisel",
        statusDetailEn: "Venue to be confirmed",
      }),
    );

    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.values).toMatchObject({
        titleEt: "Eesti ja Soome kohtumine",
        titleEn: "Estonia and Finland match",
        venueId: null,
        statusDetailEt: "Toimumiskoht täpsustamisel",
        statusDetailEn: "Venue to be confirmed",
      });
    }
  });

  it("sets endAt when an event becomes finished without an end time", () => {
    const live: AdminEventSnapshot = {
      ...current,
      state: "live",
      actualStartAt: new Date("2026-08-14T15:00:00.000Z"),
      endAt: null,
    };
    const now = new Date("2026-08-14T16:42:00.000Z");
    const plan = planAdminEventUpdate(
      live,
      parsePatch({ reason: "Final whistle", version: 3, state: "finished" }),
      now,
    );

    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.values.endAt).toEqual(now);
  });

  it("blocks invalid transitions unless an operator explicitly overrides them", () => {
    const ordinary = planAdminEventUpdate(
      current,
      parsePatch({ reason: "Imported final result", version: 3, state: "finished" }),
      new Date("2026-08-14T18:00:00.000Z"),
    );
    expect(ordinary).toEqual({
      ok: false,
      conflict: { code: "invalid_transition", from: "scheduled", to: "finished" },
    });

    const override = planAdminEventUpdate(
      current,
      parsePatch({
        reason: "Imported final result",
        version: 3,
        state: "finished",
        endAt: null,
        overrideInvalidTransition: true,
      }),
      new Date("2026-08-14T18:00:00.000Z"),
    );
    expect(override.ok).toBe(true);
    if (override.ok) {
      expect(override.transitionOverride).toBe(true);
      expect(override.values.endAt).toEqual(new Date("2026-08-14T18:00:00.000Z"));
    }
  });

  it("rejects an end time at or before the effective start", () => {
    const plan = planAdminEventUpdate(
      current,
      parsePatch({
        reason: "Incorrect timing test",
        version: 3,
        actualStartAt: "2026-08-14T16:00:00.000Z",
        endAt: "2026-08-14T15:59:59.000Z",
      }),
    );

    expect(plan).toEqual({
      ok: false,
      conflict: {
        code: "invalid_schedule",
        message: "endAt must be later than actualStartAt or scheduledStartAt",
      },
    });
  });

  it("serializes all persisted timestamps as canonical UTC strings", () => {
    expect(serializeAdminEvent(current)).toMatchObject({
      scheduledStartAt: "2026-08-14T15:00:00.000Z",
      actualStartAt: null,
      endAt: "2026-08-14T17:00:00.000Z",
      updatedAt: "2026-08-14T10:00:00.000Z",
    });
  });
});
