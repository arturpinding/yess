import { NextRequest } from "next/server";
import { clearEnvironmentCacheForTests } from "@/server/environment";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/server/observability/logger", () => ({
  createLogger: () => ({ info: mocks.loggerInfo, error: mocks.loggerError }),
}));

import { PATCH } from "./route";

const eventId = "10000000-0000-4000-8000-000000000001";
const csrfToken = "route-test-csrf-token";

const current = {
  id: eventId,
  titleEt: "Eesti – Soome",
  titleEn: "Estonia vs Finland",
  state: "scheduled" as const,
  scheduledStartAt: new Date("2026-08-14T15:00:00.000Z"),
  actualStartAt: null,
  endAt: new Date("2026-08-14T17:00:00.000Z"),
  venueId: "20000000-0000-4000-8000-000000000001",
  venueName: "Tondiraba jäähall",
  statusDetailEt: null,
  statusDetailEn: null,
  version: 3,
  updatedAt: new Date("2026-08-14T10:00:00.000Z"),
};

function request(body: unknown, options: { includeCsrf?: boolean } = {}) {
  const includeCsrf = options.includeCsrf ?? true;
  return new NextRequest(`http://localhost:3000/api/v1/admin/events/${eventId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...(includeCsrf ? { cookie: `rada-csrf=${csrfToken}`, "x-csrf-token": csrfToken } : {}),
    },
    body: JSON.stringify(body),
  });
}

function transactionFor(currentRow = current) {
  let updateValues: Record<string, unknown> | undefined;
  let auditValues: Record<string, unknown> | undefined;

  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(async () => [currentRow]) })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updateValues = values;
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => [
              {
                ...currentRow,
                ...values,
                venueName: undefined,
              },
            ]),
          })),
        };
      }),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        auditValues = values;
      }),
    })),
  };
  mocks.transaction.mockImplementationOnce(async (callback: (transaction: typeof tx) => unknown) =>
    callback(tx),
  );
  return {
    tx,
    getUpdateValues: () => updateValues,
    getAuditValues: () => auditValues,
  };
}

describe("PATCH /api/v1/admin/events/:eventId", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "postgres://rada:rada@localhost:5432/rada_test");
    vi.stubEnv("SESSION_SECRET", "session-secret-that-is-at-least-32-characters");
    vi.stubEnv("MEDIA_SIGNING_SECRET", "media-secret-that-is-at-least-32-characters");
    vi.stubEnv("DEFAULT_COUNTRY", "EE");
    clearEnvironmentCacheForTests();
    mocks.transaction.mockReset();
    mocks.loggerInfo.mockReset();
    mocks.loggerError.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    clearEnvironmentCacheForTests();
  });

  it("commits an unauthenticated development update and its audit record atomically", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T15:01:23.000Z"));
    const transaction = transactionFor();

    const response = await PATCH(
      request({ reason: "The event has started", version: 3, state: "live" }),
      { params: Promise.resolve({ eventId }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(body).toMatchObject({
      data: {
        id: eventId,
        state: "live",
        actualStartAt: "2026-08-14T15:01:23.000Z",
        version: 4,
      },
      requestId: expect.any(String),
    });
    expect(transaction.getUpdateValues()).toMatchObject({
      state: "live",
      actualStartAt: new Date("2026-08-14T15:01:23.000Z"),
      version: 4,
    });
    expect(transaction.getAuditValues()).toMatchObject({
      actorUserId: null,
      action: "event.manual_update",
      entityType: "event",
      entityId: eventId,
      requestId: body.requestId,
      reason: "The event has started",
      before: { state: "scheduled", version: 3 },
      after: {
        state: "live",
        actualStartAt: "2026-08-14T15:01:23.000Z",
        version: 4,
      },
    });
    expect(transaction.tx.insert).toHaveBeenCalledOnce();
    expect(mocks.loggerInfo).toHaveBeenCalledOnce();
  });

  it("rejects mutation without same-origin double-submit CSRF", async () => {
    const response = await PATCH(
      request(
        { reason: "The event has started", version: 3, state: "live" },
        { includeCsrf: false },
      ),
      { params: Promise.resolve({ eventId }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "csrf_failed" } });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns a version conflict without writing an audit entry", async () => {
    const transaction = transactionFor({ ...current, version: 4 });
    const response = await PATCH(
      request({ reason: "The event has started", version: 3, state: "live" }),
      { params: Promise.resolve({ eventId }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "version_conflict", currentVersion: 4 },
    });
    expect(transaction.tx.update).not.toHaveBeenCalled();
    expect(transaction.tx.insert).not.toHaveBeenCalled();
  });

  it("is indistinguishable from a missing API in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await PATCH(
      request({ reason: "Attempted production edit", version: 3, state: "live" }),
      { params: Promise.resolve({ eventId }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: { code: "not_found" } });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
