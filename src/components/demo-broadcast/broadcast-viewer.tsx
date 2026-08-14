"use client";

import { Info, LoaderCircle, LogOut, Play, Radio, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { claimViewer, submitAnswer } from "./broadcast-api";
import type { BroadcastCopy } from "./broadcast-copy";
import {
  classifyBroadcastError,
  connectionPhase,
  formatBroadcastCode,
  normalizeBroadcastCode,
  normalizeBroadcastCodeDraft,
  type BroadcastConnectionPhase,
  type BroadcastErrorKind,
  waitForIceGatheringComplete,
} from "./rtc";
import styles from "./demo-broadcast.module.css";

type ViewerClaim = {
  code: string;
  viewerToken: string;
  offer: RTCSessionDescriptionInit & { type: "offer" };
  expiresAt: string;
};

export function BroadcastViewer({
  locale,
  copy: d,
  initialCode,
}: {
  locale: Locale;
  copy: BroadcastCopy;
  initialCode: string;
}) {
  const [codeInput, setCodeInput] = useState(initialCode);
  const [phase, setPhase] = useState<BroadcastConnectionPhase>("idle");
  const [failure, setFailure] = useState<BroadcastErrorKind>();
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [hasRemoteMedia, setHasRemoteMedia] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const claimRef = useRef<ViewerClaim | null>(null);
  const operationRef = useRef(0);
  const mountedRef = useRef(true);

  const releaseResources = useCallback(() => {
    operationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const peer = peerRef.current;
    peerRef.current = null;
    if (peer) {
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.oniceconnectionstatechange = null;
      peer.close();
    }
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      claimRef.current = null;
      releaseResources();
    };
  }, [releaseResources]);

  const fail = useCallback(
    (kind: BroadcastErrorKind) => {
      releaseResources();
      if (!mountedRef.current) return;
      setHasRemoteMedia(false);
      setFailure(kind);
      setPhase("failed");
    },
    [releaseResources],
  );

  const join = useCallback(async () => {
    const code = normalizeBroadcastCode(codeInput);
    if (!code) {
      setCodeInvalid(true);
      return;
    }
    if (!window.RTCPeerConnection) {
      fail("unsupported_browser");
      return;
    }

    releaseResources();
    const operation = operationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setCodeInvalid(false);
    setFailure(undefined);
    setHasRemoteMedia(false);
    setPhase("preparing");

    try {
      let claimed = claimRef.current?.code === code ? claimRef.current : null;
      if (!claimed) {
        claimRef.current = null;
        const response = await claimViewer(code, controller.signal);
        if (controller.signal.aborted || operationRef.current !== operation) return;
        claimed = { code, ...response };
        claimRef.current = claimed;
      }

      const peer = new RTCPeerConnection({ iceServers: [] });
      peerRef.current = peer;
      let receivedMedia = false;

      const syncConnectionState = () => {
        if (operationRef.current !== operation || !mountedRef.current) return;
        const next = connectionPhase(peer.connectionState, receivedMedia);
        if (next === "failed") fail("ice_failed");
        else if (next === "connecting" || next === "live") setPhase(next);
      };
      peer.onconnectionstatechange = syncConnectionState;
      peer.oniceconnectionstatechange = () => {
        if (peer.iceConnectionState === "failed") fail("ice_failed");
      };
      peer.ontrack = (event) => {
        if (operationRef.current !== operation || !mountedRef.current) return;
        const incoming = event.streams[0] ?? new MediaStream([event.track]);
        if (remoteStreamRef.current && remoteStreamRef.current !== incoming) {
          remoteStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        remoteStreamRef.current = incoming;
        receivedMedia = true;
        setHasRemoteMedia(true);
        if (videoRef.current) {
          videoRef.current.srcObject = incoming;
          void videoRef.current.play().catch(() => undefined);
        }
        syncConnectionState();
      };

      await peer.setRemoteDescription(claimed.offer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await waitForIceGatheringComplete(peer, 5_000, controller.signal);
      const gatheredAnswer = peer.localDescription;
      if (!gatheredAnswer?.sdp || gatheredAnswer.type !== "answer") {
        throw new Error("missing_local_answer");
      }
      await submitAnswer(code, claimed.viewerToken, gatheredAnswer, controller.signal);
      if (controller.signal.aborted || operationRef.current !== operation) return;
      setCodeInput(code);
      setPhase("connecting");
    } catch (error) {
      if (controller.signal.aborted || operationRef.current !== operation) return;
      fail(classifyBroadcastError(error));
    }
  }, [codeInput, fail, releaseResources]);

  const leave = () => {
    releaseResources();
    if (!mountedRef.current) return;
    setHasRemoteMedia(false);
    setFailure(undefined);
    setPhase("stopped");
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
          {d.start}
        </a>
      </header>

      <div className={styles.notice}>
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>{d.privacy}</strong>
          <span>{d.oneViewer}</span>
        </div>
      </div>

      <div className={styles.viewerLayout}>
        <section className={styles.joinPanel} aria-labelledby="viewer-code-heading">
          <div>
            <p className={styles.step}>01</p>
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
              inputMode="text"
              disabled={joined}
              aria-invalid={codeInvalid}
              aria-describedby={codeInvalid ? "broadcast-code-error" : "broadcast-code-hint"}
              data-testid="viewer-code-input"
              onChange={(event) => {
                const nextCode = normalizeBroadcastCodeDraft(event.target.value);
                if (
                  claimRef.current &&
                  normalizeBroadcastCode(nextCode) !== claimRef.current.code
                ) {
                  claimRef.current = null;
                }
                setCodeInput(nextCode);
                setCodeInvalid(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !joined) void join();
              }}
            />
            <small id="broadcast-code-hint">{d.codeHint}</small>
          </label>
          {codeInvalid && (
            <p id="broadcast-code-error" className={styles.inlineError} role="alert">
              {d.invalidCode}
            </p>
          )}
          {!joined ? (
            <button className={styles.primaryButton} type="button" onClick={() => void join()}>
              <Play size={17} fill="currentColor" aria-hidden="true" /> {d.join}
            </button>
          ) : (
            <button className={styles.secondaryButton} type="button" onClick={leave}>
              <LogOut size={17} aria-hidden="true" /> {d.leave}
            </button>
          )}
        </section>

        <section className={styles.videoPanel} aria-label={d.remoteVideo}>
          <div className={styles.remoteFrame} data-active={hasRemoteMedia}>
            <video
              ref={videoRef}
              className={styles.remoteVideo}
              autoPlay
              playsInline
              controls
              aria-label={d.remoteVideo}
              data-testid="remote-video"
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
            {phase === "live" && <span className={styles.liveBadge}>LIVE</span>}
          </div>

          <div className={styles.statusBar}>
            <span className={styles.statusDot} data-phase={phase} aria-hidden="true" />
            <p role="status" aria-live="polite" data-testid="viewer-connection-state">
              <small>{d.statusLabel}</small>
              <strong>{d.phases[phase]}</strong>
            </p>
          </div>
          {phase === "live" && <p className={styles.playHelp}>{d.playHelp}</p>}
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
