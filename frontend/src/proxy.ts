import { NextResponse, type NextRequest } from "next/server";

// Proxy / request middleware (Module 00, Task 11). Next 16 renamed the
// `middleware` file convention to `proxy`. Next server components (the (creator)
// layout session guard) have no built-in access to the current pathname, so we
// forward it as an `x-pathname` request header — the guard reads it to build the
// `redirect("/login?from=<pathname>")` target when a session is missing/invalid.
//
// This is a routing-only concern — it does NOT touch the transport, the dispatch
// route, or any user-scoping. It only annotates the request with its own path.

export function proxy(req: NextRequest): NextResponse {
  const requestHeaders = new Headers(req.headers);
  // pathname only (no query) — the guard appends its own ?from target.
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Run on app routes, but skip static assets, the dispatch/auth API routes
  // (they read the cookie off the Request directly), and Next internals.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
