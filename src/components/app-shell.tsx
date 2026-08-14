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
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ComponentPropsWithoutRef, useEffect, useState, useTransition } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizePath, type Locale } from "@/i18n/config";
import { requiresCameraPolicyDocumentNavigation } from "./demo-broadcast/navigation-boundary";
import { usePreferences } from "./preferences-provider";
import broadcastShellStyles from "./demo-broadcast/broadcast-shell.module.css";

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

function ShellLink({
  currentPathname,
  href,
  children,
  ...props
}: ComponentPropsWithoutRef<"a"> & { currentPathname: string; href: string }) {
  if (requiresCameraPolicyDocumentNavigation(currentPathname, href)) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
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
        <ShellLink
          className="brand"
          currentPathname={pathname}
          href={`/${locale}`}
          aria-label={d.productTagline}
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>{d.productName}</strong>
            <small>{d.productTagline}</small>
          </span>
        </ShellLink>

        <nav className="primary-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, locale, item.href);
            return (
              <ShellLink
                key={item.href}
                currentPathname={pathname}
                className="nav-link"
                data-active={active}
                aria-current={active ? "page" : undefined}
                href={`/${locale}${item.href}`}
              >
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                <span>{d[item.label]}</span>
              </ShellLink>
            );
          })}
        </nav>

        <div className="rail-footer">
          {process.env.NODE_ENV !== "production" && (
            <>
              <ShellLink
                className="nav-link quiet"
                currentPathname={pathname}
                href={`/${locale}/broadcast`}
              >
                <Radio size={18} strokeWidth={1.8} aria-hidden="true" />
                <span>{d.navBroadcast}</span>
                <span className="demo-dot" title={d.demoOnly} />
              </ShellLink>
              <ShellLink
                className="nav-link quiet"
                currentPathname={pathname}
                href={`/${locale}/admin`}
              >
                <ShieldCheck size={18} strokeWidth={1.8} aria-hidden="true" />
                <span>{d.navAdmin}</span>
                <span className="demo-dot" title={d.demoOnly} />
              </ShellLink>
            </>
          )}
          <ShellLink
            className="profile-chip"
            currentPathname={pathname}
            href={`/${locale}/settings`}
          >
            <span className="profile-avatar">
              <UserRound size={17} aria-hidden="true" />
            </span>
            <span>
              <strong>{d.anonymousMode}</strong>
              <small>{d.demoData}</small>
            </span>
            <Settings size={16} aria-hidden="true" />
          </ShellLink>
        </div>
      </aside>

      <div className="app-body">
        {!online && (
          <div className="offline-banner" role="status">
            {d.offline}
          </div>
        )}

        <header className="top-bar">
          <ShellLink
            className="mobile-brand"
            currentPathname={pathname}
            href={`/${locale}`}
            aria-label={d.productTagline}
          >
            <span className="brand-mark compact" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <strong>{d.productName}</strong>
          </ShellLink>

          <ShellLink
            className="global-search"
            currentPathname={pathname}
            href={`/${locale}/discover`}
          >
            <Search size={18} aria-hidden="true" />
            <span>{d.searchPlaceholder}</span>
            <kbd>/</kbd>
          </ShellLink>

          <div className="top-actions">
            {process.env.NODE_ENV !== "production" && (
              <>
                <ShellLink
                  className="icon-button mobile-admin-link"
                  currentPathname={pathname}
                  href={`/${locale}/broadcast`}
                  aria-label={d.navBroadcast}
                  title={d.navBroadcast}
                >
                  <Radio size={18} aria-hidden="true" />
                </ShellLink>
                <ShellLink
                  className={`icon-button mobile-admin-link ${broadcastShellStyles.mobileAdmin}`}
                  currentPathname={pathname}
                  href={`/${locale}/admin`}
                  aria-label={d.controlRoom}
                  title={d.controlRoom}
                >
                  <ShieldCheck size={18} aria-hidden="true" />
                </ShellLink>
              </>
            )}
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
            <ShellLink
              className="icon-button language-button"
              currentPathname={pathname}
              href={localizePath(pathname, otherLocale)}
              aria-label={`${d.language}: ${otherLocale.toUpperCase()}`}
              title={d.language}
            >
              <Languages size={18} aria-hidden="true" />
              <span>{otherLocale.toUpperCase()}</span>
            </ShellLink>
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
              <ShellLink
                key={item.href}
                currentPathname={pathname}
                href={`/${locale}${item.href}`}
                data-active={active}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                <span>{d[item.label]}</span>
              </ShellLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
