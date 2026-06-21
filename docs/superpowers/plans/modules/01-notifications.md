# Module 01 — Notifications — Executable TDD Plan (Wave 1)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development` (red→green per task) and `superpowers:executing-plans`. Steps use `- [ ]`. This plan obeys the **keystone** `docs/superpowers/plans/2026-06-21-program-foundation.md` (§1 architecture, §2 multi-tenant auth, §5 per-module template, §6 wave order). Do NOT re-spec anything in `backend/SPEC.md` or `@creatoros/contract` — reference and conform.

## Goal

Wire the **Notifications** module end-to-end (FE bell popover → contract op → user-scoped SQL → render) so the Shell `NotificationPopover` lists the signed-in user's notifications, shows a real unread badge, and persists "全部标记为已读". Notifications are an **append-only ledger with a single `unread → read` transition** (roadmap §4 transition column; foundation §6 acceptance has no AI/immutability concern here). External side-effects: none. AI: none. This is a wide-but-shallow Wave-1 absorber (roadmap §83).

## Architecture (per foundation §1)

- Module code lives under `frontend/src/server/modules/notifications/` following MODULE-ARCH §2 (`*.db-schema.ts`, `*.repository.ts`, `*.service.ts`, `*.schema.ts`, `*.transport.ts`, `*.errors.ts`, `index.ts`, + 3 test files). `index.ts` is the **only** public entry (service interface + transport map).
- **Every repository query is user-scoped** — `eq(notifications.userId, ctx.userId)` on reads and the `markRead` guard; inserts stamp `ctx.userId` (foundation §2 ownership).
- The module's transport map `{ opId → (ctx,input) => envelope }` is **registered into the module transport registry** (foundation §1: the generalized `compositeTransport` builds `PERSISTED_OPS` from the union of registered maps; adding Notifications = register it, no edits to the composite switch).
- Shared infra (pglite/Drizzle db factory, `RequestContext`, the registry) comes from `@creatoros/backend`; the **globalThis pglite singleton** (`frontend/src/server/persistence-client.ts`, lines 50–78) is reused — do NOT introduce a module-level `let` store.
- `RequestContext { userId, requestId, source }` is threaded by the `/api/v1/dispatch` route (foundation §2); the transport signature carries `ctx`. Notifications never starts its own pglite — it rides the session-scoped singleton.

## Tech Stack

TypeScript · Drizzle ORM over `@electric-sql/pglite` (pure-WASM Postgres, ISO-8601 text timestamps to match contract `iso8601`) · `@creatoros/contract` Zod DTOs (the seam) · Next.js App Router (RSC server reads + `"use client"` island) · Vitest.

## Dependency note (which waves/modules must be GREEN first)

**Wave 0 must be green**: foundation §1 (registry generalization of `compositeTransport` + `ctx`-threaded transport signature) and §2 (Identity/auth — `users`/`sessions`, `/api/v1/auth/*`, `RequestContext.userId` derivation, seeded canonical user `canonicalDataset.user.id`). No other module is required (roadmap §60/§78: Notifications is a zero-dependency Wave-1 root). `NotificationsService.getUnreadCount` is consumed by `DashboardQueryService` in **Wave 4** (SPEC §19) — out of scope here, but the service method is built now so Wave 4 can compose it.

---

## Contract ops this module owns (grepped — `contract/src/operations/notifications.ts`)

| Op id | Client method | HTTP | DTO |
|---|---|---|---|
| `notifications.list` | `client.listNotifications` | `GET /notifications` (`paginationQuery`, `isList`) | `notificationResource` (list envelope) |
| `notifications.read` | `client.markNotificationRead` | `POST /notifications/:notificationId/read` | `notificationResource` (single envelope) |

`notificationResource` fields (`contract/src/resources/notifications.ts`): `id, userId, notificationType ∈ {task,publish,import,system,ai}, title, body, entityType, entityId, readAt: iso8601|null, createdAt: iso8601`. No `updatedAt` (Notification extends BaseEntity only, not Timestamped). Entity ER in `docs/CreatorOS-data-model.md` NOTIFICATION block (lines 705–717) matches exactly.

> **No bulk endpoint exists.** Only per-id `notifications.read` is in the contract (roadmap §428 confirms a true bulk op is unspecced). "全部标记为已读" is therefore implemented FE-side as **N concurrent `markNotificationRead` calls** (one per currently-unread id), then one `router.refresh()`. Do NOT invent a `notifications.readAll` op.

---

## TDD tasks

### A. db-schema  (foundation §5.1)

