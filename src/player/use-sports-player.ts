"use client";

import type Hls from "hls.js";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type RefCallback,
} from "react";
import {
  findDataSaverCap,
  getHlsUrl,
  isHlsSource,
  orderPlayerSources,
  qualityLabel,
} from "./source-policy";
import type {
  ExternalPlayerSource,
  PlayerEventContext,
  PlayerMetrics,
  PlayerQuality,
  PlayerSource,
  PlayerTelemetryEvent,
  PlayerTrack,
  WhepConnector,
  WhepSession,
} from "./types";

export type PlaybackPhase =
  "idle" | "loading" | "ready" | "playing" | "recovering" | "external" | "error";

export type FailureCode =
  | "whep_not_configured"
  | "whep_connection_failed"
  | "native_hls_failed"
  | "hls_library_failed"
  | "hls_not_supported"
  | "hls_network_failed"
  | "hls_media_failed"
  | "hls_fatal_error"
  | "no_sources";

export interface AttemptRecord {
  sourceId?: string;
  sourceKind?: PlayerSource["kind"];
  reason: FailureCode;
}

interface NativeAudioTrack {
  enabled: boolean;
  label: string;
  language: string;
}

interface NativeAudioTrackList extends EventTarget {
  readonly length: number;
  [index: number]: NativeAudioTrack;
}

type VideoWithAudioTracks = HTMLVideoElement & {
  readonly audioTracks?: NativeAudioTrackList;
};

const EMPTY_METRICS: PlayerMetrics = {
  bufferSeconds: 0,
  liveEdgeSeconds: null,
  droppedFrames: null,
  totalFrames: null,
};

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

function subscribeStatic(): () => void {
  return () => undefined;
}

function getPipSnapshot(): boolean {
  return "pictureInPictureEnabled" in document && document.pictureInPictureEnabled;
}

export interface UseSportsPlayerOptions {
  context: PlayerEventContext;
  sources: readonly PlayerSource[];
  isLive: boolean;
  autoPlay: boolean;
  initiallyMuted: boolean;
  dvrPermitted: boolean;
  dataSaverDefault: boolean;
  dataSaverMaxHeight: number;
  dataSaverMaxBitrate?: number;
  connectWhep?: WhepConnector;
  onTelemetry?: (event: PlayerTelemetryEvent) => void;
  audioLabel: string;
  captionsLabel: string;
}

export interface SportsPlayerController {
  shellRef: RefCallback<HTMLDivElement>;
  videoRef: RefCallback<HTMLVideoElement>;
  phase: PlaybackPhase;
  activeSource?: PlayerSource;
  externalSource?: ExternalPlayerSource;
  attempts: AttemptRecord[];
  fallbackNotice: "whep" | "generic" | null;
  dataSaver: boolean;
  dataSaverAvailable: boolean;
  qualities: PlayerQuality[];
  selectedQuality: number;
  audioTracks: PlayerTrack[];
  selectedAudio: number;
  captionTracks: PlayerTrack[];
  selectedCaption: number;
  metrics: PlayerMetrics;
  paused: boolean;
  muted: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  seekStart: number;
  seekEnd: number;
  online: boolean;
  supportsPip: boolean;
  isNativeHls: boolean;
  togglePlayback: () => void;
  toggleMute: () => void;
  changeVolume: (delta: number) => void;
  setVolumeFromInput: (event: ChangeEvent<HTMLInputElement>) => void;
  jumpToLive: () => void;
  seekBy: (seconds: number) => void;
  seekFromInput: (event: ChangeEvent<HTMLInputElement>) => void;
  setQualityFromInput: (event: ChangeEvent<HTMLSelectElement>) => void;
  setAudioFromInput: (event: ChangeEvent<HTMLSelectElement>) => void;
  setCaptionsFromInput: (event: ChangeEvent<HTMLSelectElement>) => void;
  selectCaption: (trackId: number) => void;
  toggleDataSaver: () => void;
  togglePictureInPicture: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
  retry: () => void;
}

function bufferedAhead(video: HTMLVideoElement): number {
  for (let index = 0; index < video.buffered.length; index += 1) {
    if (
      video.currentTime >= video.buffered.start(index) &&
      video.currentTime <= video.buffered.end(index)
    ) {
      return Math.max(0, video.buffered.end(index) - video.currentTime);
    }
  }
  return 0;
}

