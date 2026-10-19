import "server-only";
import { NextResponse } from "next/server";
import { ErrorCode, ERROR_HTTP } from "@creatoros/contract";

// Shared auth-route helpers (Module 00, Task 9). The three auth routes and the
// dispatch route all read the session from the incoming Request's `Cookie`
// header and write/clear it via a `Set-Cookie` response header. Reading cookies
// off the Web `Request`/`Response` (rather than `next/headers` cookies(), whose
// async request store only exists inside Next's server runtime) keeps these
// route handlers exercisable with a plain `Request` in vitest while remaining
// the standard route-handler contract Next runs in production.
//
// SECURITY (SPEC §20/§21): the raw token lives ONLY in the httpOnly cookie; it
// is never logged here, never echoed in a body. Only its sha256 hash is stored
// (identity.crypto / sessions.token_hash).

/** The httpOnly session cookie name (plan Task 9 decision). */
export const SESSION_COOKIE = "creatoros_session";

const isProd = process.env.NODE_ENV === "production";

/** Parse the raw session token out of a request's Cookie header (or null). */
export function readSessionCookie(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/**
 * Build the `Set-Cookie` value that stores the raw session token.
 * httpOnly; SameSite=Lax; Path=/; Secure (omitted in dev/test). `expires` is the
 * session's `expiresAt` (ISO-8601) → the cookie's Expires attribute.
 */
export function sessionCookieValue(rawToken: string, expiresAt: string): string {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(rawToken)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (isProd) attrs.push("Secure");
  return attrs.join("; ");
}

/** Build the `Set-Cookie` value that clears the session cookie (logout). */
export function clearSessionCookieValue(): string {
  const attrs = [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (isProd) attrs.push("Secure");
  return attrs.join("; ");
}

let reqSeq = 0;
/** A per-response requestId for the envelope meta (deterministic-enough; never a secret). */
export function nextRequestId(): string {
  return `auth-${++reqSeq}`;
}

/** SPEC §14 error envelope, status resolved from the ErrorCode. */
export function errorResponse(
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json(
    { error: { code, message, details }, meta: { requestId: nextRequestId() } },
    { status: ERROR_HTTP[code] },
  );
}