- [ ] **A1** Create `frontend/src/server/modules/notifications/notifications.db-schema.ts`. Define the Drizzle table and raw DDL (mirror the `projects` slice style in `backend/src/schema/projects.ts` — ISO-8601 `text` timestamps, `user_id TEXT NOT NULL`):
  ```ts
  import { pgTable, text } from "drizzle-orm/pg-core";

  export const notifications = pgTable("notifications", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    notificationType: text("notification_type").notNull(), // task|publish|import|system|ai
    title: text("title").notNull(),
    body: text("body").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    readAt: text("read_at"),          // nullable → contract iso8601|null
    createdAt: text("created_at").notNull(),
  });

  export const NOTIFICATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL
  );`;
  ```
- [ ] **A2** Register `NOTIFICATIONS_DDL` with the shared db init so the singleton applies it (foundation §1: shared init runs every registered module's DDL). Follow whatever Wave-0 chose for DDL aggregation; if the Wave-0 db factory exposes a DDL list, append `NOTIFICATIONS_DDL`; otherwise the module's `index.ts` exports `NOTIFICATIONS_DDL` and the registry concatenates it. *(test: table round-trips — covered by A3.)*
- [ ] **A3** RED→GREEN micro-test inside `notifications.repository.integration.test.ts` (created in B3): after `createDb()` + DDL, an `INSERT … RETURNING *` round-trips all 9 columns with `readAt` nullable.

### B. repository (user-scoped ONLY)  (foundation §5.2)

- [ ] **B1** Create `frontend/src/server/modules/notifications/notifications.repository.ts`. Mirror `createProjectRepository` deps shape (`backend/src/repositories/project-repository.ts` lines 15–19) BUT take `userId` from `RequestContext` at call time, not construction — every query filters by it. Interface:
  ```ts
  export interface NotificationRepository {
    seed(rows: NotificationRow[]): Promise<void>;
    list(userId: string, page: number, pageSize: number): Promise<{ rows: NotificationRow[]; total: number }>;
    countUnread(userId: string): Promise<number>;
    markRead(userId: string, notificationId: string, now: string): Promise<NotificationRow>;
  }
  ```
- [ ] **B2** Implement queries — **all user-scoped**:
  - `list`: `db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(pageSize).offset((page-1)*pageSize)`; `total` via a sibling `count()` on the same `eq(notifications.userId, userId)` predicate.
  - `countUnread`: `count()` where `and(eq(notifications.userId, userId), isNull(notifications.readAt))`.
  - `markRead`: first fetch with `and(eq(notifications.userId, userId), eq(notifications.id, notificationId))`; if no row → throw `OwnershipError` (defined in F). Else `update … set({ readAt: now }).where(and(eq(userId), eq(id))).returning()`. **Idempotent**: if `readAt` already non-null, return the row unchanged (do NOT overwrite the original `readAt`). One `unread→read` transition, no reverse.
- [ ] **B3** Create `frontend/src/server/modules/notifications/notifications.repository.integration.test.ts` (pglite-backed, mirrors `backend/src/repositories/project-repository.test.ts`). Assert:
  1. `list` returns only `userId`'s rows, newest-first, paginated (`total` ignores page window).
  2. **Ownership**: seed notif owned by `user-B`; `list("user-A",…)` excludes it; `markRead("user-A", "<user-B notif id>", now)` throws `OwnershipError` (foundation §2: cross-user → 404, never reveals existence).
  3. `countUnread` counts only unread rows for the user.
  4. `markRead` sets `readAt`; second `markRead` on the same id is idempotent (same `readAt`).

### C. service (RequestContext + transition)  (foundation §5.3)

- [ ] **C1** Create `frontend/src/server/modules/notifications/notifications.service.ts`. Methods take `ctx: RequestContext` first and pass `ctx.userId` to the repo (foundation §2):
  ```ts
  export interface NotificationsService {
    list(ctx: RequestContext, q: { page: number; pageSize: number }): Promise<{ items: NotificationRow[]; total: number }>;
    markRead(ctx: RequestContext, notificationId: string): Promise<NotificationRow>;
    getUnreadCount(ctx: RequestContext): Promise<number>; // SPEC §19 — consumed by DashboardQueryService (Wave 4)
  }
  ```
  `list` defaults `page=1,pageSize=20` (contract `paginationQuery` defaults). `markRead` delegates the `unread→read` transition + idempotency to the repo (the "state machine" is a single guarded transition; no multi-state graph — SPEC §12 lists no Notification machine, roadmap §398 confirms only `unread→read`). The clock is injected (`deps.now`) for deterministic tests, matching `persistence-client.ts` line 65 (`FIXED_NOW_ISO`).
- [ ] **C2** Create `notifications.service.test.ts`. Assert:
  1. `list` forwards `ctx.userId` + pagination to the repo and returns `{ items, total }`.
  2. `markRead` returns the read row; the `readAt` equals the injected `now` on first read.
  3. `markRead` on an already-read notification returns it unchanged (idempotent guard).
  4. `markRead` on another user's id surfaces `OwnershipError` (service does not swallow it).
  5. `getUnreadCount` returns the repo's user-scoped count.

### D. schema re-export  (foundation §5, MODULE-ARCH §2)

- [ ] **D1** Create `frontend/src/server/modules/notifications/notifications.schema.ts`. **Verified topology** (grepped): the `@creatoros/contract` root barrel (`contract/src/index.ts`) re-exports `envelope`/`primitives`/`endpoints`/`transport`/`client` but **NOT** the resource files or `notificationsOperations`. The per-op response schema is reachable as `ENDPOINTS.listNotifications.response` / `ENDPOINTS.markNotificationRead.response` (both `=== notificationResource`), since `ENDPOINTS` is exported and includes `...notificationsOperations` (`contract/src/endpoints.ts` lines 69/81). So this module's schema file derives the DTO + its TS type from `ENDPOINTS`, not a non-existent subpath import:
  ```ts
  import { ENDPOINTS } from "@creatoros/contract";
  import type { z } from "zod";

  export const notificationResource = ENDPOINTS.listNotifications.response; // === markNotificationRead.response
  export type NotificationResource = z.infer<typeof notificationResource>;
  ```
  The transport's `toResource(row)` (E1) and the contract test (E4) import from here. Do NOT write `@creatoros/contract/resources/notifications` — `package.json` exposes only the root export, so that subpath fails to resolve.

### E. transport (register ops)  (foundation §5.4)

- [ ] **E1** Create `frontend/src/server/modules/notifications/notifications.transport.ts`. Build the `{ opId → (ctx,input) => envelope }` map (NOT a `switch` over the whole app — the registry composes maps; mirror the envelope-meta helpers in `backend/src/persistence-transport.ts` lines 13–19):
  ```ts
  export function notificationsTransportMap(service: NotificationsService) {
    return {
      "notifications.list": async (ctx, input) => {
        const q = (input?.query ?? {}) as { page?: number; pageSize?: number };
        const page = q.page ?? 1, pageSize = q.pageSize ?? 20;
        const { items, total } = await service.list(ctx, { page, pageSize });
        return { data: items.map(toResource), meta: { requestId: ctx.requestId, page, pageSize, total } };
      },
      "notifications.read": async (ctx, input) => {
        const p = (input?.params ?? {}) as { notificationId?: string };
        const row = await service.markRead(ctx, p.notificationId ?? "");
        return { data: toResource(row), meta: { requestId: ctx.requestId } };
      },
    } as const;
  }
  ```
  `toResource(row)` maps the DB row to the contract shape (passes `readAt: row.readAt ?? null`; no `updatedAt`). Throw the module's `OwnershipError` for unknown ids (handled by B2); the registry surfaces non-owned ops via `UnsupportedOperationError` automatically (foundation §1) — Notifications does NOT add a `default` branch.
- [ ] **E2** In `frontend/src/server/modules/notifications/index.ts`, export the service factory, the transport map factory, `NOTIFICATIONS_DDL`, and the `NotificationsService` interface — the ONLY public entry (foundation §1, MODULE-ARCH §2). No cross-module repository import.
- [ ] **E3** Register the module in the Wave-0 module registry (the union that builds `PERSISTED_OPS`). After registration, `PERSISTED_OPS` includes `notifications.list` + `notifications.read`; the composite no longer falls back to `mockTransport` for them. Wire the seeded canonical notifications (`canonicalDataset.notifications`, `frontend/src/fixtures/canonical.ts` lines 2072–2095 — `notif-1` unread, `notif-2` read) via the module's `seed(...)` at singleton build, mirroring `persistence-client.ts` line 69. Use `userId: canonicalDataset.user.id` so seeds belong to the seeded login (foundation §2).
- [ ] **E4** Create `notifications.contract.test.ts`: build the transport map over a pglite-seeded service, invoke each op via an in-process client `createClient(ENDPOINTS, <transport-over-the-map>)` (mirror `frontend/src/server/mock-backend/handlers/projects.test.ts`, which goes through the client so the endpoint's own `response` schema parses the envelope). `client.listNotifications(...)` and `client.markNotificationRead(...)` returning without throw == DTO conformance. For an explicit assertion also parse the raw envelope with `listEnvelope(notificationResource)` / `successEnvelope(notificationResource)` (both imported from `@creatoros/contract`; `notificationResource` from D1). Assert `readAt: null` passes (unread `notif-1`) and a non-null `readAt` passes (read `notif-2`).

### F. errors

- [ ] **F1** Create `frontend/src/server/modules/notifications/notifications.errors.ts` exporting `OwnershipError` (or import the shared one if Wave-0 promoted `OwnershipError` to `@creatoros/backend` — grep `backend/src/` first; the Projects slice currently throws a string `OwnershipError:`, but the generalized form uses a typed class that the dispatch route maps to **404**, per foundation §2). Notifications must use the typed class so cross-user `markRead` → 404, not a 500.

### G. FE island wiring  (foundation §5.5 — from roadmap §4 Shell rows, lines 349–351)

Target file: `frontend/src/components/shell/notification-popover.tsx` (currently fixture-driven, lines 28–32 read `buildNotificationsViewModel`). Preserve the `viewModel?` test seam (prop on line 37). Rendered twice by `top-header.tsx` (lines 305, 444).

- [ ] **G1 — Server read (`通知 bell + unread badge`, `wired-local` → real `GET /notifications`)**: The Shell server component (the RSC that renders `TopHeader`/`NotificationPopover`) calls `await client.listNotifications({ query: { page: 1, pageSize: 20 } })` via the **server** contract client (`frontend/src/lib/contract-client.server.ts`, which uses `compositeTransport`). Map the returned `NotificationResource[]` into `NotificationsViewModel` (`frontend/src/server/persistence-client.ts` `buildNotificationsViewModel` shape: `{ items: [{id,title,body,type,read,createdAt}], unreadCount }`, where `read = readAt !== null`). Pass it into `<NotificationPopover viewModel={vm} />`. The unread badge (popover lines 72–81) then reflects real server data. **Button label is exactly `通知`** (`aria-label="通知"`, line 65).
- [ ] **G2 — `全部标记为已读` (`needs-backend`, op `notifications.read`, transition `unread→read`)**: Replace the local-`Set` `markAllRead` (lines 49–59) with a handler that, for every currently-unread item, calls `client.markNotificationRead({ params: { notificationId: item.id } })` via the **browser** contract client (`frontend/src/lib/contract-client.ts`), awaits `Promise.all`, then `router.refresh()` (Next `useRouter`) so the server re-reads (G1) and the badge clears from real state. Keep the optimistic local `readIds` set for instant UI, but truth comes from the refresh. **Button label is exactly `全部标记为已读`** (line 97). No bulk endpoint exists — this is N per-id calls (see contract-ops note).
- [ ] **G3 — `Notification list item` (`decorative`)**: Per roadmap §4 (line 351, "no per-item handler"), the `<li data-slot="notification-item">` (popover lines 117–142) stays **intentionally inert** — no per-item `onClick`/deep-link. Add a code comment marking it intentionally decorative so a later reviewer doesn't "fix" it. (A future per-item read would reuse `notifications.read`, but it is out of scope for Wave 1.)
- [ ] **G4** Update `frontend/src/components/shell/notification-popover.test.tsx` so the mutation path is asserted against a stubbed client: clicking `全部标记为已读` issues one `markNotificationRead` per unread id and triggers `router.refresh()`. Keep the existing badge/unread rendering assertions (they now flow through the injected `viewModel` prop, unchanged).

### H. acceptance (SPEC §22 / foundation §5.6 / §9)

- [ ] **H1** Module has `service` + `repository` + `schema` + `tests`; no cross-module repository import; `index.ts` is the sole entry (SPEC §22 bullets 3–4).
- [ ] **H2** Routes don't touch the db client — the `/api/v1/dispatch` route calls the registered transport; the Shell RSC calls only the contract client (SPEC §22 "Route 不访问 repository 或数据库客户端").
- [ ] **H3** Multi-tenant smoke (foundation §9): with two seeded users, user A's `listNotifications` never returns user B's rows and `markNotificationRead` on B's id 404s. (Covered by B3 + a dispatch-route smoke if Wave-0 provides one.)
- [ ] **H4** Idempotency (foundation §6 spirit / roadmap §407 — Notifications run post-commit, never roll back business truth): re-`markRead` is a no-op on `readAt`. Verified in B3.4 + C2.3.
- [ ] **H5** `pnpm verify` (frontend: lint/tsc/tests/build) GREEN, plus the 3 module test files green. No ArtifactVersion/AI-candidate concerns apply to this module (SPEC §22 immutability/confirm bullets are N/A — Notifications is an append-only ledger).

---

## Out of scope / explicitly NOT done

- **Bulk mark-all-read endpoint** — unspecced (roadmap §428); FE composes N `notifications.read` calls.
- **`createNotification`** — notifications are a post-commit side-effect *written by other modules* (SPEC lines 157/168/198/289: project/publish/import flows create them). Wave 1 only **reads + marks read** the seeded ledger; the write side lands with the producing modules (Projects/Publishing/Ingestion) in later waves.
- **Per-item deep-link / per-item read** — decorative now (roadmap §4 line 351).
- **`getUnreadCount` composition into Dashboard** — the method is built (C1) but consumed by `DashboardQueryService` in Wave 4 (SPEC §19).
