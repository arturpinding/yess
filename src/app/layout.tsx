import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN ?? "http://localhost:3000"),
  title: {
    default: "RADA — Eesti sport ühes vaates",
    template: "%s · RADA",
  },
  description:
    "Leia Eesti sportlaste võistlused, kontrollitud vaatamiskohad, otseülekanded ja järelvaatamine ühest rahulikust vaatest.",
  applicationName: "RADA",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1112" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const locale = requestHeaders.get("x-rada-locale") === "en" ? "en" : "et";
  const theme = cookieStore.get("rada-theme")?.value === "light" ? "light" : "dark";
  const spoilers = cookieStore.get("rada-spoilers")?.value === "hide" ? "hidden" : "visible";
  return (
    <html
      lang={locale}
      data-theme={theme}
      data-spoilers={spoilers}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
