# T-1413 恢复重构后六项 lesson 的正式链语义覆盖

2026-10-25，沿用用户“有问题继续修复，复验通过后再推送”的授权。T-1412 完整对账入口维护中发现 6 处引用了 3 个已删除测试文件，不能凭多 filter 命令退出 0 认定覆盖完整。本任务修复已定位的覆盖缺口及严格封面参考约束；历史事实、当前有效合同和源码位置见 [独立核查](../verification/t1412/stale-lesson-coverage-audit.md)。

本 SPEC 待独立评审；不是实现或验收证据。先等待 T-1412 实现交接，配置修改及资源性检查串行，不与其写集交叉。无 UI 组件或公开 API 变更，所有权仍是 backend 持有领域/账本、worker 只经现有 service port 执行。严格参考由已冻结的可信路线决定，模型只负责选真实候选，不新增内容关键词规则。

官方同步图片的当前幂等资格尚未证明，因此 FR-141306 的生产恢复分支仅是条件候选：先核当前真实适配器和受管网关的明确合同证据。没有证据时保留 unknown 不重提，记录该项未通过；不能用模拟 HTTP、旧合同、来源名或推测取得资格，也不能为完成本任务触发真实付费请求。若现有端口/账本不足，先精确补 SPEC 独评，不在 worker 临时新造持久预算。此条件不妨碍其它有证据的修复继续。


## 目标和不变量



修复六个 stale path occurrence，补足当前链路丢失的守护能力；以现行合同为准，不复活旧 runner。保留全部 55 个 lesson 的 ID、顺序、what、onFail 及无关 check token。与 T-1412 的 timeout_ms/buffer 配置修改串行：先等待其交付冻结，再从最新配置仅替换本任务六条 check 的失效部分，并追加必要的新路径。

没有测试收集与实际执行证据的条目继续标未验；不降低阈值、不加 skip、不用 passWithNoTests、不通过删 guard 或放宽 onFail 销账。无真实付费模型调用，无用户私有数据访问。

## 六项功能要求

| FR | 必须守住的当前语义 | 生产修改条件 |
| --- | --- | --- |
| FR-141301 局部改稿 | 稿面可信锚点、模型不选内部 ID、失效不污染普通聊天、原段落候选及采纳隔离、回放无第二副作用。 | 当前未证明生产缺陷，仅迁移并运行现有 assembly/host/真实 Worker 覆盖。 |
| FR-141302 原文导入 | 本轮受信 ref、最新授权、精确正文/长度/SHA、坏 ref 与未授权零派发，不能回退摘要重写。 | 当前未证明生产缺陷，仅迁移并运行拆分测试。 |
| FR-141303 发布参考封面 | Pi 前两步为 publications/cover，原宿主绑定必需参考，缺 ID/读失败/不支持不切纯文，成功只交候选；旧普通封面保持兼容。 | 精确修改 chat-cover-task-host、cover-business-adapter、execution-cover.service；不允许模型自报严格标记。 |
| FR-141304 纯文本超时 | 当前单次文本调用触发安全上界并中止 provider，取消及迟到结果安全；持续原任务按 T-1022 恢复。 | 先补测试；若发现真实超时/恢复缺陷，再提交独立 SPEC delta 增加准确生产路径，未批准不扩大实现。 |
| FR-141305 素材元数据 | 真实保存和回读保留服务原文、画面职责及 AI 来源，重复恢复不复制或覆盖。 | 先补 service 测试；若红测证明元数据缺陷，再补准确生产写集并独评。 |
| FR-141306 官方同步图片恢复 | 仅已验证幂等的官方同步网络未知，原 key 原输入最多两次 1s/3s 恢复；自配/异步视频/不具资格输入不重提；取消/失租/崩溃不重置；一份候选。 | 在资格证据充分且红测确认分支缺失后，仅修改 asset-worker-run 的原调用内恢复。不能把 unknown 写成 rejected/superseded，也不能新增任务或更换模型。若当前端口无法证明预算/lease 安全，先独评扩范围，不能绕过账本。 |

