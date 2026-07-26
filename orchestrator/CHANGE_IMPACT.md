# Change Impact — CreatorOS

> Required control artifact (rules/orchestrator-state-machine.md §"Required Control Artifacts";
> consistency-gates.md: "Every changed upstream ID has either updated downstream artifacts or an entry in
> `CHANGE_IMPACT.md`"). It was missing until 2026-06-22 (DEC-013) — the invalidating changes below had been
> narrated inside DECISION_LOG entries instead of analyzed here. This file back-fills them and is the home
> for all future impact analyses.

Each entry: the change, which upstream IDs/artifacts it touched, the downstream artifacts it INVALIDATED
(per the Invalidation Rules), and how each was handled (re-derived / re-verified / still-stale).

---

## CI-MC-002 — 模型配置改为现有 Settings 轻量优化（DEC-MC-002，2026-07-26）

- **范围重置**：旧八槽总览、配置向导、能力平台、费用和付费 effect 不进入 BUILD；继续复用
  `settings.models.put/test`，不新增页面、公开 operation 或数据模型。
- **落地影响**：模型卡普通路径只显示预设、模型 ID、API Key；高级字段默认折叠；主模型改为
  “保存并测试”，先保存再走正式 `modelFor + streamText`，非空文本才判连通。
- **兼容性**：Kimi 开放平台与 Kimi Code 拆成两套 OpenAI Chat 预设；New API、Responses
  与中转站通过高级设置和教程说明，不把基础文本探针冒充复杂工具调用认证。
- **证据**：`f91b08cb`；T-501 定向 67 tests、前端 typecheck、目标 lint、boundary、
  orphan、reconcile 通过；未发真实 provider 或付费调用。

## CI-ODR-001 — 四个过度设计任务统一范围重置（DEC-ODR-001，2026-07-26）

- **变更**：T-516/T-517/T-518/T-519 统一退回已有能力上的最小完整闭环；框架优化明确不在
  T-527 内。本次只纠正上游真相，不修改生产代码。
- **失效/待重推导**：
  - T-517 新 `automation_job/run`、八表 grant/effect 平台和第二执行状态机 → **关闭**；
  - T-516 独立 report/issue/candidate/event/confirm/undo Saga → **关闭**；
  - T-518 Growth 上传、对象存储、客服收件箱 → **关闭**；
  - T-519 第二套上传/搜索/图谱平台 → **关闭**；
  - 四项 2026-07-24/25 旧 CONTRACT → **只保留审计历史，不再授权 BUILD**。
- **重新派生**：
  - T-517 复用 `scheduled_job/job_run` 与 `PersistentTaskService`，补 sealed kind、typed
    handler registry、单一 driver 与旧 timer cutover；
  - T-516 自动扫描只做确定性报告，AI 修改必须由用户主动触发并复用定位编辑/版本链；
  - T-518 只做本地整理/复制、打开已配置 `supportUrl` 和加密日志目录；
  - T-519 先修 Assets ownership/stable assetId/complete 幂等，再补文件夹与多视图。
- **当前 Gate**：四份 Replacement 经同一 cross-model reviewer 三轮复核，最终 PASS
  （0 blocker/0 major/0 minor）；DEC-ODR-001 已记录用户范围重置。PLAN Gate 通过，
  CONTRACT/确认②/BUILD 仍关闭。

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
