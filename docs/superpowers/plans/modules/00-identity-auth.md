# Module 00 — Identity / auth (Wave 0, blocking) — Executable TDD Plan

> **Plan only.** No implementation code lands in the app from this document; it is the ordered TDD task list a later execution wave runs. Steps use `- [ ]`. Follows the keystone foundation §5 per-module template and §1/§2 architecture verbatim.

## Goal

Stand up **real, demo-grade login + multi-tenancy** so that `RequestContext.userId` becomes the sole ownership boundary for every other module. Deliver `users` + `sessions` tables, a hashed session token, the three bare auth routes (`POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`), `RequestContext` derived from the session cookie inside `/api/v1/dispatch`, ownership-404 plumbing, and the seeded canonical user so all existing fixtures keep resolving. This module owns the one cross-cutting substrate change the foundation permits: **adding a `ctx` parameter to the `Transport.request` signature** (foundation §2).

## Architecture

- Module home: `.worktrees/frontend-implementation/frontend/src/server/modules/identity/` (MODULE-ARCH §2 layout; the `@creatoros/backend` package stays the shared-infra home for the db factory + registry, per foundation §1).
- Identity owns NO contract dispatch ops. Per SPEC §13 / foundation §2 / §52, login/logout/me are **bare Next route handlers**, not `@creatoros/contract` endpoints (a grep of `contract/src/operations/` shows no `auth.*`/`identity.*` ids — confirmed below). Identity's job is the **auth surface + RequestContext derivation + the seed + ownership-404 convention**, which every later module's repository depends on.
- The single identity-flavoured *contract* op, `settings.get` (returns `userResource`), is owned by the **Settings** module (roster row 03), not Identity — Identity only guarantees `ctx.userId` resolves so Settings can scope it. This plan wires the FE identity *reads* (shell user card, Settings identity labels) against `settings.get`, but does not implement that op.
- `globalThis` pglite singleton stays the one store (foundation §1); the identity tables are added to the shared DDL applied at `createDb()`.
- Ownership rule (foundation §1/§2, SPEC §10/§20): every owned-row query is `eq(table.userId, ctx.userId)`; cross-user access throws `OwnershipError` → **404** (SPEC §14, avoids existence leak).

## Tech Stack

Next.js App Router · TypeScript strict · Drizzle ORM over pglite (`@electric-sql/pglite`, in-memory on `globalThis`) · Zod (contract DTOs + route input) · Vitest · `node:crypto` `scrypt` for password + token hashing (no native build; SPEC §3 allows; avoids adding argon2/bcrypt native deps — **decision below**) · `next/headers` `cookies()` for the httpOnly session cookie.

## Dependency note

**Depends on:** Wave 0 foundation only — the `@creatoros/contract` package (done, stage 15a) and the `@creatoros/backend` shared-infra package (db factory + the Projects exemplar). **Blocks:** every other module (Settings, Notifications, Search, Projects, …) — nothing in Waves 1–4 may go green until this is green, because all of them user-scope against `ctx.userId`.

---

## Grepped facts this plan is keyed to (no guesses)

