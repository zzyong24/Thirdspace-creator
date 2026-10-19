# T1099 正式 SPEC 独立首轮评审

评审时间：2026-10-09。结论：**CHANGES_REQUIRED（1项 major，产品方案本身可执行）**。本报告是正式 SPEC 首轮独评，不是实现、测试、安装或真实 Pi 验收。

## 绑定

- SPEC：`docs/features/t1099-tool-domain-recovery.md`，SHA256 `c4e4e14c962c5fdc96578f13153d0d286b2eb04b419a1a3e1c991e15a4662090`
- modules：`orchestrator/process/modules.config.json`，SHA256 `540a92359076a99391ac1e98efb8426a923fbf2670deb0c8052a11c57a75ea7e`
- constitution：`docs/产品定位.md`，SHA256 `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- architecture：`orchestrator/SYSTEM_ARCHITECTURE.md`，SHA256 `eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df`
- 前置诊断：`PRE_SPEC_DIAGNOSIS.md`，SHA256 `a96ff954e1dd413b5ba4ef9b7010746954d563f3bc0b55c6287964344b948925`
- Git 基线：`68dfffb372ee9f1a0c7c692b018ce803733b7576`

## 已确认可执行的边界

正式文本已闭合前置设计的关键约束：

- `toolFailureReceiptVersion:1` 只写入新 chat execution 外层 payload；existing 先返回，旧 task200/222 不补字段、不重装配、不改 modelInput、hostContext、digest、deadline 或历史终态。
- host context 必须在原 owner/source/input/host digest 校验之后返回可信版本，creation host 按 execution 传给 adapter，禁止当前部署默认、跨任务缓存或模型/data 自报。
- 只把共同脚本来源守卫改成现有 `ChatToolUserError`；未知异常、权限、版本、图片、targetDigest 与归属仍走原安全处理。root 到纯错误类的实际 import 必须通过 boundary，失败则回规格复评，禁止字符串识别或复制类型。
- 来源规则准确区分两类事实：六类文章/图文来源字段必须包含同次 read 的相同 `scriptSourceRef`；`ruleSnapshotRef` 才逐字保留真实对象或 `null`。没有要求把旧稿空来源照抄进新候选，也没有由代码补引用。
- partial 只从新版本任务的可信 settled root tool outcome 得出；unknown/unsettled/非stop/owner/lease/digest/checkpoint/card 错误继续拒绝；原 plan 和重复同参失败优先；已有成功 proposal/committed 不降级；普通 read 不冒充候选。历史 replay 沿原事务和事件字节恢复，不在 get/list 时重解释。
- 8个产品路径形成 submission→host reader→creation host/adapter→owner root→completion/projection→frozen prompt 的最小闭包，不需改公共合同、数据库、Worker、工具 definitions/schema/hash、权限或采用。

## Finding REV-001（major / testability）

**Requirement anchor**：SPEC“新格式结束状态”要求原 plan/repeated 规则优先、成功 proposal/committed 不降级、unknown 不结算、旧 task222 原字节不变。

**Acceptance anchor**：SPEC“验收”明确要求“原root、host、submission/context、completion/projection、T1095完整121及plan Worker、提示/assembly、公开partial服务/消费者相关回归”。

**位置**：`orchestrator/process/modules.config.json` 的 `T-1099.verify_commands.implementation`。

**Failure mode**：正式命令当前只运行本轮列出的7个测试文件。它没有运行原 `chat-turn-completion.service.test.ts`、`chat-receipt-projection.test.ts`、T1095 required-behavior 的既有 ports/host/completion/plan 集合，也没有运行实际 plan Worker protocol 回归。实现可以让旧终态引用、stream/replay、重复同参优先级或T1095参数纠错退化，同时仍通过 modules 中全部正式测试命令。这直接使上面的已确认 acceptance 无法由正式 Gate 证明。

**Evidence**：当前 modules SHA `540a92359076a99391ac1e98efb8426a923fbf2670deb0c8052a11c57a75ea7e` 的唯一 backend vitest 命令只列7个本轮文件；ai-worker只有 build/typecheck，没有对应 protocol test。SPEC 自身则逐项承诺上述原回归。

**最小结果约束**：不扩大产品或测试写集，只在 T1099 正式验证命令中加入精确既有回归：至少原 completion/projection、T1095 121 所用7文件集合中与本轮共享机制相关的 ports/host/completion/plan，以及实际 plan Worker protocol 测试；保留当前7文件、三端类型、静态门、timeout和reconcile。若作者选择拆为多个命令，应保持 `--retry=0`、原不缩短预算和无文件并行语义，并在 SPEC 中让命令与承诺一一对应。

- severity：major
- category：testability
- disposition：mitigate
- scope effect：none
- origin：baseline

## 结论边界

除 REV-001 外未发现产品范围、数据归属、版本冻结、partial 语义或安全错误透传的阻断。修正正式 Gate 绑定后可进行同一规格的 recheck；无需改8个产品路径或扩大用户范围。

本轮未运行模型、CLI、用户数据库、浏览器、构建、App 或测试，未修改共享仓库和任务状态。真实 Pi、安装包和任务完成均未签署。


# T1099 正式 SPEC 复审

复审时间：2026-10-09。结论：**PASS；REV-001 resolved，无新增 finding。** 本结论只表示当前 SPEC 与正式验证绑定可以进入实现，不代表实现、测试、真实 Pi、安装版或任务完成。

## 绑定

- SPEC SHA256：`c4e4e14c962c5fdc96578f13153d0d286b2eb04b419a1a3e1c991e15a4662090`（正文未变）
- modules SHA256：`f69135b28d27aca3ceffcca5c74459b3f1277d54e49abc485d48223ea39f41a4`
- 上轮：cycle 1 round 1，`CONCERNS[REV:761f9a8b8909]`
- 上轮 finding：`REV-001`，其 requirement、acceptance、failure mode、证据、处置与建议全部保持冻结。

## 销账核对

当前 backend 验证命令保留本轮7个文件，并加入：

- 原 `chat-turn-completion.service.test.ts` 与 `chat-receipt-projection.test.ts`；
- T1095 的 `tool-parameter-recovery`、公共Worker integration、agentic ports/host 与 plan integration；
- creation host、assembly、public partial task 回归。

此外单独加入 ai-worker 的 `chat-pi-loop.protocol`、`chat-plan-history-replay`、`worker-runtime`，以及 frontend 的 `partial-task-consumers`。这些命令均固定 `--retry=0 --no-file-parallelism --testTimeout=180000 --hookTimeout=180000`；原 worker build、backend/worker typecheck、boundary、semantic、orphan、timeout-policy 和 reconcile 没有删除或缩短。

因此首轮 failure mode 已关闭：旧终态引用、stream/replay、plan/repeated 优先级、T1095 参数纠错、公共 partial 消费者和实际 Worker protocol 的退化不再能绕过正式测试清单。新增内容只改变验证命令，没有修改 SPEC 正文、8个产品路径或7个测试写入路径，也没有引入新的范围或实现矛盾。

## 边界

本轮只读，没有运行上述命令、模型、CLI、数据库、浏览器、构建或App。PASS 允许 root 按正式流程 record recheck 和 start；实际 RED/GREEN、完整 Gate、固定入口出包与真实 Pi 未采纳候选仍须后续取得。
