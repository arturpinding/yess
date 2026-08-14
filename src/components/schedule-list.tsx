import { ExternalLink, Play } from "lucide-react";
import Link from "next/link";
import type { EventCardModel } from "@/domain/view-models";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatTallinnTime } from "@/i18n/format";
import { StatusPill } from "./status-pill";

export function ScheduleList({
  events,
  locale,
  dictionary: d,
  spoilerFree,
}: {
  events: EventCardModel[];
  locale: Locale;
  dictionary: Dictionary;
  spoilerFree: boolean;
}) {
  return (
    <div className="schedule-list">
      {events.map((event) => (
        <Link
          className="schedule-row"
          href={`/${locale}/events/${event.slug}`}
          key={event.id}
          style={{ "--row-accent": event.accent } as React.CSSProperties}
        >
          <span className="schedule-time">
            <strong>{formatTallinnTime(event.startAt, locale)}</strong>
            <small>{d.localTime}</small>
          </span>
          <span className="sport-marker" aria-hidden="true" />
          <span className="schedule-title">
            <strong>{event.title}</strong>
            <small>
              {event.sportName}
              {event.estonians.length
                ? ` · ${event.estonians.map((item) => item.name).join(", ")}`
                : ""}
            </small>
          </span>
          <span className="schedule-competition">{event.competitionName}</span>
          <span className="schedule-right">
            {!spoilerFree && event.score && (
              <span className="content-badge spoiler-content">{event.score}</span>
            )}
            <StatusPill status={event.status} dictionary={d} />
            <span
              className={`availability ${event.availability === "watch_here" ? "available" : ""}`}
            >
              {event.availability === "watch_here" ? (
                <Play size={12} />
              ) : (
                <ExternalLink size={12} />
              )}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
