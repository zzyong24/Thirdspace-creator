# Change Impact — CreatorOS

> Required control artifact (rules/orchestrator-state-machine.md §"Required Control Artifacts";
> consistency-gates.md: "Every changed upstream ID has either updated downstream artifacts or an entry in
> `CHANGE_IMPACT.md`"). It was missing until 2026-06-22 (DEC-013) — the invalidating changes below had been
> narrated inside DECISION_LOG entries instead of analyzed here. This file back-fills them and is the home
> for all future impact analyses.

Each entry: the change, which upstream IDs/artifacts it touched, the downstream artifacts it INVALIDATED
(per the Invalidation Rules), and how each was handled (re-derived / re-verified / still-stale).

---

## CI-006 — Full spec alignment (from DEC-006, 2026-06-20)

- **Change**: Implementation changed to match specs (UI stack @base-ui → shadcn/Radix; +13 entities; enum/field
  alignment; mandated dir structure).
- **Upstream touched**: ENT-* (domain model gained 13 entities), COMP-* (UI primitives), the locked UI baseline.
- **Downstream invalidated → handling**:
  - Frontend components → **re-derived** (INC-1..5) and re-verified `pnpm verify` GREEN.
  - **Frontend VISUAL baselines → INVALIDATED, NOT yet re-derived.** DEC-006 itself says "invalidates current
    frontend visual baselines (must re-baseline, R2-9)." Status: **still stale** — visual suite 25✓/27✗,
    tracked as OPEN-002. This is the one open invalidation from CI-006.
  - Mock data/fixtures → re-derived (INC-1).
- **Residual risk**: stage-12 visual re-validation outstanding.

## CI-009 — Contract module-resolution change (from DEC-009, 2026-06-21)

- **Change**: `@creatoros/contract` switched NodeNext `.js` specifiers → bundler resolution (extensionless,
  36 files); `awaiting_confirmation` added to `AITaskStatus`.
- **Upstream touched**: service contract packaging (supersedes DEC-008's "exports ./src/index.ts" note);
  AITaskStatus enum (contract primitives + frontend domain.ts).
- **Downstream invalidated → handling** (per "Service contract changes invalidate frontend integration code,
  backend contract tests, integration report"):
  - FE integration code → **re-derived & re-verified** (15b consumes the bundler-resolved contract; `pnpm verify`
    GREEN, 420 tests).
  - Contract tests → **re-run** (typecheck 0 / 61 tests).
  - AITaskStatus consumers → updated in both contract and frontend domain.ts (kept in sync).
- **Residual risk**: none known; the enum addition is additive.

## CI-012 — Monetization-weighted directional change + Seven-Step extension (from DEC-012, 2026-06-21)

- **Change**: Adopt `docs/CreatorOS-七步整合设计.md`. A **directional** data-model change ("monetization-weighted":
  `ContentOutput.content_role`; `MetricValue.metric_key` += profit/lead/conversion keys;
  `AudienceSnapshot.dimension_type` += intent/paying; `Learning.learning_type` += conversion types; Dashboard/
  Publishing surface conversion/lead) **baked into base-module plans before Wave 2/3**. Plus 6 new modules
  (positioning, monetization, candidate+audience-signal, calibration, platform-account, content-calendar).
- **Upstream touched**: ENT-* (ContentOutput, MetricValue, AudienceSnapshot, Learning), FR-* (new monetization
  FRs), contract DTOs (→ contract v0.3 for content_role + enum/key additions that cross the wire).
- **Downstream invalidated → handling** (per "Domain model changes invalidate mock data, backend spec, service
  contracts, and tests that reference changed entity IDs"):
  - Service contract → **pending v0.3 pass** (content_role on contentOutputResource + enum/key additions). Not
    yet done at reconciliation time.
  - Base-module plans (Projects/Analytics/Reviews/Learnings/Publishing/Dashboard) → to be edited AFTER Wave 1,
    BEFORE Wave 2 launch (DEC-012 execution timing). Not yet done.
  - Mock data + fixtures referencing these entities → **will need re-derivation** once the fields land.
  - Backend spec + tests referencing these entities → **will need update** when the new keys/roles are persisted.
- **Governance note**: DEC-012 chose **pragmatic ID continuation, NOT the formal C-1 freeze**. So new FR/ENT IDs
  are appended without a freeze ceremony — recorded as **accepted-risk** (see OPEN-004). This is the single
  largest in-flight invalidation: a directional change to already-built base modules whose downstream
  re-derivation is scheduled but incomplete.
- **Residual risk**: HIGH until contract v0.3 lands and the base-module plans + fixtures are re-derived. Track
  each as it completes.

## CI-013 — 模型协议枚举增加 Responses（DEC-019，2026-07-23）

- **变更**：`apiFormat` 从 `anthropic | openai_chat` 扩展为
  `anthropic | openai_chat | openai_responses`，并把 Chat/Responses 的 SDK 与 Pi 路径显式分开。
- **上游变更**：FR-069、FLOW-023、API-008、API-009；设置模型配置 contract 与协议路由。
- **下游失效与处置**：
  - contract resource/operation → **已重派生并重验**（TEST-001）。
  - settings 持久化、导入导出、解析 → **已重派生并重验**（TEST-002）。
  - Vercel AI SDK provider factory → **已重派生并重验**（TEST-003）。
  - Pi Agent 协议映射 → **已重派生并重验**（TEST-004）。
  - 设置页连接测试与协议选择 → **已重派生并重验**（TEST-005/006）。
  - desktop sidecar Pi lazy modules → **已重派生并重验**（TEST-007）。
  - 旧研究结论“Responses 用不上” → **已标记被 T-471 SPEC 取代**。
- **未关闭风险**：
  - T-471 实现前红测没有可审计输出，Gate FAIL 历史保留。
  - 真实 New API token + 实际模型 Agent 循环会产生费用，未经授权未运行（RISK-011）。

---

### How to use this file going forward

1. Any confirmed change to an **approved** upstream artifact (FR/NFR/FLOW/ENT/IA/PAGE/COMP/contract/security/
   release criteria) gets a `CI-###` entry here BEFORE the change is marked done.
2. List the invalidated downstream artifacts explicitly and mark each: re-derived / re-verified / still-stale.
3. `node orchestrator/process/reconcile.mjs` checks that decisions tagged as invalidating have a matching
   `CI-###` entry (see process/README.md).
