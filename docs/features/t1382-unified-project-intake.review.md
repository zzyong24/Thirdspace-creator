# 结论：PASS_WITH_CHANGES

方案已明确现有项目保全、事务幂等、纯组、候选采纳和执行边界，未发现证据充分的阻塞；建议补齐实际消费者清单、来源合同说明及针对性验收用例。

## 1. 结论说明

阻塞数：**0**。本次为首次独立静态评审，评审者未参与本 SPEC 编写。以下建议均是已确认范围的具体落点，不新增产品能力、不要求恢复已放弃的兼容层，也不把未来实现尚未存在判成设计缺陷。

按用户指定格式给出 `PASS_WITH_CHANGES`。未运行 `reviewctl`，本文件不是机器生成的 Gate PASS 或 hash receipt，不代表已经 START、实施或验收通过。

## 2. 评审范围与已读文件

评审对象为 `docs/features/t1382-unified-project-intake.md` v2 全文。采用用户于 2026-10-20 22:26（北京时间）确认的方向、Q-01..Q-12 默认值及简化兼容性的取舍；重点核查当前正确性、数据保全、幂等、`accountId=null`、迁移、AI 候选采纳、真实操作、前后端边界和 LED-047/LED-053。

已读流程与约束：

- `BACKLOG.md` 顶部、`PROJECT.md`、`PROJECT_CONTEXT.md`、`AGENTS.md`。
- `~/.codex/skills/product-to-code-orchestrator/SKILL.md`、`VERSION`、`prompts/stage-router.md`、`prompts/spec-reviewer.md`、`prompts/spec-reviewer.schema.json`。
- `orchestrator/process/.skill-version`、`orchestrator/ARTIFACT_MANIFEST.yaml` 阶段信息、`orchestrator/SYSTEM_ARCHITECTURE.md`。
- `docs/features/t1332-group-radar-topic-upgrade.review.md`、`docs/features/t1022-account-group-workspace/UI_RULES.md`、`docs/engineering/timeout-policy.md`。

已读实现包括下表及建议中引用的文件，覆盖：

- contract 的 projects、intelligence、assistant-system、endpoints 与内部执行协议。
- backend 的 projects schema、intelligence schema、0050 迁移、数据库与迁移登记；项目创建、来源引用、candidate promotion、ingestion、迁组、旧雷达队列与建项服务。
- persistent task、模型身份与原调用恢复、转写恢复与派生工作流、topic preview、generation bridge、chat 候选工具；worker 生成入口与回写端口。
- 前端快速创作、手动新建、雷达升级、选题、项目页、准备面板、来源透传、候选采纳；另核正式脚本读取与写入目标、新手引导、内容日历消费者。

阶段结论：本任务仍为 PLAN 的 SPEC 评审，整体 manifest 的 `4-build` 不替代本任务前置条件。技能为 3.30.0，项目副本为 3.29.0；遵守本次单文件限制，没有升级、登记看板或运行流程命令，不以这些本次被禁止的操作缺席作为阻塞。

所有证据均为源码静态核对；没有运行测试、构建、迁移、数据库、产品接口、模型或网络。主评审与并行核查均只读，只有本 review 文件由主评审新建。

## 3. 事实核对表

“一致”表示现状陈述或新增标注与源码一致，不代表拟建功能已经可运行。

