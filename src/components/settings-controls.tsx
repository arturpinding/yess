"use client";

import { Eye, Gauge, Moon, Sun } from "lucide-react";
import type { NotificationMode } from "@/domain/notification-preferences";
import type { Dictionary } from "@/i18n/dictionaries";
import { NotificationControl } from "./notification-control";
import { usePreferences } from "./preferences-provider";

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      className="switch"
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
    />
  );
}

export function SettingsControls({
  dictionary: d,
  initialGlobalNotificationMode,
}: {
  dictionary: Dictionary;
  initialGlobalNotificationMode: NotificationMode;
}) {
  const { theme, setTheme, spoilerFree, setSpoilerFree, dataSaver, setDataSaver } =
    usePreferences();
  return (
    <div>
      <div className="setting-row">
        <span>
          <strong>{d.notifications}</strong>
          <small>{d.notificationDefaultHelp}</small>
        </span>
        <NotificationControl
          targetType="global"
          dictionary={d}
          initialMode={initialGlobalNotificationMode}
        />
      </div>
      <div className="setting-row">
        <span>
          <strong>{d.theme}</strong>
          <small>{theme === "dark" ? d.darkMode : d.lightMode}</small>
        </span>
        <button
          className="icon-button"
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? d.lightMode : d.darkMode}
        >
          {theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
      </div>
      <div className="setting-row">
        <span>
          <strong>{d.spoilerHide}</strong>
          <small>{d.spoilerHidden}</small>
        </span>
        <Toggle
          checked={spoilerFree}
          onChange={() => {
            setSpoilerFree(!spoilerFree);
            window.location.reload();
          }}
          label={d.spoilerHide}
        />
      </div>
      <div className="setting-row">
        <span>
          <strong>{d.reducedData}</strong>
          <small>{d.dataSaver}</small>
        </span>
        <Toggle
          checked={dataSaver}
          onChange={() => setDataSaver(!dataSaver)}
          label={d.reducedData}
        />
      </div>
      <div className="setting-row">
        <span>
          <strong>{d.accessibility}</strong>
          <small>
            WCAG 2.2 AA · {d.captions} · {d.audio}
          </small>
        </span>
        <span className="content-badge">
          <Eye size={13} aria-hidden="true" /> AA
        </span>
      </div>
      <div className="setting-row">
        <span>
          <strong>{d.playback}</strong>
          <small>{d.privacyTelemetry}</small>
        </span>
        <span className="content-badge">
          <Gauge size={13} aria-hidden="true" /> {d.automatic}
        </span>
      </div>
    </div>
  );
}