- **Contract auth ops:** none. `ls contract/src/operations/` → `{ai,analytics,artifacts,assets,ingestion,knowledge,learnings,notifications,pages,production,projects,publishing,reviews,search,settings}.ts`. No `auth`/`identity`. `grep -rinE "auth|login|logout|session|getCurrentUser|identity" contract/src` → only the framework `AuthenticationError` enum in `envelope.ts` (HTTP 401) and `secretReference` fields. **⇒ login/logout/me are routes, not dispatch ops.**
- **Identity-adjacent contract op (owned by Settings):** `settings.get` (`id: "settings.get"`, `GET /settings`, response `userResource`) in `contract/src/operations/settings.ts`.
- **`userResource`** (`contract/src/resources/settings.ts`): `{ id, email, displayName, timezone, locale, createdAt, updatedAt }`.
- **Canonical user fixture** (`frontend/src/fixtures/canonical.ts` L113-120): `id:"user-zyongzhu"`, `email:"zyongzhu@creatoros.local"`, `displayName:"Zyong Zhu"`, `timezone:"Asia/Shanghai"`, `locale:"zh-CN"`. **This is the user to seed and the credential to mint.**
- **Data model** (`docs/CreatorOS-data-model.md` L48-66): `USER { id PK, email UK, display_name, timezone, locale, created_at, updated_at }`; `USER_PREFERENCE { user_id PK/FK, ... }`. **No `Session` and no `password_hash` exist in the data model** — both are identity-infra additions mandated by foundation §2 / SPEC §20 (hashed tokens). This plan adds them as identity-owned columns/tables.
- **`Transport` interface** (`contract/src/transport.ts`): `request<E>(endpoint, input)` — **no ctx today.** Foundation §2: "the transport signature gains a `ctx` parameter." Done in Task 8.
- **Dispatch route** (`frontend/src/app/api/v1/dispatch/route.ts`): looks up `ENDPOINTS_BY_ID[id]`, calls `compositeTransport.request(endpoint, input)`. **No auth today.** Gains cookie→ctx + 401 in Task 9.
- **Composite transport** (`frontend/src/server/persistence-client.ts`): `PERSISTED_OPS` Set; `buildPersistence()` seeds via `repo.seedProjects(...)` with `userId: canonicalDataset.user.id`; `globalThis.__creatorosPersistence` singleton; `__resetPersistenceForTests()`. Threads ctx through in Task 8.
- **Projects exemplar** (`backend/src/{db,schema/projects,repositories/project-repository}.ts`): `RepoDeps { now, nextId, userId }`; timestamps stored as ISO-8601 **text**; enums as text; `PROJECTS_DDL` raw string applied at `createDb()`. Identity mirrors this shape.

---

## TDD tasks

Each numbered task is RED → GREEN. File paths are exact and absolute-from-repo-root under `.worktrees/frontend-implementation/`.

### Decision (resolve at task start, recorded here)

- **Password/token hashing = `node:crypto` `scryptSync` + `randomBytes` + `timingSafeEqual`.** Rationale: zero native deps (argon2/bcrypt absent from both `package.json`s — grep confirmed), SPEC §20 only requires *hashed* tokens, demo-grade per foundation §2. Helper lives in `identity.crypto.ts`. (If the executing wave prefers argon2, swap the helper only — no call-site changes.)
- **Session cookie name:** `creatoros_session`; `httpOnly; SameSite=Lax; Path=/; Secure` (Secure omitted in test/dev). Value = the **raw** token (opaque random 32-byte hex); only its `sha256` hash is stored in `sessions.token_hash`.

---

#### Task 1 — db-schema: `users`, `sessions` (+ seed shape)

- [ ] Create `frontend/src/server/modules/identity/identity.db-schema.ts` mirroring `backend/src/schema/projects.ts` conventions (text PKs, ISO-8601 text timestamps).
  - `users` pgTable: `id text pk`, `email text notNull` (UNIQUE), `displayName text notNull`, `timezone text notNull`, `locale text notNull`, `passwordHash text notNull`, `createdAt text notNull`, `updatedAt text notNull`. *(`passwordHash` is the identity-infra column not present in the data-model ER — documented above.)*
  - `sessions` pgTable: `id text pk`, `userId text notNull` (owned row → carries `user_id`), `tokenHash text notNull` (UNIQUE), `createdAt text notNull`, `expiresAt text notNull`, `revokedAt text` (nullable).
  - Export `IDENTITY_DDL` raw-string DDL (`CREATE TABLE IF NOT EXISTS users (...)`, `... sessions (...)`, `CREATE UNIQUE INDEX IF NOT EXISTS users_email_uk ON users(email)`, `CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_uk ON sessions(token_hash)`).
