import "server-only";
import { ENDPOINTS, createClient } from "@creatoros/contract";
import type { RequestContext } from "@creatoros/contract";
import { compositeTransport } from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";

// Server-only composition root (server components, route handlers). Runs the
// composite transport in-process: REAL SQL persistence (@creatoros/backend over
// pglite) for project ops, the in-memory mock for the rest. The `server-only`
// guard keeps the mock backend + pglite out of any client bundle. Server reads
// and the /api/v1 route share this same store, so island writes persist.

// Task 8: the transport signature gained a `ctx` parameter. A server-bound
// client carries the request's RequestContext so persisted reads stay
// user-scoped. The RSC/layout (Task 11) derives ctx from the session cookie and
// calls `createServerClient(ctx)`.
export function createServerClient(ctx: RequestContext) {
  return createClient(ENDPOINTS, compositeTransport, ctx);
}

// The canonical seeded ctx — every fixture-backed page and the Projects seed are
// owned by `user-zyongzhu`. Pages not yet migrated to per-request ctx (Task 11)
// read through the default `client` below, bound to this ctx, so they keep
// resolving exactly as before this task (persisted ops now REQUIRE a ctx).
const canonicalServerCtx: RequestContext = {
  userId: canonicalDataset.user.id,
  requestId: "server-default",
  source: "user",
};

// Default server client — a thin binding to the canonical ctx. Existing green
// pages import `client` unchanged; once a page derives its real session ctx it
// switches to `createServerClient(ctx)`.
/**
 * @deprecated Canonical-ctx singleton — SSR seam / test fixtures ONLY.
 *
 * This client is hard-bound to `canonicalServerCtx` (`user-zyongzhu`), so every
 * read it issues is scoped to the seeded canonical tenant regardless of who is
 * signed in. Using it from a production page leaks the canonical tenant's data
 * to other users / breaks multi-tenant isolation.
 *
 * Production pages and feature data loaders MUST derive the per-request
 * `RequestContext` from the session and call `createServerClient(session.ctx)`
 * instead. Reach for this singleton only when there is genuinely no session
 * (pure SSR scaffolding) or in tests that intentionally pin the canonical ctx.
 *
 * Enforced by the `no-restricted-imports` ESLint rule (currently `warn` while
 * pages finish migrating; bump to `error` once `src/features/**` and
 * `src/app/**` route modules no longer import it).
 */
export const client = createServerClient(canonicalServerCtx);
