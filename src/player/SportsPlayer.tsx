"use client";

/* eslint-disable react-hooks/refs -- The controller groups callback refs with render state; no ref.current value is read while rendering. */

import {
  Activity,
  Captions,
  ExternalLink,
  Gauge,
  LoaderCircle,
  Maximize,
  Pause,
  PictureInPicture2,
  Play,
  Radio,
  RefreshCw,
  Volume2,
  VolumeX,
  WifiOff,
} from "lucide-react";
import {
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import styles from "./SportsPlayer.module.css";
import type { PlayerSourceKind, SportsPlayerProps } from "./types";
import { useSportsPlayer, type PlaybackPhase } from "./use-sports-player";

const COPY = {
  et: {
    player: "Spordivideo",
    live: "Otse",
    play: "Esita",
    pause: "Peata",
    mute: "Vaigista",
    unmute: "Lülita heli sisse",
    volume: "Helitugevus",
    seek: "Video ajajoon",
    jumpToLive: "Tagasi otse-eetrisse",
    quality: "Kvaliteet",
    automatic: "Automaatne",
    audio: "Helirada",
    captions: "Subtiitrid",
    captionsOff: "Väljas",
    dataSaver: "Andmesääst",
    dataSaverOn: "Andmesääst on sees",
    dataSaverUnavailable: "Selle brauseri jaoks pole eraldi väiksema mahuga voogu.",
    pip: "Pilt pildis",
    fullscreen: "Täisekraan",
    stats: "Voo tehniline olek",
    closeStats: "Peida voo tehniline olek",
    buffered: "Puhver",
    liveEdge: "Kaugus otse-eetrist",
    dropped: "Vahele jäänud kaadrid",
    estimateNote: "Kaugus otse-eetrist on pleieri hinnang, mitte mõõdetud klaasist klaasini viide.",
    loading: "Voo ettevalmistamine…",
    recovering: "Ühenduse taastamine…",
    offline: "Internetiühendus puudub. Pleier jätkab ühenduse taastumisel.",
    unavailable: "Videovoog pole praegu saadaval",
    unavailableBody:
      "Sündmuse info jääb alles. Proovi uuesti või kasuta allpool näidatud ametlikku vaatamiskohta.",
    retry: "Proovi uuesti",
    watchAt: "Vaata teenuses {provider}",
    externalBody:
      "Selle sündmuse vaatamisõigus on teisel teenusepakkujal. Avame ametliku vaatamiskoha uuel vahelehel.",
    fallbackWhep:
      "Ülimadala viitega voog pole selles keskkonnas seadistatud. Kasutame järgmist saadaolevat allikat.",
    fallbackGeneric: "Voog katkes. Pleier lülitus varuallikale.",
    attempts: "Tehnilised katsed",
    sourceWhep: "Ülimadal viide",
    sourceLlHls: "Madal viide",
    sourceHls: "Ühilduv voog",
    sourceExternal: "Ametlik vaatamiskoht",
    keyboard:
      "Kiirklahvid: K või tühik esitab ja peatab, M vaigistab, nooled kerivad ja muudavad heli, L viib otse-eetrisse, C lülitab subtiitreid, F avab täisekraani ning P pilt-pildis vaate.",
    ready: "Video on esitamiseks valmis",
    playing: "Video esitatakse",
    paused: "Video on peatatud",
    external: "Saadaval ametlikus välisteenuses",
    nativeAuto: "Brauseri automaatne",
    noTracks: "Radasid pole",
  },
  en: {
    player: "Sports video",
    live: "Live",
    play: "Play",
    pause: "Pause",
    mute: "Mute",
    unmute: "Unmute",
    volume: "Volume",
    seek: "Video timeline",
    jumpToLive: "Jump to live",
    quality: "Quality",
    automatic: "Auto",
    audio: "Audio track",
    captions: "Captions",
    captionsOff: "Off",
    dataSaver: "Data saver",
    dataSaverOn: "Data saver is on",
    dataSaverUnavailable: "A separate lower-data stream is not available for this browser.",
    pip: "Picture in picture",
    fullscreen: "Fullscreen",
    stats: "Stream health",
    closeStats: "Hide stream health",
    buffered: "Buffered",
    liveEdge: "Distance from live edge",
    dropped: "Dropped frames",
    estimateNote:
      "Distance from the live edge is a player estimate, not measured glass-to-glass latency.",
    loading: "Preparing stream…",
    recovering: "Restoring connection…",
    offline: "You are offline. Playback will recover when the connection returns.",
    unavailable: "Video is currently unavailable",
    unavailableBody:
      "The event context stays here. Retry, or use the official viewing destination shown below.",
    retry: "Retry",
    watchAt: "Watch on {provider}",
    externalBody:
      "Viewing rights for this event belong to another provider. The official destination opens in a new tab.",
    fallbackWhep:
      "Ultra-low-latency playback is not configured in this environment. Using the next available source.",
    fallbackGeneric: "The stream was interrupted. The player switched sources.",
    attempts: "Technical attempts",
    sourceWhep: "Ultra-low latency",
    sourceLlHls: "Low latency",
    sourceHls: "Compatible stream",
    sourceExternal: "Official destination",
    keyboard:
      "Shortcuts: K or Space plays and pauses, M mutes, arrow keys seek and change volume, L jumps live, C toggles captions, F opens fullscreen, and P opens picture in picture.",
    ready: "Video is ready to play",
    playing: "Video is playing",
    paused: "Video is paused",
    external: "Available from the official external provider",
    nativeAuto: "Browser automatic",
    noTracks: "No tracks",
  },
} as const;

function joinClasses(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const remaining = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function phaseAnnouncement(
  phase: PlaybackPhase,
  copy: (typeof COPY)["et"] | (typeof COPY)["en"],
  online: boolean,
): string {
  if (!online) return copy.offline;
  if (phase === "loading") return copy.loading;
  if (phase === "recovering") return copy.recovering;
  if (phase === "playing") return copy.playing;
  if (phase === "ready") return copy.ready;
  if (phase === "external") return copy.external;
  if (phase === "error") return copy.unavailable;
  return "";
}

function sourceKindLabel(
  kind: PlayerSourceKind,
  copy: (typeof COPY)["et"] | (typeof COPY)["en"],
): string {
  if (kind === "whep") return copy.sourceWhep;
  if (kind === "ll-hls") return copy.sourceLlHls;
  if (kind === "hls") return copy.sourceHls;
  return copy.sourceExternal;
}

export function SportsPlayer({
  context,
  sources,
  poster,
  locale = "et",
  isLive = true,
  autoPlay = false,
  initiallyMuted = false,
  dvrPermitted = false,
  dataSaverDefault = false,
  dataSaverMaxHeight = 540,
  dataSaverMaxBitrate = 1_500_000,
  connectWhep,
  onTelemetry,
  className,
}: SportsPlayerProps) {
  const copy = COPY[locale];
  const titleId = useId();
  const keyboardId = useId();
  const [showStats, setShowStats] = useState(false);
  const player = useSportsPlayer({
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
    audioLabel: copy.audio,
    captionsLabel: copy.captions,
  });

  const timeline = useMemo(() => {
    const start = isLive ? player.seekStart : 0;
    const end = isLive ? player.seekEnd : player.duration;
    const span = Math.max(0, end - start);
    const position = span > 0 ? (player.currentTime - start) / span : 0;
    const value = Math.round(Math.min(1, Math.max(0, position)) * 1_000);
    return { start, end, span, value };
  }, [isLive, player.currentTime, player.duration, player.seekEnd, player.seekStart]);

  const atLiveEdge =
    isLive && player.metrics.liveEdgeSeconds !== null && player.metrics.liveEdgeSeconds <= 3.5;
  const canSeek = timeline.span > 0 && (!isLive || dvrPermitted);
  const sourceLabel = player.activeSource
    ? player.activeSource.label || sourceKindLabel(player.activeSource.kind, copy)
    : null;
  const progressStyle = {
    "--player-progress": `${timeline.value / 10}%`,
  } as CSSProperties;

  const handleKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) return;

    const key = event.key.toLowerCase();
    if (key === " " || key === "k") {
      event.preventDefault();
      player.togglePlayback();
    } else if (key === "m") {
      event.preventDefault();
      player.toggleMute();
    } else if (key === "f") {
      event.preventDefault();
      void player.toggleFullscreen();
    } else if (key === "p" && player.supportsPip) {
      event.preventDefault();
      void player.togglePictureInPicture();
    } else if (key === "l" && isLive) {
      event.preventDefault();
      player.jumpToLive();
    } else if (key === "c" && player.captionTracks.length > 0) {
      event.preventDefault();
      player.selectCaption(player.selectedCaption >= 0 ? -1 : player.captionTracks[0]!.id);
    } else if (event.key === "ArrowLeft" && canSeek) {
      event.preventDefault();
      player.seekBy(-10);
    } else if (event.key === "ArrowRight" && canSeek) {
      event.preventDefault();
      player.seekBy(10);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      player.changeVolume(0.1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      player.changeVolume(-0.1);
    }
  };

  const viewingDestination = player.externalSource;
  const overlayVisible =
    player.phase === "loading" || player.phase === "recovering" || !player.online;

  return (
    <section
      ref={player.shellRef}
      className={joinClasses(styles.player, className)}
      role="region"
      aria-labelledby={titleId}
      aria-describedby={keyboardId}
      aria-keyshortcuts="Space K M F P L C ArrowLeft ArrowRight ArrowUp ArrowDown"
      tabIndex={0}
      onKeyDown={handleKeyboard}
    >
      <video
        ref={player.videoRef}
        className={styles.video}
        poster={poster}
        playsInline
        preload="metadata"
        aria-label={`${context.title} — ${copy.player}`}
      />

      <div className={styles.topScrim} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.eventHeading}>
          <div className={styles.statusRow}>
            {isLive && (
              <span className={styles.liveBadge}>
                <span className={styles.liveDot} aria-hidden="true" />
                {context.statusLabel || copy.live}
              </span>
            )}
            {!isLive && context.statusLabel && (
              <span className={styles.statusBadge}>{context.statusLabel}</span>
            )}
            {sourceLabel && (
              <span className={styles.sourceBadge}>
                <Radio size={13} aria-hidden="true" />
                {sourceLabel}
              </span>
            )}
          </div>
          <h2 id={titleId} className={styles.title}>
            {context.title}
          </h2>
          {(context.competition || context.startTimeLabel) && (
            <p className={styles.contextLine}>
              {[context.competition, context.startTimeLabel].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </header>

      {player.fallbackNotice && player.phase !== "error" && (
        <div className={styles.fallbackNotice} role="status">
          <RefreshCw size={15} aria-hidden="true" />
          <span>{player.fallbackNotice === "whep" ? copy.fallbackWhep : copy.fallbackGeneric}</span>
        </div>
      )}

      {overlayVisible && (
        <div className={styles.stateOverlay}>
          {player.online ? (
            <LoaderCircle className={styles.spinner} size={30} aria-hidden="true" />
          ) : (
            <WifiOff size={30} aria-hidden="true" />
          )}
          <p>
            {!player.online
              ? copy.offline
              : player.phase === "recovering"
                ? copy.recovering
                : copy.loading}
          </p>
        </div>
      )}

      {player.phase === "ready" && player.paused && (
        <button
          type="button"
          className={styles.centerPlay}
          onClick={player.togglePlayback}
          aria-label={copy.play}
        >
          <Play size={30} fill="currentColor" aria-hidden="true" />
        </button>
      )}

      {(player.phase === "error" || player.phase === "external") && (
        <div className={styles.unavailableOverlay}>
          <div className={styles.unavailableCard}>
            <span className={styles.cardEyebrow}>
              {context.statusLabel || context.startTimeLabel || copy.player}
            </span>
            <h3>{viewingDestination ? context.title : copy.unavailable}</h3>
            <p>{viewingDestination ? copy.externalBody : copy.unavailableBody}</p>
            <div className={styles.cardActions}>
              {viewingDestination ? (
                <a
                  className={styles.primaryAction}
                  href={viewingDestination.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.watchAt.replace("{provider}", viewingDestination.providerName)}
                  <ExternalLink size={16} aria-hidden="true" />
                </a>
              ) : (
                <button type="button" className={styles.primaryAction} onClick={player.retry}>
                  <RefreshCw size={16} aria-hidden="true" />
                  {copy.retry}
                </button>
              )}
            </div>
            {!viewingDestination && player.attempts.length > 0 && (
              <details className={styles.attempts}>
                <summary>{copy.attempts}</summary>
                <ul>
                  {player.attempts.map((attempt, index) => (
                    <li key={`${attempt.sourceId ?? "none"}-${index}`}>
                      {attempt.sourceKind ?? "source"}: {attempt.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}

      {showStats && player.phase !== "error" && (
        <aside className={styles.statsPanel} aria-label={copy.stats}>
          <dl>
            <div>
              <dt>{copy.buffered}</dt>
              <dd>{player.metrics.bufferSeconds.toFixed(1)} s</dd>
            </div>
            <div>
              <dt>{copy.liveEdge}</dt>
              <dd>
                {player.metrics.liveEdgeSeconds === null
                  ? "—"
                  : `${player.metrics.liveEdgeSeconds.toFixed(1)} s`}
              </dd>
            </div>
            <div>
              <dt>{copy.dropped}</dt>
              <dd>
                {player.metrics.droppedFrames === null
                  ? "—"
                  : `${player.metrics.droppedFrames} / ${player.metrics.totalFrames ?? "—"}`}
              </dd>
            </div>
          </dl>
          <p>{copy.estimateNote}</p>
        </aside>
      )}

      {player.phase !== "error" && player.phase !== "external" && (
        <div className={styles.controlsScrim}>
          <div className={styles.controls}>
            {canSeek && (
              <div className={styles.timelineRow}>
                <span className={styles.timeLabel}>
                  {isLive
                    ? `−${formatTime(Math.max(0, player.seekEnd - player.currentTime))}`
                    : formatTime(player.currentTime)}
                </span>
                <input
                  className={styles.timeline}
                  type="range"
                  min="0"
                  max="1000"
                  step="1"
                  value={timeline.value}
                  style={progressStyle}
                  onChange={player.seekFromInput}
                  aria-label={copy.seek}
                />
                <span className={styles.timeLabel}>
                  {isLive ? copy.live : formatTime(player.duration)}
                </span>
              </div>
            )}

            <div className={styles.controlRow}>
              <div className={styles.controlGroup}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={player.togglePlayback}
                  aria-label={player.paused ? copy.play : copy.pause}
                >
                  {player.paused ? (
                    <Play size={21} fill="currentColor" aria-hidden="true" />
                  ) : (
                    <Pause size={21} fill="currentColor" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={player.toggleMute}
                  aria-label={player.muted ? copy.unmute : copy.mute}
                >
                  {player.muted || player.volume === 0 ? (
                    <VolumeX size={21} aria-hidden="true" />
                  ) : (
                    <Volume2 size={21} aria-hidden="true" />
                  )}
                </button>
                <input
                  className={styles.volume}
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={player.muted ? 0 : player.volume}
                  onChange={player.setVolumeFromInput}
                  aria-label={copy.volume}
                />
                {isLive && (
                  <button
                    type="button"
                    className={joinClasses(styles.liveControl, atLiveEdge && styles.atLive)}
                    onClick={player.jumpToLive}
                    disabled={player.seekEnd <= player.seekStart}
                    aria-label={copy.jumpToLive}
                  >
                    <span aria-hidden="true" />
                    {copy.live}
                  </button>
                )}
              </div>

              <div className={joinClasses(styles.controlGroup, styles.options)}>
                <label className={styles.selectControl}>
                  <span>{copy.quality}</span>
                  <select
                    value={player.selectedQuality}
                    onChange={player.setQualityFromInput}
                    disabled={player.qualities.length === 0}
                    aria-label={copy.quality}
                  >
                    <option value={-1}>
                      {player.isNativeHls ? copy.nativeAuto : copy.automatic}
                    </option>
                    {player.qualities.map((quality) => (
                      <option key={quality.id} value={quality.id}>
                        {quality.label}
                      </option>
                    ))}
                  </select>
                </label>

                {player.audioTracks.length > 0 && (
                  <label className={styles.selectControl}>
                    <span>{copy.audio}</span>
                    <select
                      value={player.selectedAudio}
                      onChange={player.setAudioFromInput}
                      aria-label={copy.audio}
                    >
                      {player.audioTracks.map((track) => (
                        <option key={track.id} value={track.id}>
                          {track.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {player.captionTracks.length > 0 && (
                  <label className={styles.selectControl}>
                    <Captions size={17} aria-hidden="true" />
                    <span className={styles.srOnly}>{copy.captions}</span>
                    <select
                      value={player.selectedCaption}
                      onChange={player.setCaptionsFromInput}
                      aria-label={copy.captions}
                    >
                      <option value={-1}>{copy.captionsOff}</option>
                      {player.captionTracks.map((track) => (
                        <option key={track.id} value={track.id}>
                          {track.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <button
                  type="button"
                  className={joinClasses(
                    styles.textButton,
                    player.dataSaver && styles.activeButton,
                  )}
                  onClick={player.toggleDataSaver}
                  disabled={!player.dataSaverAvailable}
                  aria-pressed={player.dataSaver}
                  aria-label={
                    player.dataSaver ? `${copy.dataSaver}. ${copy.dataSaverOn}` : copy.dataSaver
                  }
                  title={player.dataSaverAvailable ? copy.dataSaver : copy.dataSaverUnavailable}
                >
                  <Gauge size={17} aria-hidden="true" />
                  <span>{copy.dataSaver}</span>
                </button>
                <button
                  type="button"
                  className={joinClasses(styles.iconButton, showStats && styles.activeButton)}
                  onClick={() => setShowStats((current) => !current)}
                  aria-label={showStats ? copy.closeStats : copy.stats}
                  aria-expanded={showStats}
                >
                  <Activity size={19} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => void player.togglePictureInPicture()}
                  disabled={!player.supportsPip}
                  aria-label={copy.pip}
                >
                  <PictureInPicture2 size={19} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => void player.toggleFullscreen()}
                  aria-label={copy.fullscreen}
                >
                  <Maximize size={19} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <p id={keyboardId} className={styles.srOnly}>
        {copy.keyboard}
      </p>
      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {phaseAnnouncement(player.phase, copy, player.online)}
      </p>
    </section>
  );
}
