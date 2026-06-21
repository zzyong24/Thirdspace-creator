# Module 19 — Candidate + AudienceSignal (选题情报层 · 七步③) — Executable TDD Plan (Wave 5)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development` (red→green per task) and `superpowers:executing-plans`. Steps use `- [ ]`. This plan obeys the **keystone** `docs/superpowers/plans/2026-06-21-program-foundation.md` (§1 architecture, §2 multi-tenant auth, §4 external-mock adapters, §5 per-module template, §6 wave order) and implements **`docs/CreatorOS-七步整合设计.md` §5** under the **§1 hard constraints C-2/C-3/C-4** and **§8 priority** (P0, after the base 16 modules — scheduled Wave 5–7 per the spec's 落地时序 note). Do NOT re-spec `backend/SPEC.md` or `@creatoros/contract` — reference and conform. **Plan only: no implementation code lands from this document; it is the ordered task list a later wave runs.**

## Goal

Wire the **选题候选池 (Candidate)** + **受众信号 (AudienceSignal)** + **晋升记录 (TopicPromotion)** module end-to-end so the system can answer 七步③ (spec §9.2): *"我有多少条按变现潜力排序的待选选题？最近用户在评论里反复问什么？"*. Deliver: `candidates` + `audience_signals` + `topic_promotions` tables; a user-scoped repository; a `CandidateService` (`RequestContext`-taking) that owns the **lightweight Candidate pool** (`pool`/`promoted`/`dropped`), the **AudienceSignal → `demand_count` aggregation**, and **`Candidate → promote → Project`** (类比 `promoteReviewInsight`); the new contract dispatch ops registered into the module transport registry; and the **`/topics` 选题候选池 page** wired (card pool sorted by `predictedScore`/`positioningFit`/`demandCount`, "晋升为 Project" button, and the `AudienceQuestionsCard` "一键转 Candidate" panel).

**This module owns NO new candidate state machine** (hard constraint C-3): AI-generated Candidates (`source ∈ {trend, benchmark, demand}`, from cheat-trends/对标/扩展) are produced by the **AI module's** `submit_candidate → awaiting_confirmation → confirmResult` flow (DEC-009; FR-063; ENT-049/050); `confirmResult` formalizes the `AITaskResult` into a `candidates` row via `CandidateService.createFromAIResult`. Only **manual** Candidates (`source = idea`) go through a plain service write. There is exactly one AI write entry (`submit_candidate`) and one AI-free formalize step (`confirmResult`) — this module supplies the *formalize target*, not a parallel `awaiting`/`confirmed` machine on `candidates`.

**AudienceSignal writes go through Ingestion** (hard constraint C-4): the spec §5.2 marks `AudienceSignal` "经 Ingestion 写入（含 TzFilm 抖音评论）". This module exposes `CandidateService.ingestAudienceSignal(ctx, record)` as the **downstream Service** that the **Ingestion module** (module 12) calls via `index.ts` — it does NOT add a write path. The signal carries `ingestionRunId` (must reference a real `IngestionRun`; RISK-005 dangling-ref guard) and rides Ingestion's `(source, idempotency_key)` / `(run, record_key)` double idempotency. `CandidateService` only *reads/aggregates* signals into `demand_count`; it never opens its own ingestion channel.

## Architecture (per foundation §1)

- Module code lives under `frontend/src/server/modules/candidate/` following MODULE-ARCH §2:
  - `candidate.db-schema.ts` · `candidate.repository.ts` · `candidate.service.ts` · `candidate.schema.ts` · `candidate.transport.ts` · `candidate.errors.ts` · `index.ts`
  - `candidate.service.test.ts` · `candidate.repository.integration.test.ts` · `candidate.contract.test.ts`
