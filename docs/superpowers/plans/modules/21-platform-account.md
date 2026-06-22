# Module 21 — Platform Account / 多账号矩阵 (TDD execution plan)

> **Wave 5–7 (七步整合 §8 row "§7.1 `PlatformAccount` + §7.2 `ContentCalendar`", priority P1).** Follows the keystone foundation `docs/superpowers/plans/2026-06-21-program-foundation.md` (§5 per-module template, §1 architecture: modules under `frontend/src/server/modules/<module>/`, user-scoped repos, registry, `globalThis` pglite) and the seven-step integration spec `docs/CreatorOS-七步整合设计.md` §7.1 (+ §1 hard constraints C-1..C-6, §8 priority). Steps use `- [ ]` and execute in order by a single dispatched agent that HALTS on the first failing step.

**Goal:** Wire the **PlatformAccount** vertical end-to-end — promote multi-account / 矩阵号 from a free-text `account_reference` string to a first-class, user-scoped entity (FE button → contract op → user-scoped SQL → envelope → render). After this module, the system can answer 七步整合 §9 row ⑤ "哪个账号断更了？" and attribute 涨粉/转化 per account: every `Publication`, `ProjectTargetPlatform`, and (via Publication) every `MetricSnapshot` 归到一个真实账号，而不是一个字符串 (§7.1 理由: "现有 `account_reference` string 撑不住").

**Why now / scope boundary (§7.1):** new entity `PlatformAccount(platform, account_handle, secret_reference, follower_baseline)`. This module **owns the account registry + the re-anchoring of the publishing/targeting/metrics graph onto `account_id`**. It does NOT build the content calendar (§7.2 `ContentCalendarEntry`/`PublishingCadence` — sibling module `22-content-calendar`, depends on this one for `account_id`), nor any monetization attribution (§4), nor calibration (§6).

**Architecture (foundation §1):** modular monolith under the Next app. This module lives at `frontend/src/server/modules/platform-account/` and registers its `{ opId → handler }` map into the composite transport registry (no edit to the composite switch — the union builds `PERSISTED_OPS`). Owns ONE entity: `PlatformAccount`. Every repository query is user-scoped (`eq(table.userId, ctx.userId)`); every insert stamps `ctx.userId`. No cross-module repository imports — the re-anchoring of `Publication.accountId` / `ProjectTargetPlatform.accountId` is done by **adding an `accountId` column + a validation hook through this module's public `index.ts` service interface** (`PlatformAccountService.assertOwnedAccount(ctx, accountId, platform)`), called BY the Publishing / Projects modules — never by reaching into their repositories from here, and never by reaching into this repo from there.

**Tech stack:** TypeScript, Drizzle ORM over the `globalThis` pglite singleton (foundation §1), Zod DTOs from `@creatoros/contract`, Vitest. Mirror the Projects slice conventions (`backend/src/schema/projects.ts`): ISO-8601 text timestamps, text enums, `jsonb` for structured columns, a raw `..._DDL` string for pglite init, `createXxxRepository(db, { now, nextId, userId })` factory, ctx-taking transport.

---

## HARD CONSTRAINTS this plan obeys (七步整合 §1)

