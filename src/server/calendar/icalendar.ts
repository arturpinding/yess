const UTF8_ENCODER = new TextEncoder();

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  startsAt: Date;
  endsAt: Date;
  updatedAt: Date;
  sequence: number;
  cancelled: boolean;
}

export interface CalendarDocument {
  name: string;
  description: string;
  events: readonly CalendarEvent[];
  domain?: string;
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function formatIcsUtc(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError("Calendar date must be valid");
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** RFC 5545 content lines are limited to 75 UTF-8 octets, including a fold marker. */
export function foldIcsLine(line: string): string {
  const lines: string[] = [];
  let current = "";
  let limit = 75;

  for (const character of line) {
    const candidate = `${current}${character}`;
    if (UTF8_ENCODER.encode(candidate).byteLength > limit && current.length > 0) {
      lines.push(current);
      current = character;
      limit = 74;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines.join("\r\n ");
}

function safeDomain(value: string | undefined): string {
  if (!value) return "rada.local";
  const normalized = value.toLowerCase().replace(/[^a-z0-9.-]/g, "");
  return normalized || "rada.local";
}

export function serializeCalendar(document: CalendarDocument): string {
  const domain = safeDomain(document.domain);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RADA//Personal Sports Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(document.name)}`,
    `X-WR-CALDESC:${escapeIcsText(document.description)}`,
    "X-WR-TIMEZONE:Europe/Tallinn",
  ];

  for (const event of document.events) {
    if (event.endsAt.getTime() <= event.startsAt.getTime()) {
      throw new RangeError("Calendar event must end after it starts");
    }
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@${domain}`,
      `DTSTAMP:${formatIcsUtc(event.updatedAt)}`,
      `LAST-MODIFIED:${formatIcsUtc(event.updatedAt)}`,
      `DTSTART:${formatIcsUtc(event.startsAt)}`,
      `DTEND:${formatIcsUtc(event.endsAt)}`,
      `SEQUENCE:${Math.max(0, Math.trunc(event.sequence))}`,
      `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
