import { instantToTallinnInput, tallinnInputToInstant } from "./admin-tallinn-time";

describe("Tallinn admin datetime inputs", () => {
  it("round-trips a summer instant independently of the browser timezone", () => {
    expect(instantToTallinnInput("2026-08-14T17:15:00.000Z")).toBe("2026-08-14T20:15");
    expect(tallinnInputToInstant("2026-08-14T20:15")).toBe("2026-08-14T17:15:00.000Z");
  });

  it("rejects a wall time skipped by Estonia's spring DST transition", () => {
    expect(() => tallinnInputToInstant("2026-03-29T03:30")).toThrow("nonexistent_tallinn_time");
  });

  it("deterministically uses the later occurrence in the repeated autumn hour", () => {
    expect(tallinnInputToInstant("2026-10-25T03:30")).toBe("2026-10-25T01:30:00.000Z");
  });
});
