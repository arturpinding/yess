import { publicNoStoreJson } from "@/server/http/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  return publicNoStoreJson({ status: "ok", service: "rada-web" });
}
