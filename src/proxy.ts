import { type NextRequest, NextResponse } from "next/server";
import { isDemoBroadcastAvailable } from "@/server/demo-broadcast/availability";

/** Supplies the route locale to the root document before React hydration. */
export function proxy(request: NextRequest) {
  const production = process.env.NODE_ENV === "production";
  const developmentOnlyAdmin = /^\/(?:et|en)\/admin(?:\/|$)/.test(request.nextUrl.pathname);
  const gatedBroadcast = /^\/(?:et|en)\/broadcast(?:\/|$)/.test(request.nextUrl.pathname);
  if (production && (developmentOnlyAdmin || (gatedBroadcast && !isDemoBroadcastAvailable()))) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const requestHeaders = new Headers(request.headers);
  const firstPathSegment = request.nextUrl.pathname.split("/")[1];
  requestHeaders.set("x-rada-locale", firstPathSegment === "en" ? "en" : "et");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
