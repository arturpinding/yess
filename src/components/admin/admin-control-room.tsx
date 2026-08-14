"use client";

import {
  Activity,
  Captions,
  ChevronDown,
  CircleAlert,
  Clock3,
  Plus,
  RadioTower,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  cloneElement,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import type { Locale } from "@/i18n/config";
import {
  AdminApiError,
  type AdminEvent,
  type AdminEventState,
  type AdminMediaOperation,
  type AdminMediaResource,
  type AdminProduct,
  type AdminRightsTargetGroups,
  type AdminRightsWindow,
  type AdminStream,
  type AdminVenue,
  createAdminStream,
  deleteAdminStream,
  EVENT_STATES,
  type StreamEditable,
  type StreamProtocol,
  type StreamState,
  STREAM_PROTOCOLS,
  STREAM_STATES,
  updateAdminEvent,
  updateAdminStream,
} from "./admin-api";
import { adminEventDraft, changedAdminEventFields, type AdminEventDraft } from "./admin-event-form";
import { AdminMediaOperationsPanel } from "./admin-media-operations-panel";
import { AdminRightsPanel } from "./admin-rights-panel";
import { instantToTallinnInput } from "./admin-tallinn-time";
import styles from "./admin-control-room.module.css";

const COPY = {
  et: {
    streamsTitle: "Ülekandeallikad",
    streamsHelp: "Esimene mängitav allikas väikseima prioriteediga valitakse esimesena.",
    eventsTitle: "Sündmuste juhtimine",
    eventsHelp: "Muuda avalikku olekut, Eesti aega, pealkirju ja toimumiskohta.",
    addSource: "Lisa varuallikas",
    addLocalEncoder: "Lisa kohalik enkooder",
    localEncoderHelp:
      "Eeltäidab HLS-allika kohaliku sünteetilise FFmpegi teenuse jaoks; pärast loomist juhi seda meediatootmise paneelis.",
    closeAdd: "Sulge lisamine",
    refresh: "Värskenda andmeid",
    refreshing: "Värskendan…",
    event: "Sündmus",
    eventTitleEt: "Pealkiri eesti keeles",
    eventTitleEn: "Pealkiri inglise keeles",
    protocol: "Protokoll",
    state: "Olek",
    priority: "Prioriteet",
    provider: "Teenusepakkuja",
    providerRef: "Pakkuja voo viide",
    playbackLocator: "Esituse URL",
    externalUrl: "Ametliku vaatamiskoha URL",
    signed: "Nõua allkirjastatud ligipääsu",
    dvr: "Tagasikerimine sekundites",
    captions: "Subtiitrid on saadaval",
    auditReason: "Muudatuse põhjus",
    auditPlaceholder: "Miks seda operatiivmuudatust vaja on?",
    save: "Salvesta muudatused",
    create: "Loo allikas",
    saving: "Salvestan…",
    saved: "Muudatus salvestatud ja vaade värskendatud.",
    created: "Uus varuallikas lisatud.",
    deleted: "Näidisallikas kustutatud.",
    noChanges: "Muuda enne salvestamist vähemalt üht välja.",
    error: "Muudatust ei õnnestunud salvestada.",
    versionConflict: "Andmeid on vahepeal muudetud. Värskenda vaadet ja proovi uuesti.",
    duplicate: "Sama teenusepakkuja ja voo viitega allikas on juba olemas.",
    invalidTransition: "See olekumuutus pole tavapärane. Luba erandparandus või vali teine olek.",
    invalidSchedule: "Ajad ei ole loogilises järjekorras.",
    invalidStreamConfig:
      "Protokoll ja esituse URL ei sobi kokku. Kontrolli allika tüüpi ja aadressi.",
    activePlayback: "Allikat kasutatakse veel. Lõpeta aktiivsed vaatamised enne kustutamist.",
    deleteSource: "Kustuta näidisallikas",
    deleteUnavailable: "Kustutada saab ainult lõpetatud või kättesaamatut näidisallikat.",
    lastHealthy: "Viimane tervisesignaal",
    never: "Puudub",
    demoSource: "Näidisallikas",
    source: "allikas",
    advanced: "Allika seaded",
    eventAdvanced: "Pealkirjad ja täpsemad ajad",
    scheduledStart: "Kavas olev algus",
    actualStart: "Tegelik algus",
    endAt: "Lõpp",
    tallinnTime: "Europe/Tallinn · teisendatakse UTC-ks",
    venue: "Toimumiskoht",
    noVenue: "Toimumiskoht määramata",
    statusDetailEt: "Oleku täpsustus eesti keeles",
    statusDetailEn: "Oleku täpsustus inglise keeles",
    goLive: "Mine otse",
    finish: "Lõpeta sündmus",
    override: "Luba erandlik olekuparandus",
    overrideHelp:
      "Kasutatakse ainult vale oleku parandamiseks; tegevus märgitakse auditilogis erandina.",
    confirmTitle: "Kinnita operatiivmuudatus",
    confirmDestructive:
      "See lõpetab või eemaldab avalikult kasutatava ressursi. Sündmuse kontekst jääb alles.",
    confirmOverride:
      "See jätab tavapärase olekumasina kontrolli vahele ja salvestatakse auditilogisse erandina.",
    confirmDeleteTitle: "Kustuta näidisallikas?",
    confirmDeleteHelp:
      "Kustutamine eemaldab allika ja selle sidusandmed. Seda ei saa juhtimisvaates tagasi võtta.",
    typeToConfirm: "Kinnitamiseks sisesta voo viide",
    confirmationValue: "Kinnitus",
    cancel: "Katkesta",
    confirm: "Kinnita muudatus",
    confirmDelete: "Kustuta allikas",
    locatorHelp: "Kasuta ainult HTTPS-i või kohalikku HTTP näidisvoogu. Saladusi URL-i ei lisata.",
    externalHelp: "Välise allika korral suunatakse vaataja ametliku õiguste omaniku lehele.",
    providerRefHelp: "Stabiilne tehniline viide; sama pakkuja sees peab olema kordumatu.",
    streamEndedFirst:
      "Märgi allikas esmalt lõpetatuks või kättesaamatuks, salvesta ja seejärel kustuta.",
    rightsHelp:
      "Allika lisamine ei loo ega pikenda vaatamisõigusi. Allikas muutub mängitavaks ainult sobiva sündmuse, võistluse või voo õiguse alusel.",
    invalidTallinnTime:
      "Seda kellaaega Europe/Tallinn ajavööndis ei eksisteeri. Vali aeg enne või pärast suveajale üleminekut.",
  },
  en: {
    streamsTitle: "Playback sources",
    streamsHelp: "The first playable source with the lowest priority is selected first.",
    eventsTitle: "Event control",
    eventsHelp: "Change public status, Estonia time, titles, and venue.",
    addSource: "Add fallback source",
    addLocalEncoder: "Add local encoder",
    localEncoderHelp:
      "Prefills an HLS source for the local synthetic FFmpeg service; after creation, control it in the media-production panel.",
    closeAdd: "Close add form",
    refresh: "Refresh data",
    refreshing: "Refreshing…",
    event: "Event",
    eventTitleEt: "Estonian title",
    eventTitleEn: "English title",
    protocol: "Protocol",
    state: "State",
    priority: "Priority",
    provider: "Provider",
    providerRef: "Provider stream reference",
    playbackLocator: "Playback URL",
    externalUrl: "Official viewing destination URL",
    signed: "Require signed access",
    dvr: "DVR window in seconds",
    captions: "Captions available",
    auditReason: "Reason for change",
    auditPlaceholder: "Why is this operational change needed?",
    save: "Save changes",
    create: "Create source",
    saving: "Saving…",
    saved: "Change saved and view refreshed.",
    created: "New fallback source added.",
    deleted: "Demo source deleted.",
    noChanges: "Change at least one field before saving.",
    error: "The change could not be saved.",
    versionConflict: "Someone changed this record. Refresh the view and try again.",
    duplicate: "A source with this provider and stream reference already exists.",
    invalidTransition:
      "That is not a normal state transition. Allow an exceptional correction or choose another state.",
    invalidSchedule: "The event times are not in a valid order.",
    invalidStreamConfig:
      "The protocol and playback URL do not match. Check the source type and address.",
    activePlayback: "This source is still in use. End active playback sessions before deleting it.",
    deleteSource: "Delete demo source",
    deleteUnavailable: "Only an ended or unavailable demo source can be deleted.",
    lastHealthy: "Last health signal",
    never: "Never",
    demoSource: "Demo source",
    source: "source",
    advanced: "Source settings",
    eventAdvanced: "Titles and advanced timing",
    scheduledStart: "Scheduled start",
    actualStart: "Actual start",
    endAt: "End",
    tallinnTime: "Europe/Tallinn · converted to UTC",
    venue: "Venue",
    noVenue: "No venue selected",
    statusDetailEt: "Estonian status detail",
    statusDetailEn: "English status detail",
    goLive: "Go live",
    finish: "Finish event",
    override: "Allow exceptional state correction",
    overrideHelp:
      "Use only to correct bad state; the action is marked as an override in the audit log.",
    confirmTitle: "Confirm operational change",
    confirmDestructive:
      "This ends or removes a publicly used resource. The event context remains available.",
    confirmOverride:
      "This bypasses the normal state-machine check and is recorded as an audit override.",
    confirmDeleteTitle: "Delete demo source?",
    confirmDeleteHelp:
      "Deletion removes the source and its dependent data. It cannot be undone in the control room.",
    typeToConfirm: "Type the stream reference to confirm",
    confirmationValue: "Confirmation",
    cancel: "Cancel",
    confirm: "Confirm change",
    confirmDelete: "Delete source",
    locatorHelp: "Use HTTPS or a local HTTP demo stream only. Never place secrets in a URL.",
    externalHelp: "An external source sends viewers to the rights holder’s official destination.",
    providerRefHelp: "Stable technical reference; it must be unique within the provider.",
    streamEndedFirst: "Mark the source ended or unavailable, save it, then delete it.",
    rightsHelp:
      "Adding a source does not create or extend viewing rights. It becomes playable only under an applicable event, competition, or stream right.",
    invalidTallinnTime:
      "That wall-clock time does not exist in Europe/Tallinn. Choose a time before or after the DST transition.",
  },
} as const;

type Copy = (typeof COPY)[Locale];
type Feedback = { kind: "success" | "error"; message: string } | null;

const EMPTY_RIGHTS_TARGETS: AdminRightsTargetGroups = {
  competitions: [],
  events: [],
  streams: [],
  mediaAssets: [],
};

const EVENT_STATE_LABELS: Record<Locale, Record<AdminEventState, string>> = {
  et: {
    scheduled: "Kavas",
    delayed: "Hilineb",
    live: "Otse",
    paused: "Paus",
    finished: "Lõppenud",
    cancelled: "Tühistatud",
  },
  en: {
    scheduled: "Scheduled",
    delayed: "Delayed",
    live: "Live",
    paused: "Paused",
    finished: "Finished",
    cancelled: "Cancelled",
  },
};

const STREAM_STATE_LABELS: Record<Locale, Record<StreamState, string>> = {
  et: {
    provisioning: "Seadistamisel",
    ready: "Valmis",
    live: "Otse",
    degraded: "Häiritud",
    ended: "Lõppenud",
    unavailable: "Kättesaamatu",
  },
  en: {
    provisioning: "Provisioning",
    ready: "Ready",
    live: "Live",
    degraded: "Degraded",
    ended: "Ended",
    unavailable: "Unavailable",
  },
};

function localizedStreamTitle(stream: AdminStream, locale: Locale) {
  return stream.eventTitle[locale] || stream.eventTitle.et || stream.eventTitle.en;
}

function errorMessage(error: unknown, copy: Copy) {
  if (error instanceof RangeError) return copy.invalidTallinnTime;
  if (!(error instanceof AdminApiError)) return copy.error;
  switch (error.code) {
    case "version_conflict":
      return copy.versionConflict;
    case "duplicate_stream_reference":
    case "stream_reference_conflict":
    case "provider_reference_conflict":
      return copy.duplicate;
    case "invalid_transition":
      return copy.invalidTransition;
    case "invalid_schedule":
      return copy.invalidSchedule;
    case "invalid_stream_configuration":
      return copy.invalidStreamConfig;
    case "active_playback":
    case "stream_in_use":
    case "active_playback_exists":
      return copy.activePlayback;
    case "stream_must_be_inactive":
      return copy.deleteUnavailable;
    default:
      return copy.error;
  }
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  return (
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
  );
}

function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactElement<{ id?: string; "aria-describedby"?: string }>;
  wide?: boolean;
}) {
  const controlId = useId();
  const hintId = `${controlId}-hint`;
  return (
    <div className={`${styles.field} ${wide ? styles.wide : ""}`}>
      <label htmlFor={controlId}>{label}</label>
      {cloneElement(children, {
        id: controlId,
        ...(hint ? { "aria-describedby": hintId } : {}),
      })}
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  );
}

