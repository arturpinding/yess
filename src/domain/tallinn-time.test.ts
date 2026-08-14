import {
  groupByTallinnDate,
  tallinnDateKey,
  tallinnDayUtcRange,
  tallinnUtcOffsetMinutes,
} from "./tallinn-time";

describe("Tallinn timezone helpers", () => {
  it("uses Estonia's DST offset at the spring transition", () => {
    expect(tallinnUtcOffsetMinutes("2026-03-29T00:30:00Z")).toBe(120);
    expect(tallinnUtcOffsetMinutes("2026-03-29T01:30:00Z")).toBe(180);
  });

  it("uses Estonia's DST offset at the autumn transition", () => {
    expect(tallinnUtcOffsetMinutes("2026-10-25T00:30:00Z")).toBe(180);
    expect(tallinnUtcOffsetMinutes("2026-10-25T01:30:00Z")).toBe(120);
  });

  it("returns 23- and 25-hour UTC ranges for DST transition days", () => {
    const spring = tallinnDayUtcRange("2026-03-29");
    const autumn = tallinnDayUtcRange("2026-10-25");

    expect(spring.end.getTime() - spring.start.getTime()).toBe(23 * 60 * 60 * 1_000);
    expect(autumn.end.getTime() - autumn.start.getTime()).toBe(25 * 60 * 60 * 1_000);
    expect(tallinnDateKey(spring.start)).toBe("2026-03-29");
    expect(tallinnDateKey(new Date(spring.end.getTime() - 1))).toBe("2026-03-29");
  });

  it("groups UTC instants by Tallinn calendar day", () => {
    const items = [
      { id: "late", at: "2026-08-14T20:30:00Z" },
      { id: "next", at: "2026-08-14T21:30:00Z" },
    ];
    const groups = groupByTallinnDate(items, (item) => item.at);

    expect(groups.get("2026-08-14")?.map((item) => item.id)).toEqual(["late"]);
    expect(groups.get("2026-08-15")?.map((item) => item.id)).toEqual(["next"]);
  });
});
