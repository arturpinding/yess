export type PlayerSourceKind = "whep" | "ll-hls" | "hls" | "external";

interface BasePlayerSource {
  /** Stable catalogue identifier. It is safe to include in operational telemetry. */
  id: string;
  kind: PlayerSourceKind;
  label?: string;
  /** Lower values are attempted first within the same source kind. */
  priority?: number;
}

export interface WhepPlayerSource extends BasePlayerSource {
  kind: "whep";
  url: string;
}

export interface HlsPlayerSource extends BasePlayerSource {
  kind: "ll-hls" | "hls";
  url: string;
  mimeType?: "application/vnd.apple.mpegurl" | "application/x-mpegURL";
  /**
   * Optional server-generated capped playlist for browsers using native HLS,
   * where JavaScript cannot reliably cap the adaptive rendition.
   */
  dataSaverUrl?: string;
}

export interface ExternalPlayerSource extends BasePlayerSource {
  kind: "external";
  url: string;
  providerName: string;
}

export type PlayerSource = WhepPlayerSource | HlsPlayerSource | ExternalPlayerSource;

export interface WhepSession {
  stream: MediaStream;
  close: () => void | Promise<void>;
}

/**
 * WHEP transport is deliberately injectable. Production deployments normally
 * need vendor-specific auth, ICE configuration, and request signing. The
 * player never logs the endpoint or credentials.
 */
export type WhepConnector = (source: WhepPlayerSource, signal: AbortSignal) => Promise<WhepSession>;

export interface PlayerQuality {
  id: number;
  height?: number;
  width?: number;
  bitrate?: number;
  label: string;
}

export interface PlayerTrack {
  id: number;
  label: string;
  language?: string;
}

export interface PlayerMetrics {
  /** Seconds of media buffered ahead of the current playhead. */
  bufferSeconds: number;
  /** Estimated distance from the live edge. Not glass-to-glass latency. */
  liveEdgeSeconds: number | null;
  droppedFrames: number | null;
  totalFrames: number | null;
}

export type PlayerTelemetryEventType =
  | "source_attempt"
  | "source_skipped"
  | "source_fallback"
  | "playback_ready"
  | "playback_started"
  | "playback_paused"
  | "playback_ended"
  | "playback_recovering"
  | "playback_failed"
  | "quality_changed"
  | "jump_to_live"
  | "metrics";

/**
 * Privacy-minimal operational event. Media URLs, tokens, IP addresses, device
 * identifiers, user identifiers, and free-form error text are never included.
 */
export interface PlayerTelemetryEvent {
  type: PlayerTelemetryEventType;
  at: string;
  eventId?: string;
  sourceId?: string;
  sourceKind?: PlayerSourceKind;
  reasonCode?: string;
  value?: number;
  metrics?: PlayerMetrics;
}

export interface PlayerEventContext {
  eventId?: string;
  title: string;
  competition?: string;
  statusLabel?: string;
  startTimeLabel?: string;
}

export interface SportsPlayerProps {
  context: PlayerEventContext;
  sources: readonly PlayerSource[];
  poster?: string;
  locale?: "et" | "en";
  isLive?: boolean;
  autoPlay?: boolean;
  initiallyMuted?: boolean;
  dvrPermitted?: boolean;
  dataSaverDefault?: boolean;
  dataSaverMaxHeight?: number;
  dataSaverMaxBitrate?: number;
  connectWhep?: WhepConnector;
  onTelemetry?: (event: PlayerTelemetryEvent) => void;
  className?: string;
}
