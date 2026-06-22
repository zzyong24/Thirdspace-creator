# Module Task Decomposition (beyond CRUD)

CRUD alone doesn't build the product — real data has to *come from somewhere* and modules have to *connect*.
So each module is classified by **archetype**, and its task list adds **data-sourcing** and/or **business-flow**
tasks beyond persistence. Machine-readable source of truth: `modules.config.json` (drives `progress.mjs`).
Per task, run `progress.mjs show <vertical>` for its data-source, cross-module flows, and OSS to borrow.

## The 5 task types (a module instantiates the applicable subset)

| task | what it builds | dep |
|---|---|---|
| `repo` | Drizzle repository + pglite test: CRUD **+ invariants** (FSM transitions, idempotency UNIQUEs) | — |
| `data-source` | how REAL data enters: ingest adapter (scrape/API) · AI-worker generation · object-storage upload+metadata · derived-compute · seed | repo |
| `flow` | cross-module wiring: UoW fan-out, post-commit emit (search/notif), feedback loops | repo |
| `frontend` | wire UI → transport + `PERSISTED_OPS` + round-trip test | repo/ds/flow |
| `e2e` | end-to-end create→persist(SQL)→render + visual; evaluator sets verified | last |

Order: `repo → [data-source] → [flow] → frontend → e2e`. 21 modules → **87 tasks**.

## Per-module (archetype · real data source · key flow · OSS to borrow)

| module | archetype | real data source (short) | OSS to borrow |
|---|---|---|---|
| **projects** | authored+orchestration | create mints project + seeds 6 stages/4 output-stages (UoW) | kanboard, twentyhq/twenty (stage-on-entity) |
| **knowledge** | authored+ingested | UI / AI-distilled / ingested candidate; append-only revisions | TriliumNext/Notes, outline |
| **assets** | authored+ingested | 2-phase S3 upload + headObject metadata; also from Production/Ingestion | resourcespace, atrocore/atrodam |
| **artifacts** | authored+AI+orch | user saves + AI via confirmResult; immutable versions + structured children | TypeCellOS/BlockNote (jsonb blocks) |
| **production** | authored+orch | settings + segments + export(mock render→asset) | remotion-dev/remotion, openshot |
| **publishing** | ingested+orch | publisher.publish → external_id fact; status follows external truth | gitroomhq/postiz-app (adapter+queue) |
| **analytics** | ingested+derived | appendSnapshot from Ingestion (FLOW-019); idempotent; derived curves | PostHog, umami |
| **reviews** | authored+orch | form + period/evidence derived from Publishing+Analytics | ParabolInc/parabol |
| **learnings** | authored+derived | quick-record OR promoted from ReviewInsight; derived confidence | ParabolInc/parabol |
| **notifications** | derived(event) | NOT self-authored — modules emit post-commit | novuhq/novu |
| **search** | derived(index) | rebuildable index; post-commit upsert; FTS+pgvector | pgvector/pgvector |
| **settings** | authored+config | prefs/model/agent upsert; secret-reference; fallback chain | BerriAI/litellm |
| **taxonomy** | authored+config | tags + polymorphic EntityTag join; seeded | acts-as-taggable-on |
| **ingestion** | ingested+orch | THE external write path; adapters; double idempotency; FLOW-019/020 fan-out | miniflux/v2 (idempotent ingest) |
| **ai** | AI+orch | ai-worker subprocess generates; confirmResult = sole AI write seam | langchain-ai/langgraph (HITL interrupt), langfuse |
| **candidate** | authored+AI+ingested+orch | manual + AI(confirm) + AudienceSignal ingest; derived demand_count | MaartenGr/BERTopic, BERTrend |
| **calibration** | authored+ingested+derived+orch | rubrics/blind-prediction + actuals from Ingestion; derived deviation | confident-ai/deepeval, promptfoo |
| **monetization** | authored+ingested+derived+orch | products/offers + leads(manual/survey) + conversions; honest unattributed | twentyhq/twenty (CRM), espocrm |
| **positioning** | authored+AI+orch | profile + immutable statement chain; PositioningGate (deterministic, no table) | twentyhq/twenty, TriliumNext |
| **platform-account** | authored+config | account registry; secret pointer; metrics = read-time rollup | gitroomhq/postiz-app (OAuth model) |
| **content-calendar** | authored+derived+orch | entries/cadence; status reconciled by reading Publishing | gitroomhq/postiz-app, mixpost |

## Classification (decides which tasks a module gets)

- **Mostly CRUD/config** (`repo,frontend,e2e`): settings, taxonomy, platform-account.
- **Needs data-sourcing** (`+data-source`): ingestion, analytics, ai, assets, knowledge, learnings, notifications, search, candidate, calibration, monetization.
- **Needs cross-module orchestration** (`+flow`): projects, production, publishing, reviews, artifacts, ingestion, ai, candidate, calibration, monetization, positioning, content-calendar.

## Top OSS to study overall

1. **gitroomhq/postiz-app** — closest stack twin (Next+TS+Postgres publishing): adapter-per-platform, OAuth accounts, scheduled-post queue → publishing + content-calendar + platform-account.
2. **twentyhq/twenty** — metadata object + stage/Kanban on React/TS/Postgres → projects pipeline + monetization CRM + positioning profile (one pattern, three modules).
3. **miniflux/v2** — cleanest idempotent external ingestion (dedup hash + conditional fetch + scheduling) → ingestion + all platform pulls.
4. **langchain-ai/langgraph** (+ **langfuse** for traces) — checkpoint + human-in-the-loop interrupt/resume = our candidate-confirm; maps onto Agent SDK tool turns → ai orchestration.

> Cross-cutting reuse: **pgvector + Postgres FTS** (not a separate engine); store editor/agent payloads as `jsonb`;
> one **stage-on-entity + transitions-audit** pattern across pipeline / monetization / review.
