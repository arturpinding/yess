import type { HlsPlayerSource, PlayerQuality, PlayerSource, PlayerSourceKind } from "./types";

const KIND_ORDER: Readonly<Record<PlayerSourceKind, number>> = {
  whep: 0,
  "ll-hls": 1,
  hls: 2,
  external: 3,
};

export type PlaybackPlanReason =
  "ready" | "whep_not_configured" | "hls_not_supported" | "external_destination";

export interface PlaybackCapabilities {
  whepConfigured: boolean;
  nativeHls: boolean;
  hlsJs: boolean;
}

export interface PlaybackPlanEntry {
  source: PlayerSource;
  playableInline: boolean;
  reason: PlaybackPlanReason;
}

export interface DataSaverLimit {
  maxHeight: number;
  maxBitrate?: number;
}

export function orderPlayerSources(sources: readonly PlayerSource[]): PlayerSource[] {
  return sources
    .map((source, originalIndex) => ({ source, originalIndex }))
    .sort((a, b) => {
      const kindDifference = KIND_ORDER[a.source.kind] - KIND_ORDER[b.source.kind];
      if (kindDifference !== 0) return kindDifference;

      const priorityDifference = (a.source.priority ?? 100) - (b.source.priority ?? 100);
      return priorityDifference || a.originalIndex - b.originalIndex;
    })
    .map(({ source }) => source);
}

export function createPlaybackPlan(
  sources: readonly PlayerSource[],
  capabilities: PlaybackCapabilities,
): PlaybackPlanEntry[] {
  return orderPlayerSources(sources).map((source) => {
    if (source.kind === "whep") {
      return {
        source,
        playableInline: capabilities.whepConfigured,
        reason: capabilities.whepConfigured ? ("ready" as const) : ("whep_not_configured" as const),
      };
    }

    if (source.kind === "external") {
      return {
        source,
        playableInline: false,
        reason: "external_destination" as const,
      };
    }

    const hlsAvailable = capabilities.nativeHls || capabilities.hlsJs;
    return {
      source,
      playableInline: hlsAvailable,
      reason: hlsAvailable ? ("ready" as const) : ("hls_not_supported" as const),
    };
  });
}

export function isHlsSource(source: PlayerSource): source is HlsPlayerSource {
  return source.kind === "ll-hls" || source.kind === "hls";
}

export function getHlsUrl(source: HlsPlayerSource, dataSaverEnabled: boolean): string {
  return dataSaverEnabled && source.dataSaverUrl ? source.dataSaverUrl : source.url;
}

/** Returns the hls.js level index that should be the hard automatic cap. */
export function findDataSaverCap(
  levels: readonly Pick<PlayerQuality, "id" | "height" | "bitrate">[],
  limit: DataSaverLimit,
): number {
  if (levels.length === 0) return -1;

  const eligible = levels.filter((level) => {
    const withinHeight = level.height === undefined || level.height <= limit.maxHeight;
    const withinBitrate =
      limit.maxBitrate === undefined ||
      level.bitrate === undefined ||
      level.bitrate <= limit.maxBitrate;
    return withinHeight && withinBitrate;
  });

  if (eligible.length === 0) {
    return [...levels].sort((a, b) => {
      const heightDifference =
        (a.height ?? Number.MAX_SAFE_INTEGER) - (b.height ?? Number.MAX_SAFE_INTEGER);
      return (
        heightDifference ||
        (a.bitrate ?? Number.MAX_SAFE_INTEGER) - (b.bitrate ?? Number.MAX_SAFE_INTEGER)
      );
    })[0]!.id;
  }

  return [...eligible].sort((a, b) => {
    const heightDifference = (b.height ?? 0) - (a.height ?? 0);
    return heightDifference || (b.bitrate ?? 0) - (a.bitrate ?? 0);
  })[0]!.id;
}

export function qualityLabel(quality: Pick<PlayerQuality, "height" | "bitrate">): string {
  if (quality.height) return `${quality.height}p`;
  if (quality.bitrate) return `${Math.round(quality.bitrate / 1_000)} kbps`;
  return "Quality";
}
