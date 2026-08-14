import { cookies } from "next/headers";
import { sessionCookieConfiguration } from "./session-token";
import { getViewerContextFromToken, type ViewerContext } from "./viewer-context";
import { getEnvironment } from "@/server/environment";

/** Resolves the selected, database-owned profile for a Server Component request. */
export async function getServerViewerContext(): Promise<ViewerContext | null> {
  const environment = getEnvironment();
  const sessionCookie = sessionCookieConfiguration(environment.NODE_ENV === "production");
  const cookieStore = await cookies();
  return getViewerContextFromToken(cookieStore.get(sessionCookie.name)?.value);
}
