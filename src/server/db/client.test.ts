import { resolveDatabaseUrl } from "./client";

describe("database URL resolution", () => {
  it("uses an explicitly configured PostgreSQL URL", () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: "postgres://service:secret@database.internal:5432/rada",
        NODE_ENV: "production",
      }),
    ).toBe("postgres://service:secret@database.internal:5432/rada");
  });

  it("allows the inert local default only outside runtime production", () => {
    expect(resolveDatabaseUrl({ NODE_ENV: "development" })).toContain("127.0.0.1");
    expect(
      resolveDatabaseUrl({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }),
    ).toContain("127.0.0.1");
  });

  it("fails closed when runtime production has no database URL", () => {
    expect(() => resolveDatabaseUrl({ NODE_ENV: "production" })).toThrow(
      "DATABASE_URL must be set in production",
    );
  });
});
