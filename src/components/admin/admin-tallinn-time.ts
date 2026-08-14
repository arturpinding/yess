import { TALLINN_TIME_ZONE, tallinnUtcOffsetMinutes } from "@/domain/tallinn-time";

const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function partsForInstant(instant: string | Date) {
  const parts = new Map(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TALLINN_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: parts.get("year") ?? "",
    month: parts.get("month") ?? "",
    day: parts.get("day") ?? "",
    hour: parts.get("hour") ?? "",
    minute: parts.get("minute") ?? "",
  };
}

export function instantToTallinnInput(instant: string | null): string {
  if (!instant) return "";
  const parts = partsForInstant(instant);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * Converts a wall-clock time in Europe/Tallinn to UTC without using the browser timezone.
 * A nonexistent spring-transition time is rejected. Repeated autumn times resolve to the
 * later occurrence, consistently, so two operators get the same instant.
 */
export function tallinnInputToInstant(input: string): string {
  const match = INPUT_PATTERN.exec(input);
  if (!match) throw new RangeError("invalid_datetime");
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const calendarProbe = new Date(localAsUtc);
  if (
    calendarProbe.getUTCFullYear() !== year ||
    calendarProbe.getUTCMonth() !== month - 1 ||
    calendarProbe.getUTCDate() !== day ||
    calendarProbe.getUTCHours() !== hour ||
    calendarProbe.getUTCMinutes() !== minute
  ) {
    throw new RangeError("invalid_datetime");
  }

  // Try every Estonia offset used in modern civil time. Choosing the latest valid
  // instant makes the repeated autumn hour deterministic.
  const candidates = [120, 180]
    .map((offset) => new Date(localAsUtc - offset * 60_000))
    .filter((candidate) => {
      const parts = partsForInstant(candidate);
      return (
        parts.year === yearText &&
        parts.month === monthText &&
        parts.day === dayText &&
        parts.hour === hourText &&
        parts.minute === minuteText &&
        tallinnUtcOffsetMinutes(candidate) * 60_000 === localAsUtc - candidate.getTime()
      );
    })
    .sort((left, right) => right.getTime() - left.getTime());
  const resolved = candidates[0];
  if (!resolved) throw new RangeError("nonexistent_tallinn_time");
  return resolved.toISOString();
}
