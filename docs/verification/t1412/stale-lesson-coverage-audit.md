# T-1412 前置核查：六处失效测试路径与当前守护语义

核查日期：2026-10-25。核查者：`/root/t1427_pi_diagnosis`。源码锚：`398b63905d6208aca89b6359af15720fa96de8f6`。

本报告只记录源码、SPEC、DEC 和 Git 历史的只读核查。没有执行测试、调用真实模型、访问用户数据库或凭据，也没有修改生产代码、lesson 配置、任务或审核状态。本次唯一写入是本文件。以下“已有覆盖”表示读到了有意义的断言，**不表示本次运行通过**；新增测试的 RED/GREEN、测试收集和安装版验收目前均未发生。

## 1. 结论与范围

55 条 lesson 中发现六处引用了三个已删除的测试文件。不能把多路径 Vitest 命令退出 0 当作这六处都得到执行，也不能删掉失效 token 后就认定覆盖恢复。

| lesson | 失效路径 | 当前结论 |
| --- | --- | --- |
| LED-014 | `backend/src/modules/ai-runtime/chat-runner.test.ts` | 局部改稿主要语义已有 assembly、可信宿主及真实 Worker 测试；可迁移守卫，须实际收集并运行。 |
| LED-017 | 同上 | 原文、授权、长度及 SHA-256 的测试已拆分；可迁移守卫，须实际收集并运行。 |
| LED-020 | 同上 | 装配中的工具序列仍在；正式 Pi 序列及“缺必需参考不提交”缺直接测试，当前宿主存在路线约束丢失。 |
| LED-023 | `ai-worker/src/runtime/agent-runtime.test.ts` | 旧纯文本挂起超时测试已删除；当前有有限调用超时和取消测试，但缺直接超时回归。应按后续 T-1022 的原任务自动恢复合同补测。 |
| LED-036 | `backend/src/modules/ai-runtime/asset-generate-runner.test.ts` | 元数据代码迁移仍在，当前真实保存测试没有断言服务原文/画面职责；先补真实保存回读测试。 |
| LED-045 | 同上 | 正式素材/封面 Worker 保留未知提交不重放，却没有官方同步图片同键网络恢复分支。T-915/T-930 未明确撤销该例外，不能用旧 runner 绿测替代正式链验证。 |

可优先迁移 LED-014/017。LED-020/023/036/045 必须补足当前执行链的语义证据后才改对应 check。本文不宣称官方 Pi 402 已解决，也不宣称完整 reconcile 已通过。

## 2. 重构历史锚

以下引用均为仓库 Git 对象，旧文件可用 `git show <删除提交>^:<路径>` 读取；行号属于相应历史版本，不能套到当前文件。

| Git 锚 | 观察到的变化 |
| --- | --- |
| `438ae9288c6a1981074ce0b18b034a24a2714efb` | 2026-09-07，旧 `chat-runner.test.ts` 改名并大幅缩减为 `chat-assembly.test.ts`（约 +70/-1642），runner 与 recovering-model 被移除，职责拆分。改名不证明原断言全数迁移。 |
| `9384f8b6b9ec5f6bce1208240caa2065dd9e0d92` | 从旧素材 runner 抽取 `generated-asset-metadata.ts`，新增持久素材结果服务及测试。 |
| `73cc86ebe8be8cbcbd3728d9303edeaee48bee52` | 增加正式素材 Worker/受控端口/真实 HTTP 集成与明确拒绝重试。 |
| `a0d120eaa1cdf08f4c2a05db3d3376b7e45027e9` | 删除旧素材 runner 及其 838 行测试，增加旧任务恢复和供应商 checkpoint 处理。 |
| `7c83551501c6b29d8929b25ebcd809d7242ca4a3` | T-893 为旧纯文本节点补有限超时及挂起模型测试。 |
| `ceb225138092e24b44d2b04db32b1005a6eb5200` | 2026-09-08，删除旧 `agent-runtime.ts` 和其 57 行测试；当前 templated/structured 节点测试不是原纯文本挂起测试的直接替身。 |
| `9a30e0719`、`99dc78325` | 聊天 runner 删除前，分别已抽离原文导入授权，并增加真实局部改稿 Worker 测试。 |
| `c8b96fd916` | 2026-10-19，精确参考组图链增加“不丢文件引用”的校验，并明确保留旧 Asset-only 封面的降级测试。 |

