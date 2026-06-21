# Module 03 — Settings (Wave 1) — Executable TDD Plan

> **For agentic workers:** REQUIRED SUB-SKILL `superpowers:test-driven-development` + `superpowers:executing-plans`. This plan follows the keystone `docs/superpowers/plans/2026-06-21-program-foundation.md` §5 per-module template and §1 architecture. Steps are `- [ ]`, ordered, bite-sized, RED→GREEN. No placeholder steps.

**Goal:** Wire the `/settings` page's user-scoped preference + model-config surface end-to-end (FE control → contract op → user-scoped SQL → render), under the modular-monolith substrate. Settings owns 4 contract ops; it is the heaviest needs-backend page (profile / model-config / agent-config). Identity-owned rows on the page (profile edit, account delete, import/export) are NOT this module's ops and stay inert here (called out per-row below).

**Architecture (foundation §1):** module lives at `frontend/src/server/modules/settings/`; user-scoped repositories (`eq(table.userId, ctx.userId)` on every query); `RequestContext.userId` threaded from the dispatch route; transport map registered into the module registry; one `globalThis` pglite singleton shared by route + RSC. Multi-tenant real (§1 decision 3); AI-real (decision 1) consumes Settings' `resolveModelForCapability`; external side-effects mocked (decision 2) — not used by Settings.

**Tech stack:** Next.js (App Router, RSC + client islands), Drizzle ORM over pglite (in-memory; ISO-8601 text timestamps, text enums, jsonb for `settings`/`capabilities`), Zod DTOs from `@creatoros/contract`, Vitest. FE mutation pattern: `client.<method>(...)` → `router.refresh()` (mirrors `frontend/src/features/project-overview/project-actions.tsx`).

**State machines (SPEC §12 / roadmap §line 398):** Settings has **no domain state machine** — preferences/model/agent rows are mutable singletons/upserts, not lifecycle entities. Service guards are validation + upsert idempotency only (no transition table).

**Dependency note (must be GREEN first):** Wave 0 — registry generalization (foundation §1) + Identity/auth `modules/00-identity-auth.md` (`users` table + seeded canonical user `user-zyongzhu` + `RequestContext.userId` derivation in the dispatch route). Settings reads/writes are user-scoped against the seeded user; without Identity there is no `ctx.userId`.

---

## Contract ops owned by this module (grepped — `contract/src/operations/settings.ts`)

| Map key (→ `client.<key>`) | op id | method/path | body / params | response DTO |
|---|---|---|---|---|
| `getSettings` | `settings.get` | GET `/settings` | — | `userResource` |
| `patchPreferences` | `settings.preferences.patch` | PATCH `/settings/preferences` | `{defaultHome?, defaultCreationMode?(guided\|flexible\|freeform), defaultVisibility?(private\|unlisted\|public), autosaveEnabled?, fileNamingRule?, analyticsEnabled?}` | `userPreferenceResource` |
| `putModel` | `settings.models.put` | PUT `/settings/models/:capability` | params `{capability}`; body `{provider, modelName, secretReference?, settings?, isDefault?}` | `modelConfigurationResource` |
| `createAgent` | `settings.agents.create` | POST `/settings/agents` | `{name, agentType}` | `agentConfigurationResource` |

DTO field shapes are fixed by `contract/src/resources/settings.ts` (do not redefine; re-export in `settings.schema.ts`). SPEC §13 group "AI、搜索和系统 / 系统" (`backend/SPEC.md` lines 443-446).

Entity fields (data-model `docs/CreatorOS-data-model.md`): `USER` (id, email UK, display_name, timezone, locale, created_at, updated_at); `USER_PREFERENCE` (user_id PK,FK, default_home, default_creation_mode, default_visibility, autosave_enabled, file_naming_rule, analytics_enabled — **no own id/timestamps**, `userResource.id == userId` mapping note below); `MODEL_CONFIGURATION` (id, user_id, capability, provider, model_name, secret_reference, settings json, is_default); `AGENT_CONFIGURATION` (id, user_id, name, agent_type, status, capabilities json, settings json, secret_reference, created_at, updated_at).

