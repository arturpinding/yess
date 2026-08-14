import { CalendarRange, ChevronLeft, ChevronRight, Clock3, Info } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScheduleList } from "@/components/schedule-list";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { formatTallinnDate, tallinnDayKey } from "@/i18n/format";
import { getEventsBetween } from "@/server/data/catalog";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

interface ScheduleQuery {
  status?: string;
  page?: string;
  sport?: string;
  competition?: string;
}

function scheduleHref(locale: string, query: ScheduleQuery) {
  const parameters = new URLSearchParams();
  if (query.status && query.status !== "all") parameters.set("status", query.status);
  if (query.page && query.page !== "1") parameters.set("page", query.page);
  if (query.sport) parameters.set("sport", query.sport);
  if (query.competition) parameters.set("competition", query.competition);
  const serialized = parameters.toString();
  return `/${locale}/schedule${serialized ? `?${serialized}` : ""}`;
}

function scheduleWindow() {
  const now = new Date();
  return {
    from: new Date(now.getTime() - 7 * 86_400_000),
    to: new Date(now.getTime() + 90 * 86_400_000),
  };
}

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ScheduleQuery>;
}) {
  const [{ locale: localeParam }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(localeParam)) notFound();
  const d = getDictionary(localeParam);
  const cookieStore = await cookies();
  const spoilerFree = cookieStore.get("rada-spoilers")?.value === "hide";
  const status = ["all", "live", "upcoming", "replay"].includes(query.status ?? "")
    ? (query.status ?? "all")
    : "all";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const { from, to } = scheduleWindow();
  const allEvents = await getEventsBetween(from, to, localeParam, { limit: 300 });
  const filtered = allEvents.filter((event) => {
    if (query.sport && event.sportSlug !== query.sport) return false;
    if (query.competition && event.competitionSlug !== query.competition) return false;
    if (status === "live") return ["live", "paused"].includes(event.status);
    if (status === "upcoming") return ["scheduled", "delayed"].includes(event.status);
    if (status === "replay") {
      return event.contentKinds.includes("replay") || event.contentKinds.includes("highlight");
    }
    return true;
  });
  const pageEvents = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const grouped = new Map<string, typeof pageEvents>();
  for (const event of pageEvents) {
    const key = tallinnDayKey(event.startAt);
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }

  const tabs = [
    { id: "all", label: d.all },
    { id: "live", label: d.liveNow },
    { id: "upcoming", label: d.startingSoon },
    { id: "replay", label: d.replay },
  ];

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{d.localTime} · Europe/Tallinn</p>
          <h1>{d.fullSchedule}</h1>
          <p>
            {localeParam === "et"
              ? "Otse, peagi algavad sündmused, järelvaatamine ja tipphetked ühes ajavööndikindlas kavas."
              : "Live, upcoming, replay and highlights in one timezone-safe schedule."}
          </p>
        </div>
        <span className="button subtle">
          <Clock3 size={16} aria-hidden="true" />
          {Intl.DateTimeFormat(localeParam === "et" ? "et-EE" : "en-GB", {
            timeZone: "Europe/Tallinn",
            timeZoneName: "short",
          })
            .formatToParts(new Date())
            .find((part) => part.type === "timeZoneName")?.value ?? "EET"}
        </span>
      </header>

      <div className="demo-banner" role="note">
        <Info size={15} aria-hidden="true" />
        {d.demoNotice}
      </div>

      <div className="tabs" role="tablist" aria-label={d.filters}>
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            className="tab"
            role="tab"
            aria-selected={status === tab.id}
            data-active={status === tab.id}
            href={scheduleHref(localeParam, {
              status: tab.id,
              sport: query.sport,
              competition: query.competition,
            })}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {pageEvents.length ? (
        [...grouped.entries()].map(([day, events]) => (
          <section className="section-block" key={day}>
            <header className="section-header">
              <div>
                <p className="eyebrow">{day}</p>
                <h2>{formatTallinnDate(events[0]!.startAt, localeParam)}</h2>
              </div>
              <span className="content-badge">
                {events.length} {localeParam === "et" ? "sündmust" : "events"}
              </span>
            </header>
            <ScheduleList
              events={events}
              locale={localeParam}
              dictionary={d}
              spoilerFree={spoilerFree}
            />
          </section>
        ))
      ) : (
        <div className="state-panel panel">
          <span className="state-icon">
            <CalendarRange aria-hidden="true" />
          </span>
          <h2>
            {localeParam === "et" ? "Selles vaates sündmusi ei ole" : "No events in this view"}
          </h2>
          <p>{localeParam === "et" ? "Vali teine filter." : "Choose another filter."}</p>
        </div>
      )}

      {pages > 1 && (
        <nav className="section-header" aria-label={localeParam === "et" ? "Leheküljed" : "Pages"}>
          <Link
            className="button"
            aria-disabled={page <= 1}
            href={scheduleHref(localeParam, {
              status,
              page: String(Math.max(1, page - 1)),
              sport: query.sport,
              competition: query.competition,
            })}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            {localeParam === "et" ? "Eelmine" : "Previous"}
          </Link>
          <span className="event-meta">
            {page} / {pages}
          </span>
          <Link
            className="button"
            aria-disabled={page >= pages}
            href={scheduleHref(localeParam, {
              status,
              page: String(Math.min(pages, page + 1)),
              sport: query.sport,
              competition: query.competition,
            })}
          >
            {localeParam === "et" ? "Järgmine" : "Next"}
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </nav>
      )}
    </div>
  );
}
