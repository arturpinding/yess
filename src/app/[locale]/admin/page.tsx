import { FileClock, Info, ShieldCheck, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { AdminControlRoom } from "@/components/admin/admin-control-room";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { formatTallinnDateTime } from "@/i18n/format";
import { getAdminOverview } from "@/server/data/catalog";

export const dynamic = "force-dynamic";

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();
  // The current control room is an operational demo, not a production auth bypass.
  // Production deployments stay fail-closed until operator SSO and role binding are configured.
  if (process.env.NODE_ENV === "production") notFound();
  const d = getDictionary(localeParam);
  const data = await getAdminOverview();

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{d.navAdmin}</p>
          <h1>{d.controlRoom}</h1>
          <p>
            {localeParam === "et"
              ? "Sündmuste, voo seisundi ja toimetusmuudatuste ühine operatiivvaade."
              : "One operational view for events, stream health and editorial changes."}
          </p>
        </div>
        <span className="demo-badge">{d.demoOnly}</span>
      </header>

      <div className="demo-banner" role="alert">
        <Info size={15} aria-hidden="true" />
        {localeParam === "et"
          ? "Siin tehtud muudatused mõjutavad kohalikku näidiskataloogi ja esituse valikut. Tootmise meediaõigusi ega taristut ei ole ühendatud."
          : "Changes here affect the local demo catalogue and playback selection. Production media rights and infrastructure are not connected."}
      </div>

      <section className="metric-grid" aria-label={d.streamHealth}>
        <div className="metric">
          <strong>{data.metrics.activeStreams}</strong>
          <small>{d.liveNow}</small>
        </div>
        <div className="metric">
          <strong>{data.metrics.degradedStreams}</strong>
          <small>{d.healthDegraded}</small>
        </div>
        <div className="metric">
          <strong>{data.metrics.activePlaybacks}</strong>
          <small>{localeParam === "et" ? "Aktiivsed vaatamised" : "Active playbacks"}</small>
        </div>
        <div className="metric">
          <strong>{data.metrics.users}</strong>
          <small>{localeParam === "et" ? "Näidiskasutajad" : "Demo users"}</small>
        </div>
        <div className="metric">
          <strong>{data.metrics.publishedCollections}</strong>
          <small>{d.editorial}</small>
        </div>
      </section>

      <AdminControlRoom
        locale={localeParam}
        initialStreams={data.streams}
        initialEvents={data.events}
        venues={data.venues}
        initialRights={data.rights}
        rightsTargets={data.rightsTargets}
        products={data.products}
        mediaResources={data.mediaResources}
        mediaOperations={data.mediaOperations}
      />

      <section className="panel">
        <header className="panel-header">
          <h2>{d.auditHistory}</h2>
          <p>
            {localeParam === "et"
              ? "Salvestatud ajalugu operatiivsetele muudatustele."
              : "Recorded history of operational changes."}
          </p>
        </header>
        <div className="ops-list">
          {data.audits.length ? (
            data.audits.map((audit) => (
              <div className="ops-row" key={audit.id}>
                <span className="notification-icon">
                  <FileClock size={17} aria-hidden="true" />
                </span>
                <div>
                  <strong>{audit.action}</strong>
                  <small>
                    {audit.entityType} · {audit.reason ?? d.demoData}
                  </small>
                </div>
                <time>{formatTallinnDateTime(audit.occurredAt, localeParam)}</time>
              </div>
            ))
          ) : (
            <div className="panel-body">
              <ShieldCheck size={18} aria-hidden="true" />
              <p className="event-meta">
                {localeParam === "et" ? "Uusi muudatusi pole." : "No recent changes."}
              </p>
            </div>
          )}
        </div>
      </section>

      <footer className="privacy-note">
        <Users size={14} aria-hidden="true" />
        {localeParam === "et"
          ? "Tootmisversioonis on see demovaade suletud, kuni operaatori SSO ja rollipõhine ligipääs on ühendatud."
          : "This demo view is disabled in production until operator SSO and role-based access are connected."}
      </footer>
    </div>
  );
}
