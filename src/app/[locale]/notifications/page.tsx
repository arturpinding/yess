import { Bell, BellRing, CalendarClock, Info, Sparkles } from "lucide-react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { MarkNotificationsRead } from "@/components/mark-notifications-read";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { formatTallinnDateTime } from "@/i18n/format";
import { getNotificationInbox } from "@/server/data/catalog";
import { getServerViewerContext } from "@/server/auth/server-viewer-context";
import { personalizationProfileId } from "@/server/auth/viewer-context";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();
  const d = getDictionary(localeParam);
  const [cookieStore, viewer] = await Promise.all([cookies(), getServerViewerContext()]);
  const spoilerFree = cookieStore.get("rada-spoilers")?.value === "hide";
  const inbox = await getNotificationInbox(personalizationProfileId(viewer), spoilerFree);

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{d.notifications}</p>
          <h1>{d.notificationInbox}</h1>
          <p>
            {localeParam === "et"
              ? "Algusajad, muudatused ja tipphetked ilma korduste ja soovimatute tulemusteta."
              : "Start times, changes and highlights without duplicates or unwanted results."}
          </p>
        </div>
        <MarkNotificationsRead label={d.markAllRead} />
      </header>

      <div className="demo-banner">
        <Info size={15} aria-hidden="true" /> {d.demoNotice}
      </div>

      <div className="notification-list">
        {inbox.length ? (
          inbox.map((notification) => (
            <article
              className="notification-item"
              data-read={Boolean(notification.readAt)}
              key={notification.id}
            >
              <span className="notification-icon">
                {notification.kind === "highlight_available" ? (
                  <Sparkles size={18} aria-hidden="true" />
                ) : notification.kind === "schedule_changed" ? (
                  <CalendarClock size={18} aria-hidden="true" />
                ) : (
                  <BellRing size={18} aria-hidden="true" />
                )}
              </span>
              <div>
                <strong>{notification.title}</strong>
                <p>{notification.body}</p>
                <small>
                  {formatTallinnDateTime(
                    notification.sentAt ?? notification.scheduledFor,
                    localeParam,
                  )}
                </small>
              </div>
              {!notification.readAt && <span className="unread-dot" aria-label={d.notifications} />}
            </article>
          ))
        ) : (
          <div className="state-panel panel">
            <span className="state-icon">
              <Bell aria-hidden="true" />
            </span>
            <h2>{d.noNotifications}</h2>
            <p>
              {localeParam === "et"
                ? "Anname märku, kui midagi muutub."
                : "We will let you know when something changes."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