> **DTO-vs-data-model reconciliation (decide-once, encoded below):**
> - `userPreferenceResource` carries an `id` + `userId` but the data-model keys `USER_PREFERENCE` by `user_id` (PK=FK). Resolution: store `user_id` as PK; the repo maps row → DTO with `id = "pref-" + userId` (stable, deterministic) so the Zod `id` field is satisfied without a second column.
> - `modelConfigurationResource.secretReference` and `.settings` are **required** (non-optional) in the DTO but the PUT body marks them optional. Resolution: repo defaults `secretReference => ""` and `settings => {}` on upsert when absent (matches canonical fixtures, e.g. `model-script` has `secret-script`/`{temperature:0.6}`).
> - `getSettings` returns `userResource` (the identity row), NOT preferences. The Settings page's preference/model controls read the preference + model rows separately via the page DTO / seeded view-model; `getSettings` is the account-card identity read only.

---

## Step 1 — db-schema (`settings.db-schema.ts`)

Mirror the Projects-slice schema style (`backend/src/schema/projects.ts`): ISO-8601 text timestamps, text enums, `jsonb` for json columns, a raw `*_DDL` string applied at db init.

- [ ] Create `frontend/src/server/modules/settings/settings.db-schema.ts` exporting three `pgTable`s + `SETTINGS_DDL`:
  - `userPreferences` — `userId text("user_id").primaryKey()`, `defaultHome text notNull`, `defaultCreationMode text notNull`, `defaultVisibility text notNull`, `autosaveEnabled boolean notNull default(true)`, `fileNamingRule text notNull default('')`, `analyticsEnabled boolean notNull default(true)`. (PK=user_id per data-model; one row per user.)
  - `modelConfigurations` — `id text primaryKey`, `userId text("user_id") notNull`, `capability text notNull`, `provider text notNull`, `modelName text("model_name") notNull`, `secretReference text("secret_reference") notNull default('')`, `settings jsonb notNull`, `isDefault boolean("is_default") notNull default(false)`. Unique upsert key is `(user_id, capability)` — add `CREATE UNIQUE INDEX IF NOT EXISTS model_config_user_capability ON model_configurations (user_id, capability)` to the DDL (drives `putModel` upsert).
  - `agentConfigurations` — `id text primaryKey`, `userId text("user_id") notNull`, `name text notNull`, `agentType text("agent_type") notNull`, `status text notNull default('active')`, `capabilities jsonb notNull`, `settings jsonb notNull`, `secretReference text("secret_reference") notNull default('')`, `createdAt text("created_at") notNull`, `updatedAt text("updated_at") notNull`.
- [ ] `SETTINGS_DDL` = the three `CREATE TABLE IF NOT EXISTS` + the unique index, snake_case columns matching the Drizzle column names.
- [ ] Register `SETTINGS_DDL` into the shared db init (foundation §1 registry; the generalized `createDb` concatenates each module's DDL — append Settings' DDL alongside `PROJECTS_DDL`).
- [ ] **Test** (`settings.repository.integration.test.ts`, schema slice): a fresh pglite db with `SETTINGS_DDL` applied accepts an insert into each of the 3 tables and round-trips it (1 assertion per table). RED first (no DDL), GREEN after.

## Step 2 — repository (`settings.repository.ts`) — USER-SCOPED ONLY

Follow `backend/src/repositories/project-repository.ts`: `RepoDeps { now, nextId, }` injected; **but** every query takes/closes over `ctx.userId` and filters `eq(table.userId, ctx.userId)`. No unscoped read or write. Throw `OwnershipError` (404 semantics) when a fetch-then-mutate misses for the scoped user.