| SPEC 陈述 | 代码位置 | 一致/不一致/无法核实 |
|---|---|---|
| §2：雷达先转写、策略 preview，最后建项目；父任务是 item/continuous | `backend/src/modules/intelligence/radar-project-queue.service.ts:45`、`:108`、`:122`、`:146` | 一致 |
| §2：candidate promote 未传 `source:'topic'`，建项、更新候选、写 promotion 不在同一事务 | `backend/src/modules/candidate/candidate.service.ts:701`、`:708`、`:714` | 一致 |
| §2：带素材的快速创作在前端读取正文并截取 60000 字 | `frontend/src/features/projects/project-creation.ts:124` 至 `:135` | 一致 |
| §2、§4：快速创作与手动新建共用创建会话，已有 output 部分失败恢复和 scope 保护 | `frontend/src/features/projects/quick-create-work.tsx:29`；`frontend/src/components/overlays/new-project-dialog.tsx:179`；`frontend/src/features/projects/project-creation.ts:46`、`:85` | 一致 |
| §2、§5：模型 `project.create` 排除 source/platformRef，由宿主采纳后创建 | `contract/src/resources/assistant-system.ts:76`；`contract/src/assistant-system.test.ts:11`；`backend/src/application/chat/assistant-system-root.ts:150` | 一致 |
| §2：采集优先复用 publication canonical 项目，合并时保留原 source | `backend/src/modules/ingestion/ingestion.service.ts:788` 至 `:845`；`backend/src/modules/projects/projects.service.ts:1302` 至 `:1343` | 一致 |
| §2：新 imported 项目进入 review、进度 100，竞争后回读 canonical owner | `backend/src/modules/projects/projects.service.ts:1052`、`:1175`；`backend/src/modules/ingestion/ingestion.service.ts:880` 至 `:919` | 一致 |
| §2：旧 confirmed 引用要求 topic/item/snapshot/transform/transcriptHash，唯一索引为项目、item、snapshot | `backend/src/schema/intelligence.ts:307` 至 `:324`；`backend/drizzle/0050_content_intelligence.sql:287` 至 `:301` | 一致 |
| §2：confirmed attach 要求确认关系及已完成逐字稿，读取重核 hash | `backend/src/modules/intelligence/project-reference.service.ts:166` 至 `:210`、`:366` 至 `:384` | 一致 |
| §2：普通建项目已有项目、阶段、平台关系、activity 的原子创建入口 | `backend/src/modules/projects/projects.repository.ts:409` 至 `:420`；`backend/src/modules/projects/projects.service.ts:1128` | 一致 |
| §2：来源读侧只透传 topic/imported，其他值转 manual；类型仍为三值 | `frontend/src/features/draft-workbench/draft-workbench-data.ts:677`；`frontend/src/types/domain.ts:127`；`frontend/src/features/project-overview/project-overview-workspace-data.ts:57` | 一致 |
| §2：准备面板从 evidence、抖音锚及本地状态推断；radar 转写被判 done | `frontend/src/features/draft-workbench/draft-workbench-page.tsx:51`；`frontend/src/features/draft-workbench/project-pipeline-panel.tsx:48`、`:80`、`:110` | 一致 |
| §2、§4：`from=topic` 导航、透传和 sessionStorage 自动 brief.fill 链确实存在 | `frontend/src/features/topics/topics-interactive-region.tsx:1043`；`frontend/src/app/(creator)/projects/[projectId]/page.tsx:35`；`frontend/src/features/draft-workbench/draft-workbench-page.tsx:134`；`frontend/src/features/draft-workbench/project-pipeline-panel.tsx:99` | 一致 |
| §2：一句话起选题仍调用 topic.enrich，并有补全选题卡死提示 | `frontend/src/features/topics/topics-interactive-region.tsx:1203`、`:1259`；`backend/src/modules/ai-runtime/chat-tools.ts:3452` | 一致；工具实际产选题卡候选，Q-08 保留方案起草可成立 |
| §2：雷达升级 UI 仍展示转写、拆解、创建三步与取消 | `frontend/src/features/intelligence/radar-upgrade-action.tsx:12`、`:69`、`:94` | 一致 |
| §2：项目转写要求真实抖音 platformRef，可能初始化主稿并触发 reconstruct | `backend/src/modules/projects/project-transcription-target.service.ts:14`；`backend/src/modules/projects/transcript-artifact.service.ts:39`、`:58`；`backend/src/modules/execution/execution-transcribe-workflow.service.ts:75`；`frontend/src/server/persistence-client.ts:6506` | 一致；SPEC 已承认并计划关闭新准备路径的副作用 |
| §2：旧 startTopicPreview 依赖真实 item、当前 snapshot、完成的逐字稿及策略定位 | `backend/src/modules/intelligence/intelligence.service.ts:4482`、`:4524`、`:4531`、`:4550`、`:4575` | 一致 |
| §2：modelRouteParent 和等待恢复存在父 kind/owner 白名单，路由继承不等于完整预算继承 | `backend/src/modules/execution/persistent-task.service.ts:439`、`:450`、`:462`、`:983` 至 `:986` | 一致 |
| §2：公开持久任务读取按 owner 经 list 分页找原 ID，不能直接认定旧 GET 可用 | `frontend/src/features/intelligence/intelligence-workbench-api.ts:19` 至 `:27` | 一致 |
| §5：ensure/preparation 为拟新增合同；endpoints 已展开 operation 集合 | `contract/src/operations/projects.ts:45`；`backend/src/modules/projects/projects.transport.ts:250`；`contract/src/endpoints.ts:60`、`:77` | 一致；新增合同已标“新”，未冒称现有能力 |
| §6：projects.source 是 text，无需数据库 enum 改型 | `backend/src/schema/projects.ts:34` | 一致 |
| §6：新表放 projects schema 可复用数据库注册；仍需补显式导出 | `backend/src/db.ts:18`、`:104`；`backend/src/modules/projects/projects.db-schema.ts:7`；`backend/src/index.ts:59` | 一致；两张表及四个新服务文件均标为新增计划 |
| §6：PostgreSQL/PGlite 共用迁移目录，新增迁移需同步 journal 与 convergence | `backend/src/db.ts:80`、`:213`、`:338`；`backend/src/migration-convergence.ts:41`、`:51`、`:61` | 一致；真实迁移结果无法核实，本轮禁止执行 |
| §6：来源删除、迁组需增加 raw 引用保护 | `backend/src/modules/intelligence/intelligence.service.ts:3059` 至 `:3125`；`backend/src/modules/platform-account/group-migration.service.ts:64`、`:129` | 一致；当前主要识别旧 confirmed，SPEC 已列新增适配 |
| §7：brief.fill 只产候选，worker 经 backend port 保存生成结果 | `backend/src/modules/ai-runtime/chat-tools.ts:4381`、`:4401`；`frontend/src/features/copilot/chat-brief-card.tsx:61`；`ai-worker/src/execution/intelligence-generation-worker.ts:50`、`:59`；`backend/src/modules/intelligence/intelligence-generation-bridge.ts:102` | 一致；新准备采纳合同尚待实现 |
| §7：无 item 的 project-owner preview 不能直接套旧来源 schema | `ai-worker/src/execution/intelligence-generation-worker.ts:17`；`backend/src/modules/intelligence/intelligence-generation-bridge.ts:49` | 一致；现 schema 要 item/platform/canonicalUrl，SPEC 明确要求新增联合 |
| §7：旧手工恢复会设置 continuous/null deadline，不能直接用于新有限父任务 | `backend/src/modules/intelligence/transcript-source-recovery.service.ts:31` | 一致；SPEC 已要求保留原期限 |
| §8：旧雷达 ID 有账号/纯组两条派生路径，新公式不能重算既有项目 ID | `backend/src/modules/projects/radar-project.service.ts:36` 至 `:42` | 一致 |
| §9：给出合计 73 个实现文件的影响清单，并要求补齐独评发现的必改消费者 | 正式稿读写、Codex 恢复、onboarding、content-calendar 的具体遗漏见 N-1、N-2、N-5 | 不一致（影响范围盘点）：73 是当前所列计数，尚非完整实施库存；§9 已允许补齐，非结果约束缺失 |
| §11：LED-047/LED-053、迁移和公共链验收均为待执行计划 | `docs/features/t1382-unified-project-intake.md:445` 至 `:491`；对应消费者与既有约束已静态核对 | 一致于“未执行”的声明；功能、性能、迁移成功均无法据此核实 |

