export const TALLINN_TIME_ZONE = "Europe/Tallinn";

export type SupportedLocale = "et" | "en";

const localeTags: Readonly<Record<SupportedLocale, string>> = {
  et: "et-EE",
  en: "en-EE",
};

interface TallinnDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function requireValidDate(value: Date | string | number): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Expected a valid instant");
  }
  return date;
}

function tallinnParts(value: Date | string | number): TallinnDateParts {
  const date = requireValidDate(value);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TALLINN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  const hour = parts.get("hour");
  const minute = parts.get("minute");
  const second = parts.get("second");

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    throw new RangeError("Unable to derive Tallinn date parts");
  }

  return { year, month, day, hour, minute, second };
}

export function tallinnDateKey(value: Date | string | number): string {
  const { year, month, day } = tallinnParts(value);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function tallinnUtcOffsetMinutes(value: Date | string | number): number {
  const date = requireValidDate(value);
  const { year, month, day, hour, minute, second } = tallinnParts(date);
  const representedAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const instantWithoutMilliseconds = Math.trunc(date.getTime() / 1_000) * 1_000;
  return (representedAsUtc - instantWithoutMilliseconds) / 60_000;
}

function localMidnightToUtc(year: number, month: number, day: number): Date {
  const localAsUtc = Date.UTC(year, month - 1, day);
  let candidate = localAsUtc;

  // Midnight is not in Estonia's DST transition gap. Iterating also keeps this
  // correct if the offset at the initial UTC guess differs from local midnight.
  for (let index = 0; index < 3; index += 1) {
    const offset = tallinnUtcOffsetMinutes(candidate);
    candidate = localAsUtc - offset * 60_000;
  }

  return new Date(candidate);
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    throw new RangeError("Tallinn date key must use YYYY-MM-DD");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError("Tallinn date key is not a calendar date");
  }

  return { year, month, day };
}

/** Returns the half-open UTC range corresponding to one Tallinn calendar day. */
export function tallinnDayUtcRange(dateKey: string): { start: Date; end: Date } {
  const { year, month, day } = parseDateKey(dateKey);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: localMidnightToUtc(year, month, day),
    end: localMidnightToUtc(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
    ),
  };
}

export function formatTallinnDateTime(
  value: Date | string | number,
  locale: SupportedLocale,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const defaults: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  };
  return new Intl.DateTimeFormat(localeTags[locale], {
    ...defaults,
    ...options,
    timeZone: TALLINN_TIME_ZONE,
  }).format(requireValidDate(value));
}

export function groupByTallinnDate<T>(
  items: readonly T[],
  instant: (item: T) => Date | string | number,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = tallinnDateKey(instant(item));
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}
