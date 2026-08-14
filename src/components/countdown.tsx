"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import { formatDurationToStart } from "@/i18n/format";

export function Countdown({
  startAt,
  locale,
  label,
}: {
  startAt: string;
  locale: Locale;
  label: string;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (new Date(startAt).getTime() <= now.getTime()) return null;
  return (
    <span className="countdown" role="timer">
      <small>{label}</small>
      <strong>{formatDurationToStart(startAt, locale, now)}</strong>
    </span>
  );
}
