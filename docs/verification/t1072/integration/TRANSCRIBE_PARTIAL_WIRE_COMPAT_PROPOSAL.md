# 转写部分结果的兼容回读与完整恢复候选（只调查，未应用）

## 状态与授权边界

源码绑定 `af34bef454d4bab319e75806c068b9f3a7f8bf3f`。本稿补齐主控要求的真实用户闭环调查，未应用生产、Worker、contract、UI 或终态 patch，原 30 个转写场景与其待裁决 expected 不变；完整 170 的最新事实仍为 159 通过、11 失败。研究原 46 + 新观察驱动 18 的 64 通过是另外一套库存，不能抵消这里的 FAIL。

此前本稿“唯一生产文件即可修完”的方向只覆盖聚合，不足验收。以下实际 UI 和恢复缺口使 producer-only 方案不能直接实施。旧 `TRANSCRIBE_CURRENT_SPEC_RECOVERY_PROPOSAL.md` 的“Worker complete enum 新增 partial”也是早期未应用候选，现候选保持原 enum；两份历史意见均不是实施许可。

原正式母规范 R-02 的未知不重提、累计预算/稳定 operationKey/fence，R-03 的真实结果账本，R-05 的部分可用结果保留和未完成说明，以及 AC-07，是此处已有需求依据。当前母文件中的新增 R-03a/R-05a、metadata/usage 和新生成意图 draft 尚未正式批准，本稿不使用它们授权代码。R-05 对已落库逐字稿批次是否精确采用 `partial`，以及下面新增的领域恢复条件，仍需准确规范裁决和独立复核；不能以 schema 已允许某字段代替业务批准。

## 真实操作者与交接

本人账号组/工作区内的创作者已有导入作品、原 `transcribe.douyin` 批次及来源 `awemeIds`。例如原 TR05 两件成功、一件抽音失败；目标是带走两件实际保存稿，并准确知道第三件未完成。下一步在对应作品的 `/projects/:projectId#script` 查看、编辑和保存，再交现有项目脚本/生产流程。用户明确恢复时只继续原任务未完成来源，不新建整批、不改来源/owner/组身份，也不重新调用已完成件的 ASR。

刷新、返回、关闭页面后重开必须从本人原任务和当前稿件读回同一事实。显示“已完成部分”必须同时给出保存件入口、未完成件原因、可执行恢复或明确不能恢复的原因；只有状态可见不算闭环。

## 当前可核查的实现事实

