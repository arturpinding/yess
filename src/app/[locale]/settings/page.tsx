import { Database, KeyRound, LockKeyhole, Shield, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { SettingsControls } from "@/components/settings-controls";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getServerViewerContext } from "@/server/auth/server-viewer-context";
import { personalizationProfileId } from "@/server/auth/viewer-context";
import { getGlobalNotificationMode } from "@/server/data/catalog";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();
  const d = getDictionary(localeParam);
  const viewer = await getServerViewerContext();
  const globalNotificationMode = await getGlobalNotificationMode(personalizationProfileId(viewer));

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{d.profile}</p>
          <h1>{d.profileSettings}</h1>
          <p>{d.anonymousHelp}</p>
        </div>
      </header>

      <div className="settings-grid">
        <section className="panel">
          <header className="panel-header">
            <h2>
              {d.playback} · {d.accessibility}
            </h2>
            <p>
              {localeParam === "et"
                ? "Need valikud töötavad selles seadmes."
                : "These preferences work on this device."}
            </p>
          </header>
          <div className="panel-body">
            <SettingsControls
              dictionary={d}
              initialGlobalNotificationMode={globalNotificationMode}
            />
          </div>
        </section>

        <aside className="panel">
          <header className="panel-header">
            <h2>{d.account}</h2>
            <p>{d.anonymousMode}</p>
          </header>
          <div className="panel-body account-card">
            <span className="state-icon">
              <UserRound aria-hidden="true" />
            </span>
            <strong>{d.anonymousMode}</strong>
            <p className="event-meta">{d.anonymousHelp}</p>
            <button
              className="button primary"
              type="button"
              disabled
              title="Requires production identity provider"
            >
              <KeyRound size={16} aria-hidden="true" /> {d.createAccount}
            </button>
            <small>
              {localeParam === "et"
                ? "Konto loomine vajab tootmise identiteediteenust; näidis ei teeskle registreerimist."
                : "Account creation requires a production identity provider; the demo does not simulate registration."}
            </small>
          </div>
        </aside>
      </div>

      <section className="panel">
        <header className="panel-header">
          <h2>{d.privacy}</h2>
          <p>GDPR · EU</p>
        </header>
        <div className="panel-body">
          <div className="setting-row">
            <span>
              <strong>{d.exportData}</strong>
              <small>
                {localeParam === "et"
                  ? "Kontoandmed masinloetavas vormingus."
                  : "Account data in a machine-readable format."}
              </small>
            </span>
            <button
              className="button"
              type="button"
              disabled
              title="Available after account sign-in"
            >
              <Database size={15} aria-hidden="true" /> {d.exportData}
            </button>
          </div>
          <div className="setting-row">
            <span>
              <strong>{d.manageDevices}</strong>
              <small>
                {localeParam === "et"
                  ? "Aktiivsete seansside vaatamine ja tühistamine."
                  : "View and revoke active sessions."}
              </small>
            </span>
            <span className="content-badge">
              <LockKeyhole size={13} aria-hidden="true" /> 1
            </span>
          </div>
          <div className="setting-row">
            <span>
              <strong>{d.parentalControls}</strong>
              <small>
                {localeParam === "et"
                  ? "Andmemudel toetab lapseprofiili vanusepiiri ja PIN-i."
                  : "The data model supports child-profile age limits and PINs."}
              </small>
            </span>
            <span className="content-badge">
              <Shield size={13} aria-hidden="true" /> 18
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