- [ ] `createSettingsRepository(db, deps)` exposing (all methods receive `ctx: RequestContext`, or a `userId` bound at construction per the foundation's threading choice — match Identity's chosen convention):
  - `getPreferences(ctx)` → `select().from(userPreferences).where(eq(userPreferences.userId, ctx.userId))` → first row or `null`.
  - `seedPreferences(rows)` / `seedModels(rows)` / `seedAgents(rows)` → `onConflictDoNothing` (fixture parity, mirrors `seedProjects`).
  - `patchPreferences(ctx, patch)` → upsert: if no row for `ctx.userId`, insert with patch over defaults; else `update(...).set(patch).where(eq(userPreferences.userId, ctx.userId))`. Only set keys present in `patch` (mirror project `patch` field-guarding). Return the row.
  - `getModel(ctx, capability)` → `where(and(eq(modelConfigurations.userId, ctx.userId), eq(modelConfigurations.capability, capability)))` → first or `null`.
  - `putModel(ctx, capability, body)` → upsert keyed on `(userId, capability)`: `insert(...).values({ id: deps.nextId("model"), userId: ctx.userId, capability, provider, modelName, secretReference: body.secretReference ?? "", settings: body.settings ?? {}, isDefault: body.isDefault ?? false }).onConflictDoUpdate({ target: [modelConfigurations.userId, modelConfigurations.capability], set: { provider, modelName, secretReference, settings, isDefault } })`. Return the row.
  - `listModels(ctx)` → all model rows for `ctx.userId` (used by `resolveModelForCapability` + page DTO).
  - `createAgent(ctx, { name, agentType })` → `insert(agentConfigurations).values({ id: deps.nextId("agent"), userId: ctx.userId, name, agentType, status: "active", capabilities: {}, settings: {}, secretReference: "", createdAt: deps.now(), updatedAt: deps.now() }).returning()`.
- [ ] **Test** (`settings.repository.integration.test.ts`, pglite-backed):
  - Ownership: seed a preference + model + agent for `userA` and for `userB`; assert `getPreferences(ctxB)` never returns `userA`'s row; `getModel(ctxB, "script")` returns only `userB`'s; `listModels(ctxA)` excludes `userB`. (User A cannot read user B — foundation §5.2.)
  - `putModel` upsert: first call inserts; second call with same `(userId, "script")` updates in place (row count stays 1, fields change).
  - `patchPreferences` insert-then-update: first call seeds defaults+patch; second call mutates only provided keys, leaves `fileNamingRule` untouched.

## Step 3 — service (`settings.service.ts`) — RequestContext methods

No state machine (§12). Service = validation (delegated to contract Zod on the transport edge) + repo orchestration + the AI-consumed read. Methods take `RequestContext` (SPEC §10).

- [ ] `createSettingsService(repo)` exposing:
  - `getAccount(ctx)` → identity row for `getSettings`. Settings does not own `users`; **delegate to Identity's public service** via its `index.ts` (no cross-module repo import — foundation §1). Returns `userResource`-shaped DTO (id, email, displayName, timezone, locale, createdAt, updatedAt).
  - `updatePreferences(ctx, patch)` → `repo.patchPreferences(ctx, patch)` → map row → `userPreferenceResource` (synthesize `id = "pref-" + ctx.userId`).
  - `setModelConfiguration(ctx, capability, body)` → `repo.putModel(...)` → map → `modelConfigurationResource`.
  - `resolveModelForCapability(ctx, capability)` → `repo.getModel(ctx, capability)` ?? the `isDefault` row from `listModels` ?? a deterministic default (`{ provider:"anthropic", modelName:"claude-opus-4-8" }` per foundation §3 default). **Public on `index.ts`** — the AI module's `ClaudeAgentRunner` reads it (foundation §3 "reads model config from Settings"; roadmap G15).
  - `createAgentConfiguration(ctx, { name, agentType })` → `repo.createAgent(...)` → map → `agentConfigurationResource`.
- [ ] **Test** (`settings.service.test.ts`, fake/in-memory repo):
  - `updatePreferences` returns DTO with synthesized `id` and only the patched fields changed.
  - `setModelConfiguration` upsert returns the merged row; `secretReference`/`settings` default when omitted.
  - `resolveModelForCapability` fallback chain: exact capability → `isDefault` → hard default (3 cases, deterministic).
  - `createAgentConfiguration` stamps `status:"active"`, empty `capabilities`/`settings`/`secretReference`, and `createdAt==updatedAt` from the injected clock.

## Step 4 — transport (`settings.transport.ts`) + registry

Mirror `backend/src/persistence-transport.ts`: a `switch (endpoint.id)` returning `{ data, meta }` envelopes; `throw new UnsupportedOperationError(endpoint.id)` in `default`. Signature gains `ctx` (foundation §2 cross-cutting change): `(ctx, endpoint, input) => envelope`.

- [ ] `settings.transport.ts` exports `settingsTransport = { [opId]: (ctx, input) => Promise<envelope> }`:
  - `"settings.get"` → `{ data: await service.getAccount(ctx), meta: { requestId: ctx.requestId } }`.
  - `"settings.preferences.patch"` → `service.updatePreferences(ctx, input.body)`.
  - `"settings.models.put"` → `service.setModelConfiguration(ctx, input.params.capability, input.body)`.
  - `"settings.agents.create"` → `service.createAgentConfiguration(ctx, input.body)`.