export function useSportsPlayer({
  context,
  sources,
  isLive,
  autoPlay,
  initiallyMuted,
  dvrPermitted,
  dataSaverDefault,
  dataSaverMaxHeight,
  dataSaverMaxBitrate,
  connectWhep,
  onTelemetry,
  audioLabel,
  captionsLabel,
}: UseSportsPlayerOptions): SportsPlayerController {
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const whepSessionRef = useRef<WhepSession | null>(null);
  const telemetryRef = useRef(onTelemetry);
  const contextRef = useRef(context);
  const activeSourceRef = useRef<PlayerSource | undefined>(undefined);
  const recoveryAttemptsRef = useRef(0);
  const metricTicksRef = useRef(0);
  const dataSaverRef = useRef(dataSaverDefault);
  const nativeModeRef = useRef(false);
  const orderedSources = useMemo(() => orderPlayerSources(sources), [sources]);

  const [attemptIndex, setAttemptIndex] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [activeSource, setActiveSource] = useState<PlayerSource>();
  const [externalSource, setExternalSource] = useState<ExternalPlayerSource>();
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [fallbackNotice, setFallbackNotice] = useState<"whep" | "generic" | null>(null);
  const [dataSaver, setDataSaver] = useState(dataSaverDefault);
  const [qualities, setQualities] = useState<PlayerQuality[]>([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [audioTracks, setAudioTracks] = useState<PlayerTrack[]>([]);
  const [selectedAudio, setSelectedAudio] = useState(0);
  const [captionTracks, setCaptionTracks] = useState<PlayerTrack[]>([]);
  const [selectedCaption, setSelectedCaption] = useState(-1);
  const [metrics, setMetrics] = useState<PlayerMetrics>(EMPTY_METRICS);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(initiallyMuted);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekStart, setSeekStart] = useState(0);
  const [seekEnd, setSeekEnd] = useState(0);
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, () => true);
  const supportsPip = useSyncExternalStore(subscribeStatic, getPipSnapshot, () => false);
  const [isNativeHls, setIsNativeHls] = useState(false);

  const setShellElement = useCallback((element: HTMLDivElement | null) => {
    shellRef.current = element;
  }, []);
  const setVideoElement = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
  }, []);

  useEffect(() => {
    telemetryRef.current = onTelemetry;
    contextRef.current = context;
  }, [context, onTelemetry]);

  const emit = useCallback((event: Omit<PlayerTelemetryEvent, "at" | "eventId">) => {
    telemetryRef.current?.({
      ...event,
      at: new Date().toISOString(),
      eventId: contextRef.current.eventId,
    });
  }, []);

  const recordFailure = useCallback((source: PlayerSource | undefined, reason: FailureCode) => {
    setAttempts((current) => [
      ...current,
      {
        sourceId: source?.id,
        sourceKind: source?.kind,
        reason,
      },
    ]);
  }, []);

  const advanceSource = useCallback(
    (source: PlayerSource | undefined, reason: FailureCode) => {
      recordFailure(source, reason);
      setFallbackNotice(reason === "whep_not_configured" ? "whep" : "generic");
      emit({
        type: reason === "whep_not_configured" ? "source_skipped" : "playback_failed",
        sourceId: source?.id,
        sourceKind: source?.kind,
        reasonCode: reason,
      });
      emit({
        type: "source_fallback",
        sourceId: source?.id,
        sourceKind: source?.kind,
        reasonCode: reason,
      });
      setAttemptIndex((current) => current + 1);
    },
    [emit, recordFailure],
  );

  const syncNativeTracks = useCallback(() => {
    const video = videoRef.current as VideoWithAudioTracks | null;
    if (!video) return;

    const captions = Array.from(
      { length: video.textTracks.length },
      (_, index) => video.textTracks[index],
    )
      .filter(
        (track): track is TextTrack =>
          track !== undefined && (track.kind === "captions" || track.kind === "subtitles"),
      )
      .map((track, index) => ({
        id: index,
        label: track.label || track.language || `${captionsLabel} ${index + 1}`,
        language: track.language || undefined,
      }));
    setCaptionTracks(captions);

    const nativeAudio = video.audioTracks;
    if (!nativeAudio) return;
    const audio = Array.from({ length: nativeAudio.length }, (_, index) => nativeAudio[index])
      .filter((track): track is NativeAudioTrack => Boolean(track))
      .map((track, index) => ({
        id: index,
        label: track.label || track.language || `${audioLabel} ${index + 1}`,
        language: track.language || undefined,
      }));
    setAudioTracks(audio);
  }, [audioLabel, captionsLabel]);

  useEffect(() => {
    const handleOffline = () => {
      setPhase("recovering");
      emit({
        type: "playback_recovering",
        sourceId: activeSourceRef.current?.id,
        sourceKind: activeSourceRef.current?.kind,
        reasonCode: "offline",
      });
    };
    const handleOnline = () => {
      setReloadToken((current) => current + 1);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [emit]);

  useEffect(() => {
    // Source-catalogue changes intentionally start a new playback attempt.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- This state belongs to the previous source catalogue.
    setAttemptIndex(0);
    setAttempts([]);
    setFallbackNotice(null);
    setExternalSource(undefined);
  }, [orderedSources]);

  useEffect(() => {
    const video = videoRef.current;
    const source = orderedSources[attemptIndex];
    if (!video) return;

    const abortController = new AbortController();
    let disposed = false;
    let readyReported = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let localHls: Hls | null = null;
    let localWhepSession: WhepSession | null = null;
    let removeNativeError: (() => void) | undefined;
    const attemptStartedAt = performance.now();

    const safeAdvance = (reason: FailureCode) => {
      if (!disposed && !abortController.signal.aborted) {
        advanceSource(source, reason);
      }
    };

    const markReady = () => {
      if (disposed) return;
      setPhase(video.paused ? "ready" : "playing");
      syncNativeTracks();
      if (!readyReported) {
        readyReported = true;
        emit({
          type: "playback_ready",
          sourceId: source?.id,
          sourceKind: source?.kind,
          value: Math.round(performance.now() - attemptStartedAt),
        });
      }
      if (autoPlay && video.paused) {
        void video.play().catch(() => setPhase("ready"));
      }
    };

    const updateTimeline = () => {
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      if (video.seekable.length > 0) {
        setSeekStart(video.seekable.start(0));
        setSeekEnd(video.seekable.end(video.seekable.length - 1));
      }
    };

    const handlePlaying = () => {
      if (stallTimer) clearTimeout(stallTimer);
      setPaused(false);
      setPhase("playing");
      emit({
        type: "playback_started",
        sourceId: source?.id,
        sourceKind: source?.kind,
      });
    };
    const handlePause = () => {
      setPaused(true);
      setPhase("ready");
      emit({
        type: "playback_paused",
        sourceId: source?.id,
        sourceKind: source?.kind,
      });
    };
    const handleWaiting = () => {
      setPhase("recovering");
      emit({
        type: "playback_recovering",
        sourceId: source?.id,
        sourceKind: source?.kind,
        reasonCode: "buffering",
      });
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (!disposed && navigator.onLine) {
          safeAdvance(
            source?.kind === "whep"
              ? "whep_connection_failed"
              : localHls
                ? "hls_network_failed"
                : "native_hls_failed",
          );
        }
      }, 8_000);
    };

    setQualities([]);
    setSelectedQuality(-1);
    setAudioTracks([]);
    setCaptionTracks([]);
    setSelectedCaption(-1);
    setMetrics(EMPTY_METRICS);
    setIsNativeHls(false);
    nativeModeRef.current = false;
    recoveryAttemptsRef.current = 0;

    if (!source) {
      setActiveSource(undefined);
      activeSourceRef.current = undefined;
      setPhase("error");
      return () => {
        disposed = true;
      };
    }

    setActiveSource(source);
    activeSourceRef.current = source;

    if (source.kind === "external") {
      setExternalSource(source);
      setPhase("external");
      return () => {
        disposed = true;
      };
    }

    setExternalSource(undefined);
    video.muted = initiallyMuted;
    video.addEventListener("loadedmetadata", markReady);
    video.addEventListener("canplay", markReady);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("stalled", handleWaiting);
    video.addEventListener("timeupdate", updateTimeline);
    video.addEventListener("durationchange", updateTimeline);
    setPhase("loading");
    emit({
      type: "source_attempt",
      sourceId: source.id,
      sourceKind: source.kind,
    });

    if (source.kind === "whep") {
      if (!connectWhep) {
        queueMicrotask(() => safeAdvance("whep_not_configured"));
      } else {
        void connectWhep(source, abortController.signal)
          .then((session) => {
            if (disposed) {
              void session.close();
              return;
            }
            localWhepSession = session;
            whepSessionRef.current = session;
            video.srcObject = session.stream;
          })
          .catch(() => safeAdvance("whep_connection_failed"));
      }
    } else if (isHlsSource(source)) {
      const mediaUrl = getHlsUrl(source, dataSaverRef.current);
      const nativeHls = Boolean(
        video.canPlayType(source.mimeType ?? "application/vnd.apple.mpegurl"),
      );

      if (nativeHls) {
        setIsNativeHls(true);
        nativeModeRef.current = true;
        const handleNativeError = () => safeAdvance("native_hls_failed");
        video.addEventListener("error", handleNativeError, { once: true });
        removeNativeError = () => video.removeEventListener("error", handleNativeError);
        video.src = mediaUrl;
        video.load();
      } else {
        void import("hls.js")
          .then(({ default: HlsConstructor }) => {
            if (disposed) return;
            if (!HlsConstructor.isSupported()) {
              safeAdvance("hls_not_supported");
              return;
            }

            const hls = new HlsConstructor({
              lowLatencyMode: source.kind === "ll-hls",
              backBufferLength: dvrPermitted ? 90 : 0,
              maxBufferLength: dataSaverRef.current ? 12 : 30,
              maxMaxBufferLength: dataSaverRef.current ? 20 : 60,
              capLevelToPlayerSize: true,
              enableWorker: true,
            });
            localHls = hls;
            hlsRef.current = hls;

            const syncHlsOptions = () => {
              const nextQualities = hls.levels.map((level, index) => ({
                id: index,
                height: level.height || undefined,
                width: level.width || undefined,
                bitrate: level.bitrate || undefined,
                label: qualityLabel({
                  height: level.height || undefined,
                  bitrate: level.bitrate || undefined,
                }),
              }));
              setQualities(nextQualities);
              setAudioTracks(
                hls.audioTracks.map((track, index) => ({
                  id: index,
                  label: track.name || track.lang || `${audioLabel} ${index + 1}`,
                  language: track.lang || undefined,
                })),
              );
              setCaptionTracks(
                hls.subtitleTracks.map((track, index) => ({
                  id: index,
                  label: track.name || track.lang || `${captionsLabel} ${index + 1}`,
                  language: track.lang || undefined,
                })),
              );

              if (dataSaverRef.current && nextQualities.length > 0) {
                hls.autoLevelCapping = findDataSaverCap(nextQualities, {
                  maxHeight: dataSaverMaxHeight,
                  maxBitrate: dataSaverMaxBitrate,
                });
              }
            };

            hls.on(HlsConstructor.Events.MANIFEST_PARSED, () => {
              syncHlsOptions();
              markReady();
            });
            hls.on(HlsConstructor.Events.LEVELS_UPDATED, syncHlsOptions);
            hls.on(HlsConstructor.Events.AUDIO_TRACKS_UPDATED, syncHlsOptions);
            hls.on(HlsConstructor.Events.SUBTITLE_TRACKS_UPDATED, syncHlsOptions);
            hls.on(HlsConstructor.Events.ERROR, (_event, data) => {
              if (!data.fatal || disposed) return;
              if (data.type === "networkError" && recoveryAttemptsRef.current < 1) {
                recoveryAttemptsRef.current += 1;
                setPhase("recovering");
                emit({
                  type: "playback_recovering",
                  sourceId: source.id,
                  sourceKind: source.kind,
                  reasonCode: "hls_network_retry",
                });
                hls.startLoad();
                return;
              }
              if (data.type === "mediaError" && recoveryAttemptsRef.current < 1) {
                recoveryAttemptsRef.current += 1;
                setPhase("recovering");
                hls.recoverMediaError();
                return;
              }
              safeAdvance(
                data.type === "networkError"
                  ? "hls_network_failed"
                  : data.type === "mediaError"
                    ? "hls_media_failed"
                    : "hls_fatal_error",
              );
            });

            hls.attachMedia(video);
            hls.loadSource(mediaUrl);
          })
          .catch(() => safeAdvance("hls_library_failed"));
      }
    }

    return () => {
      disposed = true;
      abortController.abort();
      if (stallTimer) clearTimeout(stallTimer);
      removeNativeError?.();
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("canplay", markReady);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("stalled", handleWaiting);
      video.removeEventListener("timeupdate", updateTimeline);
      video.removeEventListener("durationchange", updateTimeline);
      localHls?.destroy();
      if (hlsRef.current === localHls) hlsRef.current = null;
      if (localWhepSession) void localWhepSession.close();
      if (whepSessionRef.current === localWhepSession) {
        whepSessionRef.current = null;
      }
      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [
    advanceSource,
    attemptIndex,
    audioLabel,
    autoPlay,
    captionsLabel,
    connectWhep,
    dataSaverMaxBitrate,
    dataSaverMaxHeight,
    dvrPermitted,
    emit,
    initiallyMuted,
    orderedSources,
    recordFailure,
    reloadToken,
    syncNativeTracks,
  ]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || phase === "idle" || phase === "error") return;

      const quality = video.getVideoPlaybackQuality?.();
      const hlsLatency = hlsRef.current?.latency;
      const seekableLatency =
        isLive && video.seekable.length > 0
          ? Math.max(0, video.seekable.end(video.seekable.length - 1) - video.currentTime)
          : null;
      const nextMetrics: PlayerMetrics = {
        bufferSeconds: bufferedAhead(video),
        liveEdgeSeconds:
          typeof hlsLatency === "number" && Number.isFinite(hlsLatency)
            ? Math.max(0, hlsLatency)
            : seekableLatency,
        droppedFrames: quality?.droppedVideoFrames ?? null,
        totalFrames: quality?.totalVideoFrames ?? null,
      };
      setMetrics(nextMetrics);
      metricTicksRef.current += 1;
      if (metricTicksRef.current % 10 === 0) {
        emit({
          type: "metrics",
          sourceId: activeSourceRef.current?.id,
          sourceKind: activeSourceRef.current?.kind,
          metrics: nextMetrics,
        });
      }
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [emit, isLive, phase]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls || qualities.length === 0) return;
    hls.autoLevelCapping = dataSaver
      ? findDataSaverCap(qualities, {
          maxHeight: dataSaverMaxHeight,
          maxBitrate: dataSaverMaxBitrate,
        })
      : -1;
  }, [dataSaver, dataSaverMaxBitrate, dataSaverMaxHeight, qualities]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setPhase("ready"));
    else video.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);

  const setVolumeFromInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const nextVolume = Number(event.target.value);
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    setVolume(nextVolume);
    setMuted(video.muted);
  }, []);

  const changeVolume = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const nextVolume = Math.min(1, Math.max(0, video.volume + delta));
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    setVolume(nextVolume);
    setMuted(video.muted);
  }, []);

  const jumpToLive = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.seekable.length === 0) return;
    const livePosition =
      hlsRef.current?.liveSyncPosition ?? video.seekable.end(video.seekable.length - 1);
    if (typeof livePosition === "number" && Number.isFinite(livePosition)) {
      video.currentTime = livePosition;
      emit({
        type: "jump_to_live",
        sourceId: activeSourceRef.current?.id,
        sourceKind: activeSourceRef.current?.kind,
      });
      void video.play();
    }
  }, [emit]);

  const seekFromInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const video = videoRef.current;
      if (!video) return;
      const ratio = Number(event.target.value) / 1_000;
      if (isLive && seekEnd > seekStart) {
        video.currentTime = seekStart + ratio * (seekEnd - seekStart);
      } else if (duration > 0) video.currentTime = ratio * duration;
    },
    [duration, isLive, seekEnd, seekStart],
  );

  const seekBy = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      const lowerBound = isLive && seekEnd > seekStart ? seekStart : 0;
      const upperBound =
        isLive && seekEnd > seekStart
          ? seekEnd
          : Number.isFinite(video.duration)
            ? video.duration
            : video.currentTime;
      video.currentTime = Math.min(upperBound, Math.max(lowerBound, video.currentTime + seconds));
    },
    [isLive, seekEnd, seekStart],
  );

  const setQualityFromInput = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const hls = hlsRef.current;
      if (!hls) return;
      let nextLevel = Number(event.target.value);
      if (dataSaverRef.current && nextLevel >= 0) {
        const cap = findDataSaverCap(qualities, {
          maxHeight: dataSaverMaxHeight,
          maxBitrate: dataSaverMaxBitrate,
        });
        const chosen = qualities.find((quality) => quality.id === nextLevel);
        const capped = qualities.find((quality) => quality.id === cap);
        if (
          chosen &&
          capped &&
          ((chosen.height ?? 0) > (capped.height ?? 0) ||
            (chosen.bitrate ?? 0) > (capped.bitrate ?? 0))
        ) {
          nextLevel = cap;
        }
      }
      hls.currentLevel = nextLevel;
      hls.nextLevel = nextLevel;
      setSelectedQuality(nextLevel);
      emit({
        type: "quality_changed",
        sourceId: activeSourceRef.current?.id,
        sourceKind: activeSourceRef.current?.kind,
        value: nextLevel,
      });
    },
    [dataSaverMaxBitrate, dataSaverMaxHeight, emit, qualities],
  );

  const setAudioFromInput = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const nextTrack = Number(event.target.value);
    if (hlsRef.current) hlsRef.current.audioTrack = nextTrack;
    const nativeTracks = (videoRef.current as VideoWithAudioTracks | null)?.audioTracks;
    if (nativeTracks) {
      for (let index = 0; index < nativeTracks.length; index += 1) {
        // eslint-disable-next-line react-hooks/immutability -- AudioTrack.enabled is the browser's imperative selection API.
        nativeTracks[index]!.enabled = index === nextTrack;
      }
    }
    setSelectedAudio(nextTrack);
  }, []);

  const selectCaption = useCallback((nextTrack: number) => {
    const hls = hlsRef.current;
    if (hls) {
      hls.subtitleDisplay = nextTrack >= 0;
      hls.subtitleTrack = nextTrack;
    }
    const video = videoRef.current;
    if (video) {
      for (let index = 0; index < video.textTracks.length; index += 1) {
        video.textTracks[index]!.mode = index === nextTrack ? "showing" : "disabled";
      }
    }
    setSelectedCaption(nextTrack);
  }, []);

  const setCaptionsFromInput = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      selectCaption(Number(event.target.value));
    },
    [selectCaption],
  );

  const toggleDataSaver = useCallback(() => {
    const next = !dataSaver;
    dataSaverRef.current = next;
    const source = activeSourceRef.current;
    const hls = hlsRef.current;

    if (next && hls && qualities.length > 0) {
      const cap = findDataSaverCap(qualities, {
        maxHeight: dataSaverMaxHeight,
        maxBitrate: dataSaverMaxBitrate,
      });
      if (hls.currentLevel > cap) {
        hls.currentLevel = cap;
        hls.nextLevel = cap;
        setSelectedQuality(cap);
        emit({
          type: "quality_changed",
          sourceId: source?.id,
          sourceKind: source?.kind,
          reasonCode: "data_saver_cap",
          value: cap,
        });
      }
    }

    if (nativeModeRef.current && source && isHlsSource(source)) {
      if (source.dataSaverUrl) setReloadToken((token) => token + 1);
    }
    setDataSaver(next);
  }, [dataSaver, dataSaverMaxBitrate, dataSaverMaxHeight, emit, qualities]);

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !supportsPip) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      // Browsers can deny PiP based on policy, media readiness, or user activation.
    }
  }, [supportsPip]);

  const toggleFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    if (!shell) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shell.requestFullscreen();
    } catch {
      // Fullscreen can be denied by an embedding document or browser policy.
    }
  }, []);

  const retry = useCallback(() => {
    setAttempts([]);
    setFallbackNotice(null);
    setAttemptIndex(0);
    setReloadToken((current) => current + 1);
  }, []);

  return {
    shellRef: setShellElement,
    videoRef: setVideoElement,
    phase,
    activeSource,
    externalSource,
    attempts,
    fallbackNotice,
    dataSaver,
    dataSaverAvailable:
      Boolean(activeSource && isHlsSource(activeSource)) &&
      (!isNativeHls ||
        Boolean(activeSource && isHlsSource(activeSource) && activeSource.dataSaverUrl)),
    qualities,
    selectedQuality,
    audioTracks,
    selectedAudio,
    captionTracks,
    selectedCaption,
    metrics,
    paused,
    muted,
    volume,
    currentTime,
    duration,
    seekStart,
    seekEnd,
    online,
    supportsPip,
    isNativeHls,
    togglePlayback,
    toggleMute,
    changeVolume,
    setVolumeFromInput,
    jumpToLive,
    seekBy,
    seekFromInput,
    setQualityFromInput,
    setAudioFromInput,
    setCaptionsFromInput,
    selectCaption,
    toggleDataSaver,
    togglePictureInPicture,
    toggleFullscreen,
    retry,
  };
}
