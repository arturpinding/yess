import { CalendarDays, Info, Play, RadioTower } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AthleteCard } from "@/components/athlete-card";
import { EmptyState } from "@/components/empty-state";
import { EventCard } from "@/components/event-card";
import { ScheduleList } from "@/components/schedule-list";
import { SectionHeader } from "@/components/section-header";
import { StatusPill } from "@/components/status-pill";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { formatTallinnDate } from "@/i18n/format";
import { getHomeData } from "@/server/data/catalog";
import { getServerViewerContext } from "@/server/auth/server-viewer-context";
import { personalizationProfileId } from "@/server/auth/viewer-context";

export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();
  const d = getDictionary(localeParam);
  const [cookieStore, viewer] = await Promise.all([cookies(), getServerViewerContext()]);
  const spoilerFree = cookieStore.get("rada-spoilers")?.value === "hide";
  const data = await getHomeData(personalizationProfileId(viewer), localeParam);
  const featured = data.live[0] ?? data.soon[0] ?? data.estoniansToday[0];
  const todayLabel = formatTallinnDate(new Date(), localeParam);
  const todayAthletes = [
    ...new Map(
      data.estoniansToday
        .flatMap((event) => event.estonians)
        .map((athlete) => [athlete.id, athlete]),
    ).values(),
  ].slice(0, 8);

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{todayLabel}</p>
          <h1>
            {localeParam === "et"
              ? "Kõik oluline enne avavilet."
              : "Everything that matters before the start."}
          </h1>
          <p>
            {localeParam === "et"
              ? "Eesti sportlased, õiged algusajad ja kontrollitud vaatamiskohad — sõltumata alast või riigist."
              : "Estonian athletes, reliable start times and verified viewing destinations — across sports and borders."}
          </p>
        </div>
        <Link className="button subtle" href={`/${localeParam}/schedule`}>
          <CalendarDays size={17} aria-hidden="true" />
          {d.fullSchedule}
        </Link>
      </header>

      <div className="demo-banner" role="note">
        <Info size={15} aria-hidden="true" />
        <strong>{d.demoData}.</strong> {d.demoNotice}
      </div>

      <section className="section-block" aria-labelledby="live-heading">
        <SectionHeader
          title={d.liveNow}
          headingId="live-heading"
          description={
            localeParam === "et"
              ? "Vaatamisõigus kontrollitakse enne voo avamist."
              : "Viewing rights are checked before the stream opens."
          }
        />
        {featured ? (
          <article
            className="live-feature"
            style={{ "--feature-accent": featured.accent } as React.CSSProperties}
          >
            <div className="live-stage">
              <div className="live-stage-copy">
                <StatusPill status={featured.status} dictionary={d} />
                <h2>{featured.title}</h2>
                <p>
                  {featured.competitionName} · {featured.sportName}
                  {featured.venueName ? ` · ${featured.venueName}` : ""}
                </p>
              </div>
              <div className="live-stage-actions">
                <Link className="button on-dark" href={`/${localeParam}/events/${featured.slug}`}>
                  <Play size={16} fill="currentColor" aria-hidden="true" />
                  {featured.status === "live" ? d.watchHere : d.eventDetails}
                </Link>
                <span className="button ghost-on-dark" aria-label={d.rightsChecked}>
                  <RadioTower size={16} aria-hidden="true" />
                  {d.rightsChecked}
                </span>
              </div>
            </div>
            <div className="live-sidebar">
              <div>
                <p className="eyebrow">{d.participants}</p>
                <div className="matchup">
                  {featured.participants.slice(0, 4).map((participant) => (
                    <div className="matchup-row" key={participant.id}>
                      <strong>{participant.name}</strong>
                      <span className="matchup-score spoiler-content">
                        {spoilerFree ? "—" : (participant.score ?? "·")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="event-meta">{d.estoniansCompeting}</p>
                <div className="participant-list">
                  {featured.estonians.map((athlete) => (
                    <Link
                      className="participant-avatar"
                      href={`/${localeParam}/athletes/${athlete.slug}`}
                      key={athlete.id}
                      title={athlete.name}
                    >
                      {athlete.initials}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </article>
        ) : (
          <EmptyState
            title={localeParam === "et" ? "Hetkel pole otseülekannet" : "Nothing is live right now"}
            body={
              localeParam === "et"
                ? "Järgmised sündmused on kavas olemas."
                : "The next events are ready in the schedule."
            }
            actionHref={`/${localeParam}/schedule`}
            actionLabel={d.fullSchedule}
          />
        )}
      </section>

      <section className="section-block" aria-labelledby="soon-heading">
        <SectionHeader
          title={d.startingSoon}
          headingId="soon-heading"
          href={`/${localeParam}/schedule`}
          linkLabel={d.seeAll}
        />
        <div className="card-grid">
          {data.soon.slice(0, 3).map((event) => (
            <EventCard
              event={event}
              locale={localeParam}
              dictionary={d}
              spoilerFree={spoilerFree}
              key={event.id}
            />
          ))}
        </div>
      </section>

      <section className="section-block" aria-labelledby="estonian-athletes-heading">
        <SectionHeader
          title={d.estoniansToday}
          headingId="estonian-athletes-heading"
          description={
            localeParam === "et"
              ? `${data.estoniansToday.length} sündmust Eesti aja järgi`
              : `${data.estoniansToday.length} events in Estonia time`
          }
          href={`/${localeParam}/discover`}
          linkLabel={d.discoverAthletes}
        />
        <div className="athlete-strip">
          {(todayAthletes.length ? todayAthletes : data.featuredAthletes.slice(0, 4)).map(
            (athlete) => (
              <AthleteCard
                athlete={athlete}
                locale={localeParam}
                dictionary={d}
                following={data.followSets.athleteIds.has(athlete.id)}
                key={athlete.id}
              />
            ),
          )}
        </div>
      </section>

      <section className="section-block" aria-labelledby="personalized-heading">
        <SectionHeader
          title={d.forYou}
          headingId="personalized-heading"
          description={
            localeParam === "et"
              ? "Isiklik kava sportlaste, klubide, alade ja võistluste põhjal."
              : "A personal schedule built from athletes, clubs, sports and competitions."
          }
          href={`/${localeParam}/my-sports`}
          linkLabel={d.navMySports}
        />
        {data.personalized.length ? (
          <div className="card-grid">
            {data.personalized.slice(0, 3).map((event) => (
              <EventCard
                event={event}
                locale={localeParam}
                dictionary={d}
                spoilerFree={spoilerFree}
                key={event.id}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={d.emptyFollows}
            body={d.emptyFollowsHelp}
            actionHref={`/${localeParam}/discover`}
            actionLabel={d.discoverAthletes}
          />
        )}
      </section>

      <section className="section-block" aria-labelledby="recent-heading">
        <SectionHeader title={d.recent} headingId="recent-heading" />
        <div className="card-grid">
          {data.recent.slice(0, 3).map((event) => (
            <EventCard
              event={event}
              locale={localeParam}
              dictionary={d}
              spoilerFree={spoilerFree}
              key={event.id}
            />
          ))}
        </div>
      </section>

      <section className="section-block" aria-labelledby="schedule-preview-heading">
        <SectionHeader
          title={d.fullSchedule}
          href={`/${localeParam}/schedule`}
          linkLabel={d.seeAll}
        />
        <div id="schedule-preview-heading">
          <ScheduleList
            events={[...data.live, ...data.soon, ...data.estoniansToday]
              .filter(
                (event, index, all) => all.findIndex((item) => item.id === event.id) === index,
              )
              .slice(0, 7)}
            locale={localeParam}
            dictionary={d}
            spoilerFree={spoilerFree}
          />
        </div>
      </section>
    </div>
  );
}
