"use client";

import {
  Camera,
  Check,
  Clipboard,
  Copy,
  ExternalLink,
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
import { createBroadcast, deleteBroadcast, getAnswer, submitOffer } from "./broadcast-api";
import type { BroadcastCopy } from "./broadcast-copy";
import {
  abortableDelay,
  classifyBroadcastError,
  connectionPhase,
  formatBroadcastCode,
  isMediaSecureContext,
  normalizeBroadcastCode,
  type BroadcastConnectionPhase,
  type BroadcastErrorKind,
  waitForIceGatheringComplete,
} from "./rtc";
import styles from "./demo-broadcast.module.css";

type Capability = "checking" | "ready" | "insecure" | "unsupported";
type ActiveSession = { code: string; publisherToken: string };

function formatExpiry(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "et" ? "et-EE" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function cameraConstraints(facingMode: "user" | "environment"): MediaStreamConstraints {
  return {
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
}

export function BroadcastStudio({ locale, copy: d }: { locale: Locale; copy: BroadcastCopy }) {
  const [capability, setCapability] = useState<Capability>("checking");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [phase, setPhase] = useState<BroadcastConnectionPhase>("idle");
  const [failure, setFailure] = useState<BroadcastErrorKind>();
  const [sessionView, setSessionView] = useState<{
    code: string;
    viewerUrl: string;
    expiresAt: string;
  }>();
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string>();
  const [hasLocalMedia, setHasLocalMedia] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const sessionRef = useRef<ActiveSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const expiryTimerRef = useRef<number | null>(null);
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

      const peer = peerRef.current;
      peerRef.current = null;
      if (peer) {
        peer.onconnectionstatechange = null;
        peer.oniceconnectionstatechange = null;
        peer.close();
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (mountedRef.current) setHasLocalMedia(false);

      const session = sessionRef.current;
      sessionRef.current = null;
      if (notifyServer && session) {
        void deleteBroadcast(session.code, session.publisherToken, { keepalive }).catch(
          () => undefined,
        );
      }
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(() => {
      const secure = isMediaSecureContext(window.location, window.isSecureContext);
      if (!secure) setCapability("insecure");
      else if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
        setCapability("unsupported");
      } else setCapability("ready");
    }, 0);

    return () => {
      window.clearTimeout(timer);
      mountedRef.current = false;
      releaseResources({ notifyServer: true, keepalive: true });
    };
  }, [releaseResources]);

  useEffect(() => {
    const onPageHide = () => releaseResources({ notifyServer: true, keepalive: true });
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [releaseResources]);

  const fail = useCallback(
    (kind: BroadcastErrorKind) => {
      releaseResources({ notifyServer: true, keepalive: true });
      if (!mountedRef.current) return;
      setSessionView(undefined);
      setMicrophoneMuted(false);
      setFailure(kind);
      setPhase("failed");
    },
    [releaseResources],
  );

  const pollForAnswer = useCallback(
    async (
      peer: RTCPeerConnection,
      session: ActiveSession,
      controller: AbortController,
      operation: number,
    ) => {
      try {
        while (!controller.signal.aborted && operationRef.current === operation) {
          const result = await getAnswer(session.code, session.publisherToken, controller.signal);
          if (result.answer) {
            await peer.setRemoteDescription(result.answer);
            if (operationRef.current === operation && mountedRef.current) setPhase("connecting");
            return;
          }
          await abortableDelay(1_000, controller.signal);
        }
      } catch (error) {
        if (controller.signal.aborted || operationRef.current !== operation) return;
        fail(classifyBroadcastError(error));
      }
    },
    [fail],
  );

  const start = useCallback(async () => {
    if (capability === "insecure") {
      fail("insecure_context");
      return;
    }
    if (capability !== "ready") {
      fail("unsupported_browser");
      return;
    }

    releaseResources({ notifyServer: true });
    const operation = operationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setFailure(undefined);
    setSessionView(undefined);
    setCopyMessage(undefined);
    setMicrophoneMuted(false);
    setPhase("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(facingMode));
      if (controller.signal.aborted || operationRef.current !== operation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setHasLocalMedia(true);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        void localVideoRef.current.play().catch(() => undefined);
      }
      setPhase("preparing");

      const created = await createBroadcast(locale, controller.signal);
      const code = normalizeBroadcastCode(created.code);
      if (!code) throw new Error("invalid_broadcast_code");
      const activeSession = { code, publisherToken: created.publisherToken };
      sessionRef.current = activeSession;
      const expiresAt = new Date(created.expiresAt).getTime();
      function scheduleExpiry() {
        const remaining = expiresAt - Date.now();
        if (remaining > 0) {
          expiryTimerRef.current = window.setTimeout(
            scheduleExpiry,
            Math.min(remaining, 2_147_483_647),
          );
          return;
        }
        if (
          operationRef.current !== operation ||
          sessionRef.current !== activeSession ||
          !mountedRef.current
        ) {
          return;
        }
        releaseResources({ notifyServer: true, keepalive: true });
        if (!mountedRef.current) return;
        setSessionView(undefined);
        setFailure(undefined);
        setMicrophoneMuted(false);
        setPhase("stopped");
      }
      scheduleExpiry();

      // Same-network host candidates only. Production must inject owned
      // STUN/TURN infrastructure instead of hard-coding a public relay.
      const peer = new RTCPeerConnection({ iceServers: [] });
      peerRef.current = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      const syncConnectionState = () => {
        if (operationRef.current !== operation || !mountedRef.current) return;
        const next = connectionPhase(peer.connectionState, true);
        if (next === "failed") fail("ice_failed");
        else if (next === "connecting" || next === "live") setPhase(next);
      };
      peer.onconnectionstatechange = syncConnectionState;
      peer.oniceconnectionstatechange = () => {
        if (peer.iceConnectionState === "failed") fail("ice_failed");
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGatheringComplete(peer, 5_000, controller.signal);
      const gatheredOffer = peer.localDescription;
      if (!gatheredOffer?.sdp || gatheredOffer.type !== "offer") {
        throw new Error("missing_local_offer");
      }
      await submitOffer(code, created.publisherToken, gatheredOffer, controller.signal);
      if (controller.signal.aborted || operationRef.current !== operation) return;

      const viewerUrl = `${window.location.origin}/${locale}/broadcast/watch?code=${encodeURIComponent(
        formatBroadcastCode(code),
      )}`;
      setSessionView({ code, viewerUrl, expiresAt: created.expiresAt });
      setPhase("waiting");
      void pollForAnswer(peer, activeSession, controller, operation);
    } catch (error) {
      if (controller.signal.aborted || operationRef.current !== operation) return;
      fail(classifyBroadcastError(error));
    }
  }, [capability, facingMode, fail, locale, pollForAnswer, releaseResources]);

  const stop = useCallback(() => {
    releaseResources({ notifyServer: true, keepalive: true });
    if (!mountedRef.current) return;
    setSessionView(undefined);
    setFailure(undefined);
    setMicrophoneMuted(false);
    setPhase("stopped");
  }, [releaseResources]);

  const toggleMicrophone = () => {
    const next = !microphoneMuted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMicrophoneMuted(next);
  };

  const copyText = async (value: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(value);
      setCopyMessage(d.copied);
    } catch {
      setCopyMessage(d.copyFailed);
    }
  };

  const busy = phase === "requesting" || phase === "preparing";
  const active = phase === "waiting" || phase === "connecting" || phase === "live";
  const capabilityFailure =
    capability === "insecure"
      ? d.errors.insecure_context
      : capability === "unsupported"
        ? d.errors.unsupported_browser
        : undefined;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>
            <Radio size={14} aria-hidden="true" /> {d.eyebrow}
          </p>
          <h1>{d.publisherTitle}</h1>
          <p>{d.publisherIntro}</p>
        </div>
        <a className={styles.secondaryLink} href={`/${locale}/broadcast/watch`}>
          {d.openViewer} <ExternalLink size={15} aria-hidden="true" />
        </a>
      </header>

      <div className={styles.notice}>
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>{d.privacy}</strong>
          <span>{d.secureHelp}</span>
        </div>
      </div>

      <div className={styles.publisherGrid}>
        <section className={styles.videoPanel} aria-label={d.localPreview}>
          <div className={styles.videoFrame} data-active={hasLocalMedia}>
            <video
              ref={localVideoRef}
              className={styles.localVideo}
              autoPlay
              muted
              playsInline
              aria-label={d.localPreview}
              data-facing={facingMode}
            />
            {!active && !busy && !hasLocalMedia && (
              <div className={styles.videoPlaceholder}>
                <Camera size={34} strokeWidth={1.5} aria-hidden="true" />
                <span>{d.previewPlaceholder}</span>
              </div>
            )}
            {phase === "live" && <span className={styles.liveBadge}>LIVE</span>}
          </div>

          <div className={styles.statusBar}>
            <span className={styles.statusDot} data-phase={phase} aria-hidden="true" />
            <p role="status" aria-live="polite" data-testid="publisher-connection-state">
              <small>{d.statusLabel}</small>
              <strong>{d.phases[phase]}</strong>
            </p>
          </div>

          {(failure || capabilityFailure) && (
            <div className={styles.error} role="alert">
              <Info size={18} aria-hidden="true" />
              <p>{failure ? d.errors[failure] : capabilityFailure}</p>
            </div>
          )}
        </section>

        <aside className={styles.controlPanel}>
          <div className={styles.field}>
            <label htmlFor="broadcast-camera">{d.camera}</label>
            <select
              id="broadcast-camera"
              value={facingMode}
              disabled={busy || active}
              onChange={(event) =>
                setFacingMode(event.target.value === "user" ? "user" : "environment")
              }
            >
              <option value="environment">{d.rearCamera}</option>
              <option value="user">{d.frontCamera}</option>
            </select>
          </div>

          {!active && (
            <button
              className={styles.primaryButton}
              type="button"
              disabled={busy || capability === "checking" || Boolean(capabilityFailure)}
              onClick={() => void start()}
            >
              {busy ? (
                <LoaderCircle className={styles.spin} size={18} aria-hidden="true" />
              ) : (
                <Camera size={18} aria-hidden="true" />
              )}
              {busy ? d.phases[phase] : phase === "failed" ? d.retry : d.start}
            </button>
          )}

          {active && (
            <div className={styles.activeControls}>
              <button className={styles.secondaryButton} type="button" onClick={toggleMicrophone}>
                {microphoneMuted ? (
                  <Mic size={17} aria-hidden="true" />
                ) : (
                  <MicOff size={17} aria-hidden="true" />
                )}
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
                <span>{d.codeLabel}</span>
                <output
                  className={styles.code}
                  aria-label={d.codeLabel}
                  data-testid="publisher-code"
                >
                  {formatBroadcastCode(sessionView.code)}
                </output>
                <small>{d.codeHelp}</small>
              </div>
              <button
                className={styles.copyButton}
                type="button"
                onClick={() => void copyText(formatBroadcastCode(sessionView.code))}
              >
                <Copy size={16} aria-hidden="true" /> {d.copyCode}
              </button>
              <label className={styles.urlField}>
                <span>{d.viewerUrl}</span>
                <input
                  value={sessionView.viewerUrl}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => void copyText(sessionView.viewerUrl)}
              >
                <Clipboard size={16} aria-hidden="true" /> {d.copyLink}
              </button>
              <p className={styles.expiry}>
                {d.expiresAt}: <time>{formatExpiry(sessionView.expiresAt, locale)}</time>
              </p>
              {copyMessage && (
                <p className={styles.copyStatus} role="status" aria-live="polite">
                  {copyMessage === d.copied && <Check size={14} aria-hidden="true" />}
                  {copyMessage}
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
