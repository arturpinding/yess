import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PreferencesProvider } from "@/components/preferences-provider";
import { SessionBootstrap } from "@/components/session-bootstrap";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { isDemoBroadcastAvailable } from "@/server/demo-broadcast/availability";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();

  const cookieStore = await cookies();
  const initialTheme =
    cookieStore.get("rada-theme")?.value === "light"
      ? "light"
      : cookieStore.get("rada-theme")?.value === "dark"
        ? "dark"
        : "dark";
  const initialSpoilerFree = cookieStore.get("rada-spoilers")?.value === "hide";
  const initialDataSaver = cookieStore.get("rada-data-saver")?.value === "on";
  const dictionary = getDictionary(localeParam);

  return (
    <PreferencesProvider
      initialTheme={initialTheme}
      initialSpoilerFree={initialSpoilerFree}
      initialDataSaver={initialDataSaver}
    >
      <SessionBootstrap />
      <AppShell
        locale={localeParam}
        dictionary={dictionary}
        broadcastAvailable={isDemoBroadcastAvailable()}
      >
        {children}
      </AppShell>
    </PreferencesProvider>
  );
}