## 3. 六项逐一映射

### 3.1 LED-014：可信局部改稿锚点

旧 `chat-runner.test.ts`（`438ae9288^`）1191–1245 行验证稿面绑定 artifact/version/section/excerpt、只开放受控 `script.patch`、内部锚点不要求模型或用户补写、模型不能伪造锚点；2788 行附近验证首步工具选择。旧文件还含别名修复等其他用例，本报告没有找到每一条的当前等价测试，不能称“整文件迁移完整”。

当前有意义的落点：

- `backend/src/modules/ai-runtime/chat-assembly.test.ts:749`：失效命令停用、普通语义改稿可选工具、continuous selection 不错误强制；1280 行附近：有效绑定及提示策略。
- `backend/src/modules/ai-runtime/chat-script-patch-tool-host.test.ts:25`：真实宿主绑定与执行；版本、原文、段落、账号、工具定义变化拒绝；取消、未变化正文、伪造锚点不提交；重建工具不能让旧锚点重新取得授权。
- `backend/src/integration/chat-script-patch-worker.test.ts:25`：真实 Worker、HTTP 与测试数据库，覆盖成功、正文未变、回执丢失、提交后中断，回放不产生第二次副作用。

最小替代旧 token：`chat-assembly.test.ts` 与 `chat-script-patch-tool-host.test.ts`；正式链加强项为上述 integration 文件。原 guard 的 artifacts、script runner、chat tools、frontend 文件全部保留。没有从这项读到必须修改生产代码的证据。

### 3.2 LED-017：原文导入不变成摘要改写

旧 `chat-runner.test.ts`（`438ae9288^`）515 行附近收集受信用户正文/附件并排除 assistant；555 行附近让当前用户指令优先于 brief；587 行附近只让模型选择 ref，由宿主恢复正文并验长度/摘要。

当前落点：

- `backend/src/modules/ai-runtime/chat-assembly.test.ts:197`：语义选择、当前指令及来源 ref 的提示合同。
- `backend/src/modules/ai-runtime/chat-script-draft-preparation.test.ts:27`：冻结来源、忽略模型自报正文、按真实锚点取精确正文、长度和 SHA-256；未授权、坏 ref、假锚点及截断拒绝。
- `backend/src/modules/ai-runtime/chat-script-import-authorization.test.ts:7`：完整来源和最新指令、建议不替代最终授权、结构化选择校验。
- `frontend/src/app/api/chat/route.test.ts:679`：LED-017 的真实已保存消息，不采纳伪造 UI 历史；1240 行附近验证附件可信来源。
- `backend/src/integration/chat-script-draft-worker.test.ts:59`：真实 Worker 的 generate/verbatim/unauthorized/rejected/crash 等路径；190 行附近核子任务原文与长度，未授权零副作用。

当前来源由 `chat-turn-preparation.ts:16`、47、68、73 行附近及 `frontend/src/server/prepare-chat-reply.ts:33`、41 行冻结，不应复活已删除的 `collectVerbatimSources` helper。

最小替代旧 token：assembly、draft-preparation、import-authorization 三文件；正式链加强项为 draft-worker integration。原 chat-tools、script-runner 与 frontend 守卫保留。没有证据需要生产修改。

### 3.3 LED-020：发布封面参考路线

旧 `chat-runner.test.ts`（`438ae9288^`）426 行附近验证 `context.publications → cover.generate` 和排除 `local.tools`；476 行附近有“缺真实 coverAssetId 不派发”；2799 行附近检验 step 0/1 的强制工具序列。

