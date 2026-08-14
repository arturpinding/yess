import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const developmentDatabaseUrl = "postgres://rada:rada_dev_only@127.0.0.1:5432/rada";

export function resolveDatabaseUrl(source: {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  NEXT_PHASE?: string;
}): string {
  const configuredUrl = source.DATABASE_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  // Next evaluates route modules during metadata collection. Dynamic routes do
  // not access PostgreSQL in this phase, so constructing a lazy client against
  // the inert local default is safe and keeps build images free of secrets.
  if (source.NODE_ENV === "production" && source.NEXT_PHASE !== "phase-production-build") {
    throw new Error("DATABASE_URL must be set in production");
  }

  return developmentDatabaseUrl;
}

const globalDatabase = globalThis as typeof globalThis & {
  radaPostgresClient?: ReturnType<typeof postgres>;
};

export const postgresClient =
  globalDatabase.radaPostgresClient ??
  postgres(resolveDatabaseUrl(process.env), {
    max: process.env.NODE_ENV === "production" ? 20 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    onnotice: () => undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalDatabase.radaPostgresClient = postgresClient;
}

export const db = drizzle(postgresClient, {
  schema,
  logger: process.env.DRIZZLE_LOG === "true",
});

export async function closeDatabase(): Promise<void> {
  await postgresClient.end({ timeout: 5 });
}