| 环节 | 实际入口/源码 | 已有行为与限制 |
| --- | --- | --- |
| 单件事实 | `execution-transcribe-workflow.service.ts:20–26` | 原 execution payload 的 `transcribeItems[awemeId]` 保存完整 receipt；状态为 `saved/existing/image-album/no-project/failed`，字段 `awemeId/status/projectId/error`。同时持久 steps，人话 text；`toolCalls=[]`，不是模型调用或结构化结果列表。 |
| 原 source/task 绑定 | `transcribe-execution-binding.ts:14–17` | 原 execution kind/ownerType、AI taskType、双向 IDs、同 user/workspace 与冻结 `awemeIds` 深相等，不能用客户端 source/ref 改绑定。 |
| 真稿写入 | `transcript-artifact.service.ts:74–123`、`transcript-artifact.ts` | 同本人 imported project + aweme 查找/加项目写锁/重读来源，存在匹配 `output_script.currentVersion.contentData.awemeId` 则不重复建；用户已有 master_script 不覆盖，派生初始化失败不反转主稿事实。 |
| 已保存回读 | `draft-workbench-data.ts:557–565`、`features/script/script-editor-data.ts:338–378` | 真实项目稿面用 Artifacts 列表、当前版本与正文选择已有 `output_script`，再回退已有正文的 `master_script`；编辑器和版本读回是现有入口。任务通知当前没有逐件项目链接。当前版本可能是用户后来编辑的正文，不能谎称一定等于首次 ASR。 |
| 聚合 | `execution-transcribe-workflow.service.ts:70–82` | 必须每件有 receipt、真实 calls 无 reserved/started/unknown；任何 failed item 就整批 failed，即使另外两件已保存。原完成返回严格 `succeeded/failed`。 |
| 公共任务读 | `ai/execution-task-projection.ts:8–20`、`execution/persistent-task.service.ts:178–188` | `ai.tasks.get/list` 用 AI business ID、本人 workspace 和真实 execution 归属回读；DB partial 已有公共 succeeded + runtimeStatus partial 映射。`execution.tasks.get` 的业务服务只接受 `exec.*`，不能拿它读转写任务。 |
| 公共结果读 | `ai.service.ts:2068–2072`、`contract/src/resources/ai.ts:92–146` | `ai.tasks.results.list` 先 requireTask owner，再列 aiTaskResults；当前转写不写逐件 results。既有 resultType 为 string，resultData 为 catchall record，validation 三字段如出现仍须成组。不能把开放形状当作已批准新业务，也不能伪造候选采纳字段。 |
| 通知/控制 | `features/copilot/ai-copilot-content.tsx:512,2278–2305`、`components/ai/task-runtime-actions.tsx` | partial 通知“已完成部分/已保存实际完成结果”，没有逐件交接；partial 只有刷新，failed 才 retry，waiting_user/paused 才 resume，unknown 只原任务核对/取消。 |
| 实际控制传输 | `execution.transport.ts:114–130` | `execution.tasks.command` 直接调用 PersistentTaskService.command，能控制映射 execution，不借 `exec.*` get guard；原 strict body 仅 taskIds/command/idempotencyKey。 |
| 原控制限制 | `persistent-task.service.ts:247–272,470–573` | retry 仅 failed/blocked 且 attemptAvailable；partial 不可 retry。command 只校验 idempotencyKey 非空，未以该 key 持久化/重放；不能声称命令 ACK 丢失后自动具有持久请求回执。 |
| 稿面错误判定 | `draft-workbench-data.ts:685–755`、`draft-workbench-page.tsx:90` | 先查真实稿，然后按本人前 100 条 task 找同 project 或 source；无稿也将整批 status succeeded 判 done，不读 runtimeStatus/单件结果；done 会隐藏 TranscribeNowButton。producer-only partial 映射会让失败件入口消失。前 100 条和读失败降级 idle 也不能作为服务端防重证明。 |
| 单项目提交 | `ai/project-transcription-submission.ts:16–122` | attempt 16..128；同 user/workspace/attempt 回执精确 project/source/task 重放；同 project 锁和来源重验，已有真稿拒新请求；在途合并仅查询同 projectId、单 awemeIds 的任务。不能覆盖跨 batch 的 unknown/在途任务。 |

## 单项目现有幂等与恢复：哪些成立、哪些不成立

同 `attemptId` 原请求重放会返回原任务，已保存正文、配置后来失效或来源后来清空不产生新任务。不同 attempt 并发、同 project/source 的单件在途任务会复用；旧 task 的 runtimeStatus 为 unknown_result/waiting_user/paused 时也沿原单件回读，不产生第二个单件。现 `project-transcription-submission.test.ts` 有这些真实数据库场景、同请求改项目/跨账号拒绝、事务回滚、磁盘重开原回执和 source 变化反例。

原已明确失败且没有稿的新 attempt 可以建新单件任务，旧 attempt 仍读原任务。**这是一项新任务意图，不是原 execution 的恢复**。inputData 中 `project-transcribe:<project>:<aweme>` 字符串不提供跨 attempt 全局唯一；createTask 实际唯一是 scope/taskType/attempt，并核 requestFingerprint。TranscribeNowButton 每次点击生成新 attempt，不能靠按钮置灰证明收费幂等，也不能声称当前失败后点击一定恢复原收费账本。

跨 batch（projectId 为 null 或多 aweme）在途/unknown 不在上述合并查询范围；相同 source 的新单件可能另建任务，必须以服务端准确 admission 阻断或返回原 task，而非只隐藏按钮。当前本稿没有应用此修复。

