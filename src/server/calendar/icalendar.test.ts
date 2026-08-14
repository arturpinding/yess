import { describe, expect, it } from "vitest";
import { escapeIcsText, foldIcsLine, serializeCalendar } from "./icalendar";

describe("iCalendar serialization", () => {
  it("escapes text without allowing content-line injection", () => {
    expect(escapeIcsText("Tartu, Eesti; A\r\nB\\C")).toBe("Tartu\\, Eesti\\; A\\nB\\\\C");
  });

  it("folds every physical line to at most 75 UTF-8 octets", () => {
    const folded = foldIcsLine(`SUMMARY:${"Õhtune võistlus · ".repeat(12)}`);
    const physicalLines = folded.split("\r\n");
    expect(physicalLines.length).toBeGreaterThan(1);
    for (const line of physicalLines) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    expect(physicalLines.slice(1).every((line) => line.startsWith(" "))).toBe(true);
  });

  it("writes UTC event boundaries and stable calendar metadata", () => {
    const calendar = serializeCalendar({
      name: "Minu sport",
      description: "Isiklik kava",
      domain: "watch.rada.ee",
      events: [
        {
          id: "70000000-0000-4000-8000-000000000001",
          title: "Finaal, Tartu",
          startsAt: new Date("2026-10-25T01:30:00.000Z"),
          endsAt: new Date("2026-10-25T03:30:00.000Z"),
          updatedAt: new Date("2026-08-14T09:15:30.123Z"),
          sequence: 3,
          cancelled: false,
        },
      ],
    });

    expect(calendar).toContain("DTSTART:20261025T013000Z\r\n");
    expect(calendar).toContain("DTEND:20261025T033000Z\r\n");
    expect(calendar).toContain("UID:70000000-0000-4000-8000-000000000001@watch.rada.ee\r\n");
    expect(calendar).toContain("SUMMARY:Finaal\\, Tartu\r\n");
    expect(calendar.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