当前已有：

- `backend/src/modules/ai-runtime/chat-assembly.test.ts:153`：装配序列与提示，1585 行附近限定 local.tools 为操作系统用途。
- `backend/src/modules/ai-runtime/chat-tools.test.ts:2832`：传入参考素材，发布候选按真实发布状态、日期和封面过滤排序。
- `frontend/src/app/api/chat/route.test.ts:693`：真实 prepare 路径输出 durable assembly 序列。
- `ai-worker/src/runtime/chat/chat-pi-loop.ts:69`、93：将冻结序列落实到 Pi 请求；当前 `chat-pi-loop.protocol.test.ts` 有真实 Pi core/规范模型流协议测试，但未找到直接检验发布封面前两步的用例。

当前缺口与反例：

1. `backend/src/modules/ai-runtime/chat-cover-task-host.ts:24` 的 `current()` 确认可信所有者和冻结工具后，只返回 chatContext 等数据，没有保留 `hostContext.mediaRoute`；47–63 行的 `prepareTask()` 仅校验项目，`referenceAssetId` 为可选。因此必需参考路线的缺 ID 不能由现有宿主硬约束挡住。
2. `backend/src/modules/ai-runtime/cover-business-adapter.ts:17` 只冻结可选 referenceAssetId，没有该路线的“必需参考”语义。
3. `backend/src/modules/execution/execution-cover.service.ts:108`：只有带精确 `referenceFileId` 的读取失败会抛错；Asset-only 读取错误被转为 null 后以 `image.generate` 继续。
4. `backend/src/modules/execution/execution-cover-series.test.ts:43` 明确断言旧 `cover.brief` Asset-only 读图失败仍降级。它验证的是现存兼容行为，不能作为 publication_reference 不降级的证明，也不应不分路线直接删掉。

最小生产修复候选：由可信冻结 `hostContext.mediaRoute.kind === 'cover.publication_reference'` 得到内部必需参考标记；在宿主拒绝缺 ID，并随原子子任务输入、原 input digest 和 `__coverContext` 冻结传递。正式图片准备对该标记要求真实可读参考及真实编辑能力，读失败/空图/不支持时停止，不能悄悄切纯文。标记不取自模型自报，不新建公共模型参数；旧未带此路线的请求保留原兼容分支，旧任务不能按当前语义重写快照。需要补宿主负例、adapter 传递、正式 service 负例和 Pi 两步协议测试。

### 3.4 LED-023：纯文本单次调用上界与原任务恢复

旧 `agent-runtime.test.ts`（`ceb225138^`）两条测试验证正常文本/step 回调，以及永不返回的模型在调用方 `timeoutMs:10` 下报 `AgentNodeTimeoutError`。它不能证明当前 Pi 节点的取消和超时。

当前源码与测试：

- `ai-worker/src/execution/intelligence-generation-worker.ts:82`、102：纯文本 `generateText` 使用 `maxRetries:0`，合并父 signal 与 `AbortSignal.timeout(180000)`。
- `ai-worker/src/execution/worker-runtime.ts:107`：有限任务 parent deadline 可中止，continuous 的 null deadline 不创建总截止 timer。
- `ai-worker/src/execution/worker-runtime.test.ts:32`：取消沿同 signal 传播、错误 fence 不生效、迟到结果不提交；不是触发单次文本超时的测试。
- `ai-worker/src/execution/agentic-worker-entry.test.ts:60`：真实 HTTP cancel/stop 会关闭连接；不是文本调用 timeout 的直接证明。
- `ai-worker/src/execution/intelligence-generation-worker.test.ts:25`：真实 Pi 初始化与预留未知不出网；目前未直接触发 180000ms 调用超时。
- `ai-worker/src/execution/durable-generation-model.test.ts:22`、`backend/src/modules/execution/execution-worker-outcome.service.test.ts:81`：纯模型的 `superseded` 与 `retry_wait`；旧有限 deadline 测试不能拿来要求 continuous 总任务结束。
- `ai-worker/src/nodes/structured-node.test.ts:535`：结构化默认/有界放宽已覆盖，继续保留。