`no-project` 是未保存事实，Worker 当前 `prepareItem` 对非 failed receipt 直接跳过。先导入项目再发原 partial retry **不会自然补存**，不能在文案写成已支持；图集占位也不计为可用口播稿。只有 saved/existing 且当前同 scope 真稿仍可读的项目才允许“查看已保存稿”。历史 saved 后被用户删除/归档/改源或失去权限时只显示原保存事实和当前不可查看，不新建空稿、不跨 scope 重新绑定、不将丢失稿悄悄当成可重发源。

## 非 breaking 候选的准确 old → new（尚待裁决）

### A. 部分聚合与兼容 wire

在原完整 receipt/calls/fence 结算事务内，至少一件真实可用 saved/existing 且另有明确 failed，拟将 execution 持久 partial、AI 公共 status succeeded，准确 lastErrorMessage 显未完成件数。no-project/图集/诊断不算可用稿，unknown/reserved/started calls 仍拒普通 complete。全部成功/原全图集保持原行为；无可用稿的失败仍 failed。只有原 receipt，不制造 AI 生成候选。当前 `hasExisting` 只核 output_script 的 aweme 锚，图集占位也可能生成 existing receipt；不能单数 existing 就算真稿。拟用同 scope 领域只读 helper 重验对应当前版本的 source 非 image-album、真实非空正文和准确 aweme，读失败不取得可用证明，不能反向删除历史保存事实。这使 A 也需要最小共享领域读 helper，不再宣称唯一 service 文件就能完整修复。

host `completeTranscribeTask` 和旧 Worker 返回 **继续严格 `{status:succeeded|failed}`**；partial 的返回值映射 succeeded，Worker 按原 completed 停止，不扩 `commitResult`/finish 或 Worker enum。重复 complete 在同已提交 partial 上只回同公共映射，迟到回执不得覆盖终态；独立规范须具体核正常所有图集/no-project 的语义，不借本次改未批准边缘行为。

### B. 原公共结果槽的领域 read 投影

拟在 `ai.tasks.results.list` 的本人 task 受控归属读之后，对精确 `transcribe.douyin` + kind/ownerType/ownerId/aiTaskId/冻结 awemeIds 双向映射建立只读领域投影。复用现 AITaskResultResource，**不改 schema/DDL/endpoint/status enum**，不写或回填 aiTaskResults，不暴露完整 execution payload/provider secret/音频字节/凭据/calls 原始响应。

候选单行稳定 ID `transcribe-summary:<原AI taskId>`，resultType `transcribe_summary`，顶层 artifactId/knowledgeItemId/assetId 均 null。候选 resultData 只含 `items` 与分类 `counts`：items 按原冻结 awemeIds 顺序，逐项 `{awemeId,status,projectId,artifactId,hasUsableTranscript,error}`；status 沿原五状态，尚无 receipt 的原在途项为 `pending`（仅只读结果分类，不改 receipt/任务 enum）。projectId/artifactId 由原 receipt + 当前同 owner/workspace/source 的真实 Projects/Artifacts 验证产生，可读才提供导航；existing receipt 的 projectId 为空必须查原 aweme 的当前本人真稿，不猜 ID。不能把不同 source 当前工件、普通 output_script 或图集当真稿。删除/失权后返回 null 引用及准确说明，原 receipt 的历史保存状态不被改写。hasUsableTranscript 只由上述本人真稿验证产生；existing 图集占位保持原 receipt 分类但布尔值 false、不得提供口播稿入口。error 只沿当前服务端人话 failure，不导出诊断secret。

counts 精确包含原五终态和 pending 的数量，总数必须等于原冻结来源数；保存分类与图集/未找到项目分开，不把一件未知视失败。旧无完整绑定/旧无 receipt 的任务不补造 summary，只保旧 tasks/steps，并说明无法安全核对。其它 resultType 和三 validation 字段的现 guards 完全保留。

