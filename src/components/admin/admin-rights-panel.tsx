"use client";

import {
  Ban,
  ChevronDown,
  CircleAlert,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import type { Locale } from "@/i18n/config";
import {
  AdminApiError,
  type AdminProduct,
  type AdminRightsTargetInput,
  type AdminRightsTargetGroups,
  type AdminRightsWindow,
  type CreateRightsWindowInput,
  createAdminRightsWindow,
  deleteAdminRightsWindow,
  RIGHTS_ACCESS_LEVELS,
  RIGHTS_CONTENT_KINDS,
  RIGHTS_TARGET_TYPES,
  type RightsAccess,
  type RightsContentKind,
  type RightsTargetType,
  type UpdateRightsWindowInput,
  updateAdminRightsWindow,
} from "./admin-api";
import { instantToTallinnInput, tallinnInputToInstant } from "./admin-tallinn-time";
import styles from "./admin-control-room.module.css";

const COPY = {
  et: {
    title: "Vaatamisõigused",
    help: "Juhi tehnilist juurdepääsupoliitikat sisu, territooriumi ja ajavahemiku kaupa. Suurem prioriteedinumber võidab.",
    legalNote:
      "See vaade rakendab RADA tehnilist ligipääsupoliitikat. Kirje ei loo ega asenda levilepingut.",
    add: "Lisa õiguste aken",
    close: "Sulge lisamine",
    create: "Loo õiguste aken",
    save: "Salvesta õigused",
    saving: "Salvestan…",
    saved: "Õiguste poliitika salvestatud.",
    created: "Õiguste aken loodud.",
    deleted: "Mitteaktiivne õiguste aken kustutatud.",
    emergency: "Peata juurdepääs kohe",
    emergencyTitle: "Peata selle poliitika alusel juurdepääs?",
    emergencyHelp:
      "Aken muudetakse kättesaamatuks. Uued esituse autoriseerimised keelatakse kohe; juba CDN-is olevat meediat see näidis ei eemalda.",
    delete: "Kustuta mitteaktiivne aken",
    deleteTitle: "Kustuta õiguste aken?",
    deleteHelp:
      "Kustutada saab ainult mitteaktiivse näidissihtmärgi akna. Auditikirje säilib, kuid poliitikat ei saa siin taastada.",
    confirmDelete: "Kustuta aken",
    confirmEmergency: "Peata juurdepääs",
    cancel: "Katkesta",
    targetType: "Sihtmärgi tüüp",
    target: "Sihtmärk",
    content: "Sisu tüüp",
    territory: "Territoorium",
    territoryHelp: "Jäta tühjaks globaalse poliitika jaoks või kasuta kahetähelist koodi, nt EE.",
    access: "Ligipääs",
    product: "Nõutav toode",
    noProduct: "Vali toode",
    starts: "Algab",
    ends: "Lõpeb",
    tallinnTime: "Europe/Tallinn · teisendatakse UTC-ks",
    dvr: "Luba otseülekande tagasikerimine",
    recording: "Luba salvestamine",
    concurrency: "Samaaegsete esituste piir",
    concurrencyHelp: "Jäta tühjaks, kui leping eraldi piiri ei määra.",
    holder: "Õiguste omanik",
    contract: "Lepingu viide",
    contractHelp: "Sisemine viide, mitte lepingutekst ega saladus.",
    externalUrl: "Ametlik vaatamiskoht",
    priority: "Prioriteet",
    reason: "Muudatuse põhjus",
    reasonPlaceholder: "Viita kinnitatud parandusele või operatiivsele vajadusele.",
    noRights: "Õiguste aknaid pole veel lisatud.",
    noTargets: "Selle tüübi sihtmärke pole saadaval.",
    active: "Aktiivne",
    upcoming: "Tulevane",
    expired: "Aegunud",
    global: "Kõik territooriumid",
    noChanges: "Muuda enne salvestamist vähemalt üht välja.",
    conflict:
      "Sama ulatuse, sisu, territooriumi, ajavahemiku ja prioriteediga poliitika kattub olemasolevaga.",
    versionConflict: "Kirjet on vahepeal muudetud. Värskenda vaadet ja proovi uuesti.",
    activeDelete: "Aktiivset õiguste akent ei saa kustutada. Kasuta hädaseiskamist.",
    invalid: "Kontrolli õiguste välju ja ajavahemikku.",
    error: "Õiguste muudatust ei õnnestunud salvestada.",
    free: "Tasuta",
    entitled: "Õigusega konto",
    external_only: "Ainult ametlik väline vaatamine",
    unavailable: "Kättesaamatu",
    live: "Otse",
    replay: "Järelvaatamine",
    highlight: "Tipphetk",
    competition: "Võistlus",
    event: "Sündmus",
    stream: "Ülekandeallikas",
    media_asset: "Meediafail",
  },
  en: {
    title: "Viewing rights",
    help: "Control technical access by content, territory, and time window. A larger priority number wins.",
    legalNote:
      "This view enforces RADA's technical access policy. A record does not create or replace a distribution contract.",
    add: "Add rights window",
    close: "Close add form",
    create: "Create rights window",
    save: "Save rights",
    saving: "Saving…",
    saved: "Rights policy saved.",
    created: "Rights window created.",
    deleted: "Inactive rights window deleted.",
    emergency: "Stop access now",
    emergencyTitle: "Stop access under this policy?",
    emergencyHelp:
      "The window becomes unavailable and new playback authorizations are denied immediately. This demo does not purge media already held by a CDN.",
    delete: "Delete inactive window",
    deleteTitle: "Delete rights window?",
    deleteHelp:
      "Only an inactive window on a demo target can be deleted. Its audit entry remains, but the policy cannot be restored here.",
    confirmDelete: "Delete window",
    confirmEmergency: "Stop access",
    cancel: "Cancel",
    targetType: "Target type",
    target: "Target",
    content: "Content type",
    territory: "Territory",
    territoryHelp: "Leave blank for a global policy or enter a two-letter code such as EE.",
    access: "Access",
    product: "Required product",
    noProduct: "Select a product",
    starts: "Starts",
    ends: "Ends",
    tallinnTime: "Europe/Tallinn · converted to UTC",
    dvr: "Allow live DVR rewind",
    recording: "Allow recording",
    concurrency: "Concurrent playback limit",
    concurrencyHelp: "Leave blank when the contract does not set a separate limit.",
    holder: "Rights holder",
    contract: "Contract reference",
    contractHelp: "Internal reference only; do not paste contract text or secrets.",
    externalUrl: "Official viewing destination",
    priority: "Priority",
    reason: "Reason for change",
    reasonPlaceholder: "Reference the approved correction or operational need.",
    noRights: "No rights windows have been added yet.",
    noTargets: "No targets of this type are available.",
    active: "Active",
    upcoming: "Upcoming",
    expired: "Expired",
    global: "All territories",
    noChanges: "Change at least one field before saving.",
    conflict:
      "A policy with the same scope, content, territory, time overlap, and priority already exists.",
    versionConflict: "Someone changed this record. Refresh the view and try again.",
    activeDelete: "An active rights window cannot be deleted. Use emergency stop instead.",
    invalid: "Check the rights fields and time window.",
    error: "The rights change could not be saved.",
    free: "Free",
    entitled: "Entitled account",
    external_only: "Official external viewing only",
    unavailable: "Unavailable",
    live: "Live",
    replay: "Replay",
    highlight: "Highlight",
    competition: "Competition",
    event: "Event",
    stream: "Playback source",
    media_asset: "Media asset",
  },
} as const;

type Copy = (typeof COPY)[Locale];
type Feedback = { kind: "success" | "error"; message: string } | null;

interface RightsDraft {
  targetType: RightsTargetType;
  targetId: string;
  contentKind: RightsContentKind;
  countryCode: string;
  access: RightsAccess;
  requiredProductId: string;
  startsAt: string;
  endsAt: string;
  dvrAllowed: boolean;
  recordingAllowed: boolean;
  maxConcurrentStreams: string;
  externalWatchUrl: string;
  rightsHolder: string;
  contractReference: string;
  priority: string;
}

const TARGET_GROUP_KEY: Record<RightsTargetType, keyof AdminRightsTargetGroups> = {
  competition: "competitions",
  event: "events",
  stream: "streams",
  media_asset: "mediaAssets",
};

function targetsFor(groups: AdminRightsTargetGroups, type: RightsTargetType) {
  return groups[TARGET_GROUP_KEY[type]];
}

function initialTarget(groups: AdminRightsTargetGroups) {
  for (const type of RIGHTS_TARGET_TYPES) {
    const target = targetsFor(groups, type)[0];
    if (target) return { type, id: target.id };
  }
  return { type: "event" as const, id: "" };
}

function newDraft(groups: AdminRightsTargetGroups): RightsDraft {
  const target = initialTarget(groups);
  const start = new Date();
  const end = new Date(start.getTime() + 4 * 60 * 60_000);
  return {
    targetType: target.type,
    targetId: target.id,
    contentKind: "live",
    countryCode: "EE",
    access: "free",
    requiredProductId: "",
    startsAt: instantToTallinnInput(start.toISOString()),
    endsAt: instantToTallinnInput(end.toISOString()),
    dvrAllowed: false,
    recordingAllowed: false,
    maxConcurrentStreams: "",
    externalWatchUrl: "",
    rightsHolder: "",
    contractReference: "",
    priority: "100",
  };
}

function rightsDraft(right: AdminRightsWindow): RightsDraft {
  return {
    targetType: right.target.type,
    targetId: right.target.id,
    contentKind: right.contentKind,
    countryCode: right.countryCode ?? "",
    access: right.access,
    requiredProductId: right.requiredProductId ?? "",
    startsAt: instantToTallinnInput(right.startsAt),
    endsAt: instantToTallinnInput(right.endsAt),
    dvrAllowed: right.dvrAllowed,
    recordingAllowed: right.recordingAllowed,
    maxConcurrentStreams: right.maxConcurrentStreams?.toString() ?? "",
    externalWatchUrl: right.externalWatchUrl ?? "",
    rightsHolder: right.rightsHolder,
    contractReference: right.contractReference ?? "",
    priority: right.priority.toString(),
  };
}

function normalizeDraft(draft: RightsDraft): RightsDraft {
  const next = { ...draft };
  next.countryCode = next.countryCode.trim().toUpperCase();
  next.rightsHolder = next.rightsHolder.trim();
  next.contractReference = next.contractReference.trim();
  next.externalWatchUrl = next.externalWatchUrl.trim();
  if (next.contentKind !== "live") next.dvrAllowed = false;
  if (next.access === "unavailable") {
    next.requiredProductId = "";
    next.externalWatchUrl = "";
    next.maxConcurrentStreams = "";
    next.dvrAllowed = false;
    next.recordingAllowed = false;
  } else if (next.access === "external_only") {
    next.requiredProductId = "";
    next.maxConcurrentStreams = "";
  } else {
    next.externalWatchUrl = "";
    if (next.access === "free") next.requiredProductId = "";
  }
  return next;
}

function configurationFromDraft(draftValue: RightsDraft): Omit<CreateRightsWindowInput, "reason"> {
  const draft = normalizeDraft(draftValue);
  return {
    target: { type: draft.targetType, id: draft.targetId } as AdminRightsTargetInput,
    contentKind: draft.contentKind,
    countryCode: draft.countryCode || null,
    access: draft.access,
    requiredProductId: draft.requiredProductId || null,
    startsAt: tallinnInputToInstant(draft.startsAt),
    endsAt: tallinnInputToInstant(draft.endsAt),
    dvrAllowed: draft.dvrAllowed,
    recordingAllowed: draft.recordingAllowed,
    maxConcurrentStreams: draft.maxConcurrentStreams ? Number(draft.maxConcurrentStreams) : null,
    externalWatchUrl: draft.externalWatchUrl || null,
    rightsHolder: draft.rightsHolder,
    contractReference: draft.contractReference || null,
    priority: Number(draft.priority),
  };
}

function changedRightsFields(
  original: AdminRightsWindow,
  draftValue: RightsDraft,
): Omit<UpdateRightsWindowInput, "reason" | "expectedUpdatedAt"> {
  const draft = normalizeDraft(draftValue);
  const previous = rightsDraft(original);
  const changes: Omit<UpdateRightsWindowInput, "reason" | "expectedUpdatedAt"> = {};
  if (draft.targetType !== previous.targetType || draft.targetId !== previous.targetId) {
    changes.target = { type: draft.targetType, id: draft.targetId } as AdminRightsTargetInput;
  }
  if (draft.contentKind !== previous.contentKind) changes.contentKind = draft.contentKind;
  if (draft.countryCode !== previous.countryCode) changes.countryCode = draft.countryCode || null;
  if (draft.access !== previous.access) changes.access = draft.access;
  if (draft.requiredProductId !== previous.requiredProductId) {
    changes.requiredProductId = draft.requiredProductId || null;
  }
  if (draft.startsAt !== previous.startsAt)
    changes.startsAt = tallinnInputToInstant(draft.startsAt);
  if (draft.endsAt !== previous.endsAt) changes.endsAt = tallinnInputToInstant(draft.endsAt);
  if (draft.dvrAllowed !== previous.dvrAllowed) changes.dvrAllowed = draft.dvrAllowed;
  if (draft.recordingAllowed !== previous.recordingAllowed) {
    changes.recordingAllowed = draft.recordingAllowed;
  }
  if (draft.maxConcurrentStreams !== previous.maxConcurrentStreams) {
    changes.maxConcurrentStreams = draft.maxConcurrentStreams
      ? Number(draft.maxConcurrentStreams)
      : null;
  }
  if (draft.externalWatchUrl !== previous.externalWatchUrl) {
    changes.externalWatchUrl = draft.externalWatchUrl || null;
  }
  if (draft.rightsHolder !== previous.rightsHolder) changes.rightsHolder = draft.rightsHolder;
  if (draft.contractReference !== previous.contractReference) {
    changes.contractReference = draft.contractReference || null;
  }
  if (draft.priority !== previous.priority) changes.priority = Number(draft.priority);
  return changes;
}

function errorMessage(error: unknown, copy: Copy) {
  if (error instanceof RangeError) return copy.invalid;
  if (!(error instanceof AdminApiError)) return copy.error;
  switch (error.code) {
    case "overlapping_policy_conflict":
      return copy.conflict;
    case "version_conflict":
      return copy.versionConflict;
    case "active_rights_window":
      return copy.activeDelete;
    case "invalid_rights_configuration":
    case "invalid_request":
      return copy.invalid;
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
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: (id: string, hintId?: string) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={`${styles.field} ${wide ? styles.wide : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children(id, hintId)}
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  );
}

function RightsFields({
  draft,
  setDraft,
  groups,
  products,
  locale,
  copy,
}: {
  draft: RightsDraft;
  setDraft: (draft: RightsDraft) => void;
  groups: AdminRightsTargetGroups;
  products: AdminProduct[];
  locale: Locale;
  copy: Copy;
}) {
  const choices = targetsFor(groups, draft.targetType);
  const accessInternal = draft.access === "free" || draft.access === "entitled";
  return (
    <div className={styles.formGrid}>
      <Field label={copy.targetType}>
        {(id) => (
          <select
            id={id}
            value={draft.targetType}
            onChange={(event) => {
              const type = event.target.value as RightsTargetType;
              setDraft({
                ...draft,
                targetType: type,
                targetId: targetsFor(groups, type)[0]?.id ?? "",
              });
            }}
          >
            {RIGHTS_TARGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {copy[type]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={copy.target}>
        {(id) => (
          <select
            id={id}
            required
            value={draft.targetId}
            onChange={(event) => setDraft({ ...draft, targetId: event.target.value })}
          >
            {choices.length === 0 && <option value="">{copy.noTargets}</option>}
            {choices.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label[locale]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={copy.content}>
        {(id) => (
          <select
            id={id}
            value={draft.contentKind}
            onChange={(event) => {
              const contentKind = event.target.value as RightsContentKind;
              setDraft({
                ...draft,
                contentKind,
                dvrAllowed: contentKind === "live" && draft.dvrAllowed,
              });
            }}
          >
            {RIGHTS_CONTENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {copy[kind]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={copy.territory} hint={copy.territoryHelp}>
        {(id, hintId) => (
          <input
            id={id}
            aria-describedby={hintId}
            value={draft.countryCode}
            maxLength={2}
            pattern="[A-Za-z]{2}"
            placeholder="EE"
            onChange={(event) =>
              setDraft({ ...draft, countryCode: event.target.value.toUpperCase() })
            }
          />
        )}
      </Field>
      <Field label={copy.access}>
        {(id) => (
          <select
            id={id}
            value={draft.access}
            onChange={(event) =>
              setDraft(normalizeDraft({ ...draft, access: event.target.value as RightsAccess }))
            }
          >
            {RIGHTS_ACCESS_LEVELS.map((access) => (
              <option key={access} value={access}>
                {copy[access]}
              </option>
            ))}
          </select>
        )}
      </Field>
      {draft.access === "entitled" && (
        <Field label={copy.product}>
          {(id) => (
            <select
              id={id}
              required
              value={draft.requiredProductId}
              onChange={(event) => setDraft({ ...draft, requiredProductId: event.target.value })}
            >
              <option value="">{copy.noProduct}</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.label[locale]} · {product.code}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {draft.access === "external_only" && (
        <Field label={copy.externalUrl} wide>
          {(id) => (
            <input
              id={id}
              type="url"
              required
              value={draft.externalWatchUrl}
              placeholder="https://rights-holder.example/watch"
              onChange={(event) => setDraft({ ...draft, externalWatchUrl: event.target.value })}
            />
          )}
        </Field>
      )}
      <Field label={copy.starts} hint={copy.tallinnTime}>
        {(id, hintId) => (
          <input
            id={id}
            aria-describedby={hintId}
            type="datetime-local"
            required
            value={draft.startsAt}
            onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
          />
        )}
      </Field>
      <Field label={copy.ends} hint={copy.tallinnTime}>
        {(id, hintId) => (
          <input
            id={id}
            aria-describedby={hintId}
            type="datetime-local"
            required
            value={draft.endsAt}
            onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })}
          />
        )}
      </Field>
      <Field label={copy.priority}>
        {(id) => (
          <input
            id={id}
            type="number"
            min={0}
            max={32767}
            required
            value={draft.priority}
            onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
          />
        )}
      </Field>
      {accessInternal && (
        <Field label={copy.concurrency} hint={copy.concurrencyHelp}>
          {(id, hintId) => (
            <input
              id={id}
              aria-describedby={hintId}
              type="number"
              min={1}
              max={32767}
              value={draft.maxConcurrentStreams}
              onChange={(event) => setDraft({ ...draft, maxConcurrentStreams: event.target.value })}
            />
          )}
        </Field>
      )}
      <Field label={copy.holder} wide>
        {(id) => (
          <input
            id={id}
            required
            minLength={1}
            maxLength={180}
            value={draft.rightsHolder}
            onChange={(event) => setDraft({ ...draft, rightsHolder: event.target.value })}
          />
        )}
      </Field>
      <Field label={copy.contract} hint={copy.contractHelp} wide>
        {(id, hintId) => (
          <input
            id={id}
            aria-describedby={hintId}
            maxLength={180}
            value={draft.contractReference}
            onChange={(event) => setDraft({ ...draft, contractReference: event.target.value })}
          />
        )}
      </Field>
      <div className={`${styles.checks} ${styles.wide}`}>
        <label>
          <input
            type="checkbox"
            checked={draft.dvrAllowed}
            disabled={draft.contentKind !== "live" || !accessInternal}
            onChange={(event) => setDraft({ ...draft, dvrAllowed: event.target.checked })}
          />
          <span>{copy.dvr}</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.recordingAllowed}
            disabled={draft.access === "unavailable"}
            onChange={(event) => setDraft({ ...draft, recordingAllowed: event.target.checked })}
          />
          <span>{copy.recording}</span>
        </label>
      </div>
    </div>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
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
          aria-label={cancelLabel}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <span className={styles.dangerIcon}>
          <CircleAlert size={21} aria-hidden="true" />
        </span>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className={styles.dialogActions}>
          <button className="button" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className="button danger" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? (
              <RefreshCw className={styles.spin} size={16} aria-hidden="true" />
            ) : (
              <Ban size={16} aria-hidden="true" />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function windowPhase(right: AdminRightsWindow, now = Date.now()) {
  if (new Date(right.startsAt).getTime() > now) return "upcoming" as const;
  if (new Date(right.endsAt).getTime() <= now) return "expired" as const;
  return "active" as const;
}

function RightsEditor({
  right,
  groups,
  products,
  locale,
  copy,
  onUpdated,
  onDeleted,
}: {
  right: AdminRightsWindow;
  groups: AdminRightsTargetGroups;
  products: AdminProduct[];
  locale: Locale;
  copy: Copy;
  onUpdated: (right: AdminRightsWindow, message: string) => void;
  onDeleted: (id: string, message: string) => void;
}) {
  const [draftState, setDraftState] = useState(() => ({
    sourceUpdatedAt: right.updatedAt,
    value: rightsDraft(right),
  }));
  const draft =
    draftState.sourceUpdatedAt === right.updatedAt ? draftState.value : rightsDraft(right);
  const setDraft = (value: RightsDraft) =>
    setDraftState({ sourceUpdatedAt: right.updatedAt, value });
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"emergency" | "delete" | null>(null);
  const phase = windowPhase(right);

  async function save() {
    setBusy(true);
    setFeedback(null);
    try {
      const changes = changedRightsFields(right, draft);
      if (Object.keys(changes).length === 0) {
        setFeedback({ kind: "error", message: copy.noChanges });
        return;
      }
      const updated = await updateAdminRightsWindow(right.id, {
        ...changes,
        reason: reason.trim(),
        expectedUpdatedAt: right.updatedAt,
      });
      setReason("");
      onUpdated(updated, copy.saved);
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, copy) });
    } finally {
      setBusy(false);
    }
  }

  async function emergencyStop() {
    setConfirmation(null);
    setBusy(true);
    setFeedback(null);
    try {
      const updated = await updateAdminRightsWindow(right.id, {
        access: "unavailable",
        reason: reason.trim(),
        expectedUpdatedAt: right.updatedAt,
      });
      setReason("");
      onUpdated(updated, copy.saved);
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, copy) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setConfirmation(null);
    setBusy(true);
    setFeedback(null);
    try {
      await deleteAdminRightsWindow(right.id, {
        reason: reason.trim(),
        expectedUpdatedAt: right.updatedAt,
      });
      onDeleted(right.id, copy.deleted);
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, copy) });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const changes = changedRightsFields(right, draft);
      if (Object.keys(changes).length === 0) {
        setFeedback({ kind: "error", message: copy.noChanges });
        return;
      }
      if (changes.access === "unavailable") setConfirmation("emergency");
      else void save();
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, copy) });
    }
  }

  return (
    <details className={styles.record}>
      <summary>
        <span className={styles.recordIcon}>
          <ShieldCheck size={18} aria-hidden="true" />
        </span>
        <span className={styles.recordTitle}>
          <strong>{right.target.label[locale]}</strong>
          <small>
            {copy[right.contentKind]} · {right.countryCode ?? copy.global} · P{right.priority}
          </small>
        </span>
        <span className={`${styles.state} ${styles[right.access]}`}>{copy[right.access]}</span>
        <ChevronDown className={styles.chevron} size={18} aria-hidden="true" />
      </summary>
      <form className={styles.editor} onSubmit={submit}>
        <div className={styles.recordMeta}>
          <span>{copy[phase]}</span>
          <span>{right.contractReference ?? copy.legalNote}</span>
        </div>
        <RightsFields
          draft={draft}
          setDraft={setDraft}
          groups={groups}
          products={products}
          locale={locale}
          copy={copy}
        />
        <div className={styles.formGrid}>
          <Field label={copy.reason} wide>
            {(id) => (
              <textarea
                id={id}
                required
                minLength={3}
                maxLength={500}
                rows={2}
                value={reason}
                placeholder={copy.reasonPlaceholder}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
        </div>
        <FeedbackMessage feedback={feedback} />
        <div className={styles.formActions}>
          <button
            className="button primary"
            type="submit"
            disabled={busy || reason.trim().length < 3}
          >
            {busy ? (
              <RefreshCw className={styles.spin} size={16} aria-hidden="true" />
            ) : (
              <Save size={16} aria-hidden="true" />
            )}
            {busy ? copy.saving : copy.save}
          </button>
          {right.access !== "unavailable" && (
            <button
              className="button danger"
              type="button"
              disabled={busy || reason.trim().length < 3}
              onClick={() => setConfirmation("emergency")}
            >
              <Ban size={16} aria-hidden="true" /> {copy.emergency}
            </button>
          )}
          <button
            className="button"
            type="button"
            disabled={busy || phase === "active" || reason.trim().length < 3}
            onClick={() => setConfirmation("delete")}
            title={phase === "active" ? copy.activeDelete : undefined}
          >
            <Trash2 size={16} aria-hidden="true" /> {copy.delete}
          </button>
        </div>
        {phase === "active" && <p className={styles.deleteHelp}>{copy.activeDelete}</p>}
      </form>
      {confirmation === "emergency" && (
        <ConfirmDialog
          title={copy.emergencyTitle}
          description={copy.emergencyHelp}
          confirmLabel={copy.confirmEmergency}
          cancelLabel={copy.cancel}
          busy={busy}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void emergencyStop()}
        />
      )}
      {confirmation === "delete" && (
        <ConfirmDialog
          title={copy.deleteTitle}
          description={copy.deleteHelp}
          confirmLabel={copy.confirmDelete}
          cancelLabel={copy.cancel}
          busy={busy}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void remove()}
        />
      )}
    </details>
  );
}

function CreateRightsForm({
  groups,
  products,
  locale,
  copy,
  onCreated,
}: {
  groups: AdminRightsTargetGroups;
  products: AdminProduct[];
  locale: Locale;
  copy: Copy;
  onCreated: (right: AdminRightsWindow, message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => newDraft(groups));
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const created = await createAdminRightsWindow({
        ...configurationFromDraft(draft),
        reason: reason.trim(),
      });
      setReason("");
      onCreated(created, copy.created);
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, copy) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.createWrap}>
      <button
        className="button primary"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
        {open ? copy.close : copy.add}
      </button>
      {open && (
        <form className={`${styles.editor} ${styles.createForm}`} onSubmit={submit}>
          <RightsFields
            draft={draft}
            setDraft={setDraft}
            groups={groups}
            products={products}
            locale={locale}
            copy={copy}
          />
          <div className={styles.formGrid}>
            <Field label={copy.reason} wide>
              {(id) => (
                <textarea
                  id={id}
                  required
                  minLength={3}
                  maxLength={500}
                  rows={2}
                  value={reason}
                  placeholder={copy.reasonPlaceholder}
                  onChange={(event) => setReason(event.target.value)}
                />
              )}
            </Field>
          </div>
          <FeedbackMessage feedback={feedback} />
          <div className={styles.formActions}>
            <button className="button primary" type="submit" disabled={busy || !draft.targetId}>
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
      <p className={styles.policyNotice}>
        <ShieldCheck size={15} aria-hidden="true" /> {copy.legalNote}
      </p>
    </div>
  );
}

export function AdminRightsPanel({
  locale,
  initialRights,
  rightsTargets,
  products,
  onChanged,
}: {
  locale: Locale;
  initialRights: AdminRightsWindow[];
  rightsTargets: AdminRightsTargetGroups;
  products: AdminProduct[];
  onChanged?: (message: string) => void;
}) {
  const copy = COPY[locale];
  const [state, setState] = useState(() => ({ source: initialRights, value: initialRights }));
  const rights = state.source === initialRights ? state.value : initialRights;
  function commit(next: AdminRightsWindow[], message: string) {
    setState({ source: initialRights, value: next });
    onChanged?.(message);
  }
  return (
    <section className="panel" aria-labelledby="admin-rights-title">
      <header className="panel-header">
        <div className={styles.sectionHeading}>
          <span>
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 id="admin-rights-title">{copy.title}</h2>
            <p>{copy.help}</p>
          </div>
        </div>
      </header>
      <div className={styles.panelBody}>
        <CreateRightsForm
          groups={rightsTargets}
          products={products}
          locale={locale}
          copy={copy}
          onCreated={(right, message) => commit([right, ...rights], message)}
        />
        <div className={styles.records}>
          {rights.length === 0 ? (
            <p className={styles.emptyMessage}>{copy.noRights}</p>
          ) : (
            rights.map((right) => (
              <RightsEditor
                key={right.id}
                right={right}
                groups={rightsTargets}
                products={products}
                locale={locale}
                copy={copy}
                onUpdated={(updated, message) =>
                  commit(
                    rights.map((item) => (item.id === updated.id ? updated : item)),
                    message,
                  )
                }
                onDeleted={(id, message) =>
                  commit(
                    rights.filter((item) => item.id !== id),
                    message,
                  )
                }
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