## 4. 阻塞问题

无。

未将“没有旧二进制兼容”“旧父任务不再续跑”“不回填历史来源”“尚未运行新功能测试”列为阻塞。现有代码尚无拟新增能力，也不能单独证明 SPEC 不可实现。

## 5. 非阻塞建议

以下按重要性排序，稳定 finding ID 为 REV-001 至 REV-006，严重度均为 minor。建议在实施前按 SPEC 第 9 节末尾约定同步具体写集及测试，避免执行者只照 73 文件清单遗漏真实消费者。

### N-1 / REV-001：补齐来源工件与正式稿隔离的读写消费者

**问题与证据：** SPEC `:247` 已明确新 `purpose='project_preparation_source'` 工件不能成为正式稿，但实施清单遗漏下列实际入口：

- `backend/src/application/context/confirmed-project-script.ts:22` 只按类型、currentVersionId 和非 reserved 选稿，`:29` 读取版本后未排除来源 purpose。
- `backend/src/application/context/current-artifact.ts:49` 按 artifactType 选择首个工件。
- `backend/src/application/project-script-source.ts:20` 的精确版本读取只校验归属与类型，`:31` 的默认读取将结果标为“已保存的主脚本”。
- `backend/src/modules/artifacts/script-draft-target.service.ts:18` 按类型与 output 关联复用写稿目标，没有来源 purpose 区分。

