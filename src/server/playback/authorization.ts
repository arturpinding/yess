import type { PlayerSource, PlayerSourceKind } from "@/player/types";
import {
  resolveRights,
  type RightsResolution,
  type RightsResolutionContext,
  type RightsWindow,
} from "@/server/rights/resolve-rights";

export type DatabaseStreamProtocol = "webrtc" | "ll_hls" | "hls" | "external";
export type DatabaseStreamState =
  "provisioning" | "ready" | "live" | "degraded" | "ended" | "unavailable";

const PLAYABLE_AUTHORIZATION_STREAM_STATES = new Set<DatabaseStreamState>([
  "ready",
  "live",
  "degraded",
]);

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

/**
 * Only sources that can currently serve media may receive a playback
 * authorization. In particular, an ended source is historical metadata, not
 * an implicit replay source.
 */
export function isPlayableAuthorizationStreamState(state: DatabaseStreamState): boolean {
  return PLAYABLE_AUTHORIZATION_STREAM_STATES.has(state);
}

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
  streams: readonly AuthorizationStream[],
  policyVersion: number,
  candidateStreamId?: string,
): RightsWindow {
  const orderedStreams = orderAuthorizationStreams(streams);
  const selectedStream = row.streamId
    ? orderedStreams.find((stream) => stream.id === row.streamId)
    : candidateStreamId
      ? orderedStreams.find((stream) => stream.id === candidateStreamId)
      : orderedStreams[0];

  const scope: RightsWindow["scope"] = row.streamId
    ? { kind: "stream", streamId: row.streamId }
    : row.competitionId
      ? { kind: "competition", competitionId: row.competitionId }
      : { kind: "event", eventId: row.eventId ?? eventId };

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
    scope,
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

export type PlaybackRightsResolution =
  | (Extract<RightsResolution, { allowed: true }> & {
      /** The candidate whose transport should be authorized; null for source-independent delivery. */
      stream: AuthorizationStream | null;
    })
  | Extract<RightsResolution, { allowed: false }>;

function isUsablePlaybackCandidate(stream: AuthorizationStream): boolean {
  if (!isPlayableAuthorizationStreamState(stream.state)) return false;
  return stream.protocol === "external"
    ? stream.externalWatchUrl !== null
    : stream.playbackLocator !== null;
}

/**
 * Resolves policy against each usable source in deterministic playback order.
 * A source-specific denial does not suppress a lawful fallback source, while
 * event and competition policies are re-applied to every candidate.
 */
export function resolvePlaybackRights(
  rows: readonly DatabaseRightsWindow[],
  streams: readonly AuthorizationStream[],
  context: RightsResolutionContext,
  policyVersion: number,
): PlaybackRightsResolution {
  const orderedStreams = orderAuthorizationStreams(streams);
  const candidates = orderedStreams.filter(isUsablePlaybackCandidate);

  let firstDenial: Extract<RightsResolution, { allowed: false }> | undefined;
  for (const stream of candidates) {
    const resolution = resolveRights(
      rows.map((row) =>
        mapDatabaseRightsWindow(row, context.eventId, streams, policyVersion, stream.id),
      ),
      { ...context, streamId: stream.id },
    );
    if (resolution.allowed) {
      if (resolution.delivery.kind !== "internal" || resolution.delivery.streamId === stream.id) {
        return { ...resolution, stream };
      }
      continue;
    }
    firstDenial ??= resolution;
  }

  // An explicit partner destination remains useful when its associated
  // internal transport has ended. This never revives that ended transport:
  // only the rights row's own external-only destination is accepted here.
  for (const stream of orderedStreams.filter(
    (candidate) => !isUsablePlaybackCandidate(candidate),
  )) {
    const resolution = resolveRights(
      rows.map((row) =>
        mapDatabaseRightsWindow(row, context.eventId, streams, policyVersion, stream.id),
      ),
      { ...context, streamId: stream.id },
    );
    const winningRow = resolution.allowed
      ? rows.find((row) => row.id === resolution.window.id)
      : undefined;
    if (
      resolution.allowed &&
      resolution.delivery.kind === "external" &&
      winningRow?.access === "external_only"
    ) {
      return { ...resolution, stream: null };
    }
  }

  if (candidates.length === 0) {
    const resolution = resolveRights(
      rows.map((row) => mapDatabaseRightsWindow(row, context.eventId, [], policyVersion)),
      context,
    );
    return resolution.allowed ? { ...resolution, stream: null } : resolution;
  }

  return firstDenial ?? { allowed: false, reason: "no-rights" };
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
