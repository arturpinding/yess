import { Building2, Info, Medal, ShieldCheck, Trophy } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AthletePortrait } from "@/components/athlete-portrait";
import { EmptyState } from "@/components/empty-state";
import { EventCard } from "@/components/event-card";
import { FollowButton } from "@/components/follow-button";
import { NotificationControl } from "@/components/notification-control";
import { SectionHeader } from "@/components/section-header";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getAthleteDetail, getFollowSets, getNotificationMode } from "@/server/data/catalog";
import { getServerViewerContext } from "@/server/auth/server-viewer-context";
import { personalizationProfileId } from "@/server/auth/viewer-context";

export const dynamic = "force-dynamic";

export default async function AthletePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: localeParam, slug } = await params;
  if (!isLocale(localeParam)) notFound();
  const d = getDictionary(localeParam);
  const [athlete, cookieStore, viewer] = await Promise.all([
    getAthleteDetail(slug, localeParam),
    cookies(),
    getServerViewerContext(),
  ]);
  if (!athlete) notFound();
  const profileId = personalizationProfileId(viewer);
  const [followSets, notificationMode] = await Promise.all([
    getFollowSets(profileId),
    getNotificationMode(profileId, "athlete", athlete.id),
  ]);
  const spoilerFree = cookieStore.get("rada-spoilers")?.value === "hide";

  return (
    <div className="page-stack">
      <section className="athlete-hero">
        <AthletePortrait
          initials={athlete.initials}
          portraitUrl={athlete.portraitUrl}
          demoLabel={d.demoData}
          portraitAlt={
            localeParam === "et"
              ? `Sünteetiline näidisportree: ${athlete.name}`
              : `Synthetic demo portrait: ${athlete.name}`
          }
        />
        <div className="athlete-hero-copy">
          <div className="hero-labels">
            <span className="demo-badge">{d.demoData}</span>
            <span className="content-badge">
              <ShieldCheck size={12} aria-hidden="true" /> {athlete.nationality}
            </span>
          </div>
          <p className="eyebrow">{athlete.sportName}</p>
          <h1>{athlete.name}</h1>
          <p className="lead">{athlete.biography}</p>
          <div className="hero-actions">
            <FollowButton
              targetId={athlete.id}
              targetType="athlete"
              initialFollowing={followSets.athleteIds.has(athlete.id)}
              followLabel={d.follow}
              followingLabel={d.following}
            />
            <NotificationControl
              targetId={athlete.id}
              targetType="athlete"
              dictionary={d}
              initialMode={notificationMode}
            />
          </div>
        </div>
      </section>

      <div className="demo-banner" role="note">
        <Info size={15} aria-hidden="true" />
        {d.demoNotice}
      </div>

      <div className="detail-grid">
        <section className="panel">
          <header className="panel-header">
            <h2>{d.keyFacts}</h2>
          </header>
          <div className="panel-body fact-list">
            <div className="fact-row">
              <span>{d.nationality}</span>
              <strong>{athlete.nationality}</strong>
            </div>
            <div className="fact-row">
              <span>{d.sports}</span>
              <strong>{athlete.sportName}</strong>
            </div>
            {athlete.team && (
              <div className="fact-row">
                <span>{d.club}</span>
                <Link href={`/${localeParam}/teams/${athlete.team.slug}`}>
                  <strong>{athlete.team.name}</strong>
                </Link>
              </div>
            )}
            {athlete.keyFacts.map((fact) => (
              <div className="fact-row" key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <header className="panel-header">
            <h2>{d.currentCompetitions}</h2>
          </header>
          <div className="panel-body tag-list">
            {athlete.competitions.map((competition) => (
              <span className="content-badge" key={competition}>
                <Trophy size={12} aria-hidden="true" />
                {competition}
              </span>
            ))}
            {athlete.team && (
              <Link className="tag-link" href={`/${localeParam}/teams/${athlete.team.slug}`}>
                <Building2 size={14} aria-hidden="true" />
                {athlete.team.name} · {athlete.team.countryCode}
              </Link>
            )}
          </div>
        </section>
      </div>

      {athlete.live.length > 0 && (
        <section className="section-block">
          <SectionHeader title={d.liveNow} />
          <div className="card-grid">
            {athlete.live.map((event) => (
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
      )}

      <section className="section-block">
        <SectionHeader title={d.startingSoon} />
        {athlete.upcoming.length ? (
          <div className="card-grid">
            {athlete.upcoming.slice(0, 6).map((event) => (
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
            title={
              localeParam === "et"
                ? "Uut starti pole veel kinnitatud"
                : "No next start is confirmed"
            }
            body={
              localeParam === "et"
                ? "Hoiame võistluste kava värskena ja anname muutusest teada."
                : "We keep the competition schedule current and notify you when it changes."
            }
          />
        )}
      </section>

      <section className="section-block">
        <SectionHeader title={d.recentResults} />
        {athlete.recent.length ? (
          <div className="card-grid">
            {athlete.recent.slice(0, 6).map((event) => (
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
          <div className="panel panel-body">
            <Medal size={20} aria-hidden="true" />
            <p className="event-meta">
              {localeParam === "et" ? "Tulemusi pole veel." : "No results yet."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
