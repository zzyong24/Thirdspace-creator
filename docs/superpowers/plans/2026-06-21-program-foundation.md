# CreatorOS Full-Wiring Program — Foundation & Conventions

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. This is the **keystone** doc — every per-module plan under `docs/superpowers/plans/modules/<module>.md` MUST follow the conventions here. Steps use `- [ ]`.

**Goal:** Take CreatorOS from "one wired Projects slice + static design mockups" to **all 16 modules wired end-to-end** (FE button → contract op → user-scoped SQL → render), with **real AI (Claude Agent SDK)**, **mocked external side-effects**, and **real login + multi-tenancy**, driven wave-by-wave via the proven dispatch-route substrate.

**Decisions in force (user, 2026-06-21):**
1. **AI = real** via the Claude Agent SDK (`@creatoros/ai-worker`). Anthropic API key supplied at runtime via env (`ANTHROPIC_API_KEY`); never hardcoded.
2. **External side-effects = mock** (publishing to platforms, S3 object storage) — behind swap-seam adapters; stage-N replaces with real.
3. **Identity = real login + multi-tenant.** `RequestContext.userId` is the sole ownership boundary (SPEC §10/§20); **every repository query is user-scoped**.
4. Next step = generate all-module plans first, then run.

**Authoritative inputs (do not re-spec — reference these):** `backend/SPEC.md` (§9 schema, §10 RequestContext, §12 state machines, §13 API/76 endpoints, §14 envelope, §18 AI, §20 security, §22 acceptance), `backend/MODULE-ARCHITECTURE.md` (16 modules + module template §2), `docs/CreatorOS-data-model.md` (58 entities), `docs/CreatorOS-storage-and-business-logic.md` (6-stage flow), `@creatoros/contract` (76 ops — the seam, done), **`docs/superpowers/plans/2026-06-21-program-roadmap.md` §3 (waves) + §4 (per-button→op inventory for all 18 pages)**, and the AI design `docs/superpowers/specs/2026-06-21-ai-orchestration-agent-sdk-design.md`.

---

## 1. Architecture reconciliation (proven slice → SPEC modular monolith)

The Projects slice proved the substrate (`contract → HttpTransport → /api/v1/dispatch → compositeTransport → pglite SQL → envelope`). The full build adopts the SPEC's modular-monolith structure (SPEC §22: one Next.js app, one Postgres, one deploy unit). The slice **generalizes**, it is not thrown away:

| Proven slice (today) | Generalized form (this program) |
|---|---|
| `@creatoros/backend` flat (db + one repository + one transport) | Keep `@creatoros/backend` as the **shared infra** package: pglite/Drizzle db factory, `RequestContext`, Unit-of-Work, the **module transport registry**. Per-module code lives under `src/server/modules/<module>/` (MODULE-ARCH §2 template) and is registered into the registry. |
| `PERSISTED_OPS` Set hardcoded in `persistence-client.ts` | A **registry**: each module exports its `{ opId → handler }` map; the composite transport builds `PERSISTED_OPS` from the union. Adding a module = register it, no edits to the composite. |
| `compositeTransport` (persistence projects + mock rest) | Same composite; mock fallback shrinks to zero as modules land. |
| Hardcoded `userId` in repo deps | `RequestContext.userId` threaded from the authenticated session (see §2). |
| in-memory pglite on `globalThis` | Same `globalThis` singleton (REQUIRED — Next gives route vs RSC separate module instances; a module-level singleton splits the store). `dataDir` for cross-restart durability is a later toggle. |

**Module file layout (per MODULE-ARCH §2), under the Next app:**
```
src/server/modules/<module>/
├── <module>.db-schema.ts     # Drizzle pgTable(s), user_id column on owned rows
├── <module>.repository.ts    # user-scoped queries ONLY (eq(table.userId, ctx.userId))
├── <module>.service.ts        # RequestContext-taking methods; §12 state machines; UoW for cross-module
├── <module>.schema.ts         # re-export/usage of the contract Zod DTOs for this module
├── <module>.transport.ts      # { opId → (ctx,input)=>envelope }; throws UnsupportedOperationError otherwise
├── <module>.errors.ts
├── index.ts                   # the ONLY public entry (service interface + transport map)
├── <module>.service.test.ts
├── <module>.repository.integration.test.ts   # pglite-backed
└── <module>.contract.test.ts                  # op output validates against contract DTO
```
No cross-module repository imports (SPEC §22); modules import each other only via `index.ts`.