**影响：** 若只改转写写入与前端面板，来源逐字稿仍可能被下游当正式稿消费，或被复用为正式稿写入目标。关联 FR-1382-04、AC-1382-05。

**最小建议：** 补列这些消费者或实际承接它们的共享领域端口、相应测试和文件计数。覆盖“仅有准备来源时正式稿仍空”“用户主动保存的空稿不回灌”“精确版本引用不能绕过来源区分”“采纳写正式稿且来源工件不变”。保留显式来源读取能力，不靠全局隐藏工件解决。

**非阻塞理由：** SPEC 已明确规定排除结果，问题在实施盘点不完整，不是允许自动入稿。

```mermaid
flowchart LR
  A[准备转写] --> B[来源工件]
  B --> C[来源读取与生成]
  C --> D[AI候选]
  D --> E[用户采纳]
  E --> F[正式稿读写]
```

### N-2 / REV-002：补列 project-owner preview 的 Codex 原调用恢复

**问题与证据：** `backend/src/modules/execution/codex-read-recovery.ts:21` 只认可 `topic_preview + transform`；新 project owner 会在 `:22` 被拒。`backend/src/modules/execution/model-call-recovery.ts:102` 用它选择可只读恢复的原调用；`persistent-task.service.ts:661` 用于 resume，`:1121` 至 `:1126` 用于未知结果恢复。该 helper 及测试未列入 §9/§11。

**影响：** 若不适配，新 project-owner 任务即使保存了真实 thread/turn，也可能一直留在 `unknown_result`，不能通过已有原调用核对链恢复。关联 FR-1382-03、FR-1382-07、AC-1382-04。

**最小建议：** 补列 `codex-read-recovery.ts`、`codex-read-recovery.test.ts`，把真实 task/owner、冻结模型身份、thread/turn 的读取恢复接入新来源联合。验收同一原调用可读回、异项目/异 scope 拒绝、零新增模型提交，并保留原期限。

**非阻塞理由：** §7.3 已要求未知结果先核原账本；这是已承诺恢复路径的具体适配点，不要求保留旧升级执行器。

### N-3 / REV-003：直接覆盖纯组快速创作的来源预读

**问题与证据：** `frontend/src/app/(creator)/projects/create/page.tsx:13` 把账号平台读取和全部 sourceItemId 读取放在 `session?.ctx.accountId` 条件内。纯组 `accountId=null` 时，`:19` 的来源读取与失败提示均不会执行。

**影响：** 沿用此条件会把纯组带素材快速创作变成无来源创作。关联 FR-1382-05、FR-1382-06、AC-1382-01、AC-1382-06。

**最小建议：** 在已列该页面的变更说明及入口用例中，明确来源按合法 workspace 读取，账号平台信息另按真实账号可用性读取；直接验证纯组＋sourceItemId 的成功与拒绝路径，不以雷达按钮的纯组用例代替。

**非阻塞理由：** §4.1 已禁止静默吞来源，且该文件已列为修改；这是现有条件的具体纠正提示。

### N-4 / REV-004：明确公开 projects.create 的来源白名单

**问题与证据：** SPEC `:148` 要求 imported/assistant 经可信内部适配器，`:150` 又保留 create 已允许的 source/platformRef。当前 `contract/src/operations/projects.ts:62` 直接引用 `projectSource`，扩大资源枚举会自然扩大 create 入参；`projects.transport.ts:258` 直接透传，`projects.service.ts:1052` 根据 imported 切换 review 阶段。

**影响：** 仅扩共享枚举，容易使调用者自报的来源与“入口事实由可信宿主确定”混淆；已有 imported 行为也需要与“声明来源不授予已发布事实”的新约束对齐。关联 FR-1382-02、FR-1382-06、FR-1382-07、AC-1382-02。

