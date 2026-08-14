"use client";

import { ExternalLink, LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { SportsPlayer, type PlayerTelemetryEvent, type PlayerSource } from "@/player";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { mutationHeaders } from "./client-security";
import { usePreferences } from "./preferences-provider";

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol));

const sourceSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string(),
    kind: z.literal("whep"),
    url: httpUrlSchema,
    label: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("ll-hls"),
    url: httpUrlSchema,
    label: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("hls"),
    url: httpUrlSchema,
    label: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("external"),
    url: httpUrlSchema,
    label: z.string().optional(),
    providerName: z.string(),
  }),
]);

const responseSchema = z.union([
  z.object({
    allowed: z.literal(true),
    expiresAt: z.string(),
    dvrPermitted: z.boolean(),
    sources: z.array(sourceSchema),
  }),
  z.object({
    allowed: z.literal(false),
    reason: z.string(),
    externalDestination: httpUrlSchema.optional(),
  }),
]);

type AuthorizationResponse = z.infer<typeof responseSchema>;

function errorCopy(reason: string | undefined, locale: Locale) {
  const messages: Record<string, [string, string]> = {
    "no-rights": [
      "Selles piirkonnas puudub vaatamisõigus.",
      "Viewing rights are unavailable in this region.",
    ],
    "rights-denied": [
      "Selle sisu vaatamine pole lubatud.",
      "This content is not available to watch.",
    ],
    "entitlement-required": [
      "Vaatamiseks on vaja sobivat paketti.",
      "An eligible pass or plan is required.",
    ],
    "concurrency-limit": [
      "Liiga palju samaaegseid vaatamisi.",
      "The concurrent stream limit has been reached.",
    ],
    "conflicting-rights": [
      "Õiguste andmed vajavad kontrolli.",
      "Rights data needs operator review.",
    ],
    unauthorized: [
      "Vaatamisseanss aegus. Proovi uuesti.",
      "The viewing session expired. Try again.",
    ],
  };
  return (
    messages[reason ?? ""]?.[locale === "et" ? 0 : 1] ??
    (locale === "et" ? "Voogu ei õnnestunud avada." : "The stream could not be opened.")
  );
}

export function AuthorizedPlayer({
  eventId,
  title,
  competition,
  statusLabel,
  startTimeLabel,
  locale,
  dictionary: d,
  isLive,
}: {
  eventId: string;
  title: string;
  competition: string;
  statusLabel: string;
  startTimeLabel: string;
  locale: Locale;
  dictionary: Dictionary;
  isLive: boolean;
}) {
  const { dataSaver } = usePreferences();
  const [authorization, setAuthorization] = useState<AuthorizationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string>();
  const telemetryCounter = useRef(0);

  const authorize = useCallback(async () => {
    setLoading(true);
    setFailure(undefined);
    try {
      const requestAuthorization = () =>
        fetch(`/api/v1/events/${eventId}/playback-authorizations`, {
          method: "POST",
          headers: mutationHeaders(),
          body: JSON.stringify({ contentType: isLive ? "live" : "replay" }),
        });

      let response = await requestAuthorization();
      if (response.status === 401) {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        response = await requestAuthorization();
      }
      const body: unknown = await response.json();
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success) throw new Error("invalid_authorization_response");
      setAuthorization(parsed.data);
      if (!parsed.data.allowed) setFailure(parsed.data.reason);
    } catch {
      setFailure("unavailable");
    } finally {
      setLoading(false);
    }
  }, [eventId, isLive]);

  useEffect(() => {
    const timer = window.setTimeout(() => void authorize(), 0);
    return () => window.clearTimeout(timer);
  }, [authorize]);

  useEffect(() => {
    if (!authorization?.allowed) return;
    let released = false;
    const releasePlaybackLease = () => {
      if (released) return;
      released = true;
      void fetch("/api/v1/playback-telemetry", {
        method: "POST",
        headers: mutationHeaders(),
        body: JSON.stringify({
          type: "playback_ended",
          at: new Date().toISOString(),
          eventId,
        }),
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", releasePlaybackLease);
    return () => window.removeEventListener("pagehide", releasePlaybackLease);
  }, [authorization, eventId]);

  const sendTelemetry = useCallback((event: PlayerTelemetryEvent) => {
    telemetryCounter.current += 1;
    if (event.type === "metrics" && telemetryCounter.current % 4 !== 0) return;
    void fetch("/api/v1/playback-telemetry", {
      method: "POST",
      headers: mutationHeaders(),
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  if (loading) {
    return (
      <div className="player-gate loading" aria-busy="true">
        <LoaderCircle className="spin" size={28} aria-hidden="true" />
        <strong>
          {locale === "et" ? "Kontrollime vaatamisõigust…" : "Checking viewing rights…"}
        </strong>
        <small>{d.rightsChecked}</small>
      </div>
    );
  }

  if (!authorization?.allowed) {
    return (
      <div className="player-gate" role="status">
        <span className="state-icon">
          <LockKeyhole aria-hidden="true" />
        </span>
        <h2>{d.streamUnavailable}</h2>
        <p>{errorCopy(failure, locale)}</p>
        <div className="inline-actions">
          <button className="button" type="button" onClick={() => void authorize()}>
            <RefreshCw size={16} aria-hidden="true" /> {d.retry}
          </button>
          {authorization?.externalDestination && (
            <a
              className="button primary"
              href={authorization.externalDestination}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} aria-hidden="true" /> {d.watchPartner}
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <SportsPlayer
      context={{ eventId, title, competition, statusLabel, startTimeLabel }}
      sources={authorization.sources as PlayerSource[]}
      locale={locale}
      isLive={isLive}
      dvrPermitted={authorization.dvrPermitted}
      dataSaverDefault={dataSaver}
      onTelemetry={sendTelemetry}
    />
  );
}