---

## 2. Multi-tenant auth foundation (BLOCKS all modules — build first)

Per SPEC §10/§20. Minimal-but-real (demo-grade real, not enterprise SSO):

- **Identity module** (`src/server/modules/identity/`): `users` + `sessions` tables. Email + password (argon2/bcrypt hash). `sessions` holds a hashed session token (SPEC §20: hashed tokens). Seed the canonical user so existing fixtures keep working.
- **Login surface**: `POST /api/v1/auth/login` (email+password → set httpOnly session cookie), `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`. (These are auth routes, not contract dispatch ops.)
- **RequestContext derivation**: the `/api/v1/dispatch` route reads the session cookie → resolves `userId` → builds `RequestContext { userId, requestId, source: "user" }` → passes it into `compositeTransport.request(ctx, endpoint, input)`. **The transport signature gains a `ctx` parameter** (the one cross-cutting change to the proven substrate). Unauthenticated → 401 (except whitelisted public ops, if any).
- **Ownership everywhere**: every repository query filters `WHERE user_id = ctx.userId`; every insert stamps `ctx.userId`. Cross-user access → `OwnershipError` (404, not 403, to avoid existence leak).
- **FE**: a login page + a session guard in the `(creator)` layout; the existing hardcoded user becomes the seeded login.

Deliverable: `docs/superpowers/plans/modules/00-identity-auth.md` (I author or fan-out; it gates everything).

---

## 3. AI real-execution integration (Claude Agent SDK)

The `@creatoros/ai-worker` foundation is built (state machine, candidate schemas, ports, context tools, orchestrator, confirm — 27 tests). To make AI nodes real:

- **AITask creation** (FE): the inventory's AI buttons (e.g. Script `AI 写作建议`, Research analysis, Planning thesis, Publishing copy) call `POST /ai/tasks` (contract `ai.createTask`) with `taskType` + `inputData` + references → persisted AITask `queued`.
- **Worker execution**: `@creatoros/ai-worker` Task 11 (real `ClaudeAgentRunner` + per-node Skills) runs each queued AITask via the Agent SDK (`ANTHROPIC_API_KEY` from env), reads context via the in-process `creatoros` MCP tools (backed by the real repositories, user-scoped), and writes an `AITaskResult` candidate → `awaiting_confirmation`.
- **Confirm** (FE): the `采纳` button calls `POST /ai/tasks/:id/confirm` (contract) → the AI-free `confirmResult` formalizes the candidate into a new `ArtifactVersion`/`KnowledgeItem`/etc. → AITask `succeeded`.
- **Run mode**: dev = a polling loop in the worker process (or a Next route that drains one task) ; the worker reads/writes the SAME pglite db (shared infra). Skills live in `ai-worker/.claude/skills/<node>/`.
- Seed `AgentConfiguration` + `ModelConfiguration` rows per node (capability → model/effort; default opus-4-8, script.rewrite → fable-5/high).

Deliverable: `docs/superpowers/plans/modules/ai.md` (depends on Reviews per roadmap; includes Task 11).

---

## 4. External-mock adapters (swap seam)

- **Object storage**: an `ObjectStoragePort` with a `MockObjectStorage` (in-memory/local; returns fake signed URLs) — Assets/Production use it. Real S3 adapter is a stage-N swap.
- **Publishing**: a `PlatformPublisherPort` with a `MockPublisher` (records a `Publication` + a fake external id; no network). Real platform adapters (抖音/B站/小红书) are stage-N.
- **Ingestion**: `IngestionSourcePort` mock (deterministic fake imports), idempotent per SPEC §17.

These keep the domain logic + persistence real while the outermost I/O is mocked.

---

## 5. Per-module plan template (every `modules/<module>.md` MUST follow)

Each module plan is a TDD sequence producing working, user-scoped, contract-conformant code:

1. **db-schema** — Drizzle pgTable(s) for the module's entities (data-model + SPEC §9), `user_id` on owned rows; add DDL to the shared init. *(test: table round-trips)*
2. **repository** — user-scoped CRUD + queries the service needs; **never** unscoped. *(integration test on pglite: ownership enforced — user A cannot read user B)*
3. **service** — `RequestContext`-taking methods implementing the module's SPEC §12 state machines + §11 cross-module UoW where needed. *(service test: state-machine guards, valid + invalid)*
4. **transport** — `{ opId → (ctx,input) => envelope }` for the module's SPEC §13 ops; register in the module registry. *(contract test: each op output validates against the contract DTO)*
5. **FE wiring** — for every row in `program-roadmap §4` for this module's pages: `wired-local` → client-side island behavior; `needs-backend` → island calls the mapped op + `router.refresh()`; `decorative` → leave (note it). Server reads switch to the real op. Preserve the `viewModel?` seam.
6. **acceptance** (SPEC §22) — module has service+repository+schema+tests; no cross-module repo import; routes don't touch the db client; ArtifactVersion immutable (where relevant); candidate-confirm for AI; idempotency for Publication/metrics.

Each plan ends GREEN under `pnpm verify` (frontend) + the module's own tests.

---

## 6. Wave order (from program-roadmap §3 — dependency-ordered)

A wave starts only after prior waves are green.

- **Wave 0 (blocking, single-stream):** §1 registry generalization + §2 **Identity/auth** + §4 mock adapters. *(Foundation; nothing parallelizes before it.)*
- **Wave 1 (parallel):** `{Notifications, Search, Settings, Taxonomy}` (zero/low deps; Settings+Taxonomy follow Identity).
- **Wave 2:** **Projects** (extend the slice: outputs/tasks/activity + multi-tenant) → then `{Knowledge, Assets}` parallel → **Artifacts** once both land.
- **Wave 3:** `{Production, Publishing}` parallel → **Analytics** → `{Ingestion, Reviews}` parallel → Reviews unblocks `{Learnings, AI}` parallel.
- **Wave 4:** the 4 page-composition query services (Dashboard/ProjectOverview/PublishingCenter/GlobalSearch) — consume only public services.

Each wave = a workflow fan-out (one agent per module, executing that module's plan, halting on failure).

---

## 7. Module roster (16) — each gets a `modules/<module>.md` plan

| # | Module | SPEC §13 group | Primary pages (roadmap §4) | Wave |
|---|---|---|---|---|
| 00 | Identity/auth | §13 系统 / new auth routes | Login, Settings, Shell | 0 |
| 01 | Notifications | §13 AI、搜索和系统 | Shell NotificationPopover | 1 |
| 02 | Search | §13 AI、搜索和系统 | `/search`, Shell | 1 |
| 03 | Settings | §13 系统 | `/settings` | 1 |
| 04 | Taxonomy | §13 知识与素材 | tags across pages | 1 |
| 05 | Projects | §13 项目与流程 | `/projects`, `/projects/:id`, `/projects/new` | 2 |
| 06 | Knowledge | §13 知识与素材 | `/knowledge`, Research workspace | 2 |
| 07 | Assets | §13 知识与素材 | `/assets`, Planning/Production | 2 |
| 08 | Artifacts | §13 产物 | Script/Planning workspaces | 2 |
| 09 | Production | §13 制作与发布 | Production workspace | 3 |
| 10 | Publishing | §13 制作与发布 | Publishing workspace, `/publishing` | 3 |
| 11 | Analytics | §13 分析、复盘和经验 | `/projects/:id/review`, Dashboard | 3 |
| 12 | Ingestion | §13 外置 Skill 写入 | (backend/external) | 3 |
| 13 | Reviews | §13 分析、复盘和经验 | Review workspace | 3 |
| 14 | Learnings | §13 分析、复盘和经验 | Dashboard, `/experience` | 3 |
| 15 | AI | §13 AI、搜索和系统 | Copilot + AI buttons across workspaces | 3 |
| Q | Query services (×4) | §19 | Dashboard/Overview/PublishingCenter/Search DTOs | 4 |

---

## 8. What this program needs from the user at run time

- **`ANTHROPIC_API_KEY`** (env) — for Wave 3 AI execution. Until provided, AI ops run the deterministic Skill stub (the worker's FakeAgentRunner) so the chain is testable.
- Nothing else — external side-effects are mocked; identity is self-contained (seeded user + login).

---

## 9. Acceptance for "wiring complete"

- Every `needs-backend` / `wired-local` button in `program-roadmap §4` is functional (decorative ones documented as intentionally inert).
- Every module satisfies SPEC §22.
- `pnpm verify` green; each module's tests green; a multi-tenant smoke (user A cannot see user B's data) passes.
- AI nodes produce candidates that require confirmation before formalizing (SPEC §18).