应补当前纯文本节点的挂起请求超时、provider abort、迟到正文不保存及父取消测试，并联到原持续任务自动恢复的现有账本/outcome 回归。不可为了跑快把生产 180000 改成 10ms；测试可用受控 timer/合成 provider，断言生产调用策略。若只缺测试且行为已正确，不改产品。

### 3.5 LED-036：生成素材保留服务原文和画面职责

旧 `asset-generate-runner.test.ts`（`a0d120eaa^`）393–438 行以含“当前确认稿绑定/段落原文/视觉方案”的视频输入，断言新素材的 name/description 保留服务原文与画面职责。

当前：

- `backend/src/modules/ai-runtime/generated-asset-metadata.ts:5`、36：解析系统标记并构造服务原文/画面职责/视觉方案和名称，description 有 1000 字符边界。
- `backend/src/modules/execution/execution-asset-result.service.ts:96`：真实保存素材调用上述元数据函数。
- `backend/src/modules/execution/execution-asset-result.service.test.ts:45`：验证 pending、素材类型、单次调用、保存/恢复和费用 unknown，但未断言名称/description。
- `backend/src/modules/ai-runtime/video-decisions-runner.test.ts:1749`、1838、2201、3140：有匹配修复、空匹配拒绝、AI 来源、SRT 回退，但 fixture 预先具有 description，不能证明生成端没有丢字段。

最小补测是在现有 execution-asset-result service 测试通过真实保存端口写入带绑定标记的输入，读回 assets 的名称、描述、AI 来源，重复保存/恢复不改字段且只有一个素材/候选。若此测试已绿，仅迁移 guard，不为测试改元数据实现。

### 3.6 LED-045：官方同步生图网络恢复

旧 `asset-generate-runner.test.ts`（`a0d120eaa^`）包含：179 行不同任务不同键；209 行显式 HTTP 暂态重试同键；258 行官方同步图片在 `network/submit` 且无 HTTP 响应时恢复；301 行用户自配图片未知一次即停；518 行官方视频未知仍不重复提交。

当前正式路径：

- `ai-worker/src/execution/asset-worker-run.test.ts:46`：未知无 job 不重提、视频回执丢失及原 job 恢复。
- `backend/src/modules/execution/asset-worker-runtime.integration.test.ts:21`：真实 HTTP、Worker/端口/存储；502 未知与重启不重提；55 行附近 429 的有界重试与单候选；90 行附近原视频 job 的查询失败恢复。
- `ai-worker/src/execution/asset-worker-run.ts:56`：started/unknown/settled 先恢复原字节，有原 job 的 video 才能续查；77 行以 `execution-asset:${callId}` 作为原 key；93 行仅明确符合条件的 4xx 被标 rejected，未知网络提交进入 unknown。没有按受信 `displayModelKey === 'channel-managed'` 为同步图片选择同键恢复的分支。
- `contract/src/internal/asset-generation.ts:44`：受控 runtime options 已有 `displayModelKey`/credentialLifecycle；`execution-asset-ports.service.ts:37`–56 解析凭据前后验证 lease、原身份及 runtimeOptionsDigest，不需要从模型提示或公共请求猜官方来源。
- `ai-worker/src/execution/cover-worker-run.ts:11`–36：正式封面先回读已结算文案，再调用同一个 `runAssetInWorker`。旧 `backend/src/modules/ai-runtime/cover-runner.test.ts:446` 官方网络正例不覆盖这条正式链。

未证明事实：本次只读核查没有证明**当前线上**受管同步图片网关仍履行同键去重合同；本地假 HTTP 也不能替线上证明。恢复资格必须由当前可信配置/适配器及已有明确幂等合同证明，不能见 channel 名字就泛化到所有图片网关。没有这种证明时，未知保持 unknown_result 是必要边界。

