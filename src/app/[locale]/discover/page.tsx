import { Activity, CircleX, Search, Trophy, UsersRound } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AthleteCard } from "@/components/athlete-card";
import { EventCard } from "@/components/event-card";
import { FollowButton } from "@/components/follow-button";
import { SectionHeader } from "@/components/section-header";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getFollowSets, searchCatalog } from "@/server/data/catalog";
import { getServerViewerContext } from "@/server/auth/server-viewer-context";
import { personalizationProfileId } from "@/server/auth/viewer-context";

export const dynamic = "force-dynamic";

export default async function DiscoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ locale: localeParam }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(localeParam)) notFound();
  const d = getDictionary(localeParam);
  const searchQuery = (query.q ?? "").slice(0, 120);
  const [cookieStore, viewer] = await Promise.all([cookies(), getServerViewerContext()]);
  const spoilerFree = cookieStore.get("rada-spoilers")?.value === "hide";
  const [results, followSets] = await Promise.all([
    searchCatalog(searchQuery, localeParam),
    getFollowSets(personalizationProfileId(viewer)),
  ]);
  const resultCount =
    results.athletes.length +
    results.teams.length +
    results.sports.length +
    results.competitions.length +
    results.events.length;

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{d.navDiscover}</p>
          <h1>
            {localeParam === "et" ? "Leia oma järgmine võistlus." : "Find your next competition."}
          </h1>
          <p>
            {localeParam === "et"
              ? "Otsi korraga sportlasi, klubisid, alasid, võistlusi ja sündmusi."
              : "Search athletes, clubs, sports, competitions and events at once."}
          </p>
        </div>
      </header>

      <form action={`/${localeParam}/discover`} method="get" role="search">
        <label className="search-field">
          <span className="sr-only">{d.search}</span>
          <Search size={21} aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={searchQuery}
            placeholder={d.searchPlaceholder}
            autoComplete="off"
            maxLength={120}
          />
          {searchQuery && (
            <Link
              className="icon-button"
              href={`/${localeParam}/discover`}
              aria-label={d.clearSearch}
            >
              <CircleX size={17} aria-hidden="true" />
            </Link>
          )}
        </label>
      </form>

      {searchQuery && (
        <p className="event-meta" aria-live="polite">
          {resultCount} {localeParam === "et" ? "vastet otsingule" : "results for"} “{searchQuery}”
        </p>
      )}

      {results.athletes.length > 0 && (
        <section className="section-block">
          <SectionHeader title={d.athletes} />
          <div className="athlete-strip">
            {results.athletes.slice(0, 8).map((athlete) => (
              <AthleteCard
                athlete={athlete}
                locale={localeParam}
                dictionary={d}
                following={followSets.athleteIds.has(athlete.id)}
                key={athlete.id}
              />
            ))}
          </div>
        </section>
      )}

      {results.teams.length > 0 && (
        <section className="section-block">
          <SectionHeader title={d.teams} />
          <div className="entity-grid">
            {results.teams.slice(0, 8).map((team) => (
              <article className="entity-card" key={team.id}>
                <Link href={`/${localeParam}/teams/${team.slug}`}>
                  <span className="entity-icon">
                    <UsersRound size={19} aria-hidden="true" />
                  </span>
                </Link>
                <div>
                  <Link href={`/${localeParam}/teams/${team.slug}`}>
                    <strong>{team.name}</strong>
                    <small>
                      {team.sportName} · {team.countryCode}
                    </small>
                  </Link>
                </div>
                <FollowButton
                  targetId={team.id}
                  targetType="team"
                  initialFollowing={followSets.teamIds.has(team.id)}
                  followLabel={d.follow}
                  followingLabel={d.following}
                />
              </article>
            ))}
          </div>
        </section>
      )}

      {(results.sports.length > 0 || results.competitions.length > 0) && (
        <section className="section-block">
          <SectionHeader title={d.sports} />
          <div className="entity-grid">
            {results.sports.slice(0, 6).map((sport) => (
              <article className="entity-card" key={sport.id}>
                <Link href={`/${localeParam}/schedule?sport=${sport.slug}`}>
                  <span className="entity-icon">
                    <Activity size={19} aria-hidden="true" />
                  </span>
                </Link>
                <div>
                  <strong>{sport.name}</strong>
                  <small>{d.demoData}</small>
                </div>
                <FollowButton
                  targetId={sport.id}
                  targetType="sport"
                  initialFollowing={followSets.sportIds.has(sport.id)}
                  followLabel={d.follow}
                  followingLabel={d.following}
                />
              </article>
            ))}
            {results.competitions.slice(0, 6).map((competition) => (
              <article className="entity-card" key={competition.id}>
                <Link href={`/${localeParam}/schedule?competition=${competition.slug}`}>
                  <span className="entity-icon">
                    <Trophy size={19} aria-hidden="true" />
                  </span>
                </Link>
                <div>
                  <strong>{competition.name}</strong>
                  <small>{competition.sportName}</small>
                </div>
                <FollowButton
                  targetId={competition.id}
                  targetType="competition"
                  initialFollowing={followSets.competitionIds.has(competition.id)}
                  followLabel={d.follow}
                  followingLabel={d.following}
                />
              </article>
            ))}
          </div>
        </section>
      )}

      {results.events.length > 0 && (
        <section className="section-block">
          <SectionHeader title={d.events} />
          <div className="card-grid">
            {results.events.slice(0, 12).map((event) => (
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

      {resultCount === 0 && (
        <div className="state-panel panel">
          <span className="state-icon">
            <Search aria-hidden="true" />
          </span>
          <h2>{d.noResults}</h2>
          <p>
            {localeParam === "et"
              ? "Proovi nime, ala või võistluse lühemat kuju."
              : "Try a shorter athlete, sport or competition name."}
          </p>
          <Link className="button" href={`/${localeParam}/discover`}>
            {d.clearSearch}
          </Link>
        </div>
      )}
    </div>
  );
}
