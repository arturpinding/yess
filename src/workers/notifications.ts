import { closeDatabase, postgresClient } from "@/server/db/client";
import { runNotificationPlanningCycle } from "@/server/notifications/planning-service";
import { createLogger } from "@/server/observability/logger";

const logger = createLogger({
  service: "rada-notification-worker",
  environment: process.env.NODE_ENV ?? "development",
  version: process.env.APP_VERSION,
});

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_PLANNING_HORIZON_MINUTES = 24 * 60;
const DEFAULT_STARTED_LOOKBACK_MINUTES = 6 * 60;

interface DeliveredNotification {
  id: string;
  kind: string;
  scheduledFor: Date;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

/**
 * In-app delivery is an atomic database state transition: once a due row is
 * committed as sent, it is visible in the inbox. The pending-state predicate
 * makes concurrent workers and retries idempotent. Push and email remain in
 * pending state until their explicit vendor adapters are configured.
 */
export async function deliverDueInAppNotifications(
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<readonly DeliveredNotification[]> {
  const limit = Math.min(500, Math.max(1, Math.trunc(batchSize)));
  const delivered = await postgresClient<DeliveredNotification[]>`
    with due as (
      select id
      from notifications
      where state = 'pending'
        and channel = 'in_app'
        and scheduled_for <= now()
      order by scheduled_for asc, id asc
      for update skip locked
      limit ${limit}
    )
    update notifications as notification
    set state = 'sent',
        sent_at = coalesce(notification.sent_at, now()),
        attempts = notification.attempts + 1,
        failure_code = null,
        updated_at = now()
    from due
    where notification.id = due.id
      and notification.state = 'pending'
    returning notification.id,
              notification.kind,
              notification.scheduled_for as "scheduledFor"
  `;

  return delivered;
}

export async function runNotificationWorker(): Promise<void> {
  const batchSize = boundedInteger(process.env.NOTIFICATION_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1, 500);
  const pollIntervalMs = boundedInteger(
    process.env.NOTIFICATION_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
    250,
    60_000,
  );
  const planningHorizonMinutes = boundedInteger(
    process.env.NOTIFICATION_PLANNING_HORIZON_MINUTES,
    DEFAULT_PLANNING_HORIZON_MINUTES,
    0,
    7 * 24 * 60,
  );
  const startedLookbackMinutes = boundedInteger(
    process.env.NOTIFICATION_STARTED_LOOKBACK_MINUTES,
    DEFAULT_STARTED_LOOKBACK_MINUTES,
    0,
    7 * 24 * 60,
  );
  let stopping = false;

  const stop = () => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  logger.info(
    { batchSize, planningHorizonMinutes, pollIntervalMs, startedLookbackMinutes },
    "notification worker started",
  );

  try {
    while (!stopping) {
      try {
        const planning = await runNotificationPlanningCycle({
          horizonMinutes: planningHorizonMinutes,
          startedLookbackMinutes,
        });
        if (planning.inserted > 0) {
          logger.info(
            {
              inserted: planning.inserted,
              matchedEvents: planning.matchedEvents,
              planned: planning.planned,
            },
            "in-app notifications planned",
          );
        }
      } catch (error) {
        logger.error({ err: error }, "notification planning cycle failed");
      }

      try {
        const delivered = await deliverDueInAppNotifications(batchSize);
        if (delivered.length > 0) {
          logger.info({ delivered: delivered.length }, "in-app notifications delivered");
        }
      } catch (error) {
        logger.error({ err: error }, "notification delivery cycle failed");
      }

      if (!stopping) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }
  } finally {
    logger.info("notification worker stopping");
    await closeDatabase();
  }
}

if (process.argv[1]?.endsWith("src/workers/notifications.ts")) {
  void runNotificationWorker().catch((error: unknown) => {
    logger.fatal({ err: error }, "notification worker terminated");
    process.exitCode = 1;
  });
}