- `index.ts` is the **only** public entry (service interface + transport map + the `ingestAudienceSignal` port the Ingestion module imports). **No cross-module repository imports** (SPEC §22): this module imports `ProjectsService` (for `promote → Project`), `PositioningService` (PositioningGate, when module 17 is green), and `AIService` (only its public confirm seam) **via each module's `index.ts`** — never their repositories. Ingestion imports **this module's** `CandidateService.ingestAudienceSignal` via `index.ts`.
- **Every repository query is user-scoped** — `eq(candidates.userId, ctx.userId)`, `eq(audienceSignals.userId, ctx.userId)`, `eq(topicPromotions.userId, ctx.userId)`. Inserts stamp `ctx.userId` (foundation §2 ownership). Cross-user access → `OwnershipError` → **404** (SPEC §14, no existence leak). **Note (data-model addition, decided here):** `Candidate`/`AudienceSignal`/`TopicPromotion` are **new entities introduced by spec §5** and are NOT yet in `docs/CreatorOS-data-model.md` (grep returns nothing). Field shapes below are taken from spec §5.2 tables. Per foundation §1/§2 every owned row carries `user_id` (spec §5.2 already lists `user_id` on `Candidate` and `AudienceSignal`; `TopicPromotion` gains `user_id` here, same spirit as the Ingestion plan adding `user_id` to runs/errors).
- The module's transport map `{ opId → (ctx,input) => envelope }` is **registered into the module transport registry** (`frontend/src/server/persistence-client.ts` — add `CANDIDATE_OP_IDS` to the `PERSISTED_OPS` union, mirroring `TAXONOMY_OP_IDS`/`SEARCH_OP_IDS`; no edits to the composite switch beyond registration, foundation §1).
- Shared infra (pglite/Drizzle db factory, `RequestContext`, `UnitOfWork`, the registry) comes from `@creatoros/backend`; the **globalThis pglite singleton** (`frontend/src/server/persistence-client.ts`) is reused — do NOT introduce a module-level `let` store. The three tables' DDL is appended to the shared init applied at `createDb()` (mirror `PROJECTS_DDL` in `backend/src/schema/projects.ts`).
- `RequestContext { userId, requestId, source, ingestionRunId? }` is threaded by the `/api/v1/dispatch` route (foundation §2; SPEC §10). For `ingestAudienceSignal`, Ingestion passes a `ctx` with `source:"ingestion"` and `ingestionRunId` set (provenance + the C-4 dangling-ref check).

## Tech Stack

Next.js App Router · TypeScript strict · Drizzle ORM over pglite (`@electric-sql/pglite`, in-memory on `globalThis`) · Zod (contract DTOs from `@creatoros/contract` resources) · Vitest. Timestamps stored as **ISO-8601 text**, enums/status as **text** (mirror Projects exemplar). IDs via the injected `nextId(prefix)` deterministic generator (mirror `RepoDeps { now, nextId, userId }`). **No `Date.now`/`Math.random`/`fetch` in render/selectors/fixtures** (hard constraint C-5).

## Dependency note

**Depends on (must be GREEN first):**
- Wave 0 — registry generalization + Identity/auth (`ctx.userId`) + mock-adapter seam (foundation §1/§2/§4).
- **Projects (module 05)** — `ProjectsService.createProject` exposed via `index.ts`, for `Candidate → promote → Project` (Research-stage seed). **Hard dep.**
- **AI (module 15)** — `submit_candidate → awaiting_confirmation → confirmResult` flow (C-3). The AI confirm path must call **this module's** `createFromAIResult`. **Hard dep** for AI-sourced Candidates; manual Candidates work without it.
- **Ingestion (module 12)** — calls `CandidateService.ingestAudienceSignal` for `AudienceSignal` writes (C-4). **Hard dep** for signal ingestion; the page's manual "signal → Candidate" still works without live Ingestion.
- **Positioning (module 17, spec §3)** — `PositioningGate` for the `positioningFit` score on each Candidate (spec §5.4 "选题第一步就被定位与变现双重过滤"). **Soft dep**: if Positioning is not yet green, `positioningFit` is `null` (gate skipped) and the page renders the Candidate ungated — wire the gate call behind a nullable port so this module is not blocked by module 17.

