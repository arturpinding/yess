import { and, eq, type SQL } from "drizzle-orm";
import { notifications } from "@/server/db/schema";

/**
 * Notification inbox mutations are profile-scoped. A nullable profileId is a
 * user-level delivery, not shared mutable read state for every viewing profile.
 */
export function notificationInboxScope(userId: string, profileId: string): SQL {
  return and(eq(notifications.userId, userId), eq(notifications.profileId, profileId))!;
}