**最小建议：** 写清公开 create 实际接受的来源集合及其权限语义，说明 assistant/radar 等入口事实如何由服务端验证或赋值；增加直接 public create 的负项，不只验证 assistant 模型输入 omit 两字段。无需增加新的身份系统或攻击者模型。

**非阻塞理由：** “已允许”可解释为原三值，SPEC 也已要求真实来源校验；当前是合同歧义澄清建议，未证明新实现必然存在越权。

### N-5 / REV-005：补两处六值来源消费者

**问题与证据：** `frontend/src/features/onboarding/onboarding-data.ts:89` 的 `hasCreatedProject` 只承认 manual/topic；`backend/src/modules/content-calendar/content-calendar.service.ts:132` 的 `ScheduleProject.source` 仍是三值窄类型，配对的 `projects.service.ts:1747` 已在计划中。前两文件未列 §9。

**影响：** 新 radar/assistant/quick_create 项目可能不被新手引导计为已建项目；内容日历端口仍保留不完整来源类型。关联 FR-1382-02、AC-1382-02。

**最小建议：** 补入写集和计数，来源类型使用同一合同定义；引导按真实“已创建”业务含义处理新增入口，保持 imported 的既有区别，并补对应信号用例。

**非阻塞理由：** 六值正确透传已经是验收要求，未新增产品范围。

### N-6 / REV-006：把旧项目已提交但父回执未写的窗口列为保全用例

**问题与证据：** `backend/src/modules/projects/radar-project.service.ts:49` 至 `:58` 在事务内创建项目并返回；`radar-project-queue.service.ts:146` 调用后，直到 `:167` 才单独保存 checkpoint.projectId。存在项目已提交、父 checkpoint 尚无 projectId 的崩溃窗口。

**影响：** 若迁移后只通过旧 checkpoint.projectId 判断“是否已有项目”，重新点击会漏认已存在项目并多建。关联 FR-1382-02、FR-1382-05、AC-1382-06、AC-1382-08。

**最小建议：** 在已规划的迁移/真实关联复用测试中加入此窗口，明确用可核实的旧任务身份或项目来源事实找回原项目，返回原 ID；不能把“父无 projectId”直接当成“项目不存在”。不要求保留旧 tick、旧双协议或新项目使用旧 ID 公式。

**非阻塞理由：** §6.2、§8.1 已要求优先复用真实既有项目；这里补充当前代码确实存在的验收输入，不改变已确认简化取舍。

## 6. 对已确认简化取舍的风险提示

以下只作提示，不作为阻塞或额外确认要求：

- 一次性结束旧 radar 父任务后，用户需要重新点击；未知供应商调用仍可能暂时待核对。保留账本不等于已经知道调用结果，也不代表可以重发。
- 历史 source 不回填，部分旧雷达项目仍显示 manual；无 preparation 的旧项目显示“未登记准备流程”。这些是已接受的展示取舍，不应补造成功步骤。
- 不支持旧二进制混跑和兼容回滚，交付需成套更新 contract/backend/worker/UI；失败按新版本修正迁移，保留原库，不能删表或交回旧执行器写入。
- 先建项目后准备，模型未配置、定位待补、转写失败时会留下可编辑但尚未准备好的项目。这符合目标，应如实提供恢复入口并保留手写/保存。
- 原 confirmed 引用不变能减少迁移面；新增 raw 引用仍须执行 SPEC 已列的来源删除保全、迁组权限和快照一致性检查。本次没有运行证据证明这些检查已通过。

## 7. 评审元数据

- 评审者：**独立 Codex 会话**，未参与本 SPEC 编写；同源并行只读核查，不冒称跨模型评审。
- 时间：**2026-10-20 22:47:08，北京时间（UTC+08:00，元数据采样时间）**。
- 评审类型：initial，首轮。
- SPEC：`docs/features/t1382-unified-project-intake.md`，v2。
- SPEC SHA-256：`2732ec3d252ce7b73896b1715175a348db1c0a93acf84723809f8dc180d37380`。
- 架构约束 SHA-256：`eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df`。
- 哈希命令：`shasum -a 256 docs/features/t1382-unified-project-intake.md orchestrator/SYSTEM_ARCHITECTURE.md`，已实际执行。
- 结论：PASS_WITH_CHANGES；阻塞 0；非阻塞建议 6。
- 写入范围：仅新建本文件；未修改 SPEC、代码、看板或流程状态，未执行 Git 写操作。

