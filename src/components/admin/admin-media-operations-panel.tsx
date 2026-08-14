"use client";

import {
  CircleAlert,
  CloudCog,
  Play,
  RadioTower,
  RefreshCw,
  Square,
  Upload,
  X,
} from "lucide-react";
import { useId, useState } from "react";
import type { Locale } from "@/i18n/config";
import {
  AdminApiError,
  type AdminMediaOperation,
  type AdminMediaResource,
  type AdminMediaOperationResult,
  type AdminStream,
  type MediaProviderAction,
  operateAdminStream,
} from "./admin-api";
import styles from "./admin-control-room.module.css";

const COPY = {
  et: {
    title: "Kohalik meediatootmine",
    help: "Käivita ja avalda sünteetiline HLS-voog kohaliku FFmpegi adapteriga.",
    disclaimer:
      "Ainult arendus: see juhib kohalikku sünteetilist FFmpegi protsessi. See ei ole tootmise enkooder, origin ega CDN ning ei anna meediaõigusi.",
    noSources: "Teenusepakkujaga local-ffmpeg HLS-allikaid pole seadistatud.",
    desired: "Soovitud olek",
    observed: "Tegelik olek",
    health: "Tervis",
    healthy: "Terve",
    noSignal: "Tervisesignaal puudub",
    lastHealthy: "Viimane terve signaal",
    generation: "Põlvkond",
    lastOperation: "Viimane toiming",
    noOperations: "Toiminguid pole",
    reason: "Toimingu põhjus",
    reasonPlaceholder: "Miks tuleb kohaliku voo olekut muuta?",
    provision: "Valmista ette",
    start: "Käivita enkooder",
    publish: "Avalda kohalik voog",
    unpublish: "Eemalda avaldamine",
    stop: "Peata enkooder",
    refresh: "Kontrolli olekut",
    working: "Töötan…",
    succeeded: "Pakkuja toiming õnnestus ja tegelik olek värskendati.",
    confirmPublishTitle: "Avalda kohalik sünteetiline voog?",
    confirmPublishHelp:
      "Manifest muutub kohaliku arendusserveri kaudu kättesaadavaks. Vaataja ligipääsu kontrollivad endiselt õiguste aknad.",
    confirmUnpublishTitle: "Eemalda kohaliku voo avaldamine?",
    confirmUnpublishHelp:
      "Uued esitused ei saa seda manifesti kasutada. Enkooder jääb tööle, kuni selle eraldi peatad.",
    confirmStopTitle: "Peata kohalik enkooder?",
    confirmStopHelp:
      "Avaldatud voog tuleb enne eemaldada. Peatamine lõpetab sünteetilise meedia tootmise.",
    confirm: "Kinnita toiming",
    cancel: "Katkesta",
    versionConflict: "Voo kirjet on muudetud. Värskenda vaadet ja proovi uuesti.",
    operationInProgress: "Selle voo teine toiming on veel pooleli.",
    staleRequiresRefresh:
      "Eelmise toimingu tulemus pole teada. Vali „Kontrolli olekut“, et tegelik seis ohutult uuesti lugeda.",
    staleNeedsNewKey: "Värskenda vaadet ja käivita oleku kontroll uuesti.",
    mustUnpublish: "Eemalda voog enne avaldamisest ja peata seejärel enkooder.",
    invalidTransition: "Toiming ei sobi praeguse tegeliku olekuga.",
    unreachable: "Kohalik FFmpegi teenus ei vasta. Käivita kohalik meediateenus ja proovi uuesti.",
    error: "Meediatoiming ebaõnnestus.",
    absent: "Puudub",
    provisioned: "Ette valmistatud",
    encoding: "Kodeerib",
    published: "Avaldatud",
    stopped: "Peatatud",
    failed: "Viga",
    pending: "Pooleli",
  },
  en: {
    title: "Local media production",
    help: "Start and publish a synthetic HLS source through the local FFmpeg adapter.",
    disclaimer:
      "Development only: this controls a local synthetic FFmpeg process. It is not a production encoder, origin, or CDN, and it grants no media rights.",
    noSources: "No HLS source using provider local-ffmpeg is configured.",
    desired: "Desired state",
    observed: "Observed state",
    health: "Health",
    healthy: "Healthy",
    noSignal: "No health signal",
    lastHealthy: "Last healthy signal",
    generation: "Generation",
    lastOperation: "Latest operation",
    noOperations: "No operations yet",
    reason: "Operation reason",
    reasonPlaceholder: "Why should the local source state change?",
    provision: "Provision",
    start: "Start encoder",
    publish: "Publish local stream",
    unpublish: "Unpublish",
    stop: "Stop encoder",
    refresh: "Refresh status",
    working: "Working…",
    succeeded: "Provider operation succeeded and observed state was refreshed.",
    confirmPublishTitle: "Publish the local synthetic stream?",
    confirmPublishHelp:
      "The manifest becomes available through the local development server. Viewer access remains gated by rights windows.",
    confirmUnpublishTitle: "Unpublish the local stream?",
    confirmUnpublishHelp:
      "New playback cannot use this manifest. The encoder keeps running until you stop it separately.",
    confirmStopTitle: "Stop the local encoder?",
    confirmStopHelp:
      "A published stream must be unpublished first. Stopping ends synthetic media production.",
    confirm: "Confirm operation",
    cancel: "Cancel",
    versionConflict: "The stream record changed. Refresh the view and try again.",
    operationInProgress: "Another operation for this stream is still running.",
    staleRequiresRefresh:
      "The previous operation has an unknown outcome. Use Refresh status to reconcile it safely.",
    staleNeedsNewKey: "Refresh the view, then run Refresh status again.",
    mustUnpublish: "Unpublish the stream before stopping the encoder.",
    invalidTransition: "That operation is not valid for the current observed state.",
    unreachable:
      "The local FFmpeg service is unreachable. Start the local media service and retry.",
    error: "The media operation failed.",
    absent: "Absent",
    provisioned: "Provisioned",
    encoding: "Encoding",
    published: "Published",
    stopped: "Stopped",
    failed: "Failed",
    pending: "Pending",
  },
} as const;