- [ ] `index.ts` — the ONLY public entry: export the service interface (`SettingsService` incl. `resolveModelForCapability`) + the `{ opId → handler }` map. Register the 4 ids into the module transport registry so the composite builds `PERSISTED_OPS` from the union (foundation §1 — no edit to a hardcoded Set; add `settings.get`, `settings.preferences.patch`, `settings.models.put`, `settings.agents.create`).
- [ ] **Test** (`settings.contract.test.ts`): for each of the 4 ops, drive the handler with a seeded ctx + valid input and assert the `data` parses against the contract DTO — `successEnvelope(userResource)`, `successEnvelope(userPreferenceResource)`, `successEnvelope(modelConfigurationResource)`, `successEnvelope(agentConfigurationResource)` respectively (import from `@creatoros/contract`). RED until the transport returns DTO-shaped data.

## Step 5 — FE island wiring (from roadmap §4 `/settings` rows — line 301: wired-local 9 · decorative 8 · needs-backend 16)

Target file: `frontend/src/features/settings/settings-interactive-region.tsx` (existing island; all `data-slot` ids below already exist). Preserve the `SettingsViewModel` seam in `settings-page.tsx`. Mutation pattern per control group: a debounced `onValueChange`/`onCheckedChange`/`onChange` calls `client.<method>(...)` then `router.refresh()` (mirror `project-actions.tsx`; add `"use client"` `useRouter` + a `pending` guard). The page DTO/selector switches from fixture to seeded reads once the ops land.

**Preference controls → `client.patchPreferences` (op `settings.preferences.patch`):**
- [ ] `默认主页` select (`pref-default-home-trigger`) → `patchPreferences({ body: { defaultHome } })`.
- [ ] `默认创作模式` select (`pref-creation-mode-trigger`) → `{ defaultCreationMode }`.
- [ ] `默认可见性` select (`pref-visibility-trigger`) → `{ defaultVisibility }`.
- [ ] `自动保存` switch (`pref-autosave-switch`) → `{ autosaveEnabled }`.
- [ ] `使用情况分析` switch (`pref-analytics-switch`) → `{ analyticsEnabled }`.
> Roadmap maps `主题 / 密度 / 语言` selects (`sys-theme/sys-density/sys-locale-trigger`) + `桌面通知` switch (`sys-notifications-switch`) to `PATCH /settings/preferences` too. The contract `patchPreferences` body has NO `theme/density/locale/desktopNotifications` keys. **Decision encoded:** wire `语言` (`sys-locale-trigger`) only if Identity exposes locale on the user; `主题/密度/桌面通知` have no contract field → keep as **client-local persisted-to-nothing** (wired-local), and note in the island that they await a preferences-schema extension. Do NOT invent body keys. (Open question O1.)