function ConfirmationDialog({
  title,
  description,
  cancelLabel,
  confirmLabel,
  destructive = false,
  expectedText,
  inputLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  expectedText?: string;
  inputLabel?: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState("");
  const confirmed = expectedText === undefined || typed === expectedText;

  useEffect(() => initialFocusRef.current?.focus(), []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
      ) ?? [],
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <button
          ref={initialFocusRef}
          className={styles.dialogClose}
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label={cancelLabel}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <span className={destructive ? styles.dangerIcon : styles.confirmIcon} aria-hidden="true">
          <CircleAlert size={21} />
        </span>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {expectedText !== undefined && (
          <Field label={inputLabel ?? "Confirmation"} hint={<code>{expectedText}</code>} wide>
            <input
              aria-label={inputLabel ?? "Confirmation"}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        )}
        <div className={styles.dialogActions}>
          <button className="button" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={`button ${destructive ? "danger" : "primary"}`}
            type="button"
            onClick={onConfirm}
            disabled={busy || !confirmed}
          >
            {busy ? (
              <RefreshCw className={styles.spin} size={16} aria-hidden="true" />
            ) : destructive ? (
              <Trash2 size={16} aria-hidden="true" />
            ) : (
              <Save size={16} aria-hidden="true" />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function streamDraft(stream: AdminStream): StreamEditable {
  return {
    protocol: stream.protocol,
    state: stream.state,
    priority: stream.priority,
    playbackLocator: stream.playbackLocator,
    externalWatchUrl: stream.externalWatchUrl,
    provider: stream.provider,
    providerStreamRef: stream.providerStreamRef,
    requiresSignedAccess: stream.requiresSignedAccess,
    dvrWindowSeconds: stream.dvrWindowSeconds,
    captionsAvailable: stream.captionsAvailable,
  };
}

function normalizeStreamDraft(draft: StreamEditable): StreamEditable {
  return draft.protocol === "external"
    ? { ...draft, playbackLocator: null, requiresSignedAccess: false, dvrWindowSeconds: 0 }
    : { ...draft, externalWatchUrl: null };
}

function changedStreamFields(original: AdminStream, current: StreamEditable) {
  const normalized = normalizeStreamDraft(current);
  const previous = streamDraft(original);
  return Object.fromEntries(
    (Object.keys(normalized) as Array<keyof StreamEditable>)
      .filter((key) => normalized[key] !== previous[key])
      .map((key) => [key, normalized[key]]),
  ) as Partial<StreamEditable>;
}

function ProtocolFields({
  draft,
  setDraft,
  copy,
  locale,
}: {
  draft: StreamEditable;
  setDraft: (next: StreamEditable) => void;
  copy: Copy;
  locale: Locale;
}) {
  const external = draft.protocol === "external";
  return (
    <>
      <Field label={copy.protocol}>
        <select
          value={draft.protocol}
          onChange={(event) =>
            setDraft({ ...draft, protocol: event.target.value as StreamProtocol })
          }
        >
          {STREAM_PROTOCOLS.map((protocol) => (
            <option key={protocol} value={protocol}>
              {protocol === "ll_hls" ? "LL-HLS" : protocol.toUpperCase()}
            </option>
          ))}
        </select>
      </Field>
      <Field label={copy.state}>
        <select
          value={draft.state}
          onChange={(event) => setDraft({ ...draft, state: event.target.value as StreamState })}
        >
          {STREAM_STATES.map((state) => (
            <option key={state} value={state}>
              {STREAM_STATE_LABELS[locale][state]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={copy.priority}>
        <input
          type="number"
          min={0}
          max={32767}
          required
          value={draft.priority}
          onChange={(event) => setDraft({ ...draft, priority: event.currentTarget.valueAsNumber })}
        />
      </Field>
      <Field label={copy.provider}>
        <input
          required
          minLength={2}
          maxLength={100}
          value={draft.provider}
          onChange={(event) => setDraft({ ...draft, provider: event.target.value })}
        />
      </Field>
      <Field label={copy.providerRef} hint={copy.providerRefHelp} wide>
        <input
          required
          minLength={2}
          maxLength={200}
          value={draft.providerStreamRef}
          onChange={(event) => setDraft({ ...draft, providerStreamRef: event.target.value })}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field
        label={external ? copy.externalUrl : copy.playbackLocator}
        hint={external ? copy.externalHelp : copy.locatorHelp}
        wide
      >
        <input
          type="url"
          required
          value={(external ? draft.externalWatchUrl : draft.playbackLocator) ?? ""}
          onChange={(event) =>
            setDraft(
              external
                ? { ...draft, externalWatchUrl: event.target.value }
                : { ...draft, playbackLocator: event.target.value },
            )
          }
          placeholder={
            external
              ? "https://rights-holder.example/watch"
              : "https://media.example/live/master.m3u8"
          }
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field label={copy.dvr}>
        <input
          type="number"
          min={0}
          max={604800}
          required
          disabled={external}
          value={external ? 0 : draft.dvrWindowSeconds}
          onChange={(event) =>
            setDraft({ ...draft, dvrWindowSeconds: event.currentTarget.valueAsNumber })
          }
        />
      </Field>
      <div className={styles.checks}>
        <label>
          <input
            type="checkbox"
            checked={!external && draft.requiresSignedAccess}
            disabled={external}
            onChange={(event) => setDraft({ ...draft, requiresSignedAccess: event.target.checked })}
          />{" "}
          <span>{copy.signed}</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.captionsAvailable}
            onChange={(event) => setDraft({ ...draft, captionsAvailable: event.target.checked })}
          />{" "}
          <Captions size={16} aria-hidden="true" /> <span>{copy.captions}</span>
        </label>
      </div>
    </>
  );
}

function StreamEditor({
  stream,
  locale,
  copy,
  onUpdated,
  onDeleted,
}: {
  stream: AdminStream;
  locale: Locale;
  copy: Copy;
  onUpdated: (stream: AdminStream) => void;
  onDeleted: (streamId: string) => void;
}) {
  const [draftState, setDraftState] = useState(() => ({
    sourceUpdatedAt: stream.updatedAt,
    value: streamDraft(stream),
  }));
  const draft =
    draftState.sourceUpdatedAt === stream.updatedAt ? draftState.value : streamDraft(stream);
  const setDraft = (value: StreamEditable) =>
    setDraftState({ sourceUpdatedAt: stream.updatedAt, value });
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"save" | "delete" | null>(null);

  async function save() {
    setConfirmation(null);
    setBusy(true);
    setFeedback(null);
    try {
      const changes = changedStreamFields(stream, draft);
      if (!Object.keys(changes).length) {
        setFeedback({ kind: "error", message: copy.noChanges });
        return;
      }
      const updated = await updateAdminStream(stream.id, {
        ...changes,
        reason: reason.trim(),
        expectedUpdatedAt: stream.updatedAt,
      });
      setDraftState({ sourceUpdatedAt: stream.updatedAt, value: streamDraft(updated) });
      onUpdated(updated);
      setReason("");
      setFeedback({ kind: "success", message: copy.saved });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, copy) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setFeedback(null);
    try {
      await deleteAdminStream(stream.id, {
        reason: reason.trim(),
        expectedUpdatedAt: stream.updatedAt,
      });
      setConfirmation(null);
      onDeleted(stream.id);
    } catch (error) {
      setConfirmation(null);
      setFeedback({ kind: "error", message: errorMessage(error, copy) });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changes = changedStreamFields(stream, draft);
    if (!Object.keys(changes).length) {
      setFeedback({ kind: "error", message: copy.noChanges });
      return;
    }
    if (changes.state === "ended" || changes.state === "unavailable") setConfirmation("save");
    else void save();
  }

  const canDelete = stream.isDemo && (stream.state === "ended" || stream.state === "unavailable");

  return (
    <details className={styles.record}>
      <summary>
        <span className={styles.recordIcon}>
          <RadioTower size={18} aria-hidden="true" />
        </span>
        <span className={styles.recordTitle}>
          <strong>{localizedStreamTitle(stream, locale)}</strong>
          <small>
            {stream.protocol === "ll_hls" ? "LL-HLS" : stream.protocol.toUpperCase()} ·{" "}
            {stream.provider} · P{stream.priority}
          </small>
        </span>
        <span className={`${styles.state} ${styles[stream.state]}`}>
          {STREAM_STATE_LABELS[locale][stream.state]}
        </span>
        <ChevronDown className={styles.chevron} size={18} aria-hidden="true" />
      </summary>
      <form className={styles.editor} onSubmit={submit}>
        <div className={styles.recordMeta}>
          <span>{stream.isDemo ? copy.demoSource : copy.source}</span>
          <span>
            {copy.lastHealthy}:{" "}
            {stream.lastHealthyAt
              ? new Intl.DateTimeFormat(locale === "et" ? "et-EE" : "en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Europe/Tallinn",
                }).format(new Date(stream.lastHealthyAt))
              : copy.never}
          </span>
        </div>
        <div className={styles.formGrid}>
          <ProtocolFields draft={draft} setDraft={setDraft} copy={copy} locale={locale} />
          <Field label={copy.auditReason} wide>
            <textarea
              required
              minLength={3}
              maxLength={500}
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={copy.auditPlaceholder}
            />
          </Field>
        </div>
        <FeedbackMessage feedback={feedback} />
        <div className={styles.formActions}>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? (
              <RefreshCw className={styles.spin} size={16} aria-hidden="true" />
            ) : (
              <Save size={16} aria-hidden="true" />
            )}
            {busy ? copy.saving : copy.save}
          </button>
          {stream.isDemo && (
            <button
              className="button danger"
              type="button"
              disabled={busy || !canDelete || reason.trim().length < 3}
              onClick={() => setConfirmation("delete")}
              aria-describedby={!canDelete ? `delete-help-${stream.id}` : undefined}
            >
              <Trash2 size={16} aria-hidden="true" /> {copy.deleteSource}
            </button>
          )}
        </div>
        {stream.isDemo && !canDelete && (
          <p id={`delete-help-${stream.id}`} className={styles.deleteHelp}>
            {copy.streamEndedFirst}
          </p>
        )}
      </form>
      {confirmation === "save" && (
        <ConfirmationDialog
          title={copy.confirmTitle}
          description={copy.confirmDestructive}
          cancelLabel={copy.cancel}
          confirmLabel={copy.confirm}
          busy={busy}
          destructive
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void save()}
        />
      )}
      {confirmation === "delete" && (
        <ConfirmationDialog
          title={copy.confirmDeleteTitle}
          description={copy.confirmDeleteHelp}
          cancelLabel={copy.cancel}
          confirmLabel={copy.confirmDelete}
          busy={busy}
          destructive
          expectedText={stream.providerStreamRef}
          inputLabel={copy.typeToConfirm}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void remove()}
        />
      )}
    </details>
  );
}

function CreateStreamForm({
  events,
  locale,
  copy,
  onCreated,
}: {
  events: AdminEvent[];
  locale: Locale;
  copy: Copy;
  onCreated: (stream: AdminStream) => void;
}) {
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [draft, setDraft] = useState<StreamEditable>({
    protocol: "hls",
    state: "ready",
    priority: 100,
    playbackLocator: "",
    externalWatchUrl: null,
    provider: "",
    providerStreamRef: "",
    requiresSignedAccess: true,
    dvrWindowSeconds: 0,
    captionsAvailable: false,
  });
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  function presetLocalEncoder() {
    const reference = `local-${eventId.slice(0, 8)}-${Date.now().toString(36)}`;
    setDraft({
      protocol: "hls",
      state: "provisioning",
      priority: 50,
      playbackLocator: `http://127.0.0.1:8090/media/${reference}/index.m3u8`,
      externalWatchUrl: null,
      provider: "local-ffmpeg",
      providerStreamRef: reference,
      requiresSignedAccess: false,
      dvrWindowSeconds: 0,
      captionsAvailable: false,
    });
    setOpen(true);
    setFeedback(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const created = await createAdminStream({
        ...normalizeStreamDraft(draft),
        eventId,
        reason: reason.trim(),
      });
      onCreated(created);
      setReason("");
      setDraft((current) => ({
        ...current,
        providerStreamRef: "",
        playbackLocator: current.protocol === "external" ? null : "",
        externalWatchUrl: current.protocol === "external" ? "" : null,
      }));
      setFeedback({ kind: "success", message: copy.created });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, copy) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.createWrap}>
      <div className={styles.createActions}>
        <button
          className="button primary"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
          {open ? copy.closeAdd : copy.addSource}
        </button>
        <button className="button" type="button" onClick={presetLocalEncoder}>
          <RadioTower size={16} aria-hidden="true" /> {copy.addLocalEncoder}
        </button>
      </div>
      {open && (
        <form className={`${styles.editor} ${styles.createForm}`} onSubmit={submit}>
          <div className={styles.formGrid}>
            <Field label={copy.event} wide>
              <select required value={eventId} onChange={(event) => setEventId(event.target.value)}>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {locale === "et" ? event.titleEt : event.titleEn}
                  </option>
                ))}
              </select>
            </Field>
            <ProtocolFields draft={draft} setDraft={setDraft} copy={copy} locale={locale} />
            <Field label={copy.auditReason} wide>
              <textarea
                required
                minLength={3}
                maxLength={500}
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={copy.auditPlaceholder}
              />
            </Field>
          </div>
          <FeedbackMessage feedback={feedback} />
          <div className={styles.formActions}>
            <button className="button primary" type="submit" disabled={busy || !eventId}>
              {busy ? (
                <RefreshCw className={styles.spin} size={16} aria-hidden="true" />
              ) : (
                <Plus size={16} aria-hidden="true" />
              )}
              {busy ? copy.saving : copy.create}
            </button>
          </div>
        </form>
      )}
      <p className={styles.rightsHelp}>{copy.localEncoderHelp}</p>
      <p className={styles.rightsHelp}>{copy.rightsHelp}</p>
    </div>
  );
}