- [ ] Wire `IDENTITY_DDL` into the shared init: append it after `PROJECTS_DDL` in `backend/src/db.ts` `createDb()` (`await client.exec(PROJECTS_DDL); await client.exec(IDENTITY_DDL);`) **or**, if Wave-0 §1 has already generalized the registry, register identity's DDL into the module-DDL union. Re-export from `backend/src/index.ts`.
- [ ] **Test** `frontend/src/server/modules/identity/identity.repository.integration.test.ts` (schema slice): after `createDb()`, a raw insert into `users` then `sessions` round-trips; the `users_email_uk` index rejects a duplicate email (expect a unique-violation throw); the `sessions_token_hash_uk` index rejects a duplicate token hash. *(GREEN: tables + indexes exist.)*

#### Task 2 — identity.crypto helper (hash primitives)

- [ ] Create `frontend/src/server/modules/identity/identity.crypto.ts`:
  - `hashPassword(plain: string): string` → `scryptSync(plain, salt, 64)` with a per-hash random 16-byte salt, returns `"${saltHex}:${derivedHex}"`.
  - `verifyPassword(plain: string, stored: string): boolean` → re-derive with the stored salt, compare with `timingSafeEqual`.
  - `generateSessionToken(): { raw: string; hash: string }` → `raw = randomBytes(32).toString("hex")`, `hash = createHash("sha256").update(raw).digest("hex")`.
  - `hashToken(raw: string): string` → same sha256 (for lookup on `/me`).
- [ ] **Test** `frontend/src/server/modules/identity/identity.crypto.test.ts`: `verifyPassword(p, hashPassword(p))===true`; wrong password `false`; two `hashPassword(p)` calls differ (random salt) yet both verify; `generateSessionToken()` `hash === hashToken(raw)`; raw is 64 hex chars.

#### Task 3 — repository (user-scoped) — `users` + `sessions`

