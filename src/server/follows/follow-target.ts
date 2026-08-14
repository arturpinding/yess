import { z } from "zod";

export const FOLLOW_TARGET_TYPES = ["athlete", "team", "sport", "competition"] as const;
export type FollowTargetType = (typeof FOLLOW_TARGET_TYPES)[number];
export type FollowTargetColumn = "athleteId" | "teamId" | "sportId" | "competitionId";

export const followMutationSchema = z
  .object({
    targetType: z.enum(FOLLOW_TARGET_TYPES),
    targetId: z.string().uuid(),
  })
  .strict();

export function followTargetColumn(targetType: FollowTargetType): FollowTargetColumn {
  switch (targetType) {
    case "athlete":
      return "athleteId";
    case "team":
      return "teamId";
    case "sport":
      return "sportId";
    case "competition":
      return "competitionId";
  }
}

export function followInsertValues(
  profileId: string,
  targetType: FollowTargetType,
  targetId: string,
): { profileId: string } & Partial<Record<FollowTargetColumn, string>> {
  return { profileId, [followTargetColumn(targetType)]: targetId };
}
