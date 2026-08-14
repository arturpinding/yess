import { ArrowUpRight, CircleOff, ExternalLink, Play, Radio } from "lucide-react";
import Link from "next/link";
import type { EventCardModel } from "@/domain/view-models";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatTallinnDate, formatTallinnTime } from "@/i18n/format";
import { StatusPill } from "./status-pill";

function availabilityCopy(event: EventCardModel, d: Dictionary) {
  switch (event.availability) {
    case "watch_here":
      return { text: d.watchHere, available: true, icon: Play };
    case "watch_on_partner":
      return { text: d.watchPartner, available: true, icon: ExternalLink };
    case "free_to_air":
      return { text: d.freeToAir, available: true, icon: Radio };
    case "not_available_in_region":
      return { text: d.unavailableRegion, available: false, icon: CircleOff };
    case "no_verified_stream":
      return { text: d.noVerifiedStream, available: false, icon: CircleOff };
  }
}

export function EventCard({
  event,
  locale,
  dictionary: d,
  spoilerFree,
}: {
  event: EventCardModel;
  locale: Locale;
  dictionary: Dictionary;
  spoilerFree: boolean;
}) {
  const availability = availabilityCopy(event, d);
  const AvailabilityIcon = availability.icon;
  const score = spoilerFree ? undefined : event.score;

  return (
    <Link
      href={`/${locale}/events/${event.slug}`}
      className="event-card"
      style={{ "--card-accent": event.accent } as React.CSSProperties}
    >
      <div className="event-visual">
        <div className="event-visual-top">
          <StatusPill status={event.status} dictionary={d} />
          <span className="demo-badge">{d.demoData}</span>
        </div>
        <div className="event-time">
          <strong>{formatTallinnTime(event.startAt, locale)}</strong>
          <span>{formatTallinnDate(event.startAt, locale)}</span>
        </div>
      </div>
      <div className="event-card-body">
        <h3>{event.title}</h3>
        <p className="event-meta">
          {event.sportName} · {event.competitionName}
        </p>
        {score && <strong className="spoiler-content">{score}</strong>}
        {spoilerFree && event.status === "finished" && (
          <span className="content-badge">{d.spoilerHidden}</span>
        )}
        <div className="event-card-footer">
          <span className="participant-list" aria-label={d.estoniansCompeting}>
            {event.estonians.slice(0, 3).map((athlete) => (
              <span className="participant-avatar" key={athlete.id} title={athlete.name}>
                {athlete.initials}
              </span>
            ))}
          </span>
          <span className={`availability ${availability.available ? "available" : ""}`}>
            <AvailabilityIcon size={12} aria-hidden="true" />
            <span>{availability.text}</span>
            {availability.available && <ArrowUpRight size={11} aria-hidden="true" />}
          </span>
        </div>
      </div>
    </Link>
  );
}
