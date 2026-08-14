import type { Locale } from "./config";

const languageTags: Record<Locale, string> = { et: "et-EE", en: "en-GB" };
export const TALLINN_TIME_ZONE = "Europe/Tallinn";

export function formatTallinnTime(value: string | Date, locale: Locale) {
  return new Intl.DateTimeFormat(languageTags[locale], {
    timeZone: TALLINN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatTallinnDate(value: string | Date, locale: Locale, weekday = true) {
  return new Intl.DateTimeFormat(languageTags[locale], {
    timeZone: TALLINN_TIME_ZONE,
    weekday: weekday ? "long" : undefined,
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

export function formatTallinnDateTime(value: string | Date, locale: Locale) {
  return new Intl.DateTimeFormat(languageTags[locale], {
    timeZone: TALLINN_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatCompactRelative(value: string | Date, locale: Locale, now = new Date()) {
  const minutes = Math.round((new Date(value).getTime() - now.getTime()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat(languageTags[locale], { numeric: "auto" });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

export function tallinnDayKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TALLINN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatDurationToStart(value: string | Date, locale: Locale, now = new Date()) {
  const totalSeconds = Math.max(0, Math.floor((new Date(value).getTime() - now.getTime()) / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  if (days > 0) return locale === "et" ? `${days} p ${hours} h` : `${days}d ${hours}h`;
  if (hours > 0) return locale === "et" ? `${hours} h ${minutes} min` : `${hours}h ${minutes}m`;
  return locale === "et" ? `${minutes} min` : `${minutes}m`;
}