按 reviewer schema 保留结构化 findings 如下；此记录未送入 reviewctl，未产生机器裁决或审计回执。

```json
{
  "schema": "spec-review-round/v2",
  "review_kind": "initial",
  "summary": "静态核查未发现证据充分的阻塞；按用户格式给出 PASS_WITH_CHANGES。六项 minor 补充既有约束的实施落点，不新增兼容要求。",
  "findings": [
    {
      "id": "REV-001",
      "status": "open",
      "severity": "minor",
      "category": "completeness",
      "requirement_anchor": {"id": "FR-1382-04", "quote": "AI 拆解、初稿和资料补全只产候选"},
      "acceptance_anchor": {"id": "AC-1382-05", "quote": "未采纳前正式 brief/script 不因新 AI 结果改变"},
      "where": "SPEC §7.2、§9、§11；N-1",
      "failure_mode": "若仅按现有文件清单改写入与面板，准备来源 output_script 仍可能被正式稿读取或复用为写入目标。",
      "evidence_kind": "deterministic-check",
      "evidence_ref": "backend/src/application/context/confirmed-project-script.ts:22; backend/src/application/context/current-artifact.ts:49; backend/src/application/project-script-source.ts:20; backend/src/modules/artifacts/script-draft-target.service.ts:18",
      "risk_class": "confirmed-requirement",
      "disposition": "mitigate",
      "remedy_type": "clarify",
      "scope_effect": "none",
      "origin": "baseline",
      "origin_ref": "首轮全文及实际消费者静态核查",
      "suggestion": "按 N-1 补齐已明确隔离约束对应的实际消费者、文件计数和公共读写用例。",
      "resolution_evidence": "",
      "parent_id": "",
      "threat_model_id": ""
    },
    {
      "id": "REV-002",
      "status": "open",
      "severity": "minor",
      "category": "completeness",
      "requirement_anchor": {"id": "FR-1382-03", "quote": "支持原准备任务恢复"},
      "acceptance_anchor": {"id": "AC-1382-04", "quote": "未知结果不盲重发"},
      "where": "SPEC §7.3、§9、§11；N-2",
      "failure_mode": "若漏改 Codex 原调用恢复判别，新 project-owner preview 的真实原 thread/turn 不会被识别为可只读恢复。",
      "evidence_kind": "deterministic-check",
      "evidence_ref": "backend/src/modules/execution/codex-read-recovery.ts:21; backend/src/modules/execution/model-call-recovery.ts:102; backend/src/modules/execution/persistent-task.service.ts:1121",
      "risk_class": "confirmed-requirement",
      "disposition": "mitigate",
      "remedy_type": "clarify",
      "scope_effect": "none",
      "origin": "baseline",
      "origin_ref": "首轮全文及实际消费者静态核查",
      "suggestion": "按 N-2 补入 helper 和测试，验证真实冻结身份下原调用读回且不重新提交。",
      "resolution_evidence": "",
      "parent_id": "",
      "threat_model_id": ""
    },
    {
      "id": "REV-003",
      "status": "open",
      "severity": "minor",
      "category": "testability",
      "requirement_anchor": {"id": "FR-1382-05", "quote": "保留 T-1332 纯组端到端能力"},
      "acceptance_anchor": {"id": "AC-1382-06", "quote": "accountId=null 纯组完整公共链通过"},
      "where": "SPEC §4.1、§9.1、§11；N-3",
      "failure_mode": "保留快速创作页面的 accountId 前置条件会让纯组 sourceItemId 未被读取且无来源错误提示。",
      "evidence_kind": "deterministic-check",
      "evidence_ref": "frontend/src/app/(creator)/projects/create/page.tsx:13",
      "risk_class": "confirmed-requirement",
      "disposition": "mitigate",
      "remedy_type": "clarify",
      "scope_effect": "none",
      "origin": "baseline",
      "origin_ref": "首轮全文及实际消费者静态核查",
      "suggestion": "按 N-3 明确 workspace 来源读取，并增加纯组带 sourceItemId 的直接入口用例。",
      "resolution_evidence": "",
      "parent_id": "",
      "threat_model_id": ""
    },
    {
      "id": "REV-004",
      "status": "open",
      "severity": "minor",
      "category": "consistency",
      "requirement_anchor": {"id": "FR-1382-02", "quote": "保存项目、入口来源和原始素材引用"},
      "acceptance_anchor": {"id": "AC-1382-02", "quote": "六来源正确保存/透传"},
      "where": "SPEC §5.1、§5.2；N-4",
      "failure_mode": "若仅扩资源枚举，公开 create 可自报的新来源与可信宿主入口事实容易混淆，原 imported 行为也可能继续直接决定 review 阶段。",
      "evidence_kind": "deterministic-check",
      "evidence_ref": "contract/src/operations/projects.ts:62; backend/src/modules/projects/projects.transport.ts:258; backend/src/modules/projects/projects.service.ts:1052",
      "risk_class": "confirmed-requirement",
      "disposition": "mitigate",
      "remedy_type": "clarify",
      "scope_effect": "none",
      "origin": "baseline",
      "origin_ref": "首轮全文及实际消费者静态核查",
      "suggestion": "按 N-4 写清公开 create 来源白名单、可信赋值和发布事实边界，增加公共操作负项。",
      "resolution_evidence": "",
      "parent_id": "",
      "threat_model_id": ""
    },
    {
      "id": "REV-005",
      "status": "open",
      "severity": "minor",
      "category": "completeness",
      "requirement_anchor": {"id": "FR-1382-02", "quote": "保存项目、入口来源"},
      "acceptance_anchor": {"id": "AC-1382-02", "quote": "六来源正确保存/透传"},
      "where": "SPEC §9；N-5",
      "failure_mode": "新增来源可能不被新手引导视为已建项目，内容日历仍持有三值来源类型。",
      "evidence_kind": "deterministic-check",
      "evidence_ref": "frontend/src/features/onboarding/onboarding-data.ts:89; backend/src/modules/content-calendar/content-calendar.service.ts:132",
      "risk_class": "confirmed-requirement",
      "disposition": "mitigate",
      "remedy_type": "clarify",
      "scope_effect": "none",
      "origin": "baseline",
      "origin_ref": "首轮全文及实际消费者静态核查",
      "suggestion": "按 N-5 补列两个实际消费者及对应来源信号测试，更新文件计数。",
      "resolution_evidence": "",
      "parent_id": "",
      "threat_model_id": ""
    },
    {
      "id": "REV-006",
      "status": "open",
      "severity": "minor",
      "category": "testability",
      "requirement_anchor": {"id": "FR-1382-05", "quote": "保留 T-1332 纯组端到端能力和既有项目数据/ID"},
      "acceptance_anchor": {"id": "AC-1382-06", "quote": "已有项目 ID/数据不变"},
      "where": "SPEC §6.2、§8.1、§11；N-6",
      "failure_mode": "只通过旧父 checkpoint.projectId 查找既有项目，会漏认项目已提交但父回执尚未写入的崩溃窗口。",
      "evidence_kind": "deterministic-check",
      "evidence_ref": "backend/src/modules/projects/radar-project.service.ts:49; backend/src/modules/intelligence/radar-project-queue.service.ts:146; backend/src/modules/intelligence/radar-project-queue.service.ts:167",
      "risk_class": "confirmed-requirement",
      "disposition": "mitigate",
      "remedy_type": "clarify",
      "scope_effect": "none",
      "origin": "baseline",
      "origin_ref": "首轮全文及实际消费者静态核查",
      "suggestion": "按 N-6 将此窗口纳入既有项目保全用例，核实真实关联并返回原 ID，无需保留旧执行器。",
      "resolution_evidence": "",
      "parent_id": "",
      "threat_model_id": ""
    }
  ]
}
```


