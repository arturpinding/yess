import { describe, expect, it } from "vitest";
import { followInsertValues, followMutationSchema, followTargetColumn } from "./follow-target";

describe("follow target mapping", () => {
  it.each([
    ["athlete", "athleteId"],
    ["team", "teamId"],
    ["sport", "sportId"],
    ["competition", "competitionId"],
  ] as const)("maps %s to its exclusive persistence column", (targetType, column) => {
    expect(followTargetColumn(targetType)).toBe(column);
    expect(followInsertValues("profile-1", targetType, "target-1")).toEqual({
      profileId: "profile-1",
      [column]: "target-1",
    });
  });

  it("rejects unknown fields and malformed identifiers at the boundary", () => {
    expect(
      followMutationSchema.safeParse({ targetType: "athlete", targetId: "not-a-uuid" }).success,
    ).toBe(false);
    expect(
      followMutationSchema.safeParse({
        targetType: "athlete",
        targetId: "40000000-0000-4000-8000-000000000001",
        profileId: "attacker-selected-profile",
      }).success,
    ).toBe(false);
  });
});
