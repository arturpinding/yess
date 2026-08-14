export const NOTIFICATION_KINDS = [
  "event_starting_soon",
  "event_started",
  "schedule_changed",
  "venue_changed",
  "followed_athlete_competing",
  "important_result",
  "highlight_available",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const IMPORTANT_NOTIFICATION_KINDS = [
  "event_starting_soon",
  "schedule_changed",
  "followed_athlete_competing",
  "important_result",
  "highlight_available",
] as const satisfies readonly NotificationKind[];

export type NotificationMode = "all" | "important" | "off";
export type NotificationTargetType = "athlete" | "team";

export function deriveNotificationMode(enabledKinds: Iterable<NotificationKind>): NotificationMode {
  const enabled = new Set(enabledKinds);
  if (enabled.size === 0) return "off";
  if (NOTIFICATION_KINDS.every((kind) => enabled.has(kind))) return "all";
  return "important";
}

export function notificationTargetKey(type: NotificationTargetType, targetId: string): string {
  return `${type}:${targetId}`;
}
