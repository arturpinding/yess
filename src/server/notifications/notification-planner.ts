import { createHash } from "node:crypto";
import type { EventStatus } from "@/domain/event-status";
import {
  NOTIFICATION_KINDS as NOTIFICATION_TYPES,
  type NotificationKind,
} from "@/domain/notification-preferences";

export { NOTIFICATION_TYPES };
export type NotificationType = NotificationKind;

export interface NotificationIntent {
  deduplicationKey: string;
  profileId: string;
  eventId: string;
  eventRevision: number;
  type: NotificationType;
  scheduledFor: Date;
  spoilerSensitive: boolean;
  parameters: Readonly<Record<string, string | number | boolean | null>>;
}

export interface NotificationIdentity {
  profileId: string;
  eventId: string;
  eventRevision: number;
  type: NotificationType;
  discriminator?: string;
}

/** Hashing length-prefixed JSON avoids delimiter collisions and leaking identifiers into provider keys. */
export function notificationDeduplicationKey(identity: NotificationIdentity): string {
  if (!Number.isInteger(identity.eventRevision) || identity.eventRevision < 0) {
    throw new RangeError("eventRevision must be a non-negative integer");
  }
  const canonical = JSON.stringify({
    version: 1,
    profileId: identity.profileId,
    eventId: identity.eventId,
    eventRevision: identity.eventRevision,
    type: identity.type,
    discriminator: identity.discriminator ?? null,
  });
  return `notification:v1:${createHash("sha256").update(canonical).digest("hex")}`;
}

export interface EventNotificationPlanInput {
  profileId: string;
  eventId: string;
  eventRevision: number;
  startAt: Date;
  status: EventStatus;
  leadMinutes: number;
  now: Date;
}

/** Plans future lifecycle notifications. It does not write or deliver anything. */
export function planEventNotifications(input: EventNotificationPlanInput): NotificationIntent[] {
  validatePlanInput(input);
  if (input.status === "cancelled" || input.status === "finished") {
    return [];
  }

  const startAtMs = input.startAt.getTime();
  const nowMs = input.now.getTime();
  if (startAtMs <= nowMs) {
    return [];
  }

  const leadMs = input.leadMinutes * 60_000;
  const startingSoonAt = new Date(Math.max(nowMs, startAtMs - leadMs));
  const base = {
    profileId: input.profileId,
    eventId: input.eventId,
    eventRevision: input.eventRevision,
  };

  return [
    {
      ...base,
      type: "event_starting_soon",
      deduplicationKey: notificationDeduplicationKey({
        ...base,
        type: "event_starting_soon",
        discriminator: String(input.leadMinutes),
      }),
      scheduledFor: startingSoonAt,
      spoilerSensitive: false,
      parameters: { leadMinutes: input.leadMinutes },
    },
    {
      ...base,
      type: "event_started",
      deduplicationKey: notificationDeduplicationKey({ ...base, type: "event_started" }),
      scheduledFor: new Date(startAtMs),
      spoilerSensitive: false,
      parameters: {},
    },
  ];
}

export interface EventScheduleSnapshot {
  eventId: string;
  revision: number;
  startAt: Date;
  venueId: string | null;
  status: EventStatus;
}

export interface PendingNotificationReference {
  deduplicationKey: string;
  eventRevision: number;
  type: NotificationType;
  state: "pending" | "delivering" | "delivered" | "cancelled";
}

export interface ScheduleChangePlan {
  cancel: string[];
  create: NotificationIntent[];
}

export interface ReconcileScheduleChangeInput {
  profileId: string;
  previous: EventScheduleSnapshot;
  next: EventScheduleSnapshot;
  leadMinutes: number;
  now: Date;
  existing: readonly PendingNotificationReference[];
}

/**
 * Cancels pending intents tied to the old revision, emits one immediate change
 * notification, and schedules lifecycle intents against the new UTC instant.
 */
export function reconcileScheduleChange(input: ReconcileScheduleChangeInput): ScheduleChangePlan {
  if (input.previous.eventId !== input.next.eventId) {
    throw new RangeError("Schedule snapshots must describe the same event");
  }
  const startChanged = input.previous.startAt.getTime() !== input.next.startAt.getTime();
  const venueChanged = input.previous.venueId !== input.next.venueId;
  const statusChanged = input.previous.status !== input.next.status;
  if (!startChanged && !venueChanged && !statusChanged) {
    return { cancel: [], create: [] };
  }
  if (input.next.revision <= input.previous.revision) {
    throw new RangeError("A changed schedule must increment its revision");
  }
  if (!Number.isFinite(input.now.getTime())) {
    throw new RangeError("Schedule reconciliation requires a valid current instant");
  }

  const cancellableTypes: ReadonlySet<NotificationType> = new Set([
    "event_starting_soon",
    "event_started",
  ]);
  const cancel = input.existing
    .filter(
      (intent) =>
        intent.state === "pending" &&
        intent.eventRevision < input.next.revision &&
        cancellableTypes.has(intent.type),
    )
    .map((intent) => intent.deduplicationKey);

  const changeType: NotificationType =
    venueChanged && !startChanged ? "venue_changed" : "schedule_changed";
  const identity = {
    profileId: input.profileId,
    eventId: input.next.eventId,
    eventRevision: input.next.revision,
    type: changeType,
  } as const;
  const changeIntent: NotificationIntent = {
    ...identity,
    deduplicationKey: notificationDeduplicationKey(identity),
    scheduledFor: new Date(input.now),
    spoilerSensitive: false,
    parameters: {
      previousStartAt: input.previous.startAt.toISOString(),
      nextStartAt: input.next.startAt.toISOString(),
      previousVenueId: input.previous.venueId,
      nextVenueId: input.next.venueId,
    },
  };

  const lifecycleIntents = planEventNotifications({
    profileId: input.profileId,
    eventId: input.next.eventId,
    eventRevision: input.next.revision,
    startAt: input.next.startAt,
    status: input.next.status,
    leadMinutes: input.leadMinutes,
    now: input.now,
  });

  return { cancel, create: [changeIntent, ...lifecycleIntents] };
}

function validatePlanInput(input: EventNotificationPlanInput): void {
  if (!Number.isInteger(input.eventRevision) || input.eventRevision < 0) {
    throw new RangeError("eventRevision must be a non-negative integer");
  }
  if (!Number.isInteger(input.leadMinutes) || input.leadMinutes < 0 || input.leadMinutes > 7_200) {
    throw new RangeError("leadMinutes must be an integer between 0 and 7200");
  }
  if (!Number.isFinite(input.startAt.getTime()) || !Number.isFinite(input.now.getTime())) {
    throw new RangeError("Notification planning requires valid instants");
  }
}
