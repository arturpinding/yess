import type { AdminEvent } from "./admin-api";
import { adminEventDraft, changedAdminEventFields } from "./admin-event-form";

const event: AdminEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  titleEt: "Näidisfinaal",
  titleEn: "Demo final",
  state: "scheduled",
  scheduledStartAt: "2026-08-14T17:15:42.731Z",
  actualStartAt: "2026-08-14T17:16:09.125Z",
  endAt: null,
  venueId: null,
  venueName: null,
  statusDetailEt: null,
  statusDetailEn: null,
  version: 3,
  updatedAt: "2026-08-14T10:00:00.000Z",
};

describe("admin event form changes", () => {
  it("preserves seconds and milliseconds when an unrelated field changes", () => {
    const draft = { ...adminEventDraft(event), titleEn: "Updated demo final" };

    expect(changedAdminEventFields(event, draft)).toEqual({ titleEn: "Updated demo final" });
  });

  it("converts only an intentionally changed Tallinn wall-clock time", () => {
    const draft = { ...adminEventDraft(event), scheduledStartAt: "2026-08-14T20:30" };

    expect(changedAdminEventFields(event, draft)).toEqual({
      scheduledStartAt: "2026-08-14T17:30:00.000Z",
    });
  });
});