type Copy = (typeof COPY)[Locale];
type Feedback = { kind: "success" | "error"; message: string } | null;
type ResourceState = AdminMediaResource["observedState"];

function actionAllowed(action: MediaProviderAction, state: ResourceState): boolean {
  switch (action) {
    case "provision":
      return ["absent", "provisioned", "stopped", "failed"].includes(state);
    case "start":
      return ["provisioned", "stopped"].includes(state);
    case "publish":
      return state === "encoding";
    case "unpublish":
      return state === "published";
    case "stop":
      return ["provisioned", "encoding", "stopped", "failed"].includes(state);
    case "refresh":
      return true;
  }
}

function operationError(error: unknown, copy: Copy) {
  if (!(error instanceof AdminApiError)) return copy.error;
  switch (error.code) {
    case "version_conflict":
      return copy.versionConflict;
    case "operation_in_progress":
      return copy.operationInProgress;
    case "stale_operation_requires_refresh":
      return copy.staleRequiresRefresh;
    case "stale_operation_requires_new_idempotency_key":
      return copy.staleNeedsNewKey;
    case "must_unpublish_first":
      return copy.mustUnpublish;
    case "invalid_provider_transition":
      return copy.invalidTransition;
    case "provider_unreachable":
      return copy.unreachable;
    default:
      return copy.error;
  }
}

function operationKey(streamId: string, action: MediaProviderAction) {
  const nonce =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `admin-ui:${streamId}:${action}:${nonce}`;
}