## 精确候选写集

以下为供主线程登记的最小候选，不是当前授权。评审通过且 T-1412 实现交接后才能写这些文件。

**生产（四个）：**

1. `backend/src/modules/ai-runtime/chat-cover-task-host.ts`：读取已冻结 mediaRoute、缺参考拒绝、写入宿主决定的内部必需参考标记。
2. `backend/src/modules/ai-runtime/cover-business-adapter.ts`：将内部标记连同原输入摘要冻结到 coverContext；旧输入缺标记按原语义处理。
3. `backend/src/modules/execution/execution-cover.service.ts`：严格参考路线下拒绝不可读/空字节/不支持编辑；保持 legacy 分支和精确文件校验。
4. `ai-worker/src/execution/asset-worker-run.ts`：资格已经证明后恢复原逻辑调用内的官方同步图片网络分支，使用既有受控 resolveAssetCredential 再验 lease/冻结身份；取消可中断退避。新的进程不能对 started/unknown 的无回执图片重新开恢复预算。

**测试（十个；标“新增”者当前不存在）：**

1. `backend/src/modules/ai-runtime/chat-cover-task-host.test.ts`（新增）：可信路线、缺 ID 零提交、模型伪标记无权、跨账号/项目/定义失配、普通旧请求兼容。
2. `backend/src/modules/ai-runtime/cover-business-adapter.test.ts`（拟新增；实施前确认当前文件状态）：真实 prepare 输出的冻结严格标记/输入 digest，与普通旧任务区分。
3. `backend/src/modules/execution/execution-cover-series.test.ts`：严格路线的读取失败/空图/能力不支持/成功参考；现有 legacy 降级用例保留。
4. `ai-worker/src/runtime/chat/chat-pi-loop.protocol.test.ts`：真实 Pi core 下捕获各步模型请求与工具调用，验证前两步顺序、第三步自由及工具名规范化，不只断言提示字符串。
5. `backend/src/modules/execution/execution-asset-result.service.test.ts`：真实保存/读回素材元数据、AI 来源、恢复幂等。
6. `ai-worker/src/execution/intelligence-generation-worker.test.ts`：生产单次超时和父取消穿透真实生成入口，迟到正文无结算。
7. `ai-worker/src/execution/asset-worker-run.test.ts`：网络恢复次数/同键/输入、自配/视频排除、取消/失租/预算耗尽和未知重启。
8. `backend/src/modules/execution/asset-worker-runtime.integration.test.ts`：真实 loopback HTTP + 原 Worker IPC + 受控账本/对象存储，记录实际请求数量、相同 key、重启和候选数；不可仅注入 generateAsset helper。
9. `ai-worker/src/execution/cover-worker-run.test.ts`（新增）：正式 cover 路径使用上述 asset 恢复，已结算文案不再调用，参考字节不丢，单候选；不得只测退役 cover-runner。
10. `backend/src/modules/execution/execution-worker-outcome.service.test.ts`：补真实持久 continuous 个案，显式冻结 continuous 预算，单次模型超时后 superseded/retry_wait、executionTaskId 不变且 deadlineAt 保持 null；保留原有限预算 fixture 及有限截止兼容用例。现有 maxCalls=2/deadlineMs=300000 的 fixture 不计作 continuous 证据。

**配置及证据：**

- `orchestrator/process/reconcile.config.json`：仅上述六条 check 的精确路径迁移/必要覆盖追加；不变 what/onFail、顺序、其余条目和 T-1412 已验预算。
- 本任务 `docs/verification/t1413/**`。
- 主线程注册所需 SPEC/BACKLOG/module/context 与 review/taskctl 事件按既有协议登记；不把控制面交给产品实现子代理。

