import { z } from "zod";
import { EVENT_STATUSES, canTransitionEventStatus, type EventStatus } from "@/domain/event-status";

const utcInstantSchema = z
  .string()
  .datetime({ offset: false })
  .refine((value) => value.endsWith("Z"), "Timestamp must be an ISO 8601 UTC instant ending in Z")
  .transform((value) => new Date(value));

const nullableUtcInstantSchema = z.union([utcInstantSchema, z.null()]);
const optionalDetailSchema = z.union([z.string().trim().min(1).max(240), z.null()]).optional();

const editableFields = [
  "titleEt",
  "titleEn",
  "state",
  "scheduledStartAt",
  "actualStartAt",
  "endAt",
  "venueId",
  "statusDetailEt",
  "statusDetailEn",
] as const;

export const adminEventParamsSchema = z.object({ eventId: z.string().uuid() }).strict();

export const adminEventPatchSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
    version: z.number().int().positive(),
    titleEt: z.string().trim().min(1).max(240).optional(),
    titleEn: z.string().trim().min(1).max(240).optional(),
    state: z.enum(EVENT_STATUSES).optional(),
    scheduledStartAt: utcInstantSchema.optional(),
    actualStartAt: nullableUtcInstantSchema.optional(),
    endAt: nullableUtcInstantSchema.optional(),
    venueId: z.union([z.string().uuid(), z.null()]).optional(),
    statusDetailEt: optionalDetailSchema,
    statusDetailEn: optionalDetailSchema,
    overrideInvalidTransition: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (!editableFields.some((field) => value[field] !== undefined)) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "At least one editable event field is required",
      });
    }
  });

export type AdminEventPatch = z.infer<typeof adminEventPatchSchema>;

export interface AdminEventSnapshot {
  id: string;
  titleEt: string;
  titleEn: string;
  state: EventStatus;
  scheduledStartAt: Date;
  actualStartAt: Date | null;
  endAt: Date | null;
  venueId: string | null;
  venueName: string | null;
  statusDetailEt: string | null;
  statusDetailEn: string | null;
  version: number;
  updatedAt: Date;
}

export type AdminEventEditableValues = Pick<
  AdminEventSnapshot,
  | "titleEt"
  | "titleEn"
  | "state"
  | "scheduledStartAt"
  | "actualStartAt"
  | "endAt"
  | "venueId"
  | "statusDetailEt"
  | "statusDetailEn"
>;

export type EventControlConflict =
  | { code: "invalid_transition"; from: EventStatus; to: EventStatus }
  | { code: "invalid_schedule"; message: string };

export type EventControlPlan =
  | {
      ok: true;
      values: AdminEventEditableValues;
      transitionOverride: boolean;
    }
  | { ok: false; conflict: EventControlConflict };

/**
 * Resolves a complete candidate before touching PostgreSQL. The route still
 * performs an optimistic version check so concurrent operators cannot silently
 * overwrite each other.
 */
export function planAdminEventUpdate(
  current: AdminEventSnapshot,
  patch: AdminEventPatch,
  now: Date = new Date(),
): EventControlPlan {
  const nextState = patch.state ?? current.state;
  const validTransition = canTransitionEventStatus(current.state, nextState);
  if (!validTransition && !patch.overrideInvalidTransition) {
    return {
      ok: false,
      conflict: { code: "invalid_transition", from: current.state, to: nextState },
    };
  }

  let nextActualStartAt =
    patch.actualStartAt === undefined ? current.actualStartAt : patch.actualStartAt;
  if (current.state !== "live" && nextState === "live" && nextActualStartAt === null) {
    nextActualStartAt = now;
  }

  let nextEndAt = patch.endAt === undefined ? current.endAt : patch.endAt;
  if (current.state !== "finished" && nextState === "finished" && nextEndAt === null) {
    nextEndAt = now;
  }

  const values: AdminEventEditableValues = {
    titleEt: patch.titleEt ?? current.titleEt,
    titleEn: patch.titleEn ?? current.titleEn,
    state: nextState,
    scheduledStartAt: patch.scheduledStartAt ?? current.scheduledStartAt,
    actualStartAt: nextActualStartAt,
    endAt: nextEndAt,
    venueId: patch.venueId === undefined ? current.venueId : patch.venueId,
    statusDetailEt:
      patch.statusDetailEt === undefined ? current.statusDetailEt : patch.statusDetailEt,
    statusDetailEn:
      patch.statusDetailEn === undefined ? current.statusDetailEn : patch.statusDetailEn,
  };

  const effectiveStart = values.actualStartAt ?? values.scheduledStartAt;
  if (values.endAt && values.endAt.getTime() <= effectiveStart.getTime()) {
    return {
      ok: false,
      conflict: {
        code: "invalid_schedule",
        message: "endAt must be later than actualStartAt or scheduledStartAt",
      },
    };
  }

  return {
    ok: true,
    values,
    transitionOverride: !validTransition && patch.overrideInvalidTransition,
  };
}

export function serializeAdminEvent(event: AdminEventSnapshot) {
  return {
    ...event,
    scheduledStartAt: event.scheduledStartAt.toISOString(),
    actualStartAt: event.actualStartAt?.toISOString() ?? null,
    endAt: event.endAt?.toISOString() ?? null,
    updatedAt: event.updatedAt.toISOString(),
  };
}

export function auditEventSnapshot(event: AdminEventSnapshot): Record<string, unknown> {
  return serializeAdminEvent(event);
}