function ConfirmDialog({
  action,
  copy,
  busy,
  onConfirm,
  onCancel,
}: {
  action: "publish" | "unpublish" | "stop";
  copy: Copy;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const title =
    action === "publish"
      ? copy.confirmPublishTitle
      : action === "unpublish"
        ? copy.confirmUnpublishTitle
        : copy.confirmStopTitle;
  const description =
    action === "publish"
      ? copy.confirmPublishHelp
      : action === "unpublish"
        ? copy.confirmUnpublishHelp
        : copy.confirmStopHelp;
  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}
    >
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <button
          className={styles.dialogClose}
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label={copy.cancel}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <span className={action === "publish" ? styles.confirmIcon : styles.dangerIcon}>
          <CircleAlert size={21} aria-hidden="true" />
        </span>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className={styles.dialogActions}>
          <button className="button" type="button" onClick={onCancel} disabled={busy}>
            {copy.cancel}
          </button>
          <button
            className={`button ${action === "publish" ? "primary" : "danger"}`}
            type="button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? (
              <RefreshCw className={styles.spin} size={16} aria-hidden="true" />
            ) : action === "publish" ? (
              <Upload size={16} aria-hidden="true" />
            ) : (
              <Square size={16} aria-hidden="true" />
            )}
            {copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function LocalStreamControl({
  stream,
  resource,
  latestOperation,
  locale,
  copy,
  onResult,
}: {
  stream: AdminStream;
  resource: AdminMediaResource | null;
  latestOperation: AdminMediaOperation | null;
  locale: Locale;
  copy: Copy;
  onResult: (result: AdminMediaOperationResult) => void;
}) {
  const observedState = resource?.observedState ?? "absent";
  const desiredState = resource?.desiredState ?? "absent";
  const [reason, setReason] = useState("");
  const [busyAction, setBusyAction] = useState<MediaProviderAction | null>(null);
  const [confirmAction, setConfirmAction] = useState<"publish" | "unpublish" | "stop" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const reasonId = useId();

  async function execute(action: MediaProviderAction) {
    setConfirmAction(null);
    setBusyAction(action);
    setFeedback(null);
    try {
      const result = await operateAdminStream(
        stream.id,
        { action, reason: reason.trim(), expectedUpdatedAt: stream.updatedAt },
        operationKey(stream.id, action),
      );
      setReason("");
      setFeedback({ kind: "success", message: copy.succeeded });
      onResult(result);
    } catch (error) {
      setFeedback({ kind: "error", message: operationError(error, copy) });
    } finally {
      setBusyAction(null);
    }
  }

  function request(action: MediaProviderAction) {
    if (["publish", "unpublish", "stop"].includes(action)) {
      setConfirmAction(action as "publish" | "unpublish" | "stop");
    } else {
      void execute(action);
    }
  }

  const actions: MediaProviderAction[] = [
    "provision",
    "start",
    "publish",
    "unpublish",
    "stop",
    "refresh",
  ];
  return (
    <article className={styles.providerCard}>
      <header className={styles.providerHeader}>
        <span className={styles.recordIcon}>
          <RadioTower size={18} aria-hidden="true" />
        </span>
        <div className={styles.recordTitle}>
          <strong>{stream.eventTitle[locale]}</strong>
          <small>local-ffmpeg / {stream.providerStreamRef}</small>
        </div>
        <span className={`${styles.state} ${styles[observedState]}`}>{copy[observedState]}</span>
      </header>

      <div className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <small>{copy.desired}</small>
          <strong>{copy[desiredState]}</strong>
        </div>
        <div className={styles.statusCard}>
          <small>{copy.observed}</small>
          <strong>{copy[observedState]}</strong>
        </div>
        <div className={styles.statusCard}>
          <small>{copy.health}</small>
          <strong className={resource?.lastErrorCode ? styles.error : undefined}>
            {resource?.lastErrorCode ?? (resource?.lastHealthyAt ? copy.healthy : copy.noSignal)}
          </strong>
          {resource?.lastHealthyAt && (
            <time>
              {new Intl.DateTimeFormat(locale === "et" ? "et-EE" : "en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/Tallinn",
              }).format(new Date(resource.lastHealthyAt))}
            </time>
          )}
        </div>
        <div className={styles.statusCard}>
          <small>{copy.lastOperation}</small>
          <strong>
            {latestOperation
              ? `${copy[latestOperation.action]} · ${latestOperation.state === "pending" ? copy.pending : latestOperation.state}`
              : copy.noOperations}
          </strong>
          {latestOperation && (
            <time>
              {new Intl.DateTimeFormat(locale === "et" ? "et-EE" : "en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/Tallinn",
              }).format(new Date(latestOperation.requestedAt))}
            </time>
          )}
        </div>
      </div>

      <div className={styles.providerReason}>
        <label htmlFor={reasonId}>{copy.reason}</label>
        <textarea
          id={reasonId}
          required
          minLength={3}
          maxLength={500}
          rows={2}
          value={reason}
          placeholder={copy.reasonPlaceholder}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <div className={styles.providerActions} aria-label={copy.title}>
        {actions.map((action) => (
          <button
            key={action}
            className={`button ${action === "publish" ? "primary" : action === "unpublish" || action === "stop" ? "danger" : "subtle"}`}
            type="button"
            disabled={
              busyAction !== null ||
              reason.trim().length < 3 ||
              !actionAllowed(action, observedState)
            }
            onClick={() => request(action)}
          >
            {busyAction === action ? (
              <RefreshCw className={styles.spin} size={15} aria-hidden="true" />
            ) : action === "start" ? (
              <Play size={15} aria-hidden="true" />
            ) : action === "publish" ? (
              <Upload size={15} aria-hidden="true" />
            ) : action === "refresh" ? (
              <RefreshCw size={15} aria-hidden="true" />
            ) : (
              <Square size={15} aria-hidden="true" />
            )}
            {busyAction === action ? copy.working : copy[action]}
          </button>
        ))}
      </div>
      <div className={styles.feedback} aria-live="polite" aria-atomic="true">
        {feedback && (
          <p
            className={feedback.kind === "error" ? styles.error : styles.success}
            role={feedback.kind === "error" ? "alert" : "status"}
          >
            {feedback.kind === "error" && <CircleAlert size={15} aria-hidden="true" />}
            {feedback.message}
          </p>
        )}
      </div>
      {confirmAction && (
        <ConfirmDialog
          action={confirmAction}
          copy={copy}
          busy={busyAction !== null}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void execute(confirmAction)}
        />
      )}
    </article>
  );
}