- **C-1 (ID baseline frozen first):** all new `FR / ENT / API` ids for this module are **placeholders** (`ENT-1xx PlatformAccount`, `API-2xx accounts.*`) until OPEN-001 batch sign-off freezes existing segments; this plan does NOT mint final ids and does NOT renumber existing segments. New ids are appended as a new segment post-signature. The spec header note also permits 务实续号 (no formal C-1 freeze ceremony) — follow whichever the orchestrator confirms; do not insert into existing id ranges either way.
- **C-2 (must use contract-op → dispatch → Drizzle/pglite path, NOT frontend-fixtures-only):** from day one this module ① registers ops in `@creatoros/contract` (see "Contract ops" below — they land in **contract v0.4**); ② writes Drizzle schema + user-scoped repository; ③ joins `PERSISTED_OPS` via the registry; ④ ships the service/contract/integration test trio. NO fixtures-only FE.
- **C-3 (no parallel candidate state machine):** N/A to owned writes here — this module has no AI-generated candidates. **Where it touches AI:** if a future "suggest matrix-account split" AI action is added, it MUST reuse `submit_candidate → awaiting_confirmation → confirmResult` (DEC-009), not a new machine. This wave creates no such action — noted so a later wave doesn't fork one.
- **C-4 (calibration / metric 回收 reuses Ingestion):** this module does NOT add a new metric write path. `MetricSnapshot` already flows through `ExternalSource` + `IngestionRun` with the double idempotency keys `(source, idempotency_key)` / `(run, record_key)` (七步整合 C-4; data-model §9 lines 866-867, constraint 11). Re-anchoring metrics to an account is achieved purely by `MetricSnapshot → Publication → Publication.accountId` (the existing graph) — **no `MetricSnapshot.accountId` column, no new ingestion writer.** Per-account metrics are a *read-time rollup* over `Publication.accountId`. The RISK-005 lesson (悬空 `ingestionRunId`) does not regress because no IngestionRun reference is created here.
- **Multi-tenant user-scoping everywhere:** `RequestContext.userId` is the sole ownership boundary (foundation §2/§3). Every query filters by `userId`; cross-user access → `OwnershipError` (404, not 403). A `Publication`/`ProjectTargetPlatform` may only reference an `accountId` owned by the same user AND whose `platform` matches the row's `platform` (cross-tenant + cross-platform binding both rejected).
- **C-5 (frontend determinism):** new "账号管理" surfaces use a server shell + `*-interactive-region.tsx` island, only `ui/*` primitives + existing AppShell/Sidebar/TopHeader; render/selectors/fixtures forbid `Date.now`/`Math.random`/`fetch`. Visual baseline not re-based (R2-9) — mark the new "账号管理" page **"暂不纳入视觉门禁"** until stage-12 re-baseline.
- **C-6 (align manifest first):** before coding, confirm `ARTIFACT_MANIFEST.yaml` / frontier reflect that the base modules below are GREEN (DEC-010/011). Do not plan on top of a stale "backend not started" assumption.

---

## Dependency note (MUST be GREEN first)

This is a **Wave 5+** module — it re-anchors graph edges owned by earlier waves, so those must be green and stable:

| Must be GREEN | Why this module needs it |
|---|---|
| **Wave 0** — registry generalization + Identity/auth `RequestContext` | ctx threading + user-scoping substrate; `OwnershipError` shared error type. |
| **Wave 1** — Settings | `secret_reference` indirection convention (`settings.ts` `secretReference` pattern) — accounts store a *reference*, never a raw token (data-model `ExternalSource.secret_reference` / `ModelConfiguration.secret_reference` precedent). |
| **Wave 2** — Projects | owns `ProjectTargetPlatform`; this module adds `accountId` to it and validates via `ProjectsService` ↔ `PlatformAccountService` (no repo cross-import). |
| **Wave 3** — Publishing (`10-publishing.md`) | owns `Publication.accountReference`; this module migrates it to `Publication.accountId` and the publish flow validates the account via `PlatformAccountService.assertOwnedAccount`. |
| **Wave 3** — Analytics (`11-analytics.md`) | per-account metric rollup reads `Publication.accountId`; Analytics consumes `PlatformAccountService.listAccounts` for the account dimension — downstream, not a blocker. |

**Contract version gate:** the ops below DO NOT EXIST in contract today (grep of `contract/src/operations/` confirms only `accountReference: z.string()` in `publishing.ts` and `targetPlatforms: platformId[]` in `projects.ts` — no `PlatformAccount`). They are added in **contract v0.4**. This plan's Step 0 is a contract change; the module cannot go green until v0.4 ships the DTO + ops + the `accountId?` body extensions.

---

## Contract ops this module OWNS (added in contract v0.4 — placeholder ids, C-1)

