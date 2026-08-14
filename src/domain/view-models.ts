export type EventStatus = "scheduled" | "delayed" | "live" | "paused" | "finished" | "cancelled";

export type ContentAvailability =
  | "watch_here"
  | "watch_on_partner"
  | "free_to_air"
  | "not_available_in_region"
  | "no_verified_stream";

export type FollowTargetType = "athlete" | "team" | "sport" | "competition";

export interface PersonSummary {
  id: string;
  slug: string;
  name: string;
  initials: string;
  nationality: string;
  isEstonian: boolean;
  sportName: string;
  portraitUrl?: string;
  demo: boolean;
}

export interface ParticipantSummary {
  id: string;
  name: string;
  shortName?: string;
  kind: "athlete" | "team";
  isEstonian: boolean;
  score?: string;
}

export interface EventCardModel {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  sportName: string;
  sportId?: string;
  sportSlug: string;
  competitionName: string;
  competitionId?: string;
  competitionSlug: string;
  status: EventStatus;
  startAt: string;
  endAt?: string;
  venueName?: string;
  participants: ParticipantSummary[];
  estonians: PersonSummary[];
  availability: ContentAvailability;
  contentKinds: Array<"live" | "replay" | "highlight">;
  score?: string;
  resultText?: string;
  accent: string;
  demo: boolean;
  recommendationReason?: string;
}

export interface SearchResults {
  athletes: PersonSummary[];
  teams: Array<{
    id: string;
    slug: string;
    name: string;
    sportName: string;
    countryCode: string;
    demo: boolean;
  }>;
  sports: Array<{ id: string; slug: string; name: string; icon: string; demo: boolean }>;
  competitions: Array<{
    id: string;
    slug: string;
    name: string;
    sportName: string;
    demo: boolean;
  }>;
  events: EventCardModel[];
}
