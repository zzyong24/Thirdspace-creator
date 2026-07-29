# Change Impact — CreatorOS

> Required control artifact (rules/orchestrator-state-machine.md §"Required Control Artifacts";
> consistency-gates.md: "Every changed upstream ID has either updated downstream artifacts or an entry in
> `CHANGE_IMPACT.md`"). It was missing until 2026-06-22 (DEC-013) — the invalidating changes below had been
> narrated inside DECISION_LOG entries instead of analyzed here. This file back-fills them and is the home
> for all future impact analyses.

Each entry: the change, which upstream IDs/artifacts it touched, the downstream artifacts it INVALIDATED
(per the Invalidation Rules), and how each was handled (re-derived / re-verified / still-stale).

---

## CI-COL-001 — 内容雷达采集账号与工作区 owner 解耦（DEC-COL-001，2026-07-26）

- **范围**：只覆盖内容雷达 `creator_profile`、`favorites_folder`、`darkhorse_query`；经营数据、
  评论、分享链接、`web/rss` 和其他自动化任务都不增加账号选择器。
- **数据归属**：source/run/task/item/observation 继续以当前工作区账号为唯一 owner；collector
  仅选择服务端验证后的本机抖音登录态，不成为领域写入上下文。
- **契约影响**：新增 collector 安全列表 operation，变更三类来源的 preview/list/create/run
  语义；客户端不可提交或读取 `browserSessionRef`，现有 `web/rss` 合同不变。
- **旧工件**：T-496 的“只做收藏夹”失败方案仅留历史，由 T-537 完整替代。
- **当前 Gate**：PLAN/CONTRACT 三轮评审内部 PASS；真实双 active 账号 `RAT-537-01`
  未通过，正式 Gate 与全部 BUILD 保持 blocked。

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

## CI-TSB-001 — 三系统 runtime 权威、双入口与 lifecycle（DEC-TSB-001，2026-07-26）

- **变更**：单一 `supportUrl` 拆成官方产品 Bug `bugFeedbackUrl` 与渠道商业售后
  `channelSupportUrl`；Creator 只消费 AM signed `channel-runtime-v2`，并按复合 identity、
  source digest 与版本防降级。
- **上游**：Growth canonical/DEC-050 新周期 PASS；AM API-AM-007/011/012 与共同 projection、
  reassignment fixtures。
- **生命周期**：
  - active：按签名字段展示；
  - sales_disabled：purchase/renewal 必须 null，保留 brand/support/download/Bug；
  - terminated：只采纳 AM 完成全量原子改绑后签名的新 target identity，不 fallback、不 tombstone。
- **下游失效**：
  - T-396 三键 `.channel-links` 明文 cache 与单 `supportUrl` → **invalidated，T-534 重派生**；
  - T-518 `supportUrl` 作为 Bug 入口 → **invalidated，保留本地整理/复制/打开页面/零上传语义**；
  - T-531/T-532 若包含自动上传、附件或回执 → **冻结，不是 T-534 BUILD 输入**；
  - `contract/src/local-platform.ts`、IssueFeedbackDialog、激活页、设置购买与服务、Rust license parser/
    cache、本地 runtime reader/API 及其测试 → **已重派生并重验**；
  - 旧 TS channel-links reader 与 `/local/support-channel` → **已删除**；Rust 生产路径不再写
    `.channel-links`，旧测试辅助函数仅在 `cfg(test)` 编译。
- **安全影响**：明文 `.channel-links` 不能证明签名来源，改由现有加密 `.license` 一次保存
  license identity + verified runtime；旧明文不自动迁移。日志/API 不输出 code、identity、
  URL query/fragment、sourceDigest 或签名。
- **当前 Gate**：Creator 独立评审三轮已收口，contract/scope/fixture 与 BUILD 定向、全量回归
  PASS；`next build` 仍被当前 HEAD 中 T-535 已提交的 `instrumentation.ts` Turbopack
  code-frame panic 阻断，不归入 T-534 代码范围，也不伪报发布构建全绿。证据见
  `GATE-T534-BUILD.md`。

## CI-FDB-003 — 产品 Bug 临时飞书降级（DEC-FDB-003，2026-07-26）

- **变更**：签名 `bugFeedbackUrl` 缺失时，问题反馈弹窗打开内置官方飞书表；自动发送禁用，
  日志仅由用户压缩后手动上传。
- **不变边界**：商业入口仍只读签名 runtime；CreatorOS 不接收反馈数据、不自动上传日志，
  Growth/AM 长期权威不变。
- **下游重派生**：`IssueFeedbackDialog` 文案、按钮状态、fallback URL 与组件测试已重派生；
  `open-url` 可信桌面适配器继续复用。
- **外部入口验证**：已创建独立的飞书 Form View 并开启匿名链接，应用只打开
  `https://my.feishu.cn/share/base/form/...`；用无登录态浏览器验证可填写，且不会暴露
  Base 底表或其他用户的反馈记录。表单保留日志附件字段，内部“处理状态”不对填写者展示。

## CI-TSL-001 — T-076-CREATOR 权益领取与纯文字反馈上线增量（DEC-TSL-001，2026-07-27）

- **产品边界变更**：P-04/NFR-PRIVACY 从“应用内发送固定禁用”改为“只有用户明确确认后，可向
  Growth 官方收件服务提交用户已预览的纯文字并回显真实编号”。contract 必填的非敏感应用版本、
  系统名称和语言必须在高级诊断可见并纳入本次确认；日志、附件、截图、激活码、token、手机号、
  机器标识及其他用户内容仍禁止自动上传。
- **上游不变**：Growth 继续拥有渠道、商业关系、反馈正文与优先级；AM 继续拥有
  license/entitlement/claim 与签名；Creator 只做终端交互和可信消费。
- **受影响工件**：
  - `docs/产品定位.md` → 已重派生；
  - DEC-FDB-003 → 保留为服务不可用/安全门关闭时的手动降级，不再是永久唯一流程；
  - T-538 feedback adapter/UI → 由 T-575 承接收口，不能并行修改同一路径；
  - T-534 runtime、parser、cache 与双入口语义 → 不失效，只需回归；
  - Growth T-076/AM claim exact contract → AM consume 已 Round 2 PASS，最终 descriptor/vector
    已逐字复制并完成 SHA pin；Growth API-210..212 Round 2 也已 PASS（receipt
    `3bb73429a8e3`），0028 migration、API-210..212、durable delivery/readiness 本地 BUILD
    全绿。HARD-575-001 仅保留 live HTTPS 三仓 E2E、部署、正式密钥与 release receipt。
- **发布影响**：当前 0.2.0 已发布主功能不变；两项新能力默认关闭。本任务不 commit、push、
  deploy 或重新发布，整体 GO 后再由用户决定。
- **安全输入边界**：浏览器不接收 claimToken。Creator 生成 device session，user code 只用于
  Growth 登录态 ownership+reauth 批准；device secret/verifier 只在内存或 OS 安全临时区。
  claimToken 从 API-212 approved no-store launch 到达后，唯一允许的短期持久化是首次 AM 出网前
  的独立 OS 原生凭据 pending-consume journal；普通文件、数据库、query/fragment、剪贴板、日志、
  crash report、APM 与遥测全部禁止。AM 以同 requestId+同 consume digest exact replay；只有
  `.license` 原子落盘并读后验真才删 journal，长期只保存正式授权事实与既有 code。
- **恢复影响**：HARD-575-002 的 wire 方案已由 pending journal 收敛，不新增 Growth ack/replay
  API；native 实现与确定性 fault tests 已证明 journal-before-network、prepared/attempted exact
  replay、签名验证、`.license` 原子写入/读回和清理顺序。真实 OS keychain 进程强杀、AM commit
  后丢包及 Windows replace 逐点强杀仍是 release 验证门，不能写成已完成真机矩阵。
- **反馈 readiness 裁决**：DEC-TSL-002 以 `avoid` 关闭 HARD-575-003，不新增 API、表、角色或
  健康平台。能力由当前事务内联证明：AM signed feedback context → Growth API-170 → closed
  `202 publicRef`；任一步失败保留草稿、明确未提交并进入复制文字 + 官方反馈页。历史成功、
  URL、telemetry 或 UI state 不得冒充本次成功。
- **完成红线**：DEC-TSL-002 已授权默认关闭的 Creator BUILD，禁止 Round 4。Growth
  API-210..212 PASS、最终 device-flow fixture 逐字一致、真实 provider/领取 UI、journal
  fault-injection 与跨系统联调未闭环时 capability 不得开启、T-575 不得完成。

---

### How to use this file going forward

1. Any confirmed change to an **approved** upstream artifact (FR/NFR/FLOW/ENT/IA/PAGE/COMP/contract/security/
   release criteria) gets a `CI-###` entry here BEFORE the change is marked done.
2. List the invalidated downstream artifacts explicitly and mark each: re-derived / re-verified / still-stale.
3. `node orchestrator/process/reconcile.mjs` checks that decisions tagged as invalidating have a matching
   `CI-###` entry (see process/README.md).