New file `contract/src/operations/platform-accounts.ts` + resource `contract/src/resources/platform-accounts.ts`:

| op id | method · path | body | response DTO |
|---|---|---|---|
| `accounts.list` | GET `/accounts` | — (paginationQuery; optional `?platform=`) | `platformAccountResource` (isList) |
| `accounts.create` | POST `/accounts` | `{ platform, accountHandle, secretReference?, followerBaseline? }` | `platformAccountResource` |
| `accounts.get` | GET `/accounts/:accountId` | — | `platformAccountResource` |
| `accounts.update` | PATCH `/accounts/:accountId` | `{ accountHandle?, secretReference?, followerBaseline?, status? }` | `platformAccountResource` |
| `accounts.archive` | POST `/accounts/:accountId/archive` | — | `platformAccountResource` |

**Resource `platformAccountResource` fields** (data-model precedent + §7.1): `id`, `platform` (reuse `platformId` enum from `contract/src/primitives.ts` — `youtube|bilibili|douyin|xiaohongshu|wechatVideo|x`), `accountHandle` (string, non-empty), `secretReference` (string, nullable — a *reference*, never a raw secret; mirrors `settings.ts`/`ingestion.ts` `secretReference`), `followerBaseline` (int ≥ 0, default 0), `status` (enum `active | archived`, default `active`), `createdAt`, `updatedAt`.

**Body extensions this module REQUIRES on OTHER modules' v0.4 ops (owned by them, requested here):**
- `contract/src/operations/publishing.ts` `outputs.publications.create` body: add `accountId: id` (replacing the free-text `accountReference: z.string()`; keep `accountReference` accepted-but-deprecated for one version OR migrate fixtures — see Open Question 1). `publicationResource` (`contract/src/resources/publishing.ts`) gains `accountId: id`.
- `contract/src/operations/projects.ts` create/update body: `targetPlatforms` becomes `Array<{ platform: platformId, accountId?: id }>` OR a parallel `targetAccounts: id[]` (Open Question 2) — `ProjectTargetPlatform` gains `accountId` (data-model line 108-115). Keep backward-compatible (the v0.2 comment at `projects.ts:45` notes these are optional additive).

Enums source of truth = `contract/src/primitives.ts`. Do NOT redefine `platformId`; import it.

---

## File layout to create (foundation §1 template)

```
frontend/src/server/modules/platform-account/
├── platform-account.db-schema.ts
├── platform-account.repository.ts
├── platform-account.service.ts
├── platform-account.schema.ts
├── platform-account.transport.ts
├── platform-account.errors.ts
├── index.ts
├── platform-account.service.test.ts
├── platform-account.repository.integration.test.ts
└── platform-account.contract.test.ts
```

---

## Step 0 — contract v0.4 (blocks everything; C-2 day-one op registration)

- [ ] Add `contract/src/resources/platform-accounts.ts`: `platformAccountResource` (BaseEntity + the fields above; `platform` reuses `platformId`, `status` a new `platformAccountStatus = z.enum(["active","archived"])` in `primitives.ts`).
- [ ] Add `contract/src/operations/platform-accounts.ts`: the 5 ops above with method/path/body/response per the table; export `platformAccountOperations`.
- [ ] Wire into the contract index (mirror how `publishingOperations` is exported/aggregated) so `@creatoros/contract` surfaces `accounts.*`.
- [ ] Extend `outputs.publications.create` body + `publicationResource` with `accountId` (Open Question 1), and `projects` create/update with the account binding (Open Question 2) — additive/backward-compatible.
- [ ] **Test (contract package):** the contract's own zod round-trip / op-registry test enumerates the 5 new op ids and the 2 extended bodies; existing publishing/projects contract tests still parse (additive only).

## Step 1 — db-schema

