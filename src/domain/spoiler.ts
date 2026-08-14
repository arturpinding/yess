export interface SpoilerTimelineItem {
  spoilerSensitive: boolean;
  [key: string]: unknown;
}

export interface SpoilerHighlightItem {
  spoilerSensitive: boolean;
  [key: string]: unknown;
}

export interface EventSpoilerData {
  score: unknown | null;
  result: unknown | null;
  resultSummary: string | null;
  winnerId: string | null;
  thumbnailUrl: string | null;
  neutralThumbnailUrl?: string | null;
  timeline: readonly SpoilerTimelineItem[];
  highlights: readonly SpoilerHighlightItem[];
}

export type RedactedEvent<T extends EventSpoilerData> = Omit<
  T,
  "score" | "result" | "resultSummary" | "winnerId" | "thumbnailUrl" | "timeline" | "highlights"
> & {
  score: null;
  result: null;
  resultSummary: null;
  winnerId: null;
  thumbnailUrl: string | null;
  timeline: SpoilerTimelineItem[];
  highlights: SpoilerHighlightItem[];
  spoilersHidden: true;
};

export type VisibleEvent<T extends EventSpoilerData> = T & {
  spoilersHidden: false;
};

export interface SpoilerPolicy {
  enabled: boolean;
  /** A deliberate, event-scoped reveal overrides the profile default. */
  revealed?: boolean;
}

/**
 * Redacts spoiler-bearing data before serialization. Hiding these fields with
 * CSS would still leak them through HTML, accessibility APIs, and network data.
 */
export function applyEventSpoilerPolicy<T extends EventSpoilerData>(
  event: T,
  policy: SpoilerPolicy,
): RedactedEvent<T> | VisibleEvent<T> {
  if (!policy.enabled || policy.revealed === true) {
    return { ...event, spoilersHidden: false };
  }

  return {
    ...event,
    score: null,
    result: null,
    resultSummary: null,
    winnerId: null,
    thumbnailUrl: event.neutralThumbnailUrl ?? null,
    timeline: event.timeline.filter((item) => !item.spoilerSensitive),
    highlights: event.highlights.filter((item) => !item.spoilerSensitive),
    spoilersHidden: true,
  };
}

export interface NotificationSpoilerContent {
  title: string;
  body: string;
  safeTitle: string;
  safeBody: string;
  spoilerSensitive: boolean;
}

export function applyNotificationSpoilerPolicy<T extends NotificationSpoilerContent>(
  notification: T,
  policy: SpoilerPolicy,
): T {
  if (!policy.enabled || policy.revealed === true || !notification.spoilerSensitive) {
    return { ...notification };
  }

  return {
    ...notification,
    title: notification.safeTitle,
    body: notification.safeBody,
  };
}
