import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { getEnvironment } from "@/server/environment";
import { publicNoStoreJson } from "@/server/http/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getEnvironment();
    await db.execute(sql`select 1`);
    return publicNoStoreJson({ status: "ready", checks: { database: "ok", environment: "ok" } });
  } catch {
    return publicNoStoreJson(
      { status: "not_ready", checks: { database: "failed_or_unconfigured" } },
      { status: 503 },
    );
  }
}