- [ ] Create `frontend/src/server/modules/platform-account/platform-account.db-schema.ts`. Define one `pgTable` `platformAccounts` mirroring §7.1 + data-model conventions, with `user_id TEXT NOT NULL` (ownership column, foundation §1/§3):
  - `id` PK (text), `userId` notNull, `platform` text notNull, `accountHandle` text notNull, `secretReference` text (nullable), `followerBaseline` integer notNull default `0`, `status` text notNull default `'active'`, `createdAt` text notNull, `updatedAt` text notNull.
  - UNIQUE index `(user_id, platform, account_handle)` — one account row per (user, platform, handle); prevents矩阵号 duplicate registration (analogous to data-model uniqueness constraints §9).
- [ ] Add the `accountId` columns to the consuming tables (these tables are OWNED by Publishing/Projects — the column DDL is added in THIS module's wave but lives in their schema files; coordinate, do not duplicate the table):
  - `publications.accountId` text (nullable during migration, then required for new rows) + index — replaces/augments `accountReference` (Open Question 1).
  - `projectTargetPlatforms.accountId` text (nullable) + index (data-model line 108-115).
  - These are **edges into `platformAccounts.id`**; enforce same-user + same-platform binding in the SERVICE layer (no DB FK across module schemas in the modular monolith — validated in code, foundation §1 "no cross-module repository imports").
- [ ] Append `PLATFORM_ACCOUNT_DDL` to the shared pglite init wherever `PROJECTS_DDL` is consumed (grep `PROJECTS_DDL` usage; register in the same `CREATE TABLE IF NOT EXISTS` list). For the consumer-column additions, add `ALTER TABLE … ADD COLUMN IF NOT EXISTS account_id TEXT` to publishing/projects DDL (or include from creation when those modules re-init in this wave).
- [ ] **Test (`platform-account.repository.integration.test.ts`, first red):** a row inserted into `platformAccounts` round-trips via `db.select()` with all columns intact (`followerBaseline` defaults `0`, `secretReference` `null`, `status` `'active'`); the `(user_id, platform, account_handle)` unique index rejects a duplicate insert.

## Step 2 — repository (user-scoped ONLY)

- [ ] Create `frontend/src/server/modules/platform-account/platform-account.repository.ts` mirroring `createProjectRepository` (`backend/src/repositories/project-repository.ts`): `RepoDeps { now, nextId, userId }`, factory `createPlatformAccountRepository(db, deps)`. **Every** query filters `eq(platformAccounts.userId, deps.userId)`; **every** insert stamps `userId: deps.userId`. A private `getAccountRowById(accountId)` throws `OwnershipError` (message `OwnershipError: platform account not found: <id>`) when the scoped select is empty (404 not 403; foundation §2).
  - `createAccount({ platform, accountHandle, secretReference?, followerBaseline? })` — insert `{ id: nextId("acct"), userId, platform, accountHandle, secretReference: secretReference ?? null, followerBaseline: followerBaseline ?? 0, status: "active", createdAt: now(), updatedAt: now() }`; surfaces the unique-index violation as a `ConflictError` (duplicate handle on platform).
  - `listAccounts({ platform?, limit, offset })` — scoped, optional `platform` filter, `orderBy(desc(createdAt))`, paginated.
  - `getAccount(accountId)` — scoped get, throws `OwnershipError` if absent.
  - `findByPlatformHandle(platform, accountHandle)` — scoped select (used by create dedup + import flows); returns row or null.
  - `updateAccount(accountId, patch: { accountHandle?, secretReference?, followerBaseline?, status? })` — scoped get first (ownership), then scoped update with provided fields + `updatedAt: now()`; return row.
  - `archiveAccount(accountId)` — scoped update `status: "archived"`, `updatedAt: now()` (soft; no row delete — preserves historical Publication/metrics attribution per §7.1 归账号 intent).
  - `existsOwnedActiveAccount(accountId, platform)` — scoped boolean: row exists, `userId` matches, `platform` matches, `status = 'active'`. Backs the cross-module binding guard.
- [ ] **Tests (`platform-account.repository.integration.test.ts`, pglite-backed):**
  - ownership: repo `userId: "user-a"` creates an account; repo `userId: "user-b"` → `getAccount(sameId)` throws `OwnershipError` (A's row invisible to B); `existsOwnedActiveAccount` from B returns false.
  - duplicate `(platform, handle)` for the same user → `ConflictError`; same handle different platform → OK; same handle+platform different user → OK (scoped uniqueness is per-user).
  - `listAccounts({ platform })` returns only that platform's accounts, newest-first, respects `limit`/`offset`.
  - `archiveAccount` flips `status` to `archived` and `existsOwnedActiveAccount` then returns false (archived ≠ active binding target).

## Step 3 — service (RequestContext + guards; no AI state machine — C-3 N/A)

- [ ] Create `platform-account.errors.ts`: re-use shared foundation error types (`OwnershipError`, `ConflictError`, `ValidationError`, `UnsupportedOperationError`) — import, do not redefine.
- [ ] Create `platform-account.service.ts`. Every public method takes `(ctx: RequestContext, …)` and builds a repo bound to `ctx.userId` (`createPlatformAccountRepository(db, { now, nextId, userId: ctx.userId })`) so scoping is structural. No external port needed (accounts are pure local records — the `secretReference` is an opaque reference resolved elsewhere; this module NEVER stores or fetches a raw token, §7.1 + Settings precedent). Methods:
  - `listAccounts(ctx, { platform?, ...pagination })` → `repo.listAccounts` → `platformAccountResource[]`. Backs `accounts.list`.
  - `createAccount(ctx, { platform, accountHandle, secretReference?, followerBaseline? })` — guard `platform` parses as `platformId`; guard `accountHandle` non-empty; guard `followerBaseline >= 0` (`ValidationError` otherwise); `repo.createAccount`; return DTO. Backs `accounts.create`.
  - `getAccount(ctx, accountId)` → DTO. Backs `accounts.get`.
  - `updateAccount(ctx, accountId, patch)` — ownership via repo; `status` only `active|archived`; same validation guards; return DTO. Backs `accounts.update`.
  - `archiveAccount(ctx, accountId)` — `repo.archiveAccount`; return DTO. Backs `accounts.archive`. (Archiving an account does NOT cascade-delete its Publications — historical attribution preserved; future publishes to an archived account are rejected at the binding guard, not here.)
  - **`assertOwnedAccount(ctx, accountId, platform)` (PUBLIC binding guard — the cross-module seam, exported on `index.ts`):** returns void on success; throws `OwnershipError` if not owned, `ValidationError` if `status !== 'active'` or `platform` mismatches the account's platform. **Publishing's `createPublication` and Projects' targetPlatform write call THIS** (through `index.ts`, not the repo) before stamping `accountId` — so a Publication can only bind to a live, same-platform, same-user account. This keeps C-2's single write path AND the modular-monolith no-cross-repo rule.
- [ ] **Tests (`platform-account.service.test.ts`, fake `now`/`nextId`, pglite db):**
  - `createAccount` happy path returns `status:"active"`, `followerBaseline` echoed (or 0 default); invalid platform string → `ValidationError`; negative `followerBaseline` → `ValidationError`; duplicate handle → `ConflictError`.
  - `updateAccount` patches only provided fields, bumps `updatedAt`, rejects unknown `status`.
  - `assertOwnedAccount`: passes for owned active same-platform; throws `OwnershipError` for another user's account; throws `ValidationError` for archived account or platform mismatch (e.g. account is `douyin`, publication is `bilibili`).
  - `archiveAccount` flips status; a subsequent `assertOwnedAccount` on it throws `ValidationError` (active guard).

## Step 4 — transport (register ops) + schema

- [ ] Create `platform-account.schema.ts`: re-export the contract DTOs/enums/ops used (`platformAccountResource`, `platformAccountOperations`, `platformId`, `platformAccountStatus`) — single import surface.
- [ ] Create `platform-account.transport.ts` mirroring `createPersistenceTransport` (`backend/src/persistence-transport.ts`) but **ctx-taking** (foundation §2). Export `createPlatformAccountTransport(service)` returning `{ request(ctx, endpoint, input) }` with `switch (endpoint.id)`:
  - `"accounts.list"` → `service.listAccounts(ctx, { platform: query.platform, ...query })`, `meta: listMeta`.
  - `"accounts.create"` → `service.createAccount(ctx, body)`, `meta: singleMeta`.
  - `"accounts.get"` → `service.getAccount(ctx, params.accountId)`.
  - `"accounts.update"` → `service.updateAccount(ctx, params.accountId, body)`.
  - `"accounts.archive"` → `service.archiveAccount(ctx, params.accountId)`.
  - default → `throw new UnsupportedOperationError(endpoint.id)`.
- [ ] Create `index.ts` exporting the public `PlatformAccountService` interface (incl. `listAccounts`, `getAccount`, **`assertOwnedAccount`**), the op-id list `["accounts.list","accounts.create","accounts.get","accounts.update","accounts.archive"]`, and `registerPlatformAccount(registry)` adding the transport map. Register in the composite transport registry (foundation §1 — union builds `PERSISTED_OPS`, no composite switch edit).
- [ ] **Wire the consumers (through `index.ts`, NOT repo import):** in the Publishing module's `createPublication` and the Projects module's targetPlatform write, inject `PlatformAccountService` as a constructor dep and call `assertOwnedAccount(ctx, accountId, platform)` before stamping `accountId`. (These edits land in this wave but touch the consumer modules — keep them behind the public interface.)
- [ ] **Tests (`platform-account.contract.test.ts`):** for EACH of the 5 op ids, drive the transport with a seeded ctx + valid input and assert the contract DTO parses the envelope: `platformAccountOperations.list.response.parse(item)` per list item; `…create.response.parse(envelope.data)`; `…get`; `…update`; `…archive` (returns `status:"archived"`). Plus one cross-module guard test: a `createPublication` with an `accountId` owned by another user is rejected (via the injected `assertOwnedAccount`).

## Step 5 — FE island wiring

New global surface + injections into existing publishing/new-project flows. Preserve the `viewModel?` seam; server reads switch fixture → real op. C-5: server shell + island, `ui/*` only, no `Date.now`/`Math.random`/`fetch` in render/selectors/fixtures; mark the new page **"暂不纳入视觉门禁"**.

### 5a — New "账号管理 / 矩阵号" surface

- [ ] Decide placement (Open Question 3): either a `/settings/accounts` tab under Settings, or a standalone `/accounts` page. Add server shell `…-page.tsx` (initial read via `accounts.list`) + island `account-manager-interactive-region.tsx`.
  - **read:** server shell calls `accounts.list` → hydrate account cards (platform badge, handle, `followerBaseline`, status) into the view model.
  - **needs-backend:** `新增账号` → `accounts.create` `{ platform, accountHandle, secretReference?, followerBaseline? }` + `router.refresh()`; per-row `编辑` → `accounts.update`; `归档` → `accounts.archive` + `router.refresh()`.
  - **wired-local:** platform filter tabs (client filter, optional `?platform=` passthrough), `secretReference` masked display (show reference label, never a raw value — §7.1).
- [ ] Add the page's interactions test (mirror `publishing-center-interactions.test.tsx`): assert 新增/编辑/归档 issue the mapped `accounts.*` op via the HttpTransport mock + `router.refresh()`; assert filter tabs issue no network call; assert no `secretReference` raw value is rendered.

### 5b — Inject account selection into existing flows (replace free-text)

- [ ] **Publishing Workspace** `frontend/src/features/project-publishing/publishing-interactive-region.tsx`: the per-platform publish card's account field changes from a free-text input to an **account picker** populated by `accounts.list?platform=<platform>`; `确认发布` now passes `accountId` (not `accountReference`) into `outputs.publications.create`. Update `publishing-interactions.test.tsx` accordingly (the picker selecting an account → create body carries `accountId`).
- [ ] **New Project** `/projects/new` target-platform step: each chosen platform optionally binds an `accountId` from `accounts.list?platform=<platform>` (Open Question 2). Update the relevant new-project interactions test.

## Step 6 — tests (per MODULE-ARCH §2 trio) + acceptance (SPEC §22 + 七步整合 §9 ⑤)

- [ ] All three module test files green: `platform-account.service.test.ts` (validation guards valid+invalid, `assertOwnedAccount` cross-tenant/cross-platform/archived rejection, archive soft-flip), `platform-account.repository.integration.test.ts` (pglite, ownership user-A-vs-B, `(user,platform,handle)` uniqueness, platform-filtered list ordering/pagination), `platform-account.contract.test.ts` (each of 5 ops validates against its DTO + the cross-module binding rejection).
- [ ] **Acceptance checklist:**
  - **C-2:** every owned op runs contract-op → dispatch → user-scoped Drizzle/pglite → envelope (no fixtures-only path); the 5 ops are in `PERSISTED_OPS` via the registry.
  - **C-4:** NO new metric write path and NO `MetricSnapshot.accountId` column — per-account metrics are a read-time rollup over `Publication.accountId`; Ingestion's `(source, idempotency_key)` / `(run, record_key)` contract untouched.
  - **multi-tenant:** user A cannot read/update/archive/bind user B's account (smoke: `getAccount`/`assertOwnedAccount` from B → `OwnershipError`).
  - **no cross-module repository import:** Publishing/Projects bind via `PlatformAccountService.assertOwnedAccount` through `index.ts`; this module reaches no foreign repo.
  - **secret hygiene (§7.1):** account stores `secretReference` only — no raw token persisted or rendered.
  - **soft-archive preserves attribution:** archiving an account does not delete its Publications; historical `MetricSnapshot → Publication → accountId` rollups remain answerable.
  - **七步整合 §9 ⑤ closure:** the system can list accounts and (via `Publication.accountId` + the calendar sibling module) answer "哪个账号断更了" — this module supplies the account dimension.
  - **route does not touch the db client** (threads `ctx` into `compositeTransport.request`); the new page is marked "暂不纳入视觉门禁" until stage-12 re-baseline (C-5).
- [ ] Module ends GREEN under `pnpm verify` (frontend) + its own Vitest files.

---

## Open questions (resolve at execution, do not block planning)

1. **`accountReference` → `accountId` migration on Publishing.** Hard cut (replace the field) vs. additive (`accountId` new, `accountReference` deprecated one version). Recommend additive: add `accountId`, keep `accountReference` nullable/deprecated, backfill existing fixtures by minting a `PlatformAccount` per distinct `(platform, accountReference)`; drop `accountReference` in a later contract bump. Confirm with the Publishing module owner.
2. **Project target-platform account binding shape.** `targetPlatforms: Array<{ platform, accountId? }>` (richer) vs. parallel `targetAccounts: id[]` (additive, leaves `targetPlatforms: platformId[]` intact). Recommend the object form but gated on whether other consumers depend on the flat `platformId[]` shape (`projects.ts:52`). Confirm.
3. **"账号管理" placement.** `/settings/accounts` tab vs. standalone `/accounts` page (with a Sidebar entry). Recommend a Settings tab for P1 (no new Sidebar slot, lower visual-baseline surface); promote to standalone if the matrix-account ops UX grows. Confirm with the Settings module owner / IA.
4. **`followerBaseline` semantics.** Snapshot-at-registration vs. live-tracked. §7.1 names it a *baseline* (the at-onboarding number used as the涨粉 attribution zero-point), so keep it a static registration field; live follower counts flow through `MetricSnapshot` (`followers_gained`/follower metrics), not this column. Confirm no one expects it to auto-update.
5. **C-1 id segment.** Final `ENT/API` ids for `PlatformAccount`/`accounts.*` await OPEN-001 sign-off (or 务实续号 per the spec header). Until then placeholders only — do not insert into existing id ranges.