最小补测覆盖正式 asset 和 cover 路径的官方同步图片网络恢复、自配/视频/明确 HTTP 排除、1s/3s 总计最多两次恢复、同 key/同字节/同逻辑 call、原文案不重跑、取消/失租不再出网、崩溃重启不重置恢复预算、只一份 pending 候选。当前 asset Worker 缺正例分支，需要生产修复的可能性已由源码支持；先红测确认，不把旧的“所有 502 都再提交三次”机械复活。

## 4. 后续合同是否替代旧语义

### 4.1 官方同步图片：未发现明确撤销

`docs/superpowers/specs/2026-08-20-managed-image-submit-network-recovery.md` §2–4 和 `orchestrator/archive/DECISION_LOG-archive.md:27` 的 DEC-MODEL-057 明确限定：官方同步图片、network/submit、无 HTTP 响应、同任务/同方案/同 Idempotency-Key、1s/3s 最多两次恢复；自配中转站和异步视频不获此豁免。

后续 `docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md:160`（T-915 R-03）仍明确允许“按相同 operationKey 查询或使用已验证的供应商幂等恢复”，不支持才进入 unknown_result。162 行要求统一预算、取消和 admission；这些是迁移实现必须满足的附加边界，不是撤销官方例外的文字。T-915 210 行附近“明确拒绝才重试”的交付记录描述实现状态，不能代替用户批准的合同变更。

`docs/superpowers/specs/2026-09-08-pi-only-runtime.md`（T-930）明确承认：删除只覆盖退役路径的测试，**未声称等价 Pi 业务覆盖已建立**。DEC-RUNTIME-055 的删除旧实现许可也要求业务消费者迁移。所读 current/archive DEC 和相关 SPEC 未发现明确替代 DEC-MODEL-057 的条款。因此应登记当前正式链的覆盖/实现缺口，不能销账为“规则已废弃”。但恢复前仍须核实当下供应商幂等资格，不能靠本地测试冒充该事实。

### 4.2 封面：必需参考路线与普通旧封面分别处理

DEC-AI-043（`orchestrator/archive/DECISION_LOG-archive.md:1849`–1870）与 T-779（`BACKLOG-details.md:1228`）要求真实已发布且有封面的候选，模型语义选取真实 coverAssetId 并继续生成；没有合格参考应诚实停止，不静默纯文降级，不用 local.tools 探测平台能力。旧媒体合同 `docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.contract.md:543` 也写明参考阶段失败不可移除 referenceAssetId 重试纯文；不据此恢复该旧 SPEC 已被替代的其他审批流程。

后续 T-1048（`docs/features/t1048-image-series-workbench.md:43`、45）对组图精确文件参考要求不可丢 referenceFileId，供应商不支持时由用户明确取消参考。它保留旧自由画布能力，没有明确撤销 publication_reference 的必需参考合同。T-1021（`docs/features/t1021-cover-template-library.md:171`）也将纯提示降级限定为非必要身份且用户明确选择的普通请求；此处不声称 T-1021 的全部计划已经实现。当前已存在的 legacy 降级测试，应继续保护未指定严格路线的兼容请求；新修复只给冻结的严格路线补可执行约束。

### 4.3 纯文本：后续 T-1022 已明确改变任务级超时预期

`docs/features/t1022-nonblocking-agent-recovery.md` §3 明确允许单次调用超时释放资源，但 continuous 任务不得由总 deadline 结束，模型 timeout/network 沿原 executionTaskId 进入 retry_wait 自动恢复。`superseded` 只适用于无副作用模型候选，明确排除素材供应商任务。故 LED-023 要补“单次中止 + 原任务恢复”，不能恢复旧 T-893“让整个持续任务终结”的测试预期，也不能把此 superseded 机制借给 LED-045 的计费图片提交。

