export const CONTENT_TYPES = ["live", "replay", "highlight"] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export interface EventContentContext {
  eventId: string;
  competitionId: string;
  sportId: string;
  contentType: ContentType;
}
