# Module 18 — Monetization (七步⑦ · TDD execution plan)

> **Wave 5+ (new module, post-base-16).** Highest-priority new module per `docs/CreatorOS-七步整合设计.md` §4 + §8 P0. Follows the keystone foundation `docs/superpowers/plans/2026-06-21-program-foundation.md` (§5 per-module template, §1 architecture, §4 mock adapters). Steps use `- [ ]` and are executed in order by a single dispatched agent that HALTS on the first failing step.

**Goal:** Wire the **Monetization** vertical end-to-end so the system can answer "哪条内容带来了哪笔线索/成交？这条内容为哪个产品铺路？" (spec §9 q6). Build the P0 柔性产品模型 + 归因层 + 漏斗中心页: `Product` / `Offer` / `Lead` / `ConversionEvent` + the `ContentOutputProduct` 意图层 association + the `FunnelStage` aggregate view — every `needs-backend`/`wired-local` control on the new 变现/漏斗中心 page (`/monetization`) and the upgraded `PublicationPerformanceRow` / Dashboard `SummaryMetrics` conversion columns drives a real, user-scoped contract op (FE button → contract op → user-scoped SQL → envelope → render).

This module embodies three spec §4.1 design principles that shape its acceptance criteria:
1. **漏损现实 (§4.1.1):** attribution is naturally broken (抖音 can't link, 成交 in 微信/线下, delayed, multi-touch). Goal is "尽量归因 + 诚实 unattributed 桶", **NOT 100% auto-attribution**. The funnel ALWAYS surfaces an `unattributed` bucket — never force-allocates.
2. **不重造 SCRM (§4.1.2):** the real Lead-follow/成交 fact lives externally (飞书问卷, future 企微 SCRM). **CreatorOS only owns the「内容 ↔ 暗号/渠道码 ↔ Lead」mapping**; 成交 facts arrive via the §C-4 `ExternalSource`/Ingestion path or manual 登记 — never a parallel ingest write path.
3. **变现方式会变 (§4.1.3):** Product and price are **decoupled** — price hangs on `Offer`, not `Product`; products can be added/retired/re-priced without breaking historical attribution (成交 snapshots `offer_id` + 金额).

**Scope this wave = P0 only (spec §4.8):** 柔性 `Product`/`Offer` + `Lead`/`ConversionEvent` + 飞书问卷 Ingestion adapter + 手工登记 + default time-decay `AttributionModel` (config row, not a solver this wave) + §4.5 三层口径 funnel + `ContentOutputProduct` 意图层. **OUT of scope (later sub-waves):** P1 `EntryCode` (暗号/关键词), P2 企微渠道活码 ingest + `Touchpoint` multi-touch time-decay solver. §4.6 `MetricValue.metric_key` extension (`lead`/`inquiry`/`conversion`/`revenue` etc.) + `AudienceSnapshot.dimension_type` (`intent`/`paying`) + `Learning.learning_type` (`conversion_pattern`/`offer_insight`) are **base-module edits owned by Analytics/Learnings** per spec §0 落地时序 ① — this plan **consumes** those keys, does not add the columns. Calibration (§6 `Prediction`/`Rubric`) is a SEPARATE module — not here.

**Architecture:** Modular monolith under the Next app (foundation §1). This module lives at `frontend/src/server/modules/monetization/` and registers its `{ opId → handler }` map into the composite transport registry. Owns five entities — `Product`, `Offer`, `Lead`, `ConversionEvent`, `ContentOutputProduct` (spec §4.2/§4.3/§4.4). Every repository query is user-scoped: `eq(table.userId, ctx.userId)`. No cross-module repository imports — cross-module reads/writes go through other modules' public `index.ts` service interfaces (`ProjectsService` for ContentOutput ownership validation, `IngestionService` for the 飞书问卷 channel, `AnalyticsService` for the conversion `MetricValue` rollup, `SearchService`/`NotificationsService` for indexing/notify). Monetization never calls an external SCRM/问卷 SDK directly — 成交 facts arrive only through the `IngestionSourcePort`/Ingestion module (§C-4 + foundation §4 mock) or the manual-登记 service path.

**Tech stack:** TypeScript, Drizzle ORM over the `globalThis` pglite singleton (foundation §1), Zod DTOs from `@creatoros/contract` (v0.4 ops added in Step 0), Vitest. ISO-8601 text timestamps + text enums to mirror the Projects slice (`backend/src/schema/projects.ts`).

**Dependency note (must be GREEN first):**
- **Wave 0:** registry generalization + Identity/auth `RequestContext` + §4 `IngestionSourcePort` mock adapter.
- **Wave 2 Projects** — `ProjectsService.getOutput`(ctx, outputId) ownership validation for the `ContentOutputProduct` link + `recordActivity`. **The `ContentOutputProduct` association + `ContentOutput.content_role` (`traffic`/`trust`/`conversion`) live in the spec §4.4 意图层; `content_role` is a base Projects-module column edit (spec §0 时序 ①) — this plan READS `content_role` and OWNS only the `ContentOutputProduct` join table.**
- **Wave 3 Ingestion** — `IngestionService.createRun`/`pushRecords`/`resolveExternalSource` for the 飞书问卷 → Lead/ConversionEvent channel, reusing the **double idempotency key** `(source, idempotency_key)` / `(run, record_key)` (spec §C-4, data-model constraints 12). RISK-005: the new channel must reference a REAL `IngestionRun` (no 悬空 `ingestionRunId`).
- **Wave 3 Analytics** — `AnalyticsService.recordMetricValues`(ctx, …) so a `ConversionEvent` of type `lead`/`inquiry`/`purchase`/`revenue` also lands as a `MetricValue` under the §4.6 conversion `metric_key`s (so Dashboard/Review conversion columns read one source). Analytics must have shipped the §4.6 `metric_key` extension first.
- **Wave 3 Search / Notifications** — `SearchService.upsertDocument` (index Products/Leads), `NotificationsService.notify` (new-Lead / 成交 notifications).
- **Roadmap gate:** new gate **G18** (deps G5 Projects, G12 Ingestion, G11 Analytics, G3 Search/Notifications). Reviews/Calibration consume `MonetizationService.getFunnelForOutput`/`getProductFunnel` AFTER this module is green — downstream, not blockers.

---

## Step 0 — contract v0.4 ops (this module's seam — DOES NOT EXIST YET)

> Unlike the base-16 modules, monetization's contract ops are **not yet in `@creatoros/contract`**. They are added in **contract v0.4** as part of this wave, BEFORE the backend. This is the C-2 落库样板 first step (register op → Drizzle → PERSISTED_OPS → tests). New `API`/`ENT`/`FR` IDs are **placeholder `FR-MON-*`** until OPEN-001 ID-baseline freeze (C-1) assigns the real段; do not insert into existing frozen segments.

- [ ] Add `contract/src/resources/monetization.ts`: `productResource`, `offerResource`, `leadResource`, `conversionEventResource`, `contentOutputProductResource`, `funnelStageResource`, `monetizationFunnelResource` (the 漏斗中心 aggregate, including the `unattributed` bucket — see Step 3). Each extends BaseEntity (`id`, `createdAt`, …) per the existing resource convention.
- [ ] Add primitive enums to `contract/src/primitives.ts` (source of truth): `productStatus` = `active | retired`; `offerStatus` = `active | expired`; `leadSource` = `survey | manual | entry_code | wecom`; `attributionMethod` = `entry_code | survey | self_report | inferred | manual`; `attributionConfidence` = `high | med | low`; `leadStatus` = `new | qualified | won | lost`; `conversionEventType` = `profile_visit | follow | lead | inquiry | signup | purchase | repurchase`; `contentRole` = `traffic | trust | conversion` (shared with Projects §4.4 — define once, import in both); `attributionModelType` = `time_decay | position_based | last_touch`.
- [ ] Add `contract/src/operations/monetization.ts` with the **ops this module owns** (table below). Mirror `defineEndpoint` shape from `contract/src/operations/ingestion.ts`/`publishing.ts`.
- [ ] **Test (`contract/src/operations/monetization.test.ts` or the contract package's op-registry test):** every new op id is unique across the merged op registry; each `response` DTO round-trips a representative fixture.

### Contract ops this module owns

| op id | method · path | body | response DTO |
|---|---|---|---|
| `products.list` | GET `/products` | — (paginationQuery; `?status=`) | `productResource` (isList) |
| `products.create` | POST `/products` | `{ name, kind, tier?, deliveryWeight?, targetPersona? }` | `productResource` |
| `products.get` | GET `/products/:productId` | — | `productResource` |
| `products.patch` | PATCH `/products/:productId` | `{ name?, kind?, tier?, deliveryWeight?, targetPersona?, status? }` | `productResource` |
| `products.retire` | POST `/products/:productId/retire` | — | `productResource` |
| `products.offers.list` | GET `/products/:productId/offers` | — | `offerResource` (isList) |
| `products.offers.create` | POST `/products/:productId/offers` | `{ price, currency?, validFrom?, validTo?, note? }` | `offerResource` |
| `outputs.products.list` | GET `/outputs/:outputId/products` | — | `contentOutputProductResource` (isList) |
| `outputs.products.link` | POST `/outputs/:outputId/products` | `{ productId, contentRole? }` | `contentOutputProductResource` |
| `outputs.products.unlink` | DELETE `/outputs/:outputId/products/:productId` | — | `{ ok: true }` |
| `leads.list` | GET `/leads` | — (paginationQuery; `?status=`,`?source=`) | `leadResource` (isList) |
| `leads.create` | POST `/leads` | `{ source, surveySource?, attributedContentId?, attributionMethod?, attributionConfidence?, status? }` | `leadResource` (manual 登记) |
| `leads.get` | GET `/leads/:leadId` | — | `leadResource` |
| `leads.patch` | PATCH `/leads/:leadId` | `{ status?, attributedContentId?, attributionMethod?, attributionConfidence? }` | `leadResource` |
| `leads.conversions.list` | GET `/leads/:leadId/conversions` | — | `conversionEventResource` (isList) |
| `leads.conversions.create` | POST `/leads/:leadId/conversions` | `{ productId?, offerId?, eventType, value?, occurredAt? }` | `conversionEventResource` (manual 登记) |
| `monetization.funnel.get` | GET `/monetization/funnel` | — (`?productId=`,`?periodStart=`,`?periodEnd=`) | `monetizationFunnelResource` (incl. `unattributed` bucket) |
| `monetization.funnel.byOutput` | GET `/outputs/:outputId/funnel` | — | `funnelStageResource` (isList) |

DTO field shapes are fixed by `contract/src/resources/monetization.ts` once Step 0 lands — do NOT redefine downstream; import and validate against them.

**C-3 NOTE — AI-generated候选 reuse the existing candidate flow, NOT a parallel state machine.** Monetization has **no AI-write op of its own**. When AI proposes 产品/offer/conversion-copy candidates (spec §4.7 录入 / §7.4 `conversion_copy`), they go through the existing `ai.submit_candidate → awaiting_confirmation → confirmResult` path (DEC-009, `aiTaskStatus` already has `awaiting_confirmation`); `confirmResult` (AI-free) then calls THIS module's normal service write (`products.create` / `leads.conversions.create`). **Do not add a `submit_*` op or a second候选 status enum here.**

---

## File layout to create (foundation §1 template)

```
frontend/src/server/modules/monetization/
├── monetization.db-schema.ts
├── monetization.repository.ts
├── monetization.service.ts
├── monetization.schema.ts
├── monetization.transport.ts
├── monetization.errors.ts
├── index.ts
├── monetization.service.test.ts
├── monetization.repository.integration.test.ts
└── monetization.contract.test.ts
```

---

## Step 1 — db-schema

- [ ] Create `frontend/src/server/modules/monetization/monetization.db-schema.ts`. Define five `pgTable`s mirroring spec §4.2/§4.3/§4.4, with `user_id TEXT NOT NULL` on every owned row (the ownership column required by foundation §1/§3, data-model constraint 1). Follow the Projects schema conventions exactly (`backend/src/schema/projects.ts`): timestamps as ISO-8601 `text`, enums as `text`, JSON as `jsonb`, plus a raw `MONETIZATION_DDL` string for pglite init.
  - `products`: `id` PK (text), `userId`, `name`, `kind` (text — **free-form, user-defined; NOT a hardcoded enum**, spec §4.2 "不硬编码类型"), `tier` (nullable text label: 引流/入门/核心/高端 — sort-view only), `deliveryWeight` (text/numeric, 轻↔重), `targetPersona` (nullable text), `status` (default `'active'`), `createdAt` notNull, `updatedAt` notNull.
  - `offers`: `id` PK (text), `userId`, `productId`, `price` numeric/decimal, `currency` (default `'CNY'`), `validFrom` (nullable), `validTo` (nullable), `version` int, `note` text (default `''`), `status` (default `'active'`), `createdAt` notNull. **Price hangs here, not on Product** (spec §4.2) — a re-price = a NEW offer row; historical `ConversionEvent` snapshots `offerId` + the amount and is never mutated.
  - `leads`: `id` PK (text), `userId`, `source` (enum `survey|manual|entry_code|wecom`), `surveySource` (nullable), `entryCodeId` (nullable — P1, kept nullable now), `attributedContentId` (nullable — the §4.4 实绩层 FK to a ContentOutput; **nullable by design** — most leads归不了因), `attributionMethod` (nullable enum), `attributionConfidence` (nullable enum `high|med|low`), `status` (default `'new'`), `ingestionRunId` (nullable — set when ingested, references a REAL `IngestionRun`, RISK-005), `createdAt` notNull, `updatedAt` notNull.
  - `conversionEvents`: `id` PK (text), `userId`, `leadId` (FK — **events hang on Lead, not forced onto one content row**, spec §4.3), `productId` (nullable), `offerId` (nullable), `eventType` (enum), `value` numeric (nullable — the 金额 snapshot), `currency` (nullable), `occurredAt` notNull, `ingestionRunId` (nullable), `createdAt` notNull. UNIQUE `(userId, leadId, eventType, occurredAt)`-style guard against duplicate ingest (idempotency at the row level; the run-level idempotency is enforced by Ingestion's `(run, record_key)`).
  - `contentOutputProducts` (意图层 join, spec §4.4): `id` PK (text), `userId`, `contentOutputId`, `productId`, `contentRole` (nullable enum `traffic|trust|conversion` — the intent declared at creation), `createdAt` notNull. UNIQUE `(userId, contentOutputId, productId)` (a content铺路 a product at most once).
- [ ] Append `MONETIZATION_DDL` to the shared pglite init wherever `PROJECTS_DDL` is consumed (grep `PROJECTS_DDL` usage; register `MONETIZATION_DDL` in the same `CREATE TABLE IF NOT EXISTS` init list).
- [ ] **Test (in `monetization.repository.integration.test.ts`, first red):** a row inserted into each of the five tables round-trips via `db.select()` with all columns intact (nullable FKs `null`, jsonb defaults, `status` defaults `'active'`/`'new'`, `Lead.attributedContentId` defaults `null`).

## Step 2 — repository (user-scoped ONLY)

- [ ] Create `frontend/src/server/modules/monetization/monetization.repository.ts` mirroring `createProjectRepository` (`backend/src/repositories/project-repository.ts`): `RepoDeps { now, nextId, userId }`, factory `createMonetizationRepository(db, deps)`. **Every** query filters `eq(table.userId, deps.userId)`; **every** insert stamps `userId: deps.userId`. Private `get*RowById` helpers throw `OwnershipError` (message `OwnershipError: <entity> not found: <id>`) when the scoped select returns empty — never reveal cross-user existence (foundation §2: 404 not 403).
  - Products: `createProduct`, `getProduct`, `listProducts({status?, limit, offset})` (`orderBy desc(createdAt)`), `patchProduct(id, patch)`, `retireProduct(id)` (scoped update `status='retired'`, `updatedAt`).
  - Offers: `createOffer(productId, {price, currency?, validFrom?, validTo?, note?})` — scoped ownership check on the parent product, compute `version = (max existing offers for product) + 1` (scoped), insert; **append-only** (never UPDATE an offer's price). `listOffersByProduct(productId)`.
  - Leads: `createLead(patch)`, `getLead`, `listLeads({status?, source?, limit, offset})`, `patchLead(id, patch)` (scoped). `findLeadByIngestionKey(...)` for ingest idempotency lookup.
  - Conversions: `createConversion(leadId, patch)` — scoped ownership check on the parent lead; snapshots `offerId`+`value`+`currency`. `listConversionsByLead(leadId)`. `listConversionsForFunnel({productId?, periodStart?, periodEnd?})` — scoped aggregate read joining Lead→ConversionEvent (and Lead.attributedContentId for the per-content rollup).
  - ContentOutputProduct: `linkOutputProduct(outputId, productId, {contentRole?})` (insert, UNIQUE-guarded → `ConflictError` on dup), `unlinkOutputProduct(outputId, productId)` (scoped delete), `listProductsByOutput(outputId)`, `listOutputsByProduct(productId)`.
- [ ] **Tests (`monetization.repository.integration.test.ts`, pglite-backed):**
  - ownership: build repo with `userId: "user-a"`, create a product; build a second repo with `userId: "user-b"`; `getProduct(sameId)` from repo-B throws `OwnershipError` (user A's row invisible to B). Same for leads.
  - `createOffer` increments `version` 1 → 2 → 3 for the same product (re-price never mutates an old offer row); a retired product's old offers stay readable.
  - `listLeads` filters by `status`/`source` and is user-scoped + newest-first + paginated.
  - `linkOutputProduct` twice for the same `(output, product)` throws `ConflictError`; `unlinkOutputProduct` removes only the scoped row.
  - `listConversionsForFunnel` returns only the owning user's events and respects the `productId`/period filters.

## Step 3 — service (RequestContext + funnel aggregation + 诚实 unattributed)

- [ ] Create `frontend/src/server/modules/monetization/monetization.errors.ts`: re-use the foundation error types (`OwnershipError`, `ConflictError`, `ValidationError`, `UnsupportedOperationError`) — import from shared infra; do not redefine if they already exist.
- [ ] Create `frontend/src/server/modules/monetization/monetization.service.ts`. Every public method takes `(ctx: RequestContext, …)`; it builds a repository bound to `ctx.userId` (`createMonetizationRepository(db, { now, nextId, userId: ctx.userId })`) so scoping is structural. It receives peer service interfaces (`ProjectsService`, `IngestionService`, `AnalyticsService`, `SearchService`, `NotificationsService`) via constructor deps — never via repo import. Methods:
  - **Products/Offers:** `listProducts`, `createProduct`, `getProduct`, `patchProduct`, `retireProduct` (guard: cannot re-price via patch — price changes go through `createOffer`; `patchProduct` rejects a `price` field with `ValidationError`). `listOffers`, `createOffer` (guard `price >= 0`). On create/retire → `SearchService.upsertDocument(ctx, {type:"product", …})`.
  - **ContentOutputProduct (意图层):** `linkOutputProduct(ctx, outputId, {productId, contentRole?})` — first `ProjectsService.getOutput(ctx, outputId)` (ownership validation, NO cross-module repo import) AND `repo.getProduct(productId)` (ownership) so neither belongs to another user; then `repo.linkOutputProduct`. `unlinkOutputProduct`. `listProductsByOutput`.
  - **Leads/Conversions (manual 登记 — §4.7 P0):** `createLead(ctx, patch)` — if `attributedContentId` supplied, validate via `ProjectsService.getOutput(ctx, …)`; default `source: "manual"`, `attributionMethod: "manual"`, `attributionConfidence` from body (creator self-selects, spec §4.7). `patchLead`. `createConversion(ctx, leadId, patch)` — ownership on lead; if `offerId` supplied, snapshot its price into `value` when `value` omitted; on a `lead`/`inquiry`/`purchase`/`revenue` event, fan-out `AnalyticsService.recordMetricValues(ctx, {publicationOrOutputRef, metricKey, value})` so the §4.6 conversion `metric_key`s land in one place (Dashboard/Review read Analytics, not Monetization). Notify on `purchase` via `NotificationsService.notify`.
  - **Ingestion intake (飞书问卷 — §C-4, NO parallel write path):** `ingestSurveyLeads(ctx, ingestionRunId, records)` — called BY the Ingestion module's adapter (foundation §4 `IngestionSourcePort` mock for deterministic fake imports), NOT a public contract op. It (a) asserts the `IngestionRun` exists via `IngestionService.getRun(ctx, ingestionRunId)` (RISK-005 — reject 悬空 ids with `ValidationError`); (b) for each record, idempotency via `repo.findLeadByIngestionKey` keyed on `(ingestionRunId, recordKey)` (reuse the §C-4 `(run, record_key)` contract — skip already-written); (c) writes Lead (`source: "survey"`, `surveySource`, `attributionMethod: "survey"`, `attributionConfidence: "high"` when the survey carries an暗号/自报内容, else `low`) + any `ConversionEvent`. Re-running the same run writes nothing new (idempotent).
  - **Funnel aggregation (§4.5 三层口径 + 诚实 unattributed):**
    - `getFunnel(ctx, {productId?, periodStart?, periodEnd?})` → `monetizationFunnelResource`: per `conversionEventType` stage counts (`profile_visit → follow → lead → inquiry → signup → purchase → repurchase`), `revenueAttributed` (sum of high/med-confidence `value` with the confidence breakdown), and a **mandatory `unattributed` bucket** = events whose Lead has `attributedContentId IS NULL` or `attributionConfidence` absent. **NEVER force-allocate the unattributed bucket to a content** (spec §4.1.1/§4.5 "不强行 100% 分配"); surface `unattributedRatio` explicitly.
    - `getFunnelForOutput(ctx, outputId)` → `funnelStageResource[]`: the per-content rollup — counts of Leads/Conversions whose `attributedContentId === outputId`, plus the 意图层 vs 实绩层 gap (declared `content_role`/linked products from `ContentOutputProduct` vs actual attributed leads — spec §4.4 "差距本身就是复盘洞察").
  - **AttributionModel (config only this wave):** seed/read a single `attributionModelType: "time_decay"` config (spec §4.3 default — **禁用 last-touch 误导**). The actual time-decay multi-touch SOLVER is **P2** (needs `Touchpoint`) — this wave only stores the config + uses last-confidence-wins for the high-confidence individual layer.
- [ ] **Tests (`monetization.service.test.ts`, fake `now`/`nextId`, in-memory/pglite db, stubbed peer services):**
  - `patchProduct` with a `price` field throws `ValidationError` (price decoupled — must use `createOffer`).
  - `createOffer` twice produces `version` 1 then 2 with distinct prices; an old `ConversionEvent` keeps its snapshotted `value` after a re-price (immutable history).
  - `linkOutputProduct` validates BOTH output ownership (`ProjectsService.getOutput`) and product ownership; a cross-user output → `OwnershipError`.
  - `createConversion` of `purchase` fans out exactly one `AnalyticsService.recordMetricValues` call and one `NotificationsService.notify`.
  - `ingestSurveyLeads` with a non-existent `ingestionRunId` throws `ValidationError` (RISK-005); re-running the SAME run with the SAME records writes **zero** new Leads (idempotent on `(run, record_key)`).
  - **`getFunnel` ALWAYS returns an `unattributed` bucket** and `unattributedRatio`, even when every lead is attributed (bucket = 0, ratio = 0) — and never sums attributed + unattributed beyond the true total (no force-allocation). A lead with `attributionConfidence: null` lands in `unattributed`, not in `revenueAttributed`.
  - `getFunnelForOutput` reports the 意图层 (linked products + `content_role`) vs 实绩层 (attributed leads) gap.

## Step 4 — transport (register ops) + schema

- [ ] Create `frontend/src/server/modules/monetization/monetization.schema.ts`: re-export the contract DTOs/enums/ops used (`productResource`, `offerResource`, `leadResource`, `conversionEventResource`, `contentOutputProductResource`, `funnelStageResource`, `monetizationFunnelResource`, `monetizationOperations`, the new enums) — single import surface.
- [ ] Create `frontend/src/server/modules/monetization/monetization.transport.ts` mirroring `createPersistenceTransport` (`backend/src/persistence-transport.ts`) but **ctx-taking** (foundation §2: transport signature gains `ctx`). Export `createMonetizationTransport(service)` returning `{ request(ctx, endpoint, input) }` with a `switch (endpoint.id)` covering all 18 owned op ids (Step 0 table) → the matching service method, with `meta: listMeta` for the `*.list`/`funnel` reads and `meta: singleMeta` for single/create/patch; default → `throw new UnsupportedOperationError(endpoint.id)`.
- [ ] Create `frontend/src/server/modules/monetization/index.ts` exporting the public service interface + the op-id list (all 18) and `registerMonetization(registry)` that adds the transport map. Register this module in the composite transport registry (foundation §1: union builds `PERSISTED_OPS` — no edit to the composite switch). Also export `getFunnelForOutput(ctx, outputId)` / `getProductFunnel(ctx, productId)` on the public service interface — required by Reviews `ConversionFunnel` down-drill (spec §4.7) and the Calibration/Dashboard query services (consume AFTER green).
- [ ] **Tests (`monetization.contract.test.ts`):** for EACH of the 18 op ids, drive the transport with a seeded ctx + valid input and assert the contract DTO parses the envelope data (`monetizationOperations.<op>.response.parse(...)` per list item / envelope.data). Include a `monetization.funnel.get` happy path whose DTO carries the `unattributed` bucket + `unattributedRatio` fields.

## Step 5 — FE island wiring

New global page + two upgraded existing surfaces. Preserve the `viewModel?` seam; server reads switch from fixture to the real op. Per C-5: server外壳 + `*-interactive-region.tsx` island; only `ui/*` primitives + existing AppShell/Sidebar/TopHeader; **no `Date.now`/`Math.random`/`fetch`** in render/selectors/fixtures. **C-5 visual-baseline note:** this is a NEW page — either land after stage-12 re-baseline OR explicitly mark "暂不纳入视觉门禁" in the page's story/manifest entry.

### 5a — 变现 / 漏斗中心 `/monetization` (NEW page — Sidebar 变现 item, spec §4.7)

Create server shell `frontend/src/features/monetization/monetization-center-page.tsx` (initial reads: `products.list`, `monetization.funnel.get`, `leads.list`) + island `frontend/src/features/monetization/monetization-center-interactive-region.tsx`.

| control | state | wiring |
|---|---|---|
| Funnel overview (stages + `unattributed` bucket + `unattributedRatio`) | wired-local→backend (read) | hydrated from `monetization.funnel.get`; the `unattributed` bucket is ALWAYS shown (spec §4.5 诚实漏损). |
| 产品列表 / 产品卡 | wired-local→backend (read) | from `products.list`; status filter is client-local. |
| `新建产品` | **needs-backend** | opens form → `products.create` `{ name, kind, … }` → `router.refresh()`. |
| `退役产品` | **needs-backend** | `products.retire` → `router.refresh()`. |
| `新增 Offer (改价/活动)` | **needs-backend** | `products.offers.create` `{ price, … }` (new offer, never mutates old) → `router.refresh()`. |
| `登记一条线索/成交` (§4.7 P0 手工登记 form) | **needs-backend** | `leads.create` (关联内容 `attributedContentId` + 置信度自选) then optional `leads.conversions.create` → `router.refresh()`. |
| 飞书问卷结果列表 | wired-local→backend (read) | from `leads.list` filtered `source=survey`; the import itself runs through Ingestion (not a button here this wave). |
| Lead status 流转 (`new→qualified→won/lost`) | **needs-backend** | `leads.patch` `{ status }` → `router.refresh()`. |
| ROI / unattributed 占比 cards | wired-local→backend (read) | computed server-side in the funnel DTO; cards are read-only. |
| 内容 ↔ 产品 mapping (意图层) | wired-local→backend | `outputs.products.link`/`unlink` from a content row → `router.refresh()`. |
| period / productId filters | wired-local | client filters re-issue `monetization.funnel.get` with query params. |

- [ ] Create `frontend/src/features/monetization/monetization-center-interactions.test.tsx`: assert 新建产品/退役/新增Offer/登记线索/Lead流转/链接产品 each issue the mapped op via the HttpTransport mock + `router.refresh()`; assert the funnel view always renders the `unattributed` bucket; assert client filters issue no extra mutation.

### 5b — Publishing Center `PublicationPerformanceRow` + Dashboard `SummaryMetrics` conversion columns (spec §4.7 提升为一等指标列)

Edit `frontend/src/features/publishing-center/publishing-center-interactive-region.tsx` and the Dashboard summary island to add a 转化/线索 column (lead/inquiry/conversion counts) **alongside播放量** — read from the Analytics §4.6 conversion `MetricValue`s (Dashboard reads Analytics, which Monetization fed in Step 3). **No new mutation op here** — read-only columns; the source of truth is Analytics. Mark decorative if the Analytics conversion keys aren't yet seeded.

- [ ] Update the existing Publishing/Dashboard interaction tests: assert the conversion column renders the lead/conversion counts from the view model and issues **no** Monetization network call (read-only).

### 5c — Review `ConversionFunnel` down-drill (spec §4.7)

Note for the Reviews wave (downstream — DO NOT build here): Review's `ConversionFunnel` upgrades to down-drill to `ConversionEvent` via `MonetizationService.getFunnelForOutput`. Documented as a downstream consumer; no work this plan.

## Step 6 — tests (per MODULE-ARCH §2 trio) + acceptance (SPEC §22)

- [ ] All three test files green: `monetization.service.test.ts` (price-decoupling guard, offer versioning + immutable history, funnel ALWAYS has unattributed bucket + no force-allocation, ingest idempotency + RISK-005 run-existence, link ownership validation, conversion → Analytics/Notifications fan-out), `monetization.repository.integration.test.ts` (pglite, ownership user-A-vs-user-B on products & leads, offer version increment, link UNIQUE conflict, funnel scoping), `monetization.contract.test.ts` (each of 18 ops validates against its contract DTO; funnel DTO carries unattributed bucket + ratio).
- [ ] **Acceptance checklist (spec §C-2 + SPEC §22 + spec §9 q6):** module ships service + repository + schema + tests; the full **contract-op → dispatch → Drizzle/pglite** path is exercised (C-2 — NOT frontend-fixtures-only); **no cross-module repository import** (peer access only via `index.ts` service interfaces — `ProjectsService`/`IngestionService`/`AnalyticsService`/`SearchService`/`NotificationsService`); the dispatch route does not touch the db client (threads `ctx`); **no parallel candidate state machine** (C-3 — AI candidates reuse `submit_candidate → awaiting_confirmation → confirmResult`; this module has no AI-write op); **metric回收 reuses Ingestion `ExternalSource`+idempotency** (C-4 — `ingestSurveyLeads` rejects 悬空 `ingestionRunId`, idempotent on `(run, record_key)`, no parallel write path); **price decoupled from Product** (re-price = new Offer, immutable `ConversionEvent` history); **funnel always honest** (mandatory `unattributed` bucket, never force-allocated); multi-tenant user-scoping everywhere (user A cannot see user B's products/leads/conversions); **spec §9 q6 answerable** ("哪条内容带来了哪笔线索/成交？这条内容为哪个产品铺路？" via `getFunnelForOutput` + `ContentOutputProduct`).
- [ ] Module ends GREEN under `pnpm verify` (frontend) + the module's own Vitest files + the contract package's op-registry test (Step 0).

---

## Open questions (resolve at execution, do not block planning)

1. **ID-baseline freeze (C-1).** All new `FR-MON-*`/`ENT-MON-*`/`API-MON-*` ids are placeholders until OPEN-001 signs off. Confirm the real segment before merging contract v0.4 — do NOT renumber existing frozen segments.
2. **`content_role` ownership (Projects vs Monetization).** `ContentOutput.content_role` is a base Projects-column edit (spec §0 时序 ①); the `ContentOutputProduct.contentRole` here is the per-link declaration. Confirm whether `content_role` is read from the ContentOutput row (Projects) or duplicated on the link. Recommend: source of truth on ContentOutput (Projects), link carries an optional per-product override.
3. **§4.6 `metric_key` extension owner.** `lead`/`inquiry`/`conversion`/`revenue` `MetricValue` keys are an Analytics-module edit (spec §0 时序 ①). This plan assumes Analytics ships them first and exposes `recordMetricValues`. If Analytics hasn't, the 5b conversion columns + the Step 3 fan-out are gated — mark 5b decorative until then.
4. **`monetization.funnel.get` is an aggregate read** — confirm it belongs to this module's transport vs the Wave 4 query-service layer (foundation §6). Recommend: own the per-product/per-output funnel here (domain logic), let the Wave-4 PublishingCenter/Dashboard query services COMPOSE cross-module DTOs that include it.
5. **飞书问卷 adapter location.** `ingestSurveyLeads` is invoked by the Ingestion module's `IngestionSourcePort` adapter (foundation §4 mock). Confirm the adapter lives in Ingestion (calling Monetization's public `index.ts` method) vs a Monetization-local adapter registered into Ingestion — recommend the former (no parallel write path, C-4).
6. **AttributionModel scope.** This wave stores only the `time_decay` config + uses last-confidence-wins for the individual high-confidence layer. The actual multi-touch time-decay solver needs P2 `Touchpoint`. Confirm no solver is expected at P0.
