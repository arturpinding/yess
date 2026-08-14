import type { PlayerSource, PlayerSourceKind } from "@/player/types";
import type { RightsWindow } from "@/server/rights/resolve-rights";

export type DatabaseStreamProtocol = "webrtc" | "ll_hls" | "hls" | "external";
export type DatabaseStreamState =
  "provisioning" | "ready" | "live" | "degraded" | "ended" | "unavailable";

export interface AuthorizationStream {
  id: string;
  protocol: DatabaseStreamProtocol;
  state: DatabaseStreamState;
  priority: number;
  playbackLocator: string | null;
  externalWatchUrl: string | null;
  provider: string;
  requiresSignedAccess: boolean;
  dvrWindowSeconds: number;
  captionsAvailable: boolean;
  audioTracks: Array<{ id: string; language: string; label: string }>;
}

export interface DatabaseRightsWindow {
  id: string;
  competitionId: string | null;
  eventId: string | null;
  streamId: string | null;
  mediaAssetId: string | null;
  contentKind: "live" | "replay" | "highlight";
  countryCode: string | null;
  access: "free" | "entitled" | "external_only" | "unavailable";
  requiredProductId: string | null;
  startsAt: Date;
  endsAt: Date;
  dvrAllowed: boolean;
  maxConcurrentStreams: number | null;
  externalWatchUrl: string | null;
  rightsHolder: string;
  priority: number;
}

const STREAM_STATE_ORDER: Record<DatabaseStreamState, number> = {
  live: 0,
  ready: 1,
  degraded: 2,
  ended: 3,
  provisioning: 4,
  unavailable: 5,
};

const STREAM_PROTOCOL_ORDER: Record<DatabaseStreamProtocol, number> = {
  webrtc: 0,
  ll_hls: 1,
  hls: 2,
  external: 3,
};

export function playerSourceKind(protocol: DatabaseStreamProtocol): PlayerSourceKind {
  switch (protocol) {
    case "webrtc":
      return "whep";
    case "ll_hls":
      return "ll-hls";
    case "hls":
      return "hls";
    case "external":
      return "external";
  }
}

export function orderAuthorizationStreams(
  streams: readonly AuthorizationStream[],
): AuthorizationStream[] {
  return [...streams].sort((left, right) => {
    const state = STREAM_STATE_ORDER[left.state] - STREAM_STATE_ORDER[right.state];
    if (state !== 0) return state;
    const protocol = STREAM_PROTOCOL_ORDER[left.protocol] - STREAM_PROTOCOL_ORDER[right.protocol];
    if (protocol !== 0) return protocol;
    const priority = left.priority - right.priority;
    return priority !== 0 ? priority : left.id.localeCompare(right.id);
  });
}

/** Maps persistence rows into the pure rights engine without exposing locators. */
export function mapDatabaseRightsWindow(
  row: DatabaseRightsWindow,
  eventId: string,
  eventCompetitionId: string,
  streams: readonly AuthorizationStream[],
  policyVersion: number,
): RightsWindow {
  const orderedStreams = orderAuthorizationStreams(streams);
  const selectedStream = row.streamId
    ? orderedStreams.find((stream) => stream.id === row.streamId)
    : orderedStreams[0];

  const scope = row.competitionId
    ? ({ kind: "competition", competitionId: row.competitionId } as const)
    : ({ kind: "event", eventId } as const);

  let delivery: RightsWindow["delivery"] = { kind: "none" };
  if (row.access === "external_only" && row.externalWatchUrl) {
    delivery = { kind: "external", url: row.externalWatchUrl, label: row.rightsHolder };
  } else if (selectedStream?.protocol === "external" && selectedStream.externalWatchUrl) {
    delivery = {
      kind: "external",
      url: selectedStream.externalWatchUrl,
      label: selectedStream.provider,
    };
  } else if (selectedStream) {
    delivery = { kind: "internal", streamId: selectedStream.id };
  }

  return {
    id: row.id,
    scope: row.competitionId === eventCompetitionId ? scope : { kind: "event", eventId },
    effect: row.access === "unavailable" ? "deny" : "allow",
    territory: row.countryCode
      ? { mode: "include", countryCodes: [row.countryCode] }
      : { mode: "exclude", countryCodes: [] },
    contentTypes: [row.contentKind],
    validFrom: row.startsAt,
    validUntil: row.endsAt,
    priority: row.priority,
    requiresEntitlement: row.access === "entitled",
    acceptedProductIds: row.requiredProductId ? [row.requiredProductId] : undefined,
    maxConcurrentStreams: row.maxConcurrentStreams ?? undefined,
    delivery,
    policyVersion,
  };
}

export function appendPlaybackToken(locator: string, token: string, origin: string): string {
  const normalized = normalizeHttpUrl(locator, origin);
  if (!normalized) throw new RangeError("Playback locator must use HTTP or HTTPS");
  const url = new URL(normalized);
  url.searchParams.set("access_token", token);
  return url.toString();
}

/** Allows only browser-safe network destinations from rights and media metadata. */
export function normalizeHttpUrl(locator: string, origin: string): string | null {
  try {
    const url = new URL(locator, origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function toPlayerSource(stream: AuthorizationStream, url: string): PlayerSource {
  const kind = playerSourceKind(stream.protocol);
  if (kind === "external") {
    return { id: stream.id, kind, url, providerName: stream.provider, priority: stream.priority };
  }
  if (kind === "whep") {
    return { id: stream.id, kind, url, label: stream.provider, priority: stream.priority };
  }
  return {
    id: stream.id,
    kind,
    url,
    label: stream.provider,
    priority: stream.priority,
    mimeType: "application/vnd.apple.mpegurl",
  };
}