function EventEditor({
  event,
  venues,
  locale,
  copy,
  onUpdated,
}: {
  event: AdminEvent;
  venues: AdminVenue[];
  locale: Locale;
  copy: Copy;
  onUpdated: (event: AdminEvent) => void;
}) {
  const [draftState, setDraftState] = useState(() => ({
    sourceUpdatedAt: event.updatedAt,
    value: adminEventDraft(event),
  }));
  const draft =
    draftState.sourceUpdatedAt === event.updatedAt ? draftState.value : adminEventDraft(event);
  const setDraft = (value: AdminEventDraft | ((current: AdminEventDraft) => AdminEventDraft)) => {
    setDraftState((current) => {
      const currentValue =
        current.sourceUpdatedAt === event.updatedAt ? current.value : adminEventDraft(event);
      return {
        sourceUpdatedAt: event.updatedAt,
        value: typeof value === "function" ? value(currentValue) : value,
      };
    });
  };
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function setState(state: AdminEventState) {
    const now = instantToTallinnInput(new Date().toISOString());
    setDraft((current) => ({
      ...current,
      state,
      actualStartAt: state === "live" && current.state !== "live" ? now : current.actualStartAt,
      endAt: state === "finished" && current.state !== "finished" ? now : current.endAt,
    }));
  }

  async function save() {
    setConfirming(false);
    setBusy(true);
    setFeedback(null);
    try {
      const changes = changedAdminEventFields(event, draft);
      if (!Object.keys(changes).length) {
        setFeedback({ kind: "error", message: copy.noChanges });
        return;
      }
      const updated = await updateAdminEvent(event.id, {
        ...changes,
        reason: reason.trim(),
        version: event.version,
        ...(override ? { overrideInvalidTransition: true } : {}),
      });
      setDraftState({ sourceUpdatedAt: event.updatedAt, value: adminEventDraft(updated) });
      onUpdated(updated);
      setReason("");
      setOverride(false);
      setFeedback({ kind: "success", message: copy.saved });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, copy) });
    } finally {
      setBusy(false);
    }
  }

  function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    try {
      const changes = changedAdminEventFields(event, draft);
      if (!Object.keys(changes).length) {
        setFeedback({ kind: "error", message: copy.noChanges });
        return;
      }
      if (override || changes.state === "finished" || changes.state === "cancelled")
        setConfirming(true);
      else void save();
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, copy) });
    }
  }

  return (
    <details className={styles.record}>
      <summary>
        <span className={styles.recordIcon}>
          <Activity size={18} aria-hidden="true" />
        </span>
        <span className={styles.recordTitle}>
          <strong>{locale === "et" ? event.titleEt : event.titleEn}</strong>
          <small>
            <Clock3 size={13} aria-hidden="true" />{" "}
            {new Intl.DateTimeFormat(locale === "et" ? "et-EE" : "en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Europe/Tallinn",
            }).format(new Date(event.scheduledStartAt))}
          </small>
        </span>
        <span className={`${styles.state} ${styles[event.state]}`}>
          {EVENT_STATE_LABELS[locale][event.state]}
        </span>
        <ChevronDown className={styles.chevron} size={18} aria-hidden="true" />
      </summary>
      <form className={styles.editor} onSubmit={submit}>
        <div className={styles.quickActions} aria-label={copy.state}>
          <button
            className="button subtle"
            type="button"
            onClick={() => setState("live")}
            disabled={busy || draft.state === "live"}
          >
            <RadioTower size={15} aria-hidden="true" /> {copy.goLive}
          </button>
          <button
            className="button subtle"
            type="button"
            onClick={() => setState("finished")}
            disabled={busy || draft.state === "finished"}
          >
            <Activity size={15} aria-hidden="true" /> {copy.finish}
          </button>
        </div>
        <div className={styles.formGrid}>
          <Field label={copy.state}>
            <select
              value={draft.state}
              onChange={(changeEvent) => setState(changeEvent.target.value as AdminEventState)}
            >
              {EVENT_STATES.map((state) => (
                <option key={state} value={state}>
                  {EVENT_STATE_LABELS[locale][state]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={copy.venue}>
            <select
              value={draft.venueId}
              onChange={(changeEvent) => setDraft({ ...draft, venueId: changeEvent.target.value })}
            >
              <option value="">{copy.noVenue}</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name} · {venue.city}, {venue.countryCode}
                </option>
              ))}
            </select>
          </Field>
          <Field label={copy.scheduledStart} hint={copy.tallinnTime}>
            <input
              type="datetime-local"
              required
              value={draft.scheduledStartAt}
              onChange={(changeEvent) =>
                setDraft({ ...draft, scheduledStartAt: changeEvent.target.value })
              }
            />
          </Field>
          <Field label={copy.actualStart} hint={copy.tallinnTime}>
            <input
              type="datetime-local"
              value={draft.actualStartAt}
              onChange={(changeEvent) =>
                setDraft({ ...draft, actualStartAt: changeEvent.target.value })
              }
            />
          </Field>
          <Field label={copy.endAt} hint={copy.tallinnTime}>
            <input
              type="datetime-local"
              value={draft.endAt}
              onChange={(changeEvent) => setDraft({ ...draft, endAt: changeEvent.target.value })}
            />
          </Field>
          <Field label={copy.eventTitleEt} wide>
            <input
              required
              minLength={2}
              maxLength={240}
              value={draft.titleEt}
              onChange={(changeEvent) => setDraft({ ...draft, titleEt: changeEvent.target.value })}
            />
          </Field>
          <Field label={copy.eventTitleEn} wide>
            <input
              required
              minLength={2}
              maxLength={240}
              value={draft.titleEn}
              onChange={(changeEvent) => setDraft({ ...draft, titleEn: changeEvent.target.value })}
            />
          </Field>
          <Field label={copy.statusDetailEt}>
            <input
              maxLength={240}
              value={draft.statusDetailEt}
              onChange={(changeEvent) =>
                setDraft({ ...draft, statusDetailEt: changeEvent.target.value })
              }
            />
          </Field>
          <Field label={copy.statusDetailEn}>
            <input
              maxLength={240}
              value={draft.statusDetailEn}
              onChange={(changeEvent) =>
                setDraft({ ...draft, statusDetailEn: changeEvent.target.value })
              }
            />
          </Field>
          <div className={`${styles.override} ${styles.wide}`}>
            <label>
              <input
                type="checkbox"
                checked={override}
                onChange={(changeEvent) => setOverride(changeEvent.target.checked)}
              />{" "}
              <span>{copy.override}</span>
            </label>
            <small>{copy.overrideHelp}</small>
          </div>
          <Field label={copy.auditReason} wide>
            <textarea
              required
              minLength={3}
              maxLength={500}
              rows={2}
              value={reason}
              onChange={(changeEvent) => setReason(changeEvent.target.value)}
              placeholder={copy.auditPlaceholder}
            />
          </Field>
        </div>
        <FeedbackMessage feedback={feedback} />
        <div className={styles.formActions}>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? (
              <RefreshCw className={styles.spin} size={16} aria-hidden="true" />
            ) : (
              <Save size={16} aria-hidden="true" />
            )}
            {busy ? copy.saving : copy.save}
          </button>
        </div>
      </form>
      {confirming && (
        <ConfirmationDialog
          title={copy.confirmTitle}
          description={override ? copy.confirmOverride : copy.confirmDestructive}
          cancelLabel={copy.cancel}
          confirmLabel={copy.confirm}
          busy={busy}
          destructive
          onCancel={() => setConfirming(false)}
          onConfirm={() => void save()}
        />
      )}
    </details>
  );
}