这是 **新领域 read 语义候选**，既有 record 允许解析只证明 wire 不 breaking，不意味着已批准实施。需正式明确服务端解析器/客户端 decoder、旧消费者不走 candidate/confirm/discard、跨 owner/group 与当前失权行为。实际 fields 除上述 allowlist 不外泄。

### C. 用户可见交接与稿面读修复

转写最近任务拟提供“查看本批结果”，展开上述原任务 summary；saved/existing 且 hasUsableTranscript=true 的当前可读项提供对应 `/projects/:projectId#script`，未完成项显示“未完成”及具体原因，图集/未找到项目独立提示。已有项目稿面/版本/编辑入口复用，不复制稿、不强制换 currentVersion、无采纳确认冒生成结果。刷新直接 ai.tasks.get + results.list 回读，页面返回后仍可打开同 task，不能依赖瞬态通知队列。

稿面判 done 拟以同 source 的当前真实稿为准；没有稿的 succeeded+runtimeStatus partial 不能判 done，也不能默认 idle 新建收费任务。无稿时读取准确原任务及 source summary：在途/unknown/配置阻断显示原任务入口，明确 failed 显对应未完成事实；旧 succeeded 无真实稿显示核对状态，不伪 done。只读结果获取失败显示“暂时无法核对，请刷新原任务”，禁止读失败偷偷获得新提交权。当前 state union 没有 unknown/waiting_user 细分，拟在稿面 VM/组件局部加入可核对状态与原 task 引用，**不是修改公共 task enum**。

这些 UI 变更将解除当前前端源码 freeze，须独立授权后再实现并重新完整前端/浏览器验收。现 fullfront 的历史 GREEN不能替它背书。

### D. 原 partial 的领域恢复，而非新整批

候选动作“只重试未完成的 N 条”沿现 `execution.tasks.command` 的原 strict retry body，不新增 URL/body 字段；只对精确 transcribe AI task 的 partial 定义局部 admission，**不把 generic commandTarget 的全部 partial 开放**。用户点击前显示将继续未完成来源、可能发生新识别/后处理调用、已保存件不会重复调用；不显示供应商秘密或臆估免费。

在同原 execution 行锁内重验 owner/workspace/当前 membership、kind/ownerType/AI 双向关系、冻结 awemeIds、每件 receipt 和 calls 完整；仅明确 failed item 为目标，仍有 reserved/started/unknown/result-unconfirmed、没有 failed item、deadline/attempt/cumulative budget 已耗尽、来源已变/缺准确绑定则拒绝，并给原任务回读恢复信息。成功件/图集/existing/no-project 保原 receipt；不得通过清空 transcribeItems 让它们重跑，也不碰全部模型/ASR plan、audio/result/calls/operationKey。原 task 与 execution IDs、原截止与预算均保留，claim 才取得新 fence，旧 Worker 无新 admission 权。

原 Worker 准备件已跳过非 failed receipt；同原 execution 恢复 failed 件时，音频读取验证原 digest/bytes，ASR prepare 先回已 settled 原结果/冻结身份，后处理也先回原 receipt。因此已结算成功调用不能重发，明确抽音失败可沿原来源和有界取流重新尝试。拒绝 provider 未知结果不是 ordinary failed；它只能查询原调用，不进入本动作。原累计 calls/tokens/attempt 与 deadline 不因用户重试归零。

现 command 没有持久 command-key 回执，因此非 breaking 候选还须对这个精确分支记录最小私有 `payload.transcribeRecoveryRequests[commandKey]`（不是新 generation key）：`{command:'retry',sourceIds:<本次准确failed子集>,acceptedAt:<服务端时间>}`，同状态 queued 原子提交。same commandKey 先查原回执、核同原 frozen task/来源子集，只回当前原 task，不再重开；不同 key 是另一次用户明确恢复，须重新验上述所有门。旧回执/旧 task/历史不同 key 不回填、不凭 UI status 推断。多任务命令须先全部验证、同事务提交，不允许一半恢复；若无此精确需求批准，UI 仅发单 task，本候选先拒涉及 partial 的混合多 task 恢复。不改其它 kinds 的现控制行为。

