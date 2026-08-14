import { applyEventSpoilerPolicy, applyNotificationSpoilerPolicy } from "./spoiler";

describe("spoiler policy", () => {
  const event = {
    id: "event-1",
    score: "3–2",
    result: { winner: "team-a" },
    resultSummary: "Team A won",
    winnerId: "team-a",
    thumbnailUrl: "/winning-goal.jpg",
    neutralThumbnailUrl: "/venue.jpg",
    timeline: [
      { id: "whistle", spoilerSensitive: false },
      { id: "goal", spoilerSensitive: true },
    ],
    highlights: [{ id: "winner", spoilerSensitive: true }],
  };

  it("redacts result data before serialization without mutating its input", () => {
    const redacted = applyEventSpoilerPolicy(event, { enabled: true });

    expect(redacted).toMatchObject({
      score: null,
      result: null,
      resultSummary: null,
      winnerId: null,
      thumbnailUrl: "/venue.jpg",
      spoilersHidden: true,
    });
    expect(redacted.timeline).toEqual([{ id: "whistle", spoilerSensitive: false }]);
    expect(redacted.highlights).toEqual([]);
    expect(event.score).toBe("3–2");
  });

  it("supports a deliberate event reveal", () => {
    expect(applyEventSpoilerPolicy(event, { enabled: true, revealed: true })).toMatchObject({
      score: "3–2",
      spoilersHidden: false,
    });
  });

  it("uses safe notification copy when required", () => {
    const notification = applyNotificationSpoilerPolicy(
      {
        title: "Team A won 3–2",
        body: "Watch the decisive goal",
        safeTitle: "Result available",
        safeBody: "Open RADA when you are ready",
        spoilerSensitive: true,
      },
      { enabled: true },
    );
    expect(notification.title).toBe("Result available");
    expect(notification.body).toBe("Open RADA when you are ready");
  });
});
