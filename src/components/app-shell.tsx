"use client";

import {
  Bell,
  CalendarDays,
  Compass,
  Eye,
  EyeOff,
  Home,
  Languages,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizePath, type Locale } from "@/i18n/config";
import { usePreferences } from "./preferences-provider";

const navItems = [
  { href: "", label: "navHome", icon: Home },
  { href: "/schedule", label: "navSchedule", icon: CalendarDays },
  { href: "/discover", label: "navDiscover", icon: Compass },
  { href: "/my-sports", label: "navMySports", icon: Sparkles },
  { href: "/notifications", label: "navNotifications", icon: Bell },
] as const;

function isActive(pathname: string, locale: Locale, suffix: string) {
  const destination = `/${locale}${suffix}`;
  return suffix === "" ? pathname === destination : pathname.startsWith(destination);
}

export function AppShell({
  children,
  locale,
  dictionary: d,
}: {
  children: React.ReactNode;
  locale: Locale;
  dictionary: Dictionary;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startPreferenceTransition] = useTransition();
  const { theme, setTheme, spoilerFree, setSpoilerFree } = usePreferences();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    document.documentElement.lang = locale;
    const syncOnline = () => setOnline(navigator.onLine);
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, [locale]);

  const otherLocale: Locale = locale === "et" ? "en" : "et";

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        {d.skipToContent}
      </a>

      <aside
        className="side-rail"
        aria-label={locale === "et" ? "Põhinavigatsioon" : "Primary navigation"}
      >
        <Link className="brand" href={`/${locale}`} aria-label={d.productTagline}>
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>{d.productName}</strong>
            <small>{d.productTagline}</small>
          </span>
        </Link>

        <nav className="primary-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, locale, item.href);
            return (
              <Link
                key={item.href}
                className="nav-link"
                data-active={active}
                aria-current={active ? "page" : undefined}
                href={`/${locale}${item.href}`}
              >
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                <span>{d[item.label]}</span>
              </Link>
            );
          })}
        </nav>

        <div className="rail-footer">
          {process.env.NODE_ENV !== "production" && (
            <Link className="nav-link quiet" href={`/${locale}/admin`}>
              <ShieldCheck size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{d.navAdmin}</span>
              <span className="demo-dot" title={d.demoOnly} />
            </Link>
          )}
          <Link className="profile-chip" href={`/${locale}/settings`}>
            <span className="profile-avatar">
              <UserRound size={17} aria-hidden="true" />
            </span>
            <span>
              <strong>{d.anonymousMode}</strong>
              <small>{d.demoData}</small>
            </span>
            <Settings size={16} aria-hidden="true" />
          </Link>
        </div>
      </aside>

      <div className="app-body">
        {!online && (
          <div className="offline-banner" role="status">
            {d.offline}
          </div>
        )}

        <header className="top-bar">
          <Link className="mobile-brand" href={`/${locale}`} aria-label={d.productTagline}>
            <span className="brand-mark compact" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <strong>{d.productName}</strong>
          </Link>

          <Link className="global-search" href={`/${locale}/discover`}>
            <Search size={18} aria-hidden="true" />
            <span>{d.searchPlaceholder}</span>
            <kbd>/</kbd>
          </Link>

          <div className="top-actions">
            <button
              className="icon-button spoiler-toggle"
              type="button"
              onClick={() => {
                setSpoilerFree(!spoilerFree);
                startPreferenceTransition(() => router.refresh());
              }}
              aria-pressed={spoilerFree}
              aria-label={spoilerFree ? d.spoilerShow : d.spoilerHide}
              title={spoilerFree ? d.spoilerShow : d.spoilerHide}
            >
              {spoilerFree ? <EyeOff size={19} /> : <Eye size={19} />}
              <span className="desktop-only">{spoilerFree ? d.spoilerHidden : d.result}</span>
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? d.lightMode : d.darkMode}
              title={theme === "dark" ? d.lightMode : d.darkMode}
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Link
              className="icon-button language-button"
              href={localizePath(pathname, otherLocale)}
              aria-label={`${d.language}: ${otherLocale.toUpperCase()}`}
              title={d.language}
            >
              <Languages size={18} aria-hidden="true" />
              <span>{otherLocale.toUpperCase()}</span>
            </Link>
          </div>
        </header>

        <main className="page-main" id="main-content">
          {children}
        </main>

        <nav
          className="bottom-nav"
          aria-label={locale === "et" ? "Mobiilinavigatsioon" : "Mobile navigation"}
        >
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, locale, item.href);
            return (
              <Link
                key={item.href}
                href={`/${locale}${item.href}`}
                data-active={active}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                <span>{d[item.label]}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