## 5. 可直接登记的新任务 SPEC 草案（尚未注册、未独审，不能据此实施）

### 5.1 目标和不变量

建议题名：恢复重构后六项 lesson 的正式链语义覆盖。

修复六个 stale path occurrence，补足当前链路丢失的守护能力；以现行合同为准，不复活旧 runner。保留全部 55 个 lesson 的 ID、顺序、what、onFail 及无关 check token。与 T-1412 的 timeout_ms/buffer 配置修改串行：先等待其交付冻结，再从最新配置仅替换本任务六条 check 的失效部分，并追加必要的新路径。

没有测试收集与实际执行证据的条目继续标未验；不降低阈值、不加 skip、不用 passWithNoTests、不通过删 guard 或放宽 onFail 销账。无真实付费模型调用，无用户私有数据访问。

### 5.2 六项功能要求

| FR（登记时分配正式编号） | 必须守住的当前语义 | 生产修改条件 |
| --- | --- | --- |
| 局部改稿 | 稿面可信锚点、模型不选内部 ID、失效不污染普通聊天、原段落候选及采纳隔离、回放无第二副作用。 | 当前未证明生产缺陷，仅迁移并运行现有 assembly/host/真实 Worker 覆盖。 |
| 原文导入 | 本轮受信 ref、最新授权、精确正文/长度/SHA、坏 ref 与未授权零派发，不能回退摘要重写。 | 当前未证明生产缺陷，仅迁移并运行拆分测试。 |
| 发布参考封面 | Pi 前两步为 publications/cover，原宿主绑定必需参考，缺 ID/读失败/不支持不切纯文，成功只交候选；旧普通封面保持兼容。 | 精确修改 chat-cover-task-host、cover-business-adapter、execution-cover.service；不允许模型自报严格标记。 |
| 纯文本超时 | 当前单次文本调用触发安全上界并中止 provider，取消及迟到结果安全；持续原任务按 T-1022 恢复。 | 先补测试；若发现真实超时/恢复缺陷，再提交独立 SPEC delta 增加准确生产路径，未批准不扩大实现。 |
| 素材元数据 | 真实保存和回读保留服务原文、画面职责及 AI 来源，重复恢复不复制或覆盖。 | 先补 service 测试；若红测证明元数据缺陷，再补准确生产写集并独评。 |
| 官方同步图片恢复 | 仅已验证幂等的官方同步网络未知，原 key 原输入最多两次 1s/3s 恢复；自配/异步视频/不具资格输入不重提；取消/失租/崩溃不重置；一份候选。 | 在资格证据充分且红测确认分支缺失后，仅修改 asset-worker-run 的原调用内恢复。不能把 unknown 写成 rejected/superseded，也不能新增任务或更换模型。若当前端口无法证明预算/lease 安全，先独评扩范围，不能绕过账本。 |

### 5.3 精确候选写集

以下为供主线程登记的最小候选，不是当前授权。本次没有写这些文件。

**生产（四个）：**

1. `backend/src/modules/ai-runtime/chat-cover-task-host.ts`：读取已冻结 mediaRoute、缺参考拒绝、写入宿主决定的内部必需参考标记。
2. `backend/src/modules/ai-runtime/cover-business-adapter.ts`：将内部标记连同原输入摘要冻结到 coverContext；旧输入缺标记按原语义处理。
3. `backend/src/modules/execution/execution-cover.service.ts`：严格参考路线下拒绝不可读/空字节/不支持编辑；保持 legacy 分支和精确文件校验。
4. `ai-worker/src/execution/asset-worker-run.ts`：资格已经证明后恢复原逻辑调用内的官方同步图片网络分支，使用既有受控 resolveAssetCredential 再验 lease/冻结身份；取消可中断退避。新的进程不能对 started/unknown 的无回执图片重新开恢复预算。

**测试（九个；标“新增”者当前不存在）：**

