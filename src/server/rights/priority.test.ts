import { describe, expect, it } from "vitest";
import { compareRightsPriorityDescending, selectHighestPriorityRights } from "./priority";

describe("rights priority", () => {
  it("selects every equally ranked highest numeric priority", () => {
    const rights = [
      { id: "low", priority: 10 },
      { id: "high-b", priority: 30 },
      { id: "high-a", priority: 30 },
      { id: "middle", priority: 20 },
    ];

    expect(selectHighestPriorityRights(rights).map((right) => right.id)).toEqual([
      "high-b",
      "high-a",
    ]);
  });

  it("uses the same descending direction as authorization resolution", () => {
    const rights = [
      { id: "low", priority: 1 },
      { id: "high", priority: 100 },
    ];

    expect([...rights].sort(compareRightsPriorityDescending)[0]?.id).toBe("high");
    expect(selectHighestPriorityRights(rights)[0]?.id).toBe("high");
  });

  it("returns an empty group when no applicable rights exist", () => {
    expect(selectHighestPriorityRights([])).toEqual([]);
  });
});