这项私有回执和 transcribe-only partial admission 是 **需要正式细化裁决的新实现范围**；不能称现已支持或借母 draft 实现。返回依旧现 executionTaskResourceV2，不向客户端开放 payload。ACK 丢失保同 commandKey，先 ai.tasks.get + summary 回读；queued/running 显“恢复已排队”，原 partial 且该 key 已受理则不能自动新 key 盲重试。若没有独立可证回执能力，保错误并沿原任务核对，不说已经恢复。

### E. 非本最小 patch 可自动解决的恢复

- `no-project`：没有实际已保存稿；正常导入同来源是前置，不允许以新 project/source 替换冻结身份。现 Worker 跳过该 receipt，若要在原任务沿原已 settled ASR/postprocess 补存，需另明确定义仅保存修复动作、同 scope 新项目合法绑定与 receipt 更新；本候选不先实现，不触模型/新码，不伪称“重试即可补存”。
- 原 cumulative budget/deadline 已耗尽：保已有稿/原因，原恢复拒绝，不延 deadline/重置预算。是否允许明确新单件意图、提示再次调用费用并留下原新任务关联，需要单独规范；不能只生成新 attempt 绕门。
- 跨 batch 活跃/unknown 同 source：普通 projects.transcribe admission 必须先读本人同 workspace 的冻结 source 任务，不只同 project 单件；精确找到后沿原 task 核对，不能并行另建。锁顺序/历史缺绑定处理必须独立核，不承诺当前已覆盖。
- 历史 receipt 缺失/删稿/移组：只读已知事实和原错误，正常权限/项目恢复后重新核对；不能跨 owner/group 查库，也不能猜原模型或回填成功。

## 最小候选写集分层（未授权实施）

| 层 | 精确拟写集 | 不改项 |
| --- | --- | --- |
| 聚合 A | `backend/src/modules/execution/execution-transcribe-workflow.service.ts`；`backend/src/modules/projects/transcript-artifact.service.ts` 的精确真稿只读 helper + 原转写集成/领域 tests | Worker enum、generic finish、schema/contract、原未裁决 expected |
| 结果回读 B | `backend/src/modules/ai/ai.service.ts` 的 listResults 分支；拟新增 `backend/src/modules/ai/transcribe-result-projection.ts` 与其领域 test | 不写表、不开放 payload、不绕 requireTask/group guard |
| 持久恢复 D | `backend/src/modules/execution/persistent-task.service.ts` 局部接 transcribe guard；拟新增 `backend/src/modules/execution/transcribe-recovery.service.ts` 与其 test | 通用 partial 权限、预算/终态取消/unknown、lease/模型绑定不放宽 |
| 单件跨 batch admission | `backend/src/modules/ai/project-transcription-submission.ts` 与其原 test | 原请求回执、source/project锁、createTask payload fingerprint、正常账号组身份保留 |
| UI C | `frontend/src/features/copilot/ai-copilot-content.tsx`；拟新增 `frontend/src/features/copilot/transcribe-task-result.tsx` 及 test；`frontend/src/features/draft-workbench/draft-workbench-data.ts`、`draft-workbench-page.tsx`、`transcribe-now-button.tsx` 及对应原 tests | 不改通用任务卡为所有任务提供 partial retry，不改 routes/公共 wire enum、不覆盖正文 |

分层写集是独立复核的上限候选，不是 `backend/**` 或实施许可。B/C/D未全部批准并验证之前，不能仅做 A 后宣布用户已完成。E 若需新增动作/字段，先补准确规范及必要 breaking 确认，不能落本候选暗改。

## 需实际 RED/GREEN 的验收矩阵（目前未跑，非 PASS）

