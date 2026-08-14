import { Building2, Info, MapPin, UsersRound } from "lucide-react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AthleteCard } from "@/components/athlete-card";
import { EventCard } from "@/components/event-card";
import { FollowButton } from "@/components/follow-button";
import { NotificationControl } from "@/components/notification-control";
import { SectionHeader } from "@/components/section-header";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getFollowSets, getNotificationMode, getTeamDetail } from "@/server/data/catalog";
import { getServerViewerContext } from "@/server/auth/server-viewer-context";
import { personalizationProfileId } from "@/server/auth/viewer-context";

export const dynamic = "force-dynamic";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: localeParam, slug } = await params;
  if (!isLocale(localeParam)) notFound();
  const d = getDictionary(localeParam);
  const [team, cookieStore, viewer] = await Promise.all([
    getTeamDetail(slug, localeParam),
    cookies(),
    getServerViewerContext(),
  ]);
  if (!team) notFound();
  const profileId = personalizationProfileId(viewer);
  const [followSets, notificationMode] = await Promise.all([
    getFollowSets(profileId),
    getNotificationMode(profileId, "team", team.id),
  ]);
  const spoilerFree = cookieStore.get("rada-spoilers")?.value === "hide";

  return (
    <div className="page-stack">
      <section className="athlete-hero team-hero">
        <div className="athlete-portrait team-mark">
          <Building2 size={48} strokeWidth={1.25} aria-hidden="true" />
          <small>{d.demoData}</small>
        </div>
        <div className="athlete-hero-copy">
          <p className="eyebrow">{team.sportName}</p>
          <h1>{team.name}</h1>
          <p className="lead">
            <MapPin size={15} aria-hidden="true" /> {team.city ?? team.countryCode} ·{" "}
            {team.countryCode}
          </p>
          <div className="hero-actions">
            <FollowButton
              targetId={team.id}
              targetType="team"
              initialFollowing={followSets.teamIds.has(team.id)}
              followLabel={d.follow}
              followingLabel={d.following}
            />
            <NotificationControl
              targetId={team.id}
              targetType="team"
              dictionary={d}
              initialMode={notificationMode}
            />
          </div>
        </div>
      </section>

      <div className="demo-banner" role="note">
        <Info size={15} aria-hidden="true" /> {d.demoNotice}
      </div>

      <section className="section-block">
        <SectionHeader title={d.athletes} />
        {team.athletes.length ? (
          <div className="athlete-strip">
            {team.athletes.map((athlete) => (
              <AthleteCard
                athlete={athlete}
                locale={localeParam}
                dictionary={d}
                following={followSets.athleteIds.has(athlete.id)}
                key={athlete.id}
              />
            ))}
          </div>
        ) : (
          <div className="panel panel-body">
            <UsersRound size={20} aria-hidden="true" />
            <p className="event-meta">
              {localeParam === "et" ? "Koosseis pole avaldatud." : "Roster not published."}
            </p>
          </div>
        )}
      </section>

      <section className="section-block">
        <SectionHeader title={d.events} />
        <div className="card-grid">
          {team.events.slice(0, 9).map((event) => (
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
    </div>
  );
}