## 8. 作者处置

依据月明 2026-10-20 23:00（北京时间）「开工：合进 6 条意见出 v2.1，登记 T-1382，实现并跑测试」授权，将 N-1..N-6 / REV-001..REV-006 合入 SPEC v2.1。原评审正文、JSON findings、v2 哈希及 22:47:08 时间均保留；本节为作者修订说明，不把原独评改写为对新哈希的机器回执或功能验收。

| 原意见 | 已合入 SPEC v2.1 的位置 | 具体处置及待执行验证 |
|---|---|---|
| N-1 / REV-001 | §7.2；§9.2 四个读写消费者；§11.1、§11.2 第 14 项；AC-1382-05 | 补默认选稿、创作上下文、精确版本及写稿目标的来源 purpose 隔离；仅来源正式稿仍空、保存空稿不回灌、采纳不改来源，保显式来源读取。新增 current-artifact 测试计划，其余补现有测试。 |
| N-2 / REV-002 | §7.3；§9.2 codex-read-recovery.ts；§11.1、§11.2 第 15 项；AC-1382-04 | 补 project-owner preview 原 task/thread/turn 读取恢复及现有消费者核对；同冻结身份可恢复，异项目/scope 拒绝、0 新模型提交、原期限不变。 |
| N-3 / REV-003 | §4.1；§9.1 projects/create/page.tsx；§11.2 第 16 项与新增 page.test.tsx 计划；AC-1382-01/06 | 来源按合法 workspace 预读，账号平台信息按真实 accountId 单独读取；纯组 sourceItemId 成功/越权/不存在直接覆盖，失败不静默当无来源。 |
| N-4 / REV-004 | §5.1/5.2；§9.2 projects service/transport、§9.3 operation；§11.1、§11.2 第 17 项；AC-1382-02 | 资源六值与公开 create 原三值请求 schema 分离；公开调用拒绝新增三值及伪报 imported；imported 只由真实 ingestion 内部入口，radar/assistant/quick_create 只由对应受控服务赋值，发布事实另核。 |
| N-5 / REV-005 | §5.2；§9.1 onboarding、§9.2 content-calendar；§11.1、§11.2 第 18 项；AC-1382-02 | 新手引导认可五种真实创作入口、保 imported 原区别和真实空态；日历 source 使用统一六值合同并补信号/透传测试。 |
| N-6 / REV-006 | §6.2；§8.1/8.2；§9.2 intake service；§11.2 第 19 项；AC-1382-06/08 | 补已提交项目而父未记 projectId 的查找窗口；旧冻结任务身份仅用于定位已有行，再核项目 scope/item 来源。账号/纯组迁移、重点击及并发返回原 ID、内容不变、零第二项目；冲突不盲新建，不恢复旧 tick。 |

