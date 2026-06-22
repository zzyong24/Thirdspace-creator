import "server-only";
import { cookies, headers } from "next/headers";
import type { RequestContext } from "@creatoros/contract";
import { getIdentityService } from "@/server/persistence-client";
import {
  AuthenticationError,
  type UserDTO,
} from "@/server/modules/identity";
import { SESSION_COOKIE } from "@/app/api/v1/auth/_session";

// Server-only session helper (Module 00, Task 11). The (creator) layout session
// guard reads the httpOnly session cookie from the RSC request store, resolves a
// RequestContext through the identity service (never the db client directly —
// SPEC §22), and returns the current user for the Shell user card. Routes still
// read the cookie off the raw Request; RSCs use next/headers cookies() — the two
// agree on the SESSION_COOKIE name (single source of truth in _session.ts).

export interface ResolvedSession {
  readonly ctx: RequestContext;
  readonly user: UserDTO;
}

/**
 * Resolve the current request's session from the cookie. Returns the ctx + the
 * current user, or `null` when there is no/invalid session (the caller — the
 * layout guard — redirects to /login in that case). Throws only on unexpected
 * (non-auth) errors so genuine failures still surface.
 */
export async function resolveSession(): Promise<ResolvedSession | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!rawToken) return null;

  const identity = await getIdentityService();
  try {
    const ctx = await identity.resolveContextFromToken(rawToken);
    const user = await identity.getCurrentUser(ctx);
    return { ctx, user };
  } catch (err) {
    // Missing / revoked / expired session → treat as unauthenticated.
    if (err instanceof AuthenticationError) return null;
    throw err;
  }
}

/**
 * The current request's pathname (forwarded by middleware as `x-pathname`), used
 * to build the `/login?from=<pathname>` redirect target so the user returns to
 * where they were after authenticating. Falls back to "/" if the header is
 * absent (e.g. a request that never passed through the middleware matcher).
 */
export async function currentPathname(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get("x-pathname") ?? "/";
}
