import type { AdminEvent, AdminEventState } from "./admin-api";
import { instantToTallinnInput, tallinnInputToInstant } from "./admin-tallinn-time";

export interface AdminEventDraft {
  titleEt: string;
  titleEn: string;
  state: AdminEventState;
  scheduledStartAt: string;
  actualStartAt: string;
  endAt: string;
  venueId: string;
  statusDetailEt: string;
  statusDetailEn: string;
}

export function adminEventDraft(event: AdminEvent): AdminEventDraft {
  return {
    titleEt: event.titleEt,
    titleEn: event.titleEn,
    state: event.state,
    scheduledStartAt: instantToTallinnInput(event.scheduledStartAt),
    actualStartAt: instantToTallinnInput(event.actualStartAt),
    endAt: instantToTallinnInput(event.endAt),
    venueId: event.venueId ?? "",
    statusDetailEt: event.statusDetailEt ?? "",
    statusDetailEn: event.statusDetailEn ?? "",
  };
}

export function changedAdminEventFields(original: AdminEvent, draft: AdminEventDraft) {
  const previous = adminEventDraft(original);
  const changes: Partial<
    Pick<
      AdminEvent,
      | "titleEt"
      | "titleEn"
      | "state"
      | "scheduledStartAt"
      | "actualStartAt"
      | "endAt"
      | "venueId"
      | "statusDetailEt"
      | "statusDetailEn"
    >
  > = {};

  const titleEt = draft.titleEt.trim();
  const titleEn = draft.titleEn.trim();
  const statusDetailEt = draft.statusDetailEt.trim();
  const statusDetailEn = draft.statusDetailEn.trim();
  if (titleEt !== original.titleEt) changes.titleEt = titleEt;
  if (titleEn !== original.titleEn) changes.titleEn = titleEn;
  if (draft.state !== original.state) changes.state = draft.state;
  if (draft.venueId !== previous.venueId) changes.venueId = draft.venueId || null;
  if (statusDetailEt !== (original.statusDetailEt ?? "")) {
    changes.statusDetailEt = statusDetailEt || null;
  }
  if (statusDetailEn !== (original.statusDetailEn ?? "")) {
    changes.statusDetailEn = statusDetailEn || null;
  }

  // datetime-local intentionally displays minute precision. Compare the untouched
  // wall-clock value first so an unrelated edit preserves original seconds/millis.
  if (draft.scheduledStartAt !== previous.scheduledStartAt) {
    changes.scheduledStartAt = tallinnInputToInstant(draft.scheduledStartAt);
  }
  if (draft.actualStartAt !== previous.actualStartAt) {
    changes.actualStartAt = draft.actualStartAt ? tallinnInputToInstant(draft.actualStartAt) : null;
  }
  if (draft.endAt !== previous.endAt) {
    changes.endAt = draft.endAt ? tallinnInputToInstant(draft.endAt) : null;
  }
  return changes;
}