**Position in build order:** Wave 5+ per spec §8 (P0 §5, but the spec's 落地时序 explicitly sequences positioning/monetization/candidate/calibration/platform-account/content-calendar as Wave 5–7 **after** the base 16 modules). **Blocks:** the calibration/rubric ordering consumer (spec §5.3 cheat-recommend "按变现加权 rubric 对 Candidate 排序"), which reads `candidates` once module-calibration is built.

---

## Contract ops this module owns (to be ADDED in contract v0.4)

> **Do not assume these exist** — `grep` of `contract/src/operations/` today returns no candidate/audience/promotion ops (only an unrelated `learnings.ts` hit on "topic"). They are scheduled for **contract v0.4** and MUST be authored there first (new `contract/src/operations/candidate.ts` + `contract/src/resources/candidate.ts`, both wired into the contract index), under hard constraint C-1 (new FR/ENT/API IDs appended as a **new ID segment after** OPEN-001 freeze — placeholder `FR-CAND-*` until signed). The module transport implements exactly these ids:

| Op id | Method · path | Body / params | Response | Note |
|---|---|---|---|---|
| `candidates.list` | GET `/candidates` | `paginationQuery` + `{ status?, source?, sort?: "predictedScore"\|"positioningFit"\|"demandCount" }` | `candidateResource` (list) | `/topics` pool read, monetization-weighted sort (spec §5.5) |
| `candidates.create` | POST `/candidates` | `{ title, angle, source:"idea", contentRole?, productAnchorId? }` | `candidateResource` | **manual** entry only (`source` fixed `idea`); AI-sourced go via AI confirm, not this op (C-3) |
| `candidates.get` | GET `/candidates/:candidateId` | params `{ candidateId }` | `candidateResource` | — |
| `candidates.patch` | PATCH `/candidates/:candidateId` | `{ title?, angle?, contentRole?, productAnchorId?, status?:"pool"\|"dropped" }` | `candidateResource` | `status` patch is human curation (pool↔dropped); `promoted` is set ONLY by the promote op, never by free patch |
| `candidates.promote` | POST `/candidates/:candidateId/promote` | `{ }` | `topicPromotionResource` | `Candidate → Project`; sets `status:"promoted"`, writes `topic_promotions`, returns the promotion w/ new `projectId` (类比 `promoteReviewInsight`) |
| `audienceSignals.list` | GET `/audience-signals` | `paginationQuery` + `{ source?, demandTag?, linkedCandidateId? }` | `audienceSignalResource` (list) | `AudienceQuestionsCard` read |
| `audienceSignals.linkToCandidate` | POST `/audience-signals/:signalId/link` | `{ candidateId? }` (omit → create new Candidate from the signal) | `candidateResource` | "评论/客户问题一键转 Candidate" (spec §5.5); bumps target's `demand_count` |

**Not contract dispatch ops (internal Service seam, C-3/C-4):**
- `CandidateService.createFromAIResult(ctx, aiTaskResult)` — called by the **AI module's** `confirmResult` (AI-free) to formalize an `awaiting_confirmation` AITaskResult into a `candidates` row (`source ∈ {trend,benchmark,demand}`). **No `submit_candidate`/`confirm` op is duplicated here.**
- `CandidateService.ingestAudienceSignal(ctx, record)` — called by the **Ingestion module** per record (C-4); writes one `audience_signals` row carrying `ingestionRunId`, then bumps the linked Candidate's `demand_count` if `linkedCandidateId` resolves. Verifies the referenced `IngestionRun` exists (RISK-005).

---

## Entity shapes (from spec §5.2; new — not yet in data-model.md)

- `candidates`: `id, userId, title, angle, source(text: trend|benchmark|demand|idea), contentRole(text: traffic|trust|conversion, nullable — reuse `contentRole` enum from `contract/src/resources/projects.ts`), productAnchorId(text nullable, FK→Product when monetization green), positioningFit(int 0–100 nullable), predictedScore(int nullable), demandCount(int default 0), status(text: pool|promoted|dropped, default pool), aiTaskId(text nullable — provenance for AI-sourced), createdAt, updatedAt`.
- `audienceSignals`: `id, userId, source(text: comment|dm|consultation|review), rawText, demandTag(text nullable), payingIntent(text nullable), linkedCandidateId(text nullable), ingestionRunId(text nullable — set when via Ingestion), createdAt`.
- `topicPromotions`: `id, userId, candidateId, projectId, promotedAt`.
- **`demandCount` is derived**: it is the count of `audience_signals` with `linkedCandidateId = candidate.id`. The column is a maintained denormalization (bumped on link/ingest, recomputable); the repository never lets a free patch set it (mirror Projects' derived-field discipline).

The contract resources (`candidateResource`, `audienceSignalResource`, `topicPromotionResource` in `contract/src/resources/candidate.ts`, v0.4) expose these **minus `userId`-leak rules already established** — `userId` is present on resources that the AI/AudienceSignal resources already expose `userId` (mirror `aiTaskResource`), but never returned where the existing convention omits it; follow the v0.4 resource definitions exactly. No Drizzle row is ever returned as an API type (SPEC §9).

---

## Tasks (TDD, ordered; each red→green under `pnpm verify` + module tests)

### Task 0 — contract v0.4 ops (prerequisite, separate PR on `feat/service-contract`)
- [ ] Author `contract/src/resources/candidate.ts`: `candidateResource`, `audienceSignalResource`, `topicPromotionResource` (shapes above; reuse `contentRole`, `id`, `iso8601`, `paginationQuery` primitives). Reuse the `contentRole` enum already in `contract/src/resources/projects.ts` (`traffic|trust|conversion`) — do NOT redefine.
- [ ] Author `contract/src/operations/candidate.ts` `export const candidateOperations = { … }` with the 7 ops in the table above (`defineEndpoint`, `fr:["FR-CAND-*"]` placeholders pending C-1 freeze). Wire into the contract index/registry next to `ingestionOperations`. Bump contract to `0.4.0`.
- [ ] Contract-package tests green (each endpoint's response DTO `.parse()`s a sample). **Gate:** module Tasks 1–9 do not start until v0.4 publishes these ids.

### Task 1 — db-schema (`candidate.db-schema.ts`)
- [ ] Write `candidate.repository.integration.test.ts` first asserting the three tables round-trip: insert a `candidates` row, an `audience_signals` row referencing it via `linkedCandidateId`, a `topic_promotions` row referencing the candidate + a project id; select back; assert ISO text timestamps, `demandCount` default 0, `status` default `pool` survive.
- [ ] Define Drizzle `pgTable`s mirroring `backend/src/schema/projects.ts` style (text PK, text `user_id NOT NULL`, ints for counters/scores, ISO-8601 text datetimes, text enums):
  - `candidates` (fields above; `demandCount` int default 0, `status` text default `'pool'`).
  - `audienceSignals` (fields above).
  - `topicPromotions` (fields above).
- [ ] Export `CANDIDATE_DDL` raw string (mirror `PROJECTS_DDL`): three `CREATE TABLE IF NOT EXISTS`; index `CREATE INDEX IF NOT EXISTS ix_audience_signals_candidate ON audience_signals (linked_candidate_id)` (powers `demand_count` aggregation); `CREATE INDEX IF NOT EXISTS ix_candidates_user_status ON candidates (user_id, status)`.
- [ ] Append `CANDIDATE_DDL` to the shared init in the db factory consumed by `createDb()` (where `PROJECTS_DDL` is applied / the registry DDL union). *(test: round-trip green)*

### Task 2 — repository, user-scoped (`candidate.repository.ts`)
- [ ] Extend the integration test: assert **ownership** — seed a candidate owned by `user-A`; a repository built with `userId:"user-B"` returns `undefined`/`OwnershipError` on `getCandidate`/`listSignalsForCandidate`; user A sees it. Assert `demandCount` recompute matches the count of linked signals.
- [ ] Define `RepoDeps { now, nextId, userId }`. Implement `createCandidateRepository(db, deps)` — **every query user-scoped** (`eq(table.userId, deps.userId)`):
  - `listCandidates({ status?, source?, sort? })` — sort by `predictedScore`/`positioningFit`/`demandCount` desc (default `predictedScore`).
  - `createCandidate(input)` → stamps `userId`, `status:'pool'`, `demandCount:0`.
  - `getCandidate(id)` (scoped; `OwnershipError` 404 if missing/cross-user).
  - `patchCandidate(id, patch)` — **rejects** `status:'promoted'` and any `demandCount` write (derived-field guard).
  - `setPromoted(id)` / `createPromotion({ candidateId, projectId })`.
  - `createSignal(input)` (carries `ingestionRunId`).
  - `listSignals({ source?, demandTag?, linkedCandidateId? })` / `listSignalsForCandidate(candidateId)`.
  - `linkSignal(signalId, candidateId)` + `recomputeDemandCount(candidateId)` (or atomic increment).
- [ ] **No unscoped query anywhere.** *(integration test: ownership + derived-count green)*

### Task 3 — service: RequestContext + promote + aggregation + AI/Ingestion seams (`candidate.service.ts`)
- [ ] Write `candidate.service.test.ts` first (in-memory pglite + **fake `ProjectsService`/`PositioningService`/Ingestion-run lookup** injected as ports) covering:
  - `createCandidate(ctx, {source:'idea', …})` → `pool`, `positioningFit` from `PositioningGate` port (or `null` when port absent — soft dep).
  - `createFromAIResult(ctx, aiTaskResult)` (C-3) → writes a `candidates` row with `source∈{trend,benchmark,demand}`, `aiTaskId` set; **assert no second state machine** — the method only persists a formalized result, does not set/track `awaiting`/`confirmed` on `candidates` (those live on the AITask). Re-calling with the same `aiTaskId` is **idempotent** (no duplicate Candidate).
  - `ingestAudienceSignal(ctx, record)` (C-4) → requires `ctx.ingestionRunId`; **rejects when the referenced IngestionRun does not exist** (RISK-005 dangling-ref guard) via the injected run-lookup port; on success writes a signal and bumps `demandCount` of `linkedCandidateId` if present.
  - `linkSignalToCandidate(ctx, signalId, candidateId?)` → when `candidateId` omitted, creates a new `source:'demand'` Candidate from the signal's `rawText`/`demandTag` then links; bumps `demandCount`.
  - `promote(ctx, candidateId)` (类比 `promoteReviewInsight`) → calls `ProjectsService.createProject` (Research stage seed, carrying `title`/`angle`/`contentRole`/`positioningFit`), sets `status:'promoted'`, writes `topic_promotions`; **already-promoted Candidate → guard error** (no double-promote). Uses `UnitOfWork` so the project create + status flip + promotion row are atomic (foundation §1; SPEC §11).
  - All methods take `ctx: RequestContext`, build the repository with `ctx.userId`.
- [ ] Implement `createCandidateService({ deps, ports })` where `ports = { projects, positioning?, ingestionRunLookup }` are **public Service interfaces from each module's `index.ts`** (never repositories). *(service test: all cases green incl. promote guard + dangling-run guard + AI-result idempotency)*

### Task 4 — schema (`candidate.schema.ts`)
- [ ] Re-export the contract DTOs for this module from `@creatoros/contract`: `candidateResource`, `audienceSignalResource`, `topicPromotionResource`, and the 7 op input bodies. **Do not redefine** — import and re-export (foundation §5).
- [ ] Define the **internal `audienceSignalRecordSchema`** the service validates Ingestion's opaque records against (Ingestion only validates `Record<string,unknown>[]`, so the typed shape lives here): `{ recordKey?, source, rawText, demandTag?, payingIntent?, linkedCandidateRef? }`; drives a stable `errorCode:"SCHEMA_INVALID"` rejection so Ingestion's partial-success accounting works. *(covered by service test rejections)*

### Task 5 — transport (`candidate.transport.ts`) + registry
- [ ] Write `candidate.contract.test.ts` first: for each of the 7 op ids, call the transport map handler with a valid `(ctx, input)` and assert `data` `.parse()`s against the matching contract DTO (`candidateResource` / `audienceSignalResource` / `topicPromotionResource`) and `meta` carries `requestId`. Assert an unknown op id throws `UnsupportedOperationError`.
- [ ] Implement `createCandidateTransport(service)` returning `{ opId → (ctx,input)=>envelope }` mirroring `backend/src/persistence-transport.ts` (`(ctx, input)`), one case per id:
  - `candidates.list` → `service.listCandidates(ctx, query)`
  - `candidates.create` → `service.createCandidate(ctx, body)`
  - `candidates.get` → `service.getCandidate(ctx, params.candidateId)`
  - `candidates.patch` → `service.patchCandidate(ctx, params.candidateId, body)`
  - `candidates.promote` → `service.promote(ctx, params.candidateId)`
  - `audienceSignals.list` → `service.listSignals(ctx, query)`
  - `audienceSignals.linkToCandidate` → `service.linkSignalToCandidate(ctx, { signalId: params.signalId, candidateId: body.candidateId })`
  - default → `throw new UnsupportedOperationError(endpoint.id)`.
- [ ] Export `CANDIDATE_OP_IDS` + the map from `index.ts` and **register in the registry** (`frontend/src/server/persistence-client.ts` — add `CANDIDATE_OP_IDS` to the `PERSISTED_OPS` union, mirror `SEARCH_OP_IDS`). *(contract test green)*

### Task 6 — FE wiring: `/topics` 选题候选池 page + `AudienceQuestionsCard` (spec §5.5; C-2 full path; C-5 island)
- [ ] **New page `/topics`** (spec §5.5 "独立 `/topics`"): server outer shell + `topics-interactive-region.tsx` island, only `ui/*` primitives + existing AppShell/Sidebar/TopHeader (C-5). Add the Sidebar entry (after 「项目」). Server read calls `candidates.list` (sorted) via the dispatch path (C-2: contract op → dispatch → Drizzle/pglite — **not fixtures-only**); preserve the `viewModel?` seam.
- [ ] **`needs-backend` islands** (each calls the mapped op + `router.refresh()`):
  - Card-pool sort control → re-issues `candidates.list` with `sort`.
  - "晋升为 Project" button on a card → `candidates.promote` → on success navigate to the new `/projects/:id`.
  - Manual "新增候选" form → `candidates.create` (`source:'idea'`).
  - 候选状态 drop (pool→dropped) → `candidates.patch { status:'dropped' }`.
- [ ] **`AudienceQuestionsCard`「评论区 & 客户问题」panel** (spec §5.5) — server read `audienceSignals.list`; "一键转 Candidate" button → `audienceSignals.linkToCandidate` (omit `candidateId` to spawn a new `demand` Candidate) → `router.refresh()`.
- [ ] **C-5 visual-gate note:** per spec C-5, this is a brand-new page and the visual baseline is not re-based (R2-9). Mark `/topics` **"暂不纳入视觉门禁"** (or defer to the stage-12 re-baseline) in the page source comment; no `Date.now`/`Math.random`/`fetch` in render/selectors/fixtures.
- [ ] **Roadmap note:** the existing roadmap §4 "热门选题 row … decorative … Open topic / seed project" (Knowledge page) is **superseded** by this page for AI-sourced trend candidates — leave the Knowledge decorative row inert, do not double-wire.

### Task 7 — Ingestion + AI cross-module hook-up (C-3 / C-4 verification)
- [ ] **Ingestion (C-4):** add an `ingestAudienceSignal` fan-out in the **Ingestion module's** plan/registry so a new `audience_signal` run type routes records to `CandidateService.ingestAudienceSignal` (via this module's `index.ts`, Service-only). Add a test in `candidate.service.test.ts` (or an ingestion-side integration test) that a comment record pushed through an Ingestion run lands as an `audience_signals` row with the real `ingestionRunId` and bumps `demandCount` — and that a record citing a non-existent run is **rejected** (RISK-005).
- [ ] **AI (C-3):** confirm the **AI module's** `confirmResult` calls `CandidateService.createFromAIResult` for `resultType:"candidate"` AITaskResults; assert via a service test that an AI candidate only becomes a `candidates` row **after** `awaiting_confirmation → confirmResult` (never on `submit_candidate` alone), and that no `awaiting`/`confirmed` columns exist on `candidates` (no parallel machine). If module 15 is not yet green, stub the AIService port and mark this sub-task blocked-on-15.

### Task 8 — tests (per MODULE-ARCH §2 / foundation §5)
- [ ] `candidate.service.test.ts` — promote guard (no double-promote) + atomic UoW; `createFromAIResult` idempotency + no-parallel-machine; `ingestAudienceSignal` dangling-run rejection (RISK-005) + demand-count bump; PositioningGate nullable port — **valid + invalid paths**.
- [ ] `candidate.repository.integration.test.ts` — pglite-backed: ownership (user A ≠ user B → 404), `demandCount` recompute correctness, derived-field guard (patch can't set `promoted`/`demandCount`).
- [ ] `candidate.contract.test.ts` — each of the 7 op outputs `.parse()`s against its DTO; unknown id → `UnsupportedOperationError`.
- [ ] FE: `/topics` island + `AudienceQuestionsCard` deterministic render/selectors (no `Date.now`/`Math.random`/`fetch`, C-5); promote button → op called + refresh; link-to-candidate → op called.
- [ ] All green under `pnpm verify` (frontend) + the module's vitest.

### Task 9 — acceptance (SPEC §22 + spec §9.2 / hard constraints)
- [ ] Module has `service` + `repository` + `schema` + `transport` + `index` + the 3 test files (full §5 template, C-2 — **not fixtures-only**).
- [ ] **No cross-module repository import** — `grep -rE "repositories/(project|positioning|ai|ingestion)" frontend/src/server/modules/candidate` returns nothing; only `…/modules/<m>/index.ts` Service imports (SPEC §22).
- [ ] Routes don't touch the db client — only dispatch route → registry → transport → service → repository.
- [ ] **C-3 honored:** no `awaiting`/`confirmed` state on `candidates`; AI Candidates arrive only via `createFromAIResult` from `confirmResult`; `submit_candidate`→`awaiting_confirmation`→`confirmResult` is reused, not duplicated.
- [ ] **C-4 honored:** `AudienceSignal` writes only via `ingestAudienceSignal` called from Ingestion (no second write path); `ingestionRunId` references a verified real `IngestionRun` (RISK-005); rides Ingestion's idempotency.
- [ ] **Multi-tenant smoke:** candidates/signals/promotions under user A are invisible to user B (`get`/`list`/`promote` → 404).
- [ ] **Spec §9.2 closed:** `/topics` answers "按变现潜力排序的待选选题" (monetization-weighted sort) + `AudienceQuestionsCard` answers "用户在评论里反复问什么" (signal aggregation).
- [ ] No Drizzle row returned as an API type — all op outputs are the explicit v0.4 DTOs (SPEC §9).

---

## Open questions (flag to orchestrator before execution)

1. **C-1 ID freeze:** new `FR-CAND-*` / `ENT-*` / `API` ids for this module must be appended as a **new segment after** OPEN-001 sign-off (spec C-1). Confirm the segment range before contract v0.4 lands the ops; until then ids are placeholders.
2. **`createFromAIResult` resultType contract:** the AI module's `AITaskResult.resultType` value that maps to a Candidate (`"candidate"`? `"topic_candidate"`?) and the `resultData` shape (title/angle/source) must be fixed jointly with module 15's confirm path — pin once AI's `index.ts` seam is published.
3. **`positioningFit` timing:** if module 17 (Positioning) ships after this module, ship with the nullable gate port (fit = `null`) and backfill via a one-shot recompute when Positioning goes green — confirm this is acceptable vs. blocking on 17.
4. **`productAnchorId` FK:** spec §5.4 anchors a Candidate to a `Product` (monetization module). If monetization isn't green, keep `productAnchorId` a free nullable text ref (no FK constraint) and tighten to an FK in a later migration — confirm.
5. **Ingestion run-type id:** the `run_type` string Ingestion uses for audience-comment batches (e.g. `"audience_signal"`) must be agreed with module 12 so the fan-out routes to `ingestAudienceSignal`.
