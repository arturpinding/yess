"use client";

import {
  Camera,
  Check,
  Copy,
  Info,
  LoaderCircle,
  Mic,
  MicOff,
  Radio,
  ShieldCheck,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import {
  classifyBroadcastError,
  formatBroadcastCode,
  isMediaSecureContext,
  normalizeBroadcastCode,
  type BroadcastConnectionPhase,
} from "@/components/demo-broadcast/rtc";
import styles from "@/components/demo-broadcast/demo-broadcast.module.css";
import {
  createLiveBroadcast,
  LiveBroadcastApiError,
  markLiveBroadcastLive,
  stopLiveBroadcast,
} from "./live-broadcast-api";
import type { LiveBroadcastCopy, ManagedBroadcastErrorKind } from "./live-broadcast-copy";
import {
  connectLiveKitPublisher,
  LiveKitTransportError,
  waitForLiveKitConnected,
  type LiveKitPublisherConnection,
} from "./livekit-transport";

type Capability = "checking" | "ready" | "insecure" | "unsupported";
type ActiveSession = { code: string; publisherToken: string };
const DISCONNECTED_TIMEOUT_MS = 15_000;

function cameraConstraints(facingMode: "user" | "environment"): MediaStreamConstraints {
  return {
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  };
}

function classifyManagedError(error: unknown): ManagedBroadcastErrorKind {
  if (error instanceof LiveBroadcastApiError) {
    if (error.code === "invalid_access_key") return "invalid_access_key";
    if (error.code === "provider_unavailable") return "provider_unavailable";
    if (error.code === "rate_limited") return "rate_limited";
    if (error.code === "not_found" || error.code === "broadcast_expired") {
      return "session_not_found";
    }
    if (error.code === "broadcast_ended") return "broadcast_ended";
  }
  if (
    error instanceof LiveKitTransportError &&
    (error.code === "connection_failed" || error.code === "connection_timeout")
  ) {
    return "network";
  }
  const legacy = classifyBroadcastError(error);
  if (
    legacy === "permission_denied" ||
    legacy === "camera_not_found" ||
    legacy === "camera_busy" ||
    legacy === "insecure_context" ||
    legacy === "unsupported_browser" ||
    legacy === "rate_limited" ||
    legacy === "network"
  ) {
    return legacy;
  }
  return "unexpected";
}

function formatExpiry(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "et" ? "et-EE" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ManagedBroadcastStudio({
  locale,
  copy: d,
}: {
  locale: Locale;
  copy: LiveBroadcastCopy;
}) {
  const [capability, setCapability] = useState<Capability>("checking");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [title, setTitle] = useState(locale === "et" ? "Mängu otseülekanne" : "Live match");
  const [accessKey, setAccessKey] = useState("");
  const [phase, setPhase] = useState<BroadcastConnectionPhase>("idle");
  const [failure, setFailure] = useState<ManagedBroadcastErrorKind>();
  const [sessionView, setSessionView] = useState<{
    code: string;
    viewerUrl: string;
    expiresAt: string;
  }>();
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [copyMessage, setCopyMessage] = useState(false);
  const [hasLocalMedia, setHasLocalMedia] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const connectionRef = useRef<LiveKitPublisherConnection | null>(null);
  const sessionRef = useRef<ActiveSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const expiryTimerRef = useRef<number | null>(null);
  const disconnectTimerRef = useRef<number | null>(null);
  const connectionListenerCleanupRef = useRef<(() => void) | null>(null);
  const trackEndCleanupRef = useRef<(() => void) | null>(null);
  const operationRef = useRef(0);
  const mountedRef = useRef(true);

  const releaseResources = useCallback(
    ({
      notifyServer = false,
      keepalive = false,
    }: { notifyServer?: boolean; keepalive?: boolean } = {}) => {
      operationRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      if (expiryTimerRef.current !== null) {
        window.clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
      if (disconnectTimerRef.current !== null) {
        window.clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      trackEndCleanupRef.current?.();
      trackEndCleanupRef.current = null;
      connectionListenerCleanupRef.current?.();
      connectionListenerCleanupRef.current = null;

      const connection = connectionRef.current;
      connectionRef.current = null;
      if (connection) {
        void connection.close().catch(() => undefined);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (mountedRef.current) setHasLocalMedia(false);

      const session = sessionRef.current;
      sessionRef.current = null;
      if (notifyServer && session) {
        void stopLiveBroadcast(session.code, session.publisherToken, { keepalive }).catch(
          () => undefined,
        );
      }
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    const capabilityTimer = window.setTimeout(() => {
      const supported =
        typeof navigator.mediaDevices?.getUserMedia === "function" &&
        typeof window.RTCPeerConnection === "function";
      setCapability(
        !supported
          ? "unsupported"
          : isMediaSecureContext(window.location, window.isSecureContext)
            ? "ready"
            : "insecure",
      );
    }, 0);
    const onPageHide = () => releaseResources({ notifyServer: true, keepalive: true });
    window.addEventListener("pagehide", onPageHide);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(capabilityTimer);
      window.removeEventListener("pagehide", onPageHide);
      releaseResources({ notifyServer: true, keepalive: true });
    };
  }, [releaseResources]);

  const stop = useCallback(() => {
    releaseResources({ notifyServer: true });
    if (!mountedRef.current) return;
    setSessionView(undefined);
    setFailure(undefined);
    setMicrophoneMuted(false);
    setPhase("stopped");
  }, [releaseResources]);

  const start = useCallback(async () => {
    if (capability === "insecure") {
      setFailure("insecure_context");
      setPhase("failed");
      return;
    }
    if (capability !== "ready") {
      setFailure("unsupported_browser");
      setPhase("failed");
      return;
    }

    releaseResources({ notifyServer: true });
    const operation = operationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setFailure(undefined);
    setSessionView(undefined);
    setCopyMessage(false);
    setMicrophoneMuted(false);
    setPhase("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(facingMode));
      if (controller.signal.aborted || operationRef.current !== operation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const videoTracks = stream.getVideoTracks();
      const onCameraEnded = () => {
        if (controller.signal.aborted || operationRef.current !== operation) return;
        releaseResources({ notifyServer: true });
        if (!mountedRef.current) return;
        setFailure("camera_interrupted");
        setPhase("failed");
      };
      videoTracks.forEach((track) => track.addEventListener("ended", onCameraEnded));
      trackEndCleanupRef.current = () =>
        videoTracks.forEach((track) => track.removeEventListener("ended", onCameraEnded));
      setHasLocalMedia(true);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        void localVideoRef.current.play().catch(() => undefined);
      }
      setPhase("preparing");

      const created = await createLiveBroadcast(
        { locale, title: title.trim(), accessKey },
        controller.signal,
      );
      if (controller.signal.aborted || operationRef.current !== operation) {
        await stopLiveBroadcast(created.code, created.publisherToken, { keepalive: true }).catch(
          () => undefined,
        );
        return;
      }
      const code = normalizeBroadcastCode(created.code);
      if (!code) throw new Error("invalid_broadcast_code");
      const activeSession = { code, publisherToken: created.publisherToken };
      sessionRef.current = activeSession;
      const viewerUrl = `${window.location.origin}/${locale}/broadcast/watch?code=${encodeURIComponent(formatBroadcastCode(code))}`;
      setSessionView({ code, viewerUrl, expiresAt: created.expiresAt });
      setPhase("connecting");

      const connection = await connectLiveKitPublisher({
        mediaUrl: created.mediaUrl,
        mediaToken: created.mediaToken,
        stream,
        signal: controller.signal,
      });
      if (controller.signal.aborted || operationRef.current !== operation) {
        await connection.close().catch(() => undefined);
        return;
      }
      connectionRef.current = connection;
      let confirmedLive = false;
      const failConnection = () => {
        if (!mountedRef.current || operationRef.current !== operation) return;
        releaseResources({ notifyServer: true });
        if (!mountedRef.current) return;
        setFailure("network");
        setPhase("failed");
      };
      const syncConnection = (state = connection.state) => {
        if (!mountedRef.current || operationRef.current !== operation) return;
        if (state === "connected") {
          if (disconnectTimerRef.current !== null) {
            window.clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = null;
          }
          setPhase(confirmedLive ? "live" : "connecting");
        } else if (state === "disconnected") {
          failConnection();
        } else if (state === "reconnecting") {
          setPhase("connecting");
          disconnectTimerRef.current ??= window.setTimeout(failConnection, DISCONNECTED_TIMEOUT_MS);
        }
      };
      connectionListenerCleanupRef.current = connection.onStateChange(syncConnection);
      syncConnection();
      await waitForLiveKitConnected(connection, {
        signal: controller.signal,
        timeoutMs: 15_000,
      });
      await markLiveBroadcastLive(code, created.publisherToken, controller.signal);
      if (controller.signal.aborted || operationRef.current !== operation) return;
      confirmedLive = true;
      syncConnection();

      const expiryDelay = new Date(created.expiresAt).getTime() - Date.now();
      expiryTimerRef.current = window.setTimeout(stop, Math.max(0, expiryDelay));
    } catch (error) {
      if (controller.signal.aborted || operationRef.current !== operation) return;
      const kind = classifyManagedError(error);
      releaseResources({ notifyServer: true });
      if (!mountedRef.current) return;
      setFailure(kind);
      setPhase("failed");
    }
  }, [accessKey, capability, facingMode, locale, releaseResources, stop, title]);

  const active = phase === "preparing" || phase === "connecting" || phase === "live";
  const busy = phase === "requesting" || phase === "preparing" || phase === "connecting";

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>
            <Radio size={14} aria-hidden="true" /> {d.eyebrow}
          </p>
          <h1>{d.studioTitle}</h1>
          <p>{d.studioIntro}</p>
        </div>
        <a className={styles.secondaryLink} href={`/${locale}/broadcast/watch`}>
          {d.watch}
        </a>
      </header>

      <div className={styles.notice}>
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>{d.managedTitle}</strong>
          <span>{d.managedBody}</span>
        </div>
      </div>

      <div className={styles.publisherGrid}>
        <section className={styles.videoPanel} aria-label={d.localPreview}>
          <div className={styles.videoFrame} data-active={hasLocalMedia}>
            <video
              ref={localVideoRef}
              className={styles.localVideo}
              data-facing={facingMode}
              autoPlay
              muted
              playsInline
              aria-label={d.localPreview}
            />
            {!hasLocalMedia && (
              <div className={styles.videoPlaceholder}>
                {busy ? (
                  <LoaderCircle className={styles.spin} size={34} aria-hidden="true" />
                ) : (
                  <Camera size={34} strokeWidth={1.5} aria-hidden="true" />
                )}
                <span>{d.previewPlaceholder}</span>
              </div>
            )}
            {phase === "live" && <span className={styles.liveBadge}>{d.live}</span>}
          </div>
          <div className={styles.statusBar}>
            <span className={styles.statusDot} data-phase={phase} aria-hidden="true" />
            <p role="status" aria-live="polite">
              <small>{d.status}</small>
              <strong>{d.phases[phase]}</strong>
            </p>
          </div>
          {failure && (
            <div className={styles.error} role="alert">
              <Info size={18} aria-hidden="true" />
              <p>{d.errors[failure]}</p>
            </div>
          )}
        </section>

        <section className={styles.controlPanel}>
          <label className={styles.field}>
            <span>{d.matchTitle}</span>
            <input
              value={title}
              maxLength={120}
              disabled={active || busy}
              placeholder={d.matchTitlePlaceholder}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>{d.accessKey}</span>
            <input
              type="password"
              value={accessKey}
              maxLength={256}
              disabled={active || busy}
              autoComplete="off"
              onChange={(event) => setAccessKey(event.target.value)}
            />
            <small>{d.accessKeyHint}</small>
          </label>
          <label className={styles.field}>
            <span>{d.camera}</span>
            <select
              value={facingMode}
              disabled={active || busy}
              onChange={(event) => setFacingMode(event.target.value as "user" | "environment")}
            >
              <option value="environment">{d.rearCamera}</option>
              <option value="user">{d.frontCamera}</option>
            </select>
          </label>

          {!active ? (
            <button
              className={styles.primaryButton}
              type="button"
              disabled={capability === "checking" || busy || !title.trim() || !accessKey}
              onClick={() => void start()}
            >
              {busy ? (
                <LoaderCircle className={styles.spin} size={17} aria-hidden="true" />
              ) : (
                <Camera size={17} aria-hidden="true" />
              )}
              {d.start}
            </button>
          ) : (
            <div className={styles.activeControls}>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => {
                  const muted = !microphoneMuted;
                  streamRef.current?.getAudioTracks().forEach((track) => {
                    track.enabled = !muted;
                  });
                  setMicrophoneMuted(muted);
                }}
              >
                {microphoneMuted ? <Mic size={17} /> : <MicOff size={17} />}
                {microphoneMuted ? d.unmute : d.mute}
              </button>
              <button className={styles.stopButton} type="button" onClick={stop}>
                <Square size={16} fill="currentColor" aria-hidden="true" /> {d.stop}
              </button>
            </div>
          )}

          {sessionView && (
            <div className={styles.shareCard}>
              <div>
                <span>{d.share}</span>
                <small>{d.code}</small>
                <strong className={styles.code}>{formatBroadcastCode(sessionView.code)}</strong>
              </div>
              <button
                className={styles.copyButton}
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(sessionView.viewerUrl).then(() => {
                    setCopyMessage(true);
                    window.setTimeout(() => setCopyMessage(false), 2_000);
                  });
                }}
              >
                <Copy size={16} aria-hidden="true" /> {d.copyLink}
              </button>
              {copyMessage && (
                <p className={styles.copyStatus} role="status">
                  <Check size={14} aria-hidden="true" /> {d.copied}
                </p>
              )}
              <p className={styles.expiry}>
                {d.expires} {formatExpiry(sessionView.expiresAt, locale)}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
