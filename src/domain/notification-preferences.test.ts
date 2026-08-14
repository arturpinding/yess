import {
  deriveNotificationMode,
  IMPORTANT_NOTIFICATION_KINDS,
  NOTIFICATION_KINDS,
} from "./notification-preferences";

describe("notification preferences", () => {
  it("uses the database notification-kind vocabulary", () => {
    expect(NOTIFICATION_KINDS).toEqual([
      "event_starting_soon",
      "event_started",
      "schedule_changed",
      "venue_changed",
      "followed_athlete_competing",
      "important_result",
      "highlight_available",
    ]);
  });

  it.each([
    [[], "off"],
    [IMPORTANT_NOTIFICATION_KINDS, "important"],
    [["event_started"], "important"],
    [NOTIFICATION_KINDS, "all"],
  ] as const)("derives %s as %s", (enabledKinds, expected) => {
    expect(deriveNotificationMode(enabledKinds)).toBe(expected);
  });
});
