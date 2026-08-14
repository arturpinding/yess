import { Bell, CalendarPlus, Sparkles, UserRound, UsersRound } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { FollowButton } from "@/components/follow-button";
import { NotificationControl } from "@/components/notification-control";
import { ScheduleList } from "@/components/schedule-list";
import { SectionHeader } from "@/components/section-header";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getMySports } from "@/server/data/catalog";
import { getServerViewerContext } from "@/server/auth/server-viewer-context";
import { personalizationProfileId } from "@/server/auth/viewer-context";

export const dynamic = "force-dynamic";

function entityHref(locale: string, type: string, slug: string) {
  if (type === "athlete") return `/${locale}/athletes/${slug}`;
  if (type === "team") return `/${locale}/teams/${slug}`;
  if (type === "sport") return `/${locale}/schedule?sport=${encodeURIComponent(slug)}`;
  return `/${locale}/schedule?competition=${encodeURIComponent(slug)}`;
}

export default async function MySportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();
  const d = getDictionary(localeParam);
  const [cookieStore, viewer] = await Promise.all([cookies(), getServerViewerContext()]);
  const data = await getMySports(personalizationProfileId(viewer), localeParam);
  const spoilerFree = cookieStore.get("rada-spoilers")?.value === "hide";

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{d.navMySports}</p>
          <h1>{localeParam === "et" ? "Sinu sport, sinu ajas." : "Your sport, on your time."}</h1>
          <p>{d.emptyFollowsHelp}</p>
        </div>
        <a className="button primary" href="/api/v1/calendar.ics" download>
          <CalendarPlus size={17} aria-hidden="true" />
          {d.calendarExport}
        </a>
      </header>

      {data.entities.length ? (
        <section className="section-block">
          <SectionHeader title={d.following} />
          <div className="entity-grid">
            {data.entities.map((entity) => (
              <article className="entity-card" key={entity.id}>
                <Link href={entityHref(localeParam, entity.type, entity.slug)}>
                  <span className="entity-icon">
                    {entity.type === "athlete" ? (
                      <UserRound size={19} aria-hidden="true" />
                    ) : entity.type === "team" ? (
                      <UsersRound size={19} aria-hidden="true" />
                    ) : (
                      <Sparkles size={19} aria-hidden="true" />
                    )}
                  </span>
                </Link>
                <Link href={entityHref(localeParam, entity.type, entity.slug)}>
                  <strong>{entity.name}</strong>
                  <small>{entity.subtitle}</small>
                </Link>
                <div className="inline-actions">
                  <FollowButton
                    targetId={entity.targetId}
                    targetType={entity.type}
                    initialFollowing
                    followLabel={d.follow}
                    followingLabel={d.following}
                    compact
                  />
                  {(entity.type === "athlete" || entity.type === "team") && (
                    <NotificationControl
                      targetId={entity.targetId}
                      targetType={entity.type}
                      dictionary={d}
                      initialMode={entity.notificationMode}
                    />
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          title={d.emptyFollows}
          body={d.emptyFollowsHelp}
          actionHref={`/${localeParam}/discover`}
          actionLabel={d.discoverAthletes}
        />
      )}

      <section className="section-block">
        <SectionHeader
          title={d.myCalendar}
          description={
            localeParam === "et"
              ? "Kõik jälgimistega seotud sündmused Eesti aja järgi."
              : "Every event connected to your follows in Estonia time."
          }
          href={`/${localeParam}/schedule`}
          linkLabel={d.fullSchedule}
        />
        {data.calendar.length ? (
          <ScheduleList
            events={data.calendar.slice(0, 30)}
            locale={localeParam}
            dictionary={d}
            spoilerFree={spoilerFree}
          />
        ) : (
          <EmptyState
            title={localeParam === "et" ? "Isiklik kava on tühi" : "Your calendar is empty"}
            body={d.emptyFollowsHelp}
          />
        )}
      </section>

      <aside className="demo-banner">
        <Bell size={15} aria-hidden="true" />
        {localeParam === "et"
          ? "Teavitused kasutavad sama isiklikku kava ja väldivad kordussõnumeid."
          : "Notifications use the same personal schedule and deduplicate repeat messages."}
      </aside>
    </div>
  );
}