export function AdminMediaOperationsPanel({
  locale,
  initialStreams,
  initialResources,
  initialOperations,
  onChanged,
}: {
  locale: Locale;
  initialStreams: AdminStream[];
  initialResources: AdminMediaResource[];
  initialOperations: AdminMediaOperation[];
  onChanged?: (message: string) => void;
}) {
  const copy = COPY[locale];
  const localStreams = initialStreams.filter((stream) => stream.provider === "local-ffmpeg");
  const [state, setState] = useState(() => ({
    sourceStreams: initialStreams,
    sourceResources: initialResources,
    sourceOperations: initialOperations,
    streams: localStreams,
    resources: initialResources,
    operations: initialOperations,
  }));
  const sourceMatches =
    state.sourceStreams === initialStreams &&
    state.sourceResources === initialResources &&
    state.sourceOperations === initialOperations;
  const streams = sourceMatches ? state.streams : localStreams;
  const resources = sourceMatches ? state.resources : initialResources;
  const operations = sourceMatches ? state.operations : initialOperations;

  function commit(result: AdminMediaOperationResult) {
    const nextStreams = streams.map((stream) =>
      stream.id === result.stream.id ? result.stream : stream,
    );
    const nextResources = resources.some((resource) => resource.id === result.resource.id)
      ? resources.map((resource) =>
          resource.id === result.resource.id ? result.resource : resource,
        )
      : [result.resource, ...resources];
    setState({
      sourceStreams: initialStreams,
      sourceResources: initialResources,
      sourceOperations: initialOperations,
      streams: nextStreams,
      resources: nextResources,
      operations: [
        result.operation,
        ...operations.filter((operation) => operation.id !== result.operation.id),
      ],
    });
    onChanged?.(copy.succeeded);
  }

  return (
    <section className="panel" aria-labelledby="admin-media-operations-title">
      <header className="panel-header">
        <div className={styles.sectionHeading}>
          <span>
            <CloudCog size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 id="admin-media-operations-title">{copy.title}</h2>
            <p>{copy.help}</p>
          </div>
        </div>
      </header>
      <div className={styles.panelBody}>
        <p className={styles.providerNotice}>
          <CircleAlert size={16} aria-hidden="true" />
          <span>
            <strong>local-ffmpeg</strong> · {copy.disclaimer}
          </span>
        </p>
        {streams.length === 0 ? (
          <p className={styles.emptyMessage}>{copy.noSources}</p>
        ) : (
          <div className={styles.providerGrid}>
            {streams.map((stream) => (
              <LocalStreamControl
                key={stream.id}
                stream={stream}
                resource={resources.find((resource) => resource.streamId === stream.id) ?? null}
                latestOperation={
                  operations.find((operation) => operation.streamId === stream.id) ?? null
                }
                locale={locale}
                copy={copy}
                onResult={commit}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