若正式 cover 真实 IPC 测试需要额外 integration 文件，或单次图片恢复需要新增端口/账本字段，先提交精确范围增量独审；不把此草案扩张为任意 execution/contract 目录写权限。没有批准的路径不改。

## 守卫替换清单

下面列本次六条 check 中需要的新目标；每条原有的其他 frontend/backend/worker 测试继续保留。带“补测后”的路径只有真正实现并运行后才能进 guard。

| lesson | 替代失效 token / 追加实际链 |
| --- | --- |
| LED-014 | backend `chat-assembly.test.ts`、`chat-script-patch-tool-host.test.ts`；追加 `src/integration/chat-script-patch-worker.test.ts`。 |
| LED-017 | backend `chat-assembly.test.ts`、`chat-script-draft-preparation.test.ts`、`chat-script-import-authorization.test.ts`；追加 `src/integration/chat-script-draft-worker.test.ts`。 |
| LED-020 | backend assembly、补测后的 chat-cover-task-host / cover-business-adapter / execution-cover-series；追加 ai-worker `src/runtime/chat/chat-pi-loop.protocol.test.ts`。旧 cover-runner 不被称作正式链证据。 |
| LED-023 | ai-worker 补测后的 `src/execution/intelligence-generation-worker.test.ts`，并带现有 `worker-runtime.test.ts`、`durable-generation-model.test.ts`；backend 追加原 `execution-worker-outcome.service.test.ts`，保留原结构化/搜索回归。 |
| LED-036 | backend 补测后的 `src/modules/execution/execution-asset-result.service.test.ts`，原 material-match/video-decisions/前端完整保留。 |
| LED-045 | backend 补测后的 `src/modules/execution/asset-worker-runtime.integration.test.ts`；ai-worker `src/execution/asset-worker-run.test.ts` 与新增 `cover-worker-run.test.ts`。旧 cover-runner 只能作为兼容回归保留，不能独自承担该 lesson。 |

## 红绿、收集与退出证据

1. 先为 LED-020/023/036/045 补行为测试再改生产。生产确有缺陷的 RED 必须是预期行为断言失败，不能用编译错误、缺文件或不存在的 filter 冒充红测。若缺失的只是测试且新增测试首跑已绿，诚实记录“补覆盖、首次即绿”，不制造 RED。
2. 每个最终 check 中的精确测试路径，先核真实文件存在，再使用仓库实际 Vitest 版本支持的收集方式，归档**每文件**收集数、测试名与来源。若工具无法稳定导出列表，用逐文件运行的详细结果证明；缺路径/0 collected 必须阻止完成，不能只看整条多 filter 命令 exit 0。
3. 每次执行归档完整 argv/cwd、开始结束、退出码、实际 pass/fail/skipped 数。行为目标用稳定测试名映射到六条 lesson；不得仅存输出尾部摘要。零 skip、零 retry 的运行才能作为本任务要求的通过证据；必要真实 HTTP 全部为临时 loopback 随机端口。
4. 网络恢复红绿同时记录服务端收到的请求数与 idempotency key，真实 Worker IPC 与账本/素材/候选读回；官方资格的源码/合同证明单独归档，不能拿模拟服务证明线上去重。
5. 普通文本超时验证 provider 收到 abort；与第10项新增的真实持久 continuous 账本/outcome 个案一起，证明单次超时后仍为原任务 retry_wait、deadlineAt=null，不被追加总截止或终结。不能以 Worker 的内存端口或有限预算 fixture 代签该持久语义；不向真实账号发请求，不降低生产 timeout。若新测试证明生产缺陷，先独评准确生产写集增量，再修实现。
6. 聚焦检查通过后按实际修改路径执行 typecheck、boundary、semantic-boundary 和 `node tools/timeout-policy/verify.mjs`；最终由主线程 `pmem sync → reconcile`，保留其他真实失败。仅当这六条自身的全部有效子命令都实际通过，才标这些 coverage 缺口已关闭。