1. `backend/src/modules/ai-runtime/chat-cover-task-host.test.ts`（新增）：可信路线、缺 ID 零提交、模型伪标记无权、跨账号/项目/定义失配、普通旧请求兼容。
2. `backend/src/modules/ai-runtime/cover-business-adapter.test.ts`（拟新增；实施前确认当前文件状态）：真实 prepare 输出的冻结严格标记/输入 digest，与普通旧任务区分。
3. `backend/src/modules/execution/execution-cover-series.test.ts`：严格路线的读取失败/空图/能力不支持/成功参考；现有 legacy 降级用例保留。
4. `ai-worker/src/runtime/chat/chat-pi-loop.protocol.test.ts`：真实 Pi core 下捕获各步模型请求与工具调用，验证前两步顺序、第三步自由及工具名规范化，不只断言提示字符串。
5. `backend/src/modules/execution/execution-asset-result.service.test.ts`：真实保存/读回素材元数据、AI 来源、恢复幂等。
6. `ai-worker/src/execution/intelligence-generation-worker.test.ts`：生产单次超时和父取消穿透真实生成入口，迟到正文无结算。
7. `ai-worker/src/execution/asset-worker-run.test.ts`：网络恢复次数/同键/输入、自配/视频排除、取消/失租/预算耗尽和未知重启。
8. `backend/src/modules/execution/asset-worker-runtime.integration.test.ts`：真实 loopback HTTP + 原 Worker IPC + 受控账本/对象存储，记录实际请求数量、相同 key、重启和候选数；不可仅注入 generateAsset helper。
9. `ai-worker/src/execution/cover-worker-run.test.ts`（新增）：正式 cover 路径使用上述 asset 恢复，已结算文案不再调用，参考字节不丢，单候选；不得只测退役 cover-runner。

**配置及证据：**

- `orchestrator/process/reconcile.config.json`：仅上述六条 check 的精确路径迁移/必要覆盖追加；不变 what/onFail、顺序、其余条目和 T-1412 已验预算。
- 新任务自己的 `docs/verification/<登记后的任务号>/**`。
- 主线程注册所需 SPEC/BACKLOG/module/context 与 review/taskctl 事件按既有协议登记；不把控制面交给产品实现子代理。

若正式 cover 真实 IPC 测试需要额外 integration 文件，或单次图片恢复需要新增端口/账本字段，先提交精确范围增量独审；不把此草案扩张为任意 execution/contract 目录写权限。没有批准的路径不改。

### 5.4 守卫替换清单

下面列本次六条 check 中需要的新目标；每条原有的其他 frontend/backend/worker 测试继续保留。带“补测后”的路径只有真正实现并运行后才能进 guard。

| lesson | 替代失效 token / 追加实际链 |
| --- | --- |
| LED-014 | backend `chat-assembly.test.ts`、`chat-script-patch-tool-host.test.ts`；追加 `src/integration/chat-script-patch-worker.test.ts`。 |
| LED-017 | backend `chat-assembly.test.ts`、`chat-script-draft-preparation.test.ts`、`chat-script-import-authorization.test.ts`；追加 `src/integration/chat-script-draft-worker.test.ts`。 |
| LED-020 | backend assembly、补测后的 chat-cover-task-host / cover-business-adapter / execution-cover-series；追加 ai-worker `src/runtime/chat/chat-pi-loop.protocol.test.ts`。旧 cover-runner 不被称作正式链证据。 |
| LED-023 | ai-worker 补测后的 `src/execution/intelligence-generation-worker.test.ts`，并带现有 `worker-runtime.test.ts`、`durable-generation-model.test.ts`；backend 追加原 `execution-worker-outcome.service.test.ts`，保留原结构化/搜索回归。 |
| LED-036 | backend 补测后的 `src/modules/execution/execution-asset-result.service.test.ts`，原 material-match/video-decisions/前端完整保留。 |
| LED-045 | backend 补测后的 `src/modules/execution/asset-worker-runtime.integration.test.ts`；ai-worker `src/execution/asset-worker-run.test.ts` 与新增 `cover-worker-run.test.ts`。旧 cover-runner 只能作为兼容回归保留，不能独自承担该 lesson。 |