**Model-config controls → `client.putModel` (op `settings.models.put`, `:capability` fixed to the page's configured capability, e.g. `"script"`):**
- [ ] `提供商` select (`model-provider-trigger`) → `putModel({ params: { capability }, body: { provider, modelName } })` (send current modelName too — PUT is a full upsert).
- [ ] `模型` select (`model-name-trigger`) → `putModel({ params: { capability }, body: { provider, modelName } })`.
- [ ] `温度` number input (`model-temperature-input`) → `putModel({ params: { capability }, body: { provider, modelName, settings: { temperature } } })` (debounced onChange/onBlur). Maps to `modelConfigurations.settings.temperature`.

**Identity-owned needs-backend rows on this page — NOT Settings ops (leave inert here; covered by `modules/00-identity-auth.md`):**
- [ ] `昵称 / 邮箱` inputs (`account-nickname-input`, `account-email-input`) — roadmap: "no §13 PATCH /me". Intentionally inert in this module; Identity owns. Add an island comment.
- [ ] `删除账户` button (`other-delete-button`) — Identity coordination, no §13 route. Inert here.
- [ ] `确认删除账户` switch (`other-delete-switch`) — **wired-local** (arms the destructive gate, disables/enables the button); leave its existing local state.

**Decorative on this page (8) — intentionally inert (note only):**
- [ ] 8 section tabs (账户/偏好/通知/外观/集成/存储/数据/关于, `settings-tabs`) — wired-local visual switch (no panel swap). Leave.
- [ ] `已验证 badge / plan / timezone chips` (`account-status-badge`, identity TagChips) — display-only.
- [ ] `存储进度条 / 分布 rows` (`storage-usage-card`, `storage-breakdown-row`) — display-only cross-module aggregate; reads come from the Settings-Storage query service (foundation §Wave 4 / SPEC §19), NOT a Settings op. Leave as fixture/DTO read; mark inert for mutation.
- [ ] `导入 / 导出` buttons (`other-import-button`, `other-export-button`) — no route exposed (Identity). Inert.

## Step 6 — server read switch (page DTO)

- [ ] `settings-page.tsx` keeps the `viewModel?` seam. The default view-model source (`buildSettingsViewModel`, `frontend/src/fixtures/selectors/settings.ts`) is replaced by a server read: `client.getSettings()` for the account card; preference + model rows from the seeded repo (via the page DTO query service per SPEC §19 once Wave 4 lands, or directly from `listModels`/`getPreferences` in the interim). Storage breakdown stays the cross-module aggregate (display-only). Keep SSR deterministic against the seeded canonical user.
- [ ] Seed parity: register canonical `userPreferences` (`pref-zyongzhu`), `modelConfigurations` (`model-script` etc.), `agentConfigurations` into the Settings repo seed at persistence build (mirror `buildPersistence` in `persistence-client.ts`, deterministic ids/clock).

## Step 7 — acceptance (SPEC §22 / foundation §5.6)

- [ ] Module has service + repository + schema + the 3 test files (service / repository-integration / contract). No cross-module repository import (account read goes through Identity `index.ts`; storage via query service).
- [ ] Routes don't touch the db client — only the dispatch route + transport map do (SPEC §22 line 672).
- [ ] Every repository query is user-scoped (`eq(table.userId, ctx.userId)`); multi-tenant smoke (user A ≠ user B) green from Step 2.
- [ ] `putModel` upsert is idempotent on `(userId, capability)`; `patchPreferences` is idempotent (re-PATCH same body = same row).
- [ ] `resolveModelForCapability` is public on `index.ts` and consumed by AI (no AI candidate path here — Settings has no candidate-confirm surface).
- [ ] All 4 ops registered in the module transport registry; composite `PERSISTED_OPS` union includes them; mock fallback no longer serves them.
- [ ] `pnpm verify` (frontend) GREEN + the 3 module test files GREEN.

---

## Decorative / inert register (explicit, for the wiring-complete acceptance, foundation §9)

| Control (`data-slot`) | Disposition | Reason |
|---|---|---|
| `account-nickname-input`, `account-email-input` | inert (Identity) | no §13 `PATCH /me` |
| `other-delete-button` | inert (Identity) | account-delete has no §13 route |
| `other-delete-switch` | wired-local | arms destructive gate (local) |
| `other-import-button`, `other-export-button` | inert (Identity) | no import/export route exposed |
| `sys-theme-trigger`, `sys-density-trigger`, `sys-notifications-switch` | wired-local | no matching `patchPreferences` body field |
| 8 `settings-tabs` | wired-local | visual section switch |
| `account-status-badge`, identity chips | decorative | display-only |
| `storage-usage-card` / `storage-breakdown-row` | decorative (display) | cross-module aggregate via SPEC §19 query service, not a Settings mutation |

## Open questions

- **O1:** `主题 / 密度 / 语言 / 桌面通知` are roadmap-mapped to `PATCH /settings/preferences`, but `patchPreferences`'s body has no `theme/density/locale/desktopNotifications` fields. Extend the contract preferences body (re-issue contract) OR keep these client-local? Plan currently keeps them wired-local except `locale` (deferred to Identity user-locale). Needs a contract decision before these 4 controls can truly persist.
- **O2:** `getSettings` returns `userResource` (identity), but the page's preference/model cards need `userPreferenceResource` + model rows — there is no single `GET /settings` aggregate op for them. Confirm the page composes via the SPEC §19 Settings query DTO (Wave 4) vs. interim direct repo reads. Affects Step 6 timing.
- **O3:** `:capability` for the model card is not in the page UI (the card shows provider/model/temperature with no capability selector). Plan pins it to a single configured capability (`"script"`). Confirm whether the page should expose per-capability rows or a single default capability.
