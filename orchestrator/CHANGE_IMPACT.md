# Change Impact — CreatorOS

> Required control artifact (rules/orchestrator-state-machine.md §"Required Control Artifacts";
> consistency-gates.md: "Every changed upstream ID has either updated downstream artifacts or an entry in
> `CHANGE_IMPACT.md`"). It was missing until 2026-06-22 (DEC-013) — the invalidating changes below had been
> narrated inside DECISION_LOG entries instead of analyzed here. This file back-fills them and is the home
> for all future impact analyses.

Each entry: the change, which upstream IDs/artifacts it touched, the downstream artifacts it INVALIDATED
(per the Invalidation Rules), and how each was handled (re-derived / re-verified / still-stale).

---

## CI-ONB-637 — 新手引导从技术配置改为创作成果路径（2026-07-31）

- **上游变化**：用户确认自动化不应被感知；引导改为账号、历史项目、定位、对标、选题、项目。
- **失效**：T-161/T-348 中“文本模型配置”“后台初始化自动化”为必经步骤、项目总数代表首个项目的语义失效。
- **重新派生**：引导完成态改读定位中心、内容雷达与项目来源真值；已有作品确认按账号隔离；新号动态跳过历史项目并连续编号。
- **交互影响**：设置页重新打开增加 force-open + 同页事件，完整状态也必须展示；关闭后恢复自动隐藏。
- **契约影响**：无公开服务契约、数据归属或自动化执行架构变化；仅客户端信息架构和读模型组合变化。

## CI-MODEL-610 — clientId 权威从 Activity 归位 Growth registry（2026-07-29）

- **上游变化**：应用/客户端目录唯一归 Growth；Activity ticket/introspection 只证明
  `projectKey/channelRef` 与授权事实，不再向 Creator 提供权威 `clientId`。
- **失效**：T-606/旧 T-575 中 Creator 向 Activity 请求自报 `clientId`、以及把该自报值视为
  授权 claim 的描述失效；早期 T-606 review receipt 不再代表当前契约。
- **重新派生**：Creator 只声明接受的 extension/protocol；Growth registry 解析并签入最终
  `clientId`。Creator 兼容忽略旧 ticket 响应 `clientId`，继续验 Growth-signed
  `creatoros.desktop`，并以 `projectKey + channelRef + clientId` 隔离版本/ETag 序列。
- **下游验证**：config.pull 请求/parser、locator cache、31/50/24/11/17 反例、验证报告均更新。
- **发布影响**：正式 Growth/Activity 字段契约、三端同环境联调和整改后独立复审前保持
  release `NO-GO`。

## CI-MODEL-606 — 渠道完整模型 JSON 成为 CreatorOS 条件权威（2026-07-29）

- **上游变化**：Growth T-086 最终契约允许 exact CreatorOS extension 携带长期 Key 和任意
  JSON object；verified configured 必须由 CreatorOS 自动采用。
- **失效**：T-575 的安全三键 parser、长期 Key 禁止、24 小时远端 LKG；T-604 的 Gateway、
  短 bearer、alias routing、`managed_locked` 和远端 LKG 优先全部失效。
- **重新派生**：既有 `config.pull` envelope/验签/locator 保留；extension 改为独立加密 secret
  namespace 和 `channel/local` 唯一裁决；所有模型 resolver 通过同一 authority 边界。
- **UI 影响**：设置页增加脱敏当前来源状态，本地配置始终可编辑；API/UI 不返回渠道 JSON。
- **发布影响**：CreatorOS 分支验证不能替代 Growth/Activity 跨仓联调、生产密钥和用户发布许可。

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

## CI-TSB-002 — Activity 最小运行快照与 Growth 业务解释权（DEC-BOUNDARY-002，2026-07-29）

- **变更**：明确 Activity 的 `projectKey/channelRef` 只是授权范围快照，不是渠道、应用或模型
  业务目录；Growth 是唯一业务解释方，CreatorOS 只消费两边签名结果。
- **兼容**：不删除现有激活码、project/channel 字段或本机 license；用户无需重激活。
- **下游重派生**：
  - T-606 authority contract → 增加 §1.1 与 TC-T617-11..13；
  - Activity v1/额外 client/application 字段 → 明确 fail-closed，不再“兼容忽略”；
  - AI 日志、raw error 与异步任务 modelKey → 必须统一脱敏为 `channel-managed`。
- **发布影响**：不新增 wire 或 migration；Growth/Activity live HTTPS E2E、正式 key 和用户
  发布许可仍未完成，不能把单仓测试写成已上线。

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
- **2026-07-29 产品配置增量**：新增 Activity `config.pull` ticket → Growth signed opaque
  bundle → Creator 产品 parser/LKG。T-534 `channel-runtime-v2` 不失效，Growth bundle
  `channelConfig` 不成为第二套 runtime；只增加 server-only `modelPolicy` 安全投影。
- **配置/缓存影响**：增加默认关闭的 client-config build inputs 与
  `.client-config-lkg` AES-GCM 缓存；旧 `.license`、用户内容、BYOK secret 和已发布主功能不
  迁移、不清空。live HTTPS E2E 或公钥/keyId 缺失时保持关闭。
- **2026-07-29 Growth 单运行时路径适配**：上游提交 `a74b92e` 已将真实 API-216 transport
  从 `/api/v2/client-config/bundles/current` 收敛为
  `/api/client-config/bundles/current`。Creator 只同步固定 path 与测试；授权、签名、缓存、
  fail-closed 和 capability 默认关闭边界均不变。
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

## CI-CR-017 — 内容雷达人工上传逐字稿增量（T-603，2026-07-29）

- **变更**：在既有“手动转写”旁增加人工上传 `.txt/.md/.srt/.vtt`，上传成功后写入同一
  `ItemTranscript` 并沿用现有逐字稿拆解、选题候选和 Project 来源证据链。
- **数据归属不变**：`backend/src/modules/intelligence` 仍是唯一写者；不新增表、文件资产、
  对象存储或 worker 任务，浏览器只把规范化文本交给 typed operation。
- **不可变边界**：只允许尚未完成且无活动转写的作品写入；已有 `done` 或
  `queued/running` 不被覆盖。相同已完成正文的重试只读回既有资源。
- **受影响工件**：
  - `FR-CR-022/FLOW-CR-010/AC-CR-025` → 新增并待独立增量评审；
  - 内容雷达服务契约 → 新增 `API-CR-032`；
  - `contract/src/operations/intelligence.ts`、intelligence transport/service、内容雷达详情页
    与测试 → 待 BUILD 重派生；
  - 既有 `FR-CR-007` ASR 持久队列、`FR-CR-012/013` 选题与 Project 证据门不失效，只需回归。
- **发布影响**：不改数据库 schema，不迁移历史数据；当前版本不受影响。T-603 完成前不得显示
  无接线的上传按钮。

## CI-CR-018 — 内容雷达逐字稿纠错与选题后锁定增量（T-622，2026-07-29）

- **变更**：逐字稿由“完成后永不覆盖”调整为“首个成功选题候选前可纠错、候选产生后永久
  锁定”；录入统一支持粘贴正文与文件导入，未锁定时允许替换或重新转写。
- **上游失效**：`DEC-CR-017` 第 3 点及 `CI-CR-017` 的“已有 done 不被覆盖”边界已被
  `DEC-CR-018` 定向替代；其余文件格式、正文上限、唯一写者和不保存原文件规则继续有效。
- **旧版本语义失效**：既有 `FR-CR-012/013`、`NFR-CR-008`、`API-CR-020/022` 与
  `AC-CR-010` 中的 `transcriptVersionId`、重新转写新增版本和逐字稿版本表假设全部失效；
  统一重派生为成功候选 `outputSnapshot.transcriptHash` + transform/source snapshot 锚。
- **数据归属不变**：继续复用当前作品唯一 `ItemTranscript`，不新增版本表、历史资产或第二
  套逐字稿真相；backend intelligence service 仍是唯一写者。
- **待重派生工件**：
  - 内容雷达服务契约中的人工上传、重新转写与选题候选状态机 → 待补充替换条件、永久锁和
    `transcriptHash` 并发校验；
  - `contract/src/operations/intelligence.ts`、backend intelligence service、worker 回写路径
    与测试 → 待 BUILD；
  - 内容雷达详情页 → 待增加粘贴/导入共用编辑框、替换、重新转写、生成前确认和锁定态。
- **发布影响**：不改数据库 schema，不迁移历史数据；在契约与 backend 锁定检查完成前，不得
  只开放前端覆盖按钮。

## CI-POS-019 — 定位母版重建与复盘 Copilot 单入口（T-623，2026-07-29）

- **变更**：定位中心“新建定位母版”从只清空前端草稿升级为真实
  `positioning.master.reset`；复盘页“帮我复盘”从全局深链改为既有项目编导右栏预填。
- **数据影响**：`creator_profiles` 增加 `statement_version_floor`，存量默认 0；重置时清空
  profile 可变字段并记录当前最大版本。`positioning_statements` 不更新、不删除，历史完整保留。
- **读取重派生**：当前定位与未指定 statement 的定位 Gate 只读取版本号大于 floor 的陈述；
  历史列表继续读取全部版本。定位 AI 与其他 creative-context 消费面经同一
  `getPositioningCenter` 自动得到空母版，不需要各下游单独过滤。
- **交互重派生**：定位编辑 Dialog 禁止外部点击关闭；项目 layout 统一挂载
  `DraftChatRequestProvider`，复盘三个入口只发送 `review.analyze` 预填请求，不自动发送、
  不覆盖用户正在输入的文字、不打开第二个 Copilot。
- **兼容与限制**：旧版本号继续递增；AI 仍只产候选，用户采纳后经既有 backend service 落库；
  小屏继续遵守阶段右栏现有 `xl+` 显示约束，不回退全局弹窗。
- **验证**：contract 全量、positioning service/contract/repository、定位与复盘前端定向、
  Copilot embed 预填、三包 typecheck、boundary 与 reconcile。

## CI-RCN-020 — 历史作品重建依赖与短窗口侧栏修复（T-638，2026-07-31）

- **变更**：导入作品只先排逐字稿；已有真稿或真稿刚绑定时才排 `reconstruct.project`，同因批量
  失败通知跨轮聚合；低高度侧栏固定保留账号与用户身份。
- **数据影响**：无 schema、迁移或归属变化；沿用 `output_script` 当前版本中的 transcript/source
  判真稿，`source=image-album` 明确不参与重建。
- **执行影响**：`transcribe-runner` 新增可选后续端口，由 composition root 通过既有
  `ai.tasks.create` 排重建；幂等和任务终态继续由现有 ai service 管理。
- **前端影响**：Copilot 通知增加重建失败语义聚合与数量；侧栏采用 `dvh`、导航内部滚动、底部
  身份区不收缩，短高度隐藏次要提示卡。
- **失效工件**：旧 `reconstruct-enqueue` 中“同轮同时排两个任务、靠以后轮次碰巧成功”的注释
  与测试已重派生；其余自动化、模型配置和数据源契约不变。

## CI-ASR-021 — 历史逐字稿渐进回填与小米 MiMo ASR（T-639，2026-07-31）

- **产品变化**：公开历史作品与指标继续全量采集，但统一采集尾部每轮最多只补 5 条缺失逐字稿；
  手动单条转写不受限制。未配置 ASR 时后台不创建注定失败的任务。
- **模型配置变化**：`transcribe.audio` 从隐式本地 Whisper 兜底改为云端 ASR 必配；普通设置路径
  只见供应商预设、模型名和 Key，provider/baseUrl 收进高级设置。旧显式 `whisper-local` 与已有
  SiliconFlow/OpenAI/Groq 配置保留兼容，不迁移、不覆盖。
- **执行变化**：新增 `xiaomi-mimo` adapter，走官方 `chat/completions + input_audio`；现有 OpenAI
  multipart adapter 不改。超过 MiMo 单次 base64 上限的 MP3 按帧安全切片并顺序合并，不增加
  用户视频大小限制。
- **数据与契约影响**：无 schema、迁移或公开 operation 变化；仍由既有 backend service port
  写逐字稿，AI worker 不直接写库；仍复用唯一统一采集任务，不新建调度器。
- **失效工件**：T-160 中“未配置就自动下载并运行本地 Whisper”的默认产品语义被本决策替代；
  adapter 代码仅作旧显式配置兼容。旧研究和历史 SPEC 保留原貌，由 T-639 作为当前增量真相。

---

### How to use this file going forward

1. Any confirmed change to an **approved** upstream artifact (FR/NFR/FLOW/ENT/IA/PAGE/COMP/contract/security/
   release criteria) gets a `CI-###` entry here BEFORE the change is marked done.
2. List the invalidated downstream artifacts explicitly and mark each: re-derived / re-verified / still-stale.
3. `node orchestrator/process/reconcile.mjs` checks that decisions tagged as invalidating have a matching
   `CI-###` entry (see process/README.md).