1. 原 TR05/TR12 同输入：实际 2/1 真稿、失败源仍失败；原原文、分类汇总与原 expected 保待裁决；批准后同时验证 DB partial 和旧 Worker strict succeeded 返回，不能只改 assertion。
2. 原公共 get/list/results 的真数据库/transport：本人成功/失败/图集/no-project 分离计数；summary 稳定 source 次序、project+artifact真绑定；跨 user/group/account、失权、同 source别project、缺原 receipt、字段篡改拒绝，不泄露 payload/secret。旧其它 resultType/validation和旧 Worker wire保持。
3. 真实 UI 意图→反馈→stable→项目编辑→返回/刷新：partial不能标全完成；失败源入口不隐藏、未知不显示新抓取；保存件能实际打开对应正文，手工编辑/历史版本可读；三视口与项目最小视口按正式 UI 规则验。页面读失败显示核对，不自动提交。
4. 精确原 partial retry：同 key并发/丢 ACK/重开服务仍原 task；不同 key仅明示新恢复、已保存件0新增 HTTP/ASR/产物/version；失败件沿原音频/plan/settledcall读回、原 operation 不变，实际新调用限明确未完成且剩余额度允许。需要真正实时 transport 计数正控制，不用静态 getter误证0HTTP。
5. unknown/reserved/startedcall、fence失效、cancelled、跨owner/group、改source/plan、原音频丢失、耗尽budget/deadline拒绝并保已有稿；并发普通单件与原 batch 恢复不双发；原 no-project 导入后仍保未支持补存，不假恢复。
6. 源码变更批准后运行原 30/170 库存、相关真实 Worker/PGlite 和 backend tsc；如涉及 C，再全前端与真实非fixture UI。所有未通过继续报告，历史全front/nativeHTTP不等于新恢复验收。真双电脑安装与供应商/真实账号登录写入仍未授权，不在本 fixture 冒 PASS。

## 未应用最小规范补丁草案

只拟在原母 R-05 转写领域补充以下段落并映射 AC-07，不覆盖现 R-03a/R-05a draft，也不改变旧 S5价格/成本责任；是否加入母或精确转写任务规范由主控和独立 reviewer 决定：

> 对映射 `transcribe.douyin` 的已保存部分稿，完整 receipt 和已确认 calls 经宿主核实后以 execution partial、旧公共 succeeded/runtimeStatus partial 投影，内部 complete 原 succeeded/failed wire不变；必须提供本人原任务逐件结果回读、真稿项目交接与未完成说明。只有真实可读非图集稿才是可用业务结果。无稿的 failed source 不可因整批 succeeded 隐藏核对/恢复入口。
>
> 领域 partial 恢复仅接原任务明确 failed 子集，保原 source、计划/身份、calls/回执、累计预算和 deadline；settled 回读，saved/existing/图集/no-project 不重新调用。原命令同 key 的受理与目标子集持久同事务，重复只回原任务，不重复排队。unknown 或未确认调用不得恢复 admission；预算不足/原身份改变拒绝，不能新 attempt 自动绕过。普通单件提交需对同 scope跨 batch原冻结source在途/unknown也拒绝另发。
>
> 现 no-project补存、耗尽预算后的新收费单件意图、缺历史冻结证据恢复均不是上述 partial retry 的隐含许可，另行准确规范。公共 schema/endpoint/旧枚举保留；新增 summary结果语义只读 allowlist、原执行私有命令回执和局部 UI不得开放整包payload或通用partial retry。

这段是未应用的增量草案，旧母当前正式receipt不自动包含它；需确认具体字段/锁顺序/成本提示与反例后才能产生正式patch和实现写集。

## 主控需要裁决的具体点

A 的原 R05 partial 适用范围、B 的明确 resultType/allowlist读语义、C 的失败源/核对状态交接、D 的 transcribe-only原任务恢复与最小持久命令回执、跨 batch source admission 的正确锁与失败恢复，需要分别给准确批准依据或新的最小规范补丁后独立核。不要以 public succeeded 掩盖 partial；若只批准 A，本需求仍保持未通过，因为 C/D的真实用户阻塞没有消失。
