import { type NextRequest, NextResponse } from "next/server";

/** Supplies the route locale to the root document before React hydration. */
export function proxy(request: NextRequest) {
  if (
    process.env.NODE_ENV === "production" &&
    /^\/(?:et|en)\/admin(?:\/|$)/.test(request.nextUrl.pathname)
  ) {
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
