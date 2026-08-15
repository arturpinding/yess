"use client";

import { Info, LoaderCircle, LogOut, Play, Radio, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import {
  formatBroadcastCode,
  normalizeBroadcastCode,
  normalizeBroadcastCodeDraft,
  type BroadcastConnectionPhase,
} from "@/components/demo-broadcast/rtc";
import styles from "@/components/demo-broadcast/demo-broadcast.module.css";
import {
  getLiveBroadcast,
  listLiveBroadcasts,
  LiveBroadcastApiError,
  type LiveBroadcastSummary,
} from "./live-broadcast-api";
import type { LiveBroadcastCopy, ManagedBroadcastErrorKind } from "./live-broadcast-copy";
import {
  connectLiveKitViewer,
  LiveKitTransportError,
  type LiveKitViewerConnection,
} from "./livekit-transport";

const REMOTE_MEDIA_TIMEOUT_MS = 15_000;
const DISCONNECTED_TIMEOUT_MS = 15_000;

function classifyViewerError(error: unknown): ManagedBroadcastErrorKind {
  if (error instanceof LiveBroadcastApiError) {
    if (error.code === "not_found" || error.code === "broadcast_expired") {
      return "session_not_found";
    }
    if (error.code === "broadcast_ended") return "broadcast_ended";
    if (error.code === "rate_limited") return "rate_limited";
    if (error.status >= 500) return "provider_unavailable";
  }
  if (
    error instanceof LiveKitTransportError &&
    (error.code === "connection_failed" || error.code === "connection_timeout")
  ) {
    return "network";
  }
  if (error instanceof TypeError) return "network";
  return "unexpected";
}

export function ManagedBroadcastViewer({
  locale,
  copy: d,
  initialCode,
}: {
  locale: Locale;
  copy: LiveBroadcastCopy;
  initialCode: string;
}) {
  const [broadcasts, setBroadcasts] = useState<LiveBroadcastSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [codeInput, setCodeInput] = useState(initialCode);
  const [phase, setPhase] = useState<BroadcastConnectionPhase>("idle");
  const [failure, setFailure] = useState<ManagedBroadcastErrorKind>();
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [hasRemoteMedia, setHasRemoteMedia] = useState(false);
  const [activeTitle, setActiveTitle] = useState<string>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<LiveKitViewerConnection | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);
  const mediaTimerRef = useRef<number | null>(null);
  const disconnectTimerRef = useRef<number | null>(null);
  const connectionListenerCleanupRef = useRef<(() => void) | null>(null);
  const mediaListenerCleanupRef = useRef<(() => void) | null>(null);
  const operationRef = useRef(0);
  const mountedRef = useRef(true);

  const releaseResources = useCallback(() => {
    operationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (mediaTimerRef.current !== null) {
      window.clearTimeout(mediaTimerRef.current);
      mediaTimerRef.current = null;
    }
    if (disconnectTimerRef.current !== null) {
      window.clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
    connectionListenerCleanupRef.current?.();
    connectionListenerCleanupRef.current = null;
    mediaListenerCleanupRef.current?.();
    mediaListenerCleanupRef.current = null;
    const connection = connectionRef.current;
    connectionRef.current = null;
    if (connection) {
      void connection.close().catch(() => undefined);
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const refreshList = useCallback(async () => {
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    try {
      const next = await listLiveBroadcasts(controller.signal);
      if (!controller.signal.aborted && mountedRef.current) setBroadcasts(next);
    } catch {
      // A stale list is still more useful than replacing it with an error on a transient poll.
    } finally {
      if (!controller.signal.aborted && mountedRef.current) setListLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const initialRefresh = window.setTimeout(() => void refreshList(), 0);
    const timer = window.setInterval(() => void refreshList(), 5_000);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
      listAbortRef.current?.abort();
      releaseResources();
    };
  }, [refreshList, releaseResources]);

  const join = useCallback(
    async (value: string) => {
      const code = normalizeBroadcastCode(value);
      if (!code) {
        setCodeInvalid(true);
        return;
      }
      if (!window.RTCPeerConnection) {
        setFailure("unsupported_browser");
        setPhase("failed");
        return;
      }

      releaseResources();
      const operation = operationRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setCodeInvalid(false);
      setFailure(undefined);
      setHasRemoteMedia(false);
      setActiveTitle(undefined);
      setPhase("preparing");

      try {
        const broadcast = await getLiveBroadcast(code, controller.signal);
        setActiveTitle(broadcast.title);
        setPhase("connecting");

        const connection = await connectLiveKitViewer({
          mediaUrl: broadcast.mediaUrl,
          mediaToken: broadcast.mediaToken,
          signal: controller.signal,
        });
        if (controller.signal.aborted || operationRef.current !== operation) {
          await connection.close().catch(() => undefined);
          return;
        }
        connectionRef.current = connection;
        let receivedMedia = connection.stream.getTracks().length > 0;

        const failConnection = () => {
          if (!mountedRef.current || operationRef.current !== operation) return;
          releaseResources();
          if (!mountedRef.current) return;
          setFailure("network");
          setHasRemoteMedia(false);
          setPhase("failed");
        };
        const syncConnection = (state = connection.state) => {
          if (!mountedRef.current || operationRef.current !== operation) return;
          if (state === "connected") {
            if (disconnectTimerRef.current !== null) {
              window.clearTimeout(disconnectTimerRef.current);
              disconnectTimerRef.current = null;
            }
            setPhase(receivedMedia ? "live" : "connecting");
          } else if (state === "disconnected") {
            failConnection();
          } else if (state === "reconnecting") {
            setPhase("connecting");
            disconnectTimerRef.current ??= window.setTimeout(
              failConnection,
              DISCONNECTED_TIMEOUT_MS,
            );
          }
        };
        const syncMedia = (stream = connection.stream) => {
          if (!mountedRef.current || operationRef.current !== operation) return;
          receivedMedia = stream.getTracks().length > 0;
          setHasRemoteMedia(receivedMedia);
          if (receivedMedia && mediaTimerRef.current !== null) {
            window.clearTimeout(mediaTimerRef.current);
            mediaTimerRef.current = null;
          } else if (!receivedMedia && mediaTimerRef.current === null) {
            mediaTimerRef.current = window.setTimeout(() => {
              if (!mountedRef.current || operationRef.current !== operation) return;
              releaseResources();
              if (!mountedRef.current) return;
              setFailure("provider_unavailable");
              setHasRemoteMedia(false);
              setPhase("failed");
            }, REMOTE_MEDIA_TIMEOUT_MS);
          }
          syncConnection();
        };
        connectionListenerCleanupRef.current = connection.onStateChange(syncConnection);
        mediaListenerCleanupRef.current = connection.onMediaChange(syncMedia);
        if (videoRef.current) {
          videoRef.current.srcObject = connection.stream;
          void videoRef.current.play().catch(() => undefined);
        }
        setCodeInput(code);
        window.history.replaceState(
          null,
          "",
          `/${locale}/broadcast/watch?code=${encodeURIComponent(formatBroadcastCode(code))}`,
        );
        syncMedia();
        syncConnection();
      } catch (error) {
        if (controller.signal.aborted || operationRef.current !== operation) return;
        releaseResources();
        if (!mountedRef.current) return;
        setFailure(classifyViewerError(error));
        setHasRemoteMedia(false);
        setPhase("failed");
      }
    },
    [locale, releaseResources],
  );

  useEffect(() => {
    if (!initialCode) return;
    const timer = window.setTimeout(() => void join(initialCode), 0);
    return () => window.clearTimeout(timer);
  }, [initialCode, join]);

  const leave = () => {
    releaseResources();
    if (!mountedRef.current) return;
    setFailure(undefined);
    setHasRemoteMedia(false);
    setActiveTitle(undefined);
    setPhase("stopped");
    window.history.replaceState(null, "", `/${locale}/broadcast/watch`);
  };

  const busy = phase === "preparing" || phase === "connecting";
  const joined = busy || phase === "live";

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>
            <Radio size={14} aria-hidden="true" /> {d.eyebrow}
          </p>
          <h1>{d.viewerTitle}</h1>
          <p>{d.viewerIntro}</p>
        </div>
        <a className={styles.secondaryLink} href={`/${locale}/broadcast`}>
          {d.startBroadcast}
        </a>
      </header>

      <div className={styles.notice}>
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>{d.managedTitle}</strong>
          <span>{d.managedBody}</span>
        </div>
      </div>

      <div className={styles.viewerLayout}>
        <div className={styles.viewerControls}>
          <section className={styles.joinPanel} aria-labelledby="live-broadcasts-heading">
            <div className={styles.listHeading}>
              <div>
                <p className={styles.step}>01</p>
                <h2 id="live-broadcasts-heading">{d.available}</h2>
                <p>{d.availableHint}</p>
              </div>
              <button
                className={styles.iconAction}
                type="button"
                aria-label={d.refresh}
                title={d.refresh}
                onClick={() => void refreshList()}
              >
                <RefreshCw size={16} aria-hidden="true" />
              </button>
            </div>
            <div className={styles.broadcastList} aria-live="polite">
              {listLoading && broadcasts.length === 0 ? (
                <LoaderCircle className={styles.spin} size={24} aria-label={d.refresh} />
              ) : broadcasts.length === 0 ? (
                <p className={styles.emptyList}>{d.noBroadcasts}</p>
              ) : (
                broadcasts.map((broadcast) => (
                  <button
                    key={broadcast.code}
                    className={styles.broadcastCard}
                    type="button"
                    onClick={() => void join(broadcast.code)}
                  >
                    <span>
                      <strong>{broadcast.title}</strong>
                      <small>{formatBroadcastCode(broadcast.code)}</small>
                    </span>
                    <em data-live={broadcast.state === "live"}>
                      {broadcast.state === "live" ? d.live : d.preparing}
                    </em>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className={styles.joinPanel} aria-labelledby="viewer-code-heading">
            <div>
              <p className={styles.step}>02</p>
              <h2 id="viewer-code-heading">{d.codeInput}</h2>
              <p>{d.codeHint}</p>
            </div>
            <label className={styles.codeField}>
              <span>{d.codeInput}</span>
              <input
                value={formatBroadcastCode(codeInput)}
                placeholder={d.codePlaceholder}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                disabled={joined}
                aria-invalid={codeInvalid}
                onChange={(event) => {
                  setCodeInput(normalizeBroadcastCodeDraft(event.target.value));
                  setCodeInvalid(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !joined) void join(codeInput);
                }}
              />
              <small>{d.codeHint}</small>
            </label>
            {codeInvalid && (
              <p className={styles.inlineError} role="alert">
                {d.invalidCode}
              </p>
            )}
            {!joined ? (
              <button
                className={styles.primaryButton}
                type="button"
                onClick={() => void join(codeInput)}
              >
                <Play size={17} fill="currentColor" aria-hidden="true" /> {d.open}
              </button>
            ) : (
              <button className={styles.secondaryButton} type="button" onClick={leave}>
                <LogOut size={17} aria-hidden="true" /> {d.leave}
              </button>
            )}
          </section>
        </div>

        <section className={styles.videoPanel} aria-label={d.remoteVideo}>
          <div className={styles.remoteFrame} data-active={hasRemoteMedia}>
            <video
              ref={videoRef}
              className={styles.remoteVideo}
              autoPlay
              playsInline
              controls
              aria-label={d.remoteVideo}
            />
            {!hasRemoteMedia && (
              <div className={styles.videoPlaceholder}>
                {busy ? (
                  <LoaderCircle className={styles.spin} size={34} aria-hidden="true" />
                ) : (
                  <Radio size={34} strokeWidth={1.5} aria-hidden="true" />
                )}
                <span>{d.waitingVideo}</span>
              </div>
            )}
            {phase === "live" && <span className={styles.liveBadge}>{d.live}</span>}
          </div>
          <div className={styles.statusBar}>
            <span className={styles.statusDot} data-phase={phase} aria-hidden="true" />
            <p role="status" aria-live="polite">
              <small>{activeTitle ?? d.status}</small>
              <strong>{d.phases[phase]}</strong>
            </p>
          </div>
          {(phase === "live" || phase === "connecting") && (
            <p className={styles.playHelp}>{d.playHelp}</p>
          )}
          {failure && (
            <div className={styles.error} role="alert">
              <Info size={18} aria-hidden="true" />
              <p>{d.errors[failure]}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
