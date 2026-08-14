import type { EventStatus } from "@/domain/view-models";
import type { Dictionary } from "@/i18n/dictionaries";

const statusKeys: Record<EventStatus, keyof Dictionary> = {
  scheduled: "scheduled",
  delayed: "delayed",
  live: "live",
  paused: "paused",
  finished: "finished",
  cancelled: "cancelled",
};

export function StatusPill({
  status,
  dictionary: d,
}: {
  status: EventStatus;
  dictionary: Dictionary;
}) {
  return <span className={`status-pill ${status}`}>{d[statusKeys[status]]}</span>;
}
