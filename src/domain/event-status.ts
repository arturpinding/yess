export const EVENT_STATUSES = [
  "scheduled",
  "delayed",
  "live",
  "paused",
  "finished",
  "cancelled",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

const normalTransitions: Readonly<Record<EventStatus, ReadonlySet<EventStatus>>> = {
  scheduled: new Set(["delayed", "live", "cancelled"]),
  delayed: new Set(["scheduled", "live", "cancelled"]),
  live: new Set(["paused", "finished", "cancelled"]),
  paused: new Set(["live", "finished", "cancelled"]),
  finished: new Set(),
  cancelled: new Set(),
};

export type EventTransitionMode = "normal" | "ingestion-reconciliation";

export interface EventTransitionOptions {
  mode?: EventTransitionMode;
}

/**
 * Returns whether a state change is valid. Re-applying the current status is
 * intentionally idempotent. Imported final results may reconcile an event that
 * was never observed live, but this exceptional path must be explicit.
 */
export function canTransitionEventStatus(
  from: EventStatus,
  to: EventStatus,
  options: EventTransitionOptions = {},
): boolean {
  if (from === to) {
    return true;
  }

  if (
    options.mode === "ingestion-reconciliation" &&
    to === "finished" &&
    (from === "scheduled" || from === "delayed")
  ) {
    return true;
  }

  return normalTransitions[from].has(to);
}

export class InvalidEventStatusTransitionError extends Error {
  readonly from: EventStatus;
  readonly to: EventStatus;

  constructor(from: EventStatus, to: EventStatus) {
    super(`Invalid event status transition: ${from} -> ${to}`);
    this.name = "InvalidEventStatusTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function assertEventStatusTransition(
  from: EventStatus,
  to: EventStatus,
  options?: EventTransitionOptions,
): void {
  if (!canTransitionEventStatus(from, to, options)) {
    throw new InvalidEventStatusTransitionError(from, to);
  }
}
