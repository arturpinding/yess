import "dotenv/config";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { closeDatabase, db } from "../src/server/db/client";

async function main(): Promise<void> {
  await migrate(db, { migrationsFolder: "drizzle" });
  console.info("Database migrations completed.");
}

main()
  .catch((error: unknown) => {
    console.error("Database migration failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