### 5.5 红绿、收集与退出证据

1. 先为 LED-020/023/036/045 补行为测试再改生产。生产确有缺陷的 RED 必须是预期行为断言失败，不能用编译错误、缺文件或不存在的 filter 冒充红测。若缺失的只是测试且新增测试首跑已绿，诚实记录“补覆盖、首次即绿”，不制造 RED。
2. 每个最终 check 中的精确测试路径，先核真实文件存在，再使用仓库实际 Vitest 版本支持的收集方式，归档**每文件**收集数、测试名与来源。若工具无法稳定导出列表，用逐文件运行的详细结果证明；缺路径/0 collected 必须阻止完成，不能只看整条多 filter 命令 exit 0。
3. 每次执行归档完整 argv/cwd、开始结束、退出码、实际 pass/fail/skipped 数。行为目标用稳定测试名映射到六条 lesson；不得仅存输出尾部摘要。零 skip、零 retry 的运行才能作为本任务要求的通过证据；必要真实 HTTP 全部为临时 loopback 随机端口。
4. 网络恢复红绿同时记录服务端收到的请求数与 idempotency key，真实 Worker IPC 与账本/素材/候选读回；官方资格的源码/合同证明单独归档，不能拿模拟服务证明线上去重。
5. 普通文本超时验证 provider 收到 abort，既有 continuous 账本/outcome 测试证明原任务 retry_wait；不向真实账号发请求，不降低生产 timeout。
6. 聚焦检查通过后按实际修改路径执行 typecheck、boundary、semantic-boundary 和 `node tools/timeout-policy/verify.mjs`；最终由主线程 `pmem sync → reconcile`，保留其他真实失败。仅当这六条自身的全部有效子命令都实际通过，才标这些 coverage 缺口已关闭。

## 6. 内容绑定与未验声明

| 文件 | SHA-256 |
| --- | --- |
| `docs/superpowers/specs/2026-08-20-managed-image-submit-network-recovery.md` | `3dd0e1c7119f2360a42ded470d108e0e100424d9fa4fba6108caa7e52809e4b4` |
| `docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md` | `b8282e2c286a9e0ffa757264667e724bcc20457e355b08487d8c08e1011811d9` |
| `docs/superpowers/specs/2026-09-08-pi-only-runtime.md` | `7c93d7ae841e0da1c35228e5479a344a21ce385e697361bc90711b8c2db56b33` |
| `docs/features/t1022-nonblocking-agent-recovery.md` | `5eb3f4069a9e5601a05c46e5cd5a709e0254338e64078a351d526fa1209b7363` |
| `docs/features/t1048-image-series-workbench.md` | `8c2424b17990ee8c064034464f03d4f41fefcfc7b5e0632df50271644acea548` |
| `backend/src/modules/ai-runtime/chat-cover-task-host.ts` | `7ac78a741a609627e18c84650b8748ee8eecd7434244afc1c55d77a0130344a9` |
| `backend/src/modules/ai-runtime/cover-business-adapter.ts` | `e52b3350abec952d73023a02721a1e9908fe0b276feb6fce0fc3e79dd54a84d6` |
| `backend/src/modules/execution/execution-cover.service.ts` | `149bc03905d84cfcc5f1a15f49bcefe4ee1bbda91a7fb61697a0aac8b50b8fae` |
| `ai-worker/src/execution/asset-worker-run.ts` | `8a070521270ec5117078ed1f4b783830aa557d4e7fa52d2d9672ce9e91efb055` |

本报告提供的是可核验映射和待注册修复合同。实际测试收集数、红绿计数、生产补丁、供应商现时幂等能力、完整 reconcile、打包安装、真实模型与 UI 验收均未由本次核查取得，不能据本文补签 PASS。
