import {
  CalendarClock,
  ExternalLink,
  Info,
  MapPin,
  RadioTower,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorizedPlayer } from "@/components/authorized-player";
import { Countdown } from "@/components/countdown";
import { EventCard } from "@/components/event-card";
import { SectionHeader } from "@/components/section-header";
import { StatusPill } from "@/components/status-pill";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { formatTallinnDateTime } from "@/i18n/format";
import { getEventDetail } from "@/server/data/catalog";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: localeParam, slug } = await params;
  if (!isLocale(localeParam)) notFound();
  const d = getDictionary(localeParam);
  const [event, cookieStore] = await Promise.all([getEventDetail(slug, localeParam), cookies()]);
  if (!event) notFound();
  const spoilerFree = cookieStore.get("rada-spoilers")?.value === "hide";
  const isLive = ["live", "paused"].includes(event.card.status);
  const canPlay =
    event.card.availability === "watch_here" &&
    (isLive || event.card.contentKinds.includes("replay"));

  return (
    <div className="page-stack event-page">
      <header className="event-heading">
        <div className="hero-labels">
          <StatusPill status={event.card.status} dictionary={d} />
          <span className="demo-badge">{d.demoData}</span>
        </div>
        <p className="eyebrow">
          {event.card.sportName} · {event.card.competitionName}
        </p>
        <h1>{event.card.title}</h1>
        <div className="event-heading-meta">
          <span>
            <CalendarClock size={15} aria-hidden="true" />
            {formatTallinnDateTime(event.card.startAt, localeParam)} · {d.localTime}
          </span>
          {event.venue && (
            <span>
              <MapPin size={15} aria-hidden="true" />
              {event.venue.name}, {event.venue.city}
            </span>
          )}
        </div>
        {["scheduled", "delayed"].includes(event.card.status) && (
          <Countdown startAt={event.card.startAt} locale={localeParam} label={d.countdown} />
        )}
      </header>

      {canPlay ? (
        <AuthorizedPlayer
          eventId={event.card.id}
          title={event.card.title}
          competition={event.card.competitionName}
          statusLabel={d[event.card.status]}
          startTimeLabel={formatTallinnDateTime(event.card.startAt, localeParam)}
          locale={localeParam}
          dictionary={d}
          isLive={isLive}
        />
      ) : (
        <section className="player-gate">
          <span className="state-icon">
            <RadioTower aria-hidden="true" />
          </span>
          <h2>
            {event.card.status === "scheduled" || event.card.status === "delayed"
              ? localeParam === "et"
                ? "Ülekanne avaneb enne starti"
                : "Playback opens before the start"
              : d.streamUnavailable}
          </h2>
          <p>{d.streamUnavailableHelp}</p>
          {event.card.availability === "watch_on_partner" && (
            <button className="button primary" type="button" disabled title={d.demoData}>
              <ExternalLink size={16} aria-hidden="true" /> {d.watchPartner} · {d.demoOnly}
            </button>
          )}
        </section>
      )}

      <div className="demo-banner" role="note">
        <Info size={15} aria-hidden="true" />
        {d.demoNotice} {d.rightsExplanation}
      </div>

      <div className="detail-grid event-detail-grid">
        <section className="panel">
          <header className="panel-header">
            <h2>{d.eventDetails}</h2>
          </header>
          <div className="panel-body fact-list">
            <div className="fact-row">
              <span>{d.competition}</span>
              <strong>{event.card.competitionName}</strong>
            </div>
            <div className="fact-row">
              <span>{d.status}</span>
              <StatusPill status={event.card.status} dictionary={d} />
            </div>
            <div className="fact-row">
              <span>{d.venue}</span>
              <strong>{event.venue ? `${event.venue.name}, ${event.venue.city}` : "—"}</strong>
            </div>
            <div className="fact-row">
              <span>{d.participants}</span>
              <strong>{event.card.participants.length}</strong>
            </div>
            {event.description && <p>{event.description}</p>}
          </div>
        </section>

        <aside className="panel rights-panel">
          <header className="panel-header">
            <h2>{d.rights}</h2>
            <p>{d.rightsChecked}</p>
          </header>
          <div className="panel-body">
            <span className="rights-icon">
              <ShieldCheck size={22} aria-hidden="true" />
            </span>
            {event.rights.length ? (
              event.rights.map((right) => (
                <div className="rights-row" key={right.id}>
                  <strong>{right.rightsHolder}</strong>
                  <small>
                    {right.countryCode ?? "EU"} · {right.access} · DVR{" "}
                    {right.dvrAllowed ? "✓" : "—"}
                  </small>
                  <small>
                    {formatTallinnDateTime(right.startsAt, localeParam)} –{" "}
                    {formatTallinnDateTime(right.endsAt, localeParam)}
                  </small>
                </div>
              ))
            ) : (
              <p className="event-meta">{d.noVerifiedStream}</p>
            )}
            <p className="privacy-note">{d.rightsExplanation}</p>
          </div>
        </aside>
      </div>

      <section className="section-block">
        <SectionHeader title={d.participants} />
        <div className="participant-grid">
          {event.card.participants.map((participant) => {
            const athlete = event.card.estonians.find((item) => item.id === participant.id);
            const href = athlete
              ? `/${localeParam}/athletes/${athlete.slug}`
              : participant.kind === "team"
                ? `/${localeParam}/discover?q=${encodeURIComponent(participant.name)}`
                : `/${localeParam}/discover`;
            return (
              <Link className="participant-tile" href={href} key={participant.id}>
                <span className="participant-avatar">
                  {athlete?.initials ?? participant.name.slice(0, 2)}
                </span>
                <span>
                  <strong>{participant.name}</strong>
                  <small>{participant.isEstonian ? d.estoniansCompeting : participant.kind}</small>
                </span>
                {!spoilerFree && participant.score && (
                  <strong className="spoiler-content">{participant.score}</strong>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {event.results.length > 0 && (
        <section className="section-block" aria-labelledby="event-result-heading">
          <SectionHeader title={d.result} headingId="event-result-heading" />
          <div className="result-list panel">
            {spoilerFree ? (
              <div className="panel-body result-hidden" role="status">
                {d.spoilerHidden}
              </div>
            ) : (
              event.results.map((result, index) => (
                <div
                  className="result-row spoiler-content"
                  key={`${result.participantName}-${index}`}
                >
                  <strong>{result.rank ?? "—"}</strong>
                  <span>{result.participantName}</span>
                  <span>{result.outcome ?? "—"}</span>
                  <strong>{result.score ?? "—"}</strong>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      <section className="section-block">
        <SectionHeader title={d.timeline} />
        <div className="timeline-list panel">
          {event.timeline.length ? (
            event.timeline.map((item) => (
              <div className="timeline-row" key={item.id}>
                <time>
                  {item.eventClock ?? formatTallinnDateTime(item.occurredAt, localeParam)}
                </time>
                <span className="timeline-marker" aria-hidden="true" />
                <div>
                  <strong>{item.kind.replaceAll("_", " ")}</strong>
                  <p>{spoilerFree && item.spoilerSensitive ? d.spoilerHidden : item.text}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="panel-body">
              <p className="event-meta">
                {localeParam === "et"
                  ? "Sündmuste käik ilmub, kui andmepakkuja selle edastab."
                  : "The timeline appears when the data provider supplies it."}
              </p>
            </div>
          )}
        </div>
      </section>

      {event.related.length > 0 && (
        <section className="section-block">
          <SectionHeader title={d.relatedEvents} />
          <div className="card-grid">
            {event.related.slice(0, 3).map((related) => (
              <EventCard
                event={related}
                locale={localeParam}
                dictionary={d}
                spoilerFree={spoilerFree}
                key={related.id}
              />
            ))}
          </div>
        </section>
      )}

      <footer className="privacy-note">
        <Users size={14} aria-hidden="true" /> {d.privacyTelemetry}
      </footer>
    </div>
  );
}