- [ ] Create `frontend/src/server/modules/identity/identity.repository.ts` with `RepoDeps { now: () => string; nextId: (prefix: string) => string }` (matches the Projects exemplar; **no fixed `userId` dep here** — identity's repo is the one place that *resolves* identity, so its lookups key on email / token hash / explicit userId, but every method that touches a *session row by user* still filters `eq(sessions.userId, userId)`).
  - `seedUser(row): Promise<void>` — `insert(users).values(row).onConflictDoNothing()` (idempotent seed).
  - `findUserByEmail(email): Promise<UserRow | undefined>` — `where(eq(users.email, email))`.
  - `getUserById(userId): Promise<UserRow>` — `where(eq(users.id, userId))`; throw `OwnershipError` (→404) if absent.
  - `createSession(input: { userId; tokenHash; expiresAt }): Promise<SessionRow>` — stamps `id=nextId("session")`, `createdAt=now()`.
  - `findActiveSessionByTokenHash(tokenHash): Promise<SessionRow | undefined>` — `where(eq(sessions.tokenHash, tokenHash))`, filter out `revokedAt != null` and `expiresAt <= now()` in-method.
  - `revokeSession(tokenHash, userId): Promise<void>` — **user-scoped**: `update(sessions).set({ revokedAt: now() }).where(and(eq(sessions.tokenHash, tokenHash), eq(sessions.userId, userId)))`.
  - `revokeAllForUser(userId): Promise<void>` — `where(eq(sessions.userId, userId))` (used by account-delete coordination).
- [ ] **Test** (extend `identity.repository.integration.test.ts`, pglite-backed, per MODULE-ARCH §2):
  - seed two users A, B; `createSession` one session each; **ownership**: `revokeSession(tokenHashA, userB.id)` revokes nothing (A's session still active) — proves no cross-user revoke; `revokeSession(tokenHashA, userA.id)` revokes it.
  - `findActiveSessionByTokenHash` returns undefined for a revoked session and for an expired one (`expiresAt` in the past).
  - `findUserByEmail` is exact-match; `getUserById` throws `OwnershipError` for an unknown id.

#### Task 4 — errors

- [ ] Create `frontend/src/server/modules/identity/identity.errors.ts`: `AuthenticationError` (maps to 401 — wrong/blank credentials, no/invalid session), `OwnershipError` (maps to 404 — user/session not found for this scope). Re-use the contract `ErrorCode` names (`AuthenticationError`, `OwnershipError`) so the route mapper (Task 9) and SPEC §14 stay aligned.

#### Task 5 — service (RequestContext + the auth state actions)

- [ ] Create `frontend/src/server/modules/identity/identity.service.ts`. No §12 *business* state machine applies to Identity (foundation §4 / roadmap §5: "No machine for … Identity"); the relevant lifecycle is the **session lifecycle** `none → active → revoked|expired`, enforced here.
  - `login({ email, password }): Promise<{ user: UserDTO; rawToken: string; expiresAt: string }>` — `findUserByEmail`; if missing or `!verifyPassword` → throw `AuthenticationError` (same message either way — no user-enumeration). Else `generateSessionToken()`, `createSession({ userId, tokenHash, expiresAt = now + 30d })`, return raw token (for the cookie) + a `UserDTO` (explicit DTO, NOT the Drizzle row — SPEC §9: no row leak; shape = `userResource` minus internal fields).
  - `resolveContextFromToken(rawToken): Promise<RequestContext>` — `findActiveSessionByTokenHash(hashToken(rawToken))`; missing → throw `AuthenticationError`; else build `RequestContext { userId: session.userId, requestId: nextId("req"), source: "user" }` (SPEC §10 shape).
  - `getCurrentUser(ctx): Promise<UserDTO>` — `getUserById(ctx.userId)` → DTO (this is the `/me` payload).
  - `logout(ctx, rawToken): Promise<void>` — `revokeSession(hashToken(rawToken), ctx.userId)` (user-scoped revoke).
  - Export the public surface from `frontend/src/server/modules/identity/index.ts` (the ONLY public entry — service interface + the seed helper + `resolveContextFromToken`). No transport map export (Identity owns no dispatch ops).
- [ ] **Test** `frontend/src/server/modules/identity/identity.service.test.ts` (service-level, MODULE-ARCH §2):
  - `login` happy path returns a raw token whose hash matches a stored active session; returned DTO has no `passwordHash` key.
  - wrong password and unknown email both throw `AuthenticationError` with an identical message.
  - `resolveContextFromToken(raw)` yields `ctx.userId === seededUser.id`, `source: "user"`; an unknown/garbage token throws `AuthenticationError`; after `logout(ctx, raw)`, the same token throws (revoked).
  - `getCurrentUser(ctx)` returns the seeded user DTO.

#### Task 6 — RequestContext type (shared infra)

- [ ] Add the `RequestContext` type to shared infra so every module imports one definition: `backend/src/request-context.ts` → `export interface RequestContext { userId: string; requestId: string; source: "user" | "ingestion" | "ai"; ingestionRunId?: string; aiTaskId?: string; }` (SPEC §10). Re-export from `backend/src/index.ts`. *(No test — type-only; consumed by Tasks 5/8/9.)*

#### Task 7 — seed the canonical user (fixtures keep resolving)

- [ ] Add a seed helper `seedCanonicalUser(repo, deps)` to `identity.service.ts` (or `identity.seed.ts` co-located): inserts the canonical user with **exact** fixture values — `id:"user-zyongzhu"`, `email:"zyongzhu@creatoros.local"`, `displayName:"Zyong Zhu"`, `timezone:"Asia/Shanghai"`, `locale:"zh-CN"`, `createdAt/updatedAt` = `FIXED_NOW_ISO` (import from `@/server/mock-backend/store`), `passwordHash = hashPassword(DEV_PASSWORD)` where `DEV_PASSWORD` is read from `process.env.CREATOROS_DEV_PASSWORD ?? "creatoros-dev"` (documented default; never logged — SPEC §20/§21).
- [ ] **Test** (extend `identity.service.test.ts`): after `seedCanonicalUser`, `login({ email:"zyongzhu@creatoros.local", password: DEV_PASSWORD })` succeeds and `ctx.userId === "user-zyongzhu"`; a second `seedCanonicalUser` call is a no-op (idempotent — `onConflictDoNothing`).

#### Task 8 — transport signature change: thread `ctx` (the one cross-cutting substrate edit)

- [ ] Edit `contract/src/transport.ts`: `Transport.request<E>(endpoint, input, ctx?: RequestContext)`. Keep `ctx` **optional** in the contract type so the typed client (browser side, which has no ctx) still compiles; the server composite + persistence transports treat a missing ctx as unauthenticated for persisted ops.
- [ ] Edit `backend/src/persistence-transport.ts`: `request(endpoint, input, ctx)`. Replace the construction-time `RepoDeps.userId` reliance with **per-request ctx**: `createPersistenceTransport` takes a `repoFactory(ctx)` (or the handler reads `ctx.userId`). Every Projects query becomes `eq(projects.userId, ctx.userId)` (the exemplar currently lists/gets unscoped — Wave-2 Projects tightens it; this task only plumbs ctx so it *can*). Throw `AuthenticationError` if a persisted op is reached with no `ctx`.
- [ ] Edit `frontend/src/server/persistence-client.ts`: `compositeTransport.request(endpoint, input, ctx)` → forward `ctx` to both `mockTransport.request(...)` and `getPersistence().request(...)`. `buildPersistence()` also seeds identity: `await seedCanonicalUser(identityRepo, deps)` alongside `repo.seedProjects(...)`, and applies `IDENTITY_DDL` (via Task 1's `createDb`). Keep the `globalThis` singleton + `__resetPersistenceForTests()`.
- [ ] Edit `frontend/src/lib/contract-client.server.ts`: server reads need a ctx. Add `createServerClient(ctx)` that binds `compositeTransport` with the request's ctx (derived in the RSC/layout from the cookie — Task 11). The existing `client` export becomes a thin default bound to the seeded canonical ctx for pages not yet migrated (keeps current green pages working).
- [ ] **Test** `frontend/src/server/persistence-client.ctx.test.ts`: a persisted op called with a ctx for user A returns A-scoped rows; called with no ctx throws `AuthenticationError`; a non-persisted (mock) op ignores ctx and still resolves (back-compat).

#### Task 9 — auth routes + dispatch ctx-derivation + 401

- [ ] Create `frontend/src/app/api/v1/auth/login/route.ts` (`POST`): Zod-validate `{ email, password }`; call `identity.login`; on success `cookies().set("creatoros_session", rawToken, { httpOnly:true, sameSite:"lax", path:"/", expires })` and return `{ data: userDTO, meta:{ requestId } }`; on `AuthenticationError` → 401 envelope (SPEC §14).
- [ ] Create `frontend/src/app/api/v1/auth/logout/route.ts` (`POST`): read cookie → `resolveContextFromToken` → `identity.logout(ctx, rawToken)`; `cookies().delete("creatoros_session")`; return `{ data: { ok: true }, meta }`. Missing cookie → still 200 (idempotent logout).
- [ ] Create `frontend/src/app/api/v1/auth/me/route.ts` (`GET`): read cookie → `resolveContextFromToken` → `getCurrentUser(ctx)` → `{ data: userDTO, meta }`; no/invalid cookie → 401.
- [ ] Edit `frontend/src/app/api/v1/dispatch/route.ts`: before `compositeTransport.request(...)`, read `cookies().get("creatoros_session")` → `resolveContextFromToken` → `ctx`; pass `ctx` as the third arg. No/invalid cookie → **401** envelope `{ error:{ code:"AuthenticationError", ... }, meta }` (foundation §2 "Unauthenticated → 401"). Map thrown `OwnershipError` → 404, `AuthenticationError` → 401, `ConflictError` → 409, else keep the existing 501/400 split (SPEC §14 table).
- [ ] **Test** `frontend/src/app/api/v1/auth/auth-routes.test.ts` + extend `dispatch/route.test.ts`:
  - `POST /auth/login` with canonical creds → 200, sets `Set-Cookie: creatoros_session=...; HttpOnly`.
  - `GET /auth/me` with that cookie → 200 + canonical user; without cookie → 401.
  - `POST /auth/logout` clears the cookie; a subsequent `/auth/me` with the old cookie → 401.
  - `POST /api/v1/dispatch` for a persisted op **without** a session cookie → 401; **with** the cookie → 200 (ctx threaded).

### FE island wiring (from roadmap §4 button rows)

Identity owns three page surfaces in the roster (foundation §7 row 00: **Login, Settings, Shell**). §4 has **no Login-page inventory** (greenfield — built here); Identity's §4 rows live in the **Settings** and **Shell** tables, mostly `decorative`/`needs-backend` with `Module = Identity`.

#### Task 10 — Login page (greenfield client island)

- [ ] Create `frontend/src/app/login/page.tsx` + `frontend/src/app/login/login-form.tsx` (client island): email + password inputs, **登录** submit → `fetch("/api/v1/auth/login", { method:"POST", body })`; on 200 `router.replace(searchParams.get("from") ?? "/")` + `router.refresh()`; on 401 render an inline error (no enumeration). This is the surface the foundation §2 "login page" deliverable names; not in §4 because §4 predates auth.
- [ ] **Test** `frontend/src/app/login/login-form.test.tsx` (component): renders email/password/登录; submit posts to `/api/v1/auth/login`; 401 shows the error message; 200 calls `router.replace` + `router.refresh`.

#### Task 11 — Shell session guard + user card (Shell rows)

- [ ] Edit `frontend/src/app/(creator)/layout.tsx` (server): read `cookies().get("creatoros_session")` → `resolveContextFromToken`; on failure `redirect("/login?from=" + pathname)` (the session guard foundation §2 names for the `(creator)` layout). On success derive `ctx` and pass a server-bound client (Task 8 `createServerClient(ctx)`) down so pages read user-scoped.
- [ ] Wire the **Shell** §4 rows whose `Module = Identity`:
  - `User profile card` (§4 Shell: "Brand mark / unread dot / **user profile card** | decorative | … | GET /settings | Identity") — make the user card render real identity from `settings.get` (`displayName`, `email`). It was `decorative`; lifting it to a real read is the Identity FE deliverable. The brand mark + unread dot stay **intentionally inert (decorative)**.
- [ ] **Test** `frontend/src/app/(creator)/layout.guard.test.tsx`: no/invalid cookie → redirect to `/login`; valid cookie → renders children + the user card bound to the canonical user.

#### Task 12 — Settings identity rows (display + account-delete gate)

Settings §4 rows with `Module = Identity` (these are wired here for *display/identity*; the preference-persistence rows belong to the Settings module, Wave 1):
- [ ] `已验证 badge / plan / timezone chips` — `decorative` in §4; bind the timezone/locale chips to `settings.get` (real identity labels). The "已验证"/plan badges remain **intentionally inert (decorative)** — no verification/billing entity exists.
- [ ] `昵称 / 邮箱 inputs` — `needs-backend` but **flagged spec gap in roadmap §6: no `PATCH /me`**. Leave the inputs **read-only, populated from `settings.get`**, and note inline: *profile-edit deferred — `PATCH /me` is an unresolved §13 gap (roadmap §6).* Do NOT invent an endpoint.
- [ ] `确认删除账户 switch` — `wired-local` in §4 (arms the gate); keep the local arming behavior.
- [ ] `删除账户` button — `needs-backend`, "(Identity coordination)", **no §13 REST route** (roadmap §6 gap). Leave the button **disabled with a tooltip**: *account deletion (30-day window) pending the account-delete REST surface (roadmap §6 gap).* Mark intentionally inert until that gap is decided. (The repo `revokeAllForUser` + a future delete route are the eventual backing — out of scope for Wave 0.)
- [ ] `导入 / 导出` buttons — `decorative` in §4, no route exposed → **intentionally inert (decorative)**.
- [ ] **Test** `frontend/src/app/settings/identity-section.test.tsx`: timezone/locale/email/nickname render from a stubbed `settings.get`; nickname/email inputs are read-only; 删除账户 is disabled; toggling the delete switch only flips local arm state.

### Tests roll-up (MODULE-ARCH §2 three-tier)

- **service:** `identity.service.test.ts`, `identity.crypto.test.ts` (Tasks 2,5,7).
- **repository-integration (pglite):** `identity.repository.integration.test.ts` — ownership-enforced, user A cannot revoke/read user B's sessions (Tasks 1,3).
- **contract:** Identity owns no dispatch op, so the contract tier is the **route/envelope conformance** tests (`auth-routes.test.ts`, `dispatch/route.test.ts`, `persistence-client.ctx.test.ts`) asserting the 401/404 envelope shapes match SPEC §14 + that `/me` payload validates against `userResource` (Tasks 8,9).
- **FE:** `login-form.test.tsx`, `layout.guard.test.tsx`, `identity-section.test.tsx` (Tasks 10–12).

### Acceptance (SPEC §22 + foundation §5.6)

- [ ] Module has service + repository + schema + errors + tests; public surface only via `index.ts`; **no cross-module repository import** (Identity imports nothing from other modules; later modules import Identity only via `index.ts` for `resolveContextFromToken`/`RequestContext`).
- [ ] Routes (`auth/*`, `dispatch`) do **not** touch the db client directly — they go through `identity.service` / `compositeTransport` (SPEC §22 "Route 不访问 repository 或数据库客户端").
- [ ] Every identity repository query that reads/writes an owned (`sessions`) row by user is `eq(sessions.userId, userId)`; cross-user → no rows / `OwnershipError` → 404 (multi-tenant smoke: user A cannot revoke or read user B's session — Task 3 test).
- [ ] Hashed session token only (`sessions.token_hash`); raw token lives only in the httpOnly cookie; password stored as a salted scrypt hash; **no secret/token/password logged** (SPEC §20/§21).
- [ ] Canonical user seeded idempotently so all existing fixture-backed green pages and the Projects persistence seed still resolve under the seeded ctx.
- [ ] `RequestContext.userId` derivable from the cookie in `/api/v1/dispatch`; unauthenticated dispatch → 401. `pnpm verify` (frontend) green + this module's tests green.

---

## Open questions (carry into execution)

1. **`PATCH /me` (profile edit) and the account import/export/delete REST surface** are roadmap §6 spec gaps with no §13 endpoint. This plan leaves those Settings rows inert/read-only. Confirm: defer to a later Identity stage-N (current assumption) vs. add the endpoints now.
2. **Hashing primitive:** plan picks `node:crypto` scrypt for zero-native-dep demo-grade. Confirm acceptable, or mandate argon2id (adds a native/optional dep + build step).
3. **ctx propagation depth in Wave 0:** Task 8 threads ctx through the transport but only *enables* user-scoping on the still-unscoped Projects exemplar list/get; tightening those filters is assigned to Wave-2 Projects. Confirm that split (Identity plumbs ctx; each module tightens its own queries) rather than retro-scoping Projects inside this plan.
4. **Dev login credential:** `CREATOROS_DEV_PASSWORD` env with default `"creatoros-dev"` for the seeded canonical user. Confirm the default + whether the login page should show it in dev.