export function AdminControlRoom({
  locale,
  initialStreams,
  initialEvents,
  venues,
  initialRights = [],
  rightsTargets = EMPTY_RIGHTS_TARGETS,
  products = [],
  mediaResources = [],
  mediaOperations = [],
}: {
  locale: Locale;
  initialStreams: AdminStream[];
  initialEvents: AdminEvent[];
  venues: AdminVenue[];
  initialRights?: AdminRightsWindow[];
  rightsTargets?: AdminRightsTargetGroups;
  products?: AdminProduct[];
  mediaResources?: AdminMediaResource[];
  mediaOperations?: AdminMediaOperation[];
}) {
  const copy = COPY[locale];
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [announcement, setAnnouncement] = useState("");

  function refresh(message?: string) {
    if (message) setAnnouncement(message);
    startRefresh(() => router.refresh());
  }

  function updateStream() {
    refresh(copy.saved);
  }

  function createStream() {
    refresh(copy.created);
  }

  return (
    <div className={styles.room}>
      <div className={styles.toolbar}>
        <button className="button" type="button" onClick={() => refresh()} disabled={refreshing}>
          <RefreshCw
            className={refreshing ? styles.spin : undefined}
            size={16}
            aria-hidden="true"
          />
          {refreshing ? copy.refreshing : copy.refresh}
        </button>
      </div>
      <FeedbackMessage
        feedback={announcement ? { kind: "success", message: announcement } : null}
      />

      <section className="panel" aria-labelledby="admin-streams-title">
        <header className="panel-header">
          <div className={styles.sectionHeading}>
            <span>
              <RadioTower size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 id="admin-streams-title">{copy.streamsTitle}</h2>
              <p>{copy.streamsHelp}</p>
            </div>
          </div>
        </header>
        <div className={styles.panelBody}>
          <CreateStreamForm
            events={initialEvents}
            locale={locale}
            copy={copy}
            onCreated={createStream}
          />
          <div className={styles.records}>
            {initialStreams.map((stream) => (
              <StreamEditor
                key={stream.id}
                stream={stream}
                locale={locale}
                copy={copy}
                onUpdated={updateStream}
                onDeleted={() => refresh(copy.deleted)}
              />
            ))}
          </div>
        </div>
      </section>

      <AdminMediaOperationsPanel
        locale={locale}
        initialStreams={initialStreams}
        initialResources={mediaResources}
        initialOperations={mediaOperations}
        onChanged={refresh}
      />

      <AdminRightsPanel
        locale={locale}
        initialRights={initialRights}
        rightsTargets={rightsTargets}
        products={products}
        onChanged={refresh}
      />

      <section className="panel" aria-labelledby="admin-events-title">
        <header className="panel-header">
          <div className={styles.sectionHeading}>
            <span>
              <Activity size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 id="admin-events-title">{copy.eventsTitle}</h2>
              <p>{copy.eventsHelp}</p>
            </div>
          </div>
        </header>
        <div className={styles.panelBody}>
          <div className={styles.records}>
            {initialEvents.map((event) => (
              <EventEditor
                key={event.id}
                event={event}
                venues={venues}
                locale={locale}
                copy={copy}
                onUpdated={() => refresh(copy.saved)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