§9 按唯一实现路径校正为前端 23、后端 47、contract 7、迁移 3，共 80 个；比 v2 增列 7 个现有消费者，拟新增 5/拟删除 2 不变。§11 新增测试计划为 7 个文件；本次实际新增/删除测试均为 0，功能测试与类型检查未运行。原两份旧执行器专属测试仅在后续真正删除旧路径时按 SPEC 删除，不提前删测或削弱断言。

本次仅文档与登记；taskctl start 与合法 reviewctl 回执的实际结果以终端、独立生成的任务回执及审计事件为准。原人工评审 PASS_WITH_CHANGES（0 阻塞）与六条作者处置不等于功能测试 PASS，也不代替当前 SPEC 哈希的合法机器回执。


**本轮实际登记结果**：首次 `node orchestrator/process/taskctl.mjs start T-1382` 返回 exit 1，完整错误为 `✗ 任务 T-1382: 审核列值「PASS_WITH_CHANGES」不在 allowlist`，未修改状态。随后由未参与文稿编辑的同模型独立审阅者完整静态复核 v2.1，六条均解决、新增问题 0；真实 `reviewctl record` 使用脚本允许的任务专属 [机器回执](t1382-unified-project-intake.T-1382.review.md) 和 [独立评审输入](t1382-unified-project-intake.T-1382.review-input.json)，不覆盖本文件。原 v2 人工评审没有机器历史，本次为 v2.1 首次机器登记（homogeneous，非跨模型），结果 `PASS[REV:6ea0e716a260]`、0 open、exit 0。再次执行同一 start 命令返回 `✓ T-1382 📋→🔨(event 已记)`、exit 0；审核及状态审计分别追加到 review-events/events，验收仍待验。

**保全核对例外**：开始时已保全工作区基线。本次核对发现 `orchestrator/.lessons-stats.json` 的部分计数/时间在运行期间另有变化（本次观察到 lastFiredAt 为 `2026-10-20T15:02:24.249Z`），来源未核实；本会话没有直接编辑或回退该文件，也没有执行 reconcile，不将它报告为逐字节未变。BACKLOG 原有行、DEC 原有内容、原评审正文及其他受保护原件按基线核对；这项统计差异与本任务独评及 start 成功分开记录。
