# T1315 两项公共失败的最小边界分析

绑定：实际候选 source `0e1dc6228f1fa3dc02f2b1c7a1cee77ab18d650a`，50727/qyb5ZR，路由 revision 1，纯组 `grp-e80980cf-18`，accountId=null。本文只读分析，不是修复授权或修复完成声明。

## planning.thesis 生成成功而采纳拒绝

原项目 `project-e80980cf-92`、任务 `ai-task-e80980cf-103`、执行 `exec_e73b5756-571c-4b07-bbc9-7358e6d15dbb`。真实模型产出 artifact_version，任务 awaiting_confirmation；`u32-followup-attempt01/0008-ai-tasks-confirm.json` 为公共 confirm 428，`AccountRequiredError: ai.adoptThesisCandidate requires a selected account (ctx.accountId missing)`。同目录 thesis-after-confirm 保留原候选状态；未再次确认或创建替代任务。wrapper exit0 只表示脚本走完，不能代签该动作成功。

`backend/src/modules/ai/ai.service.ts:1298–1344` 校验原候选的项目/body/nodes 后，调用真实 `adoptThesisCandidate`。组合根 `frontend/src/server/persistence-client.ts:2872` 装配 `backend/src/application/thesis-adoption.ts`。后者第10行先 requireAccountId；第17–39行项目和任务仅按 account_id 锁定并创建 account-only AiRepository，未携带 group。纯组在第一门即失败；仅去掉 requireAccountId 会遗留错误 SQL/null 与 repository 归属，不能当作完整修复。

另一个同文件后续门也需同时闭合：第54–58行新建 ArtifactsService 仅传 db/now/nextId，而 artifacts.service.ts:209 的 group 写要求 assertProjectOwned；只修最前账号门会在新 artifact 创建时再拒绝。该窄实例应通过已锁真实项目证明提供端口，不取消 artifact 通用归属守卫。

实际目标是 group-owned 项目下的 thesis_tree artifact/version。现有 artifacts service/repository 已使用 workspaceKey/workspaceFilter，纯组创建盖 account=null；应沿其真实服务写版本，不伪选账号、不造 legacy 后缀上下文、不改通用 workspaceFilter。当前工作单元保持项目→任务锁和同事务 artifact 创建/版本/任务终态，按原 aiTaskId 找版本保证重放幂等。窄修需要将该工作单元的项目/任务读取、锁和 AiRepository 装配改为真实 user/group/account scope，并保冻结 membership/fence/原候选校验及归档政策。需覆盖纯组、group+filter、legacy、外组/外user、已有版本响应丢失重放和失败回滚。此调用链没有量表服务；不能以增量表/默认量表或自动选择平台账号修复本失败。

建议最小生产 W 为 `backend/src/application/thesis-adoption.ts`；若真实现有端口不足，应先以 SPEC 证明额外路径必要，而非扩大通用 helper。前 RED 应沿公开 create→真实或受控 immutable worker 候选→confirm，并保原任务/版本/作用域，原公共 FAIL 不覆盖。

## agentic 公共创建在真实 worker 前被旧准入拒绝

原 RSS source `intelligence-source-e80980cf-349`，runInitial=false、monitorEnabled=false，尚无采集 run。`rss-collect-attempt01/` 保存完整请求/响应：`execution.tasks.create`，taskType=agentic.collect，有限 timeoutSec=1800、network=deny，返回400 `未注册的 executor: agentic.collect`，未返回 task ID，0执行/模型。未换原始 ai.tasks.create exec.* 绕过，未 manual runs.start 重复采集。

现役 UI `frontend/src/features/copilot/execution-task-card.tsx:245` 的未映射任务重试调用 createExecutionTask；这是静态 live consumer，不冒本次已点 UI 或实际重试；公共 transport `persistence-client.ts:4325` 先调用 executionBase 再 dispatch。`backend/src/modules/execution/execution.service.ts:163–166` 在建任务前按 hasExecutor 拒绝；组合根 `persistence-client.ts:3868–3871` 仍仅查询 executorRegistry。`backend/src/modules/execution/executor-registry.ts:155` 的 builtin 只注册 echo/media.probe/video.render，未见 agentic 注册。

同一组合根 `persistence-client.ts:6482–6489` 已实际提供 `exec.agentic.collect/material/research` 三项 worker business definitions；`backend/src/modules/ai-runtime/agentic-business-execution.service.ts:25–34` 将真实 definitions 克隆并以 supports 查询，prepare 继续严格核 task/spec 类型、network=deny、输入归属、原 execution 映射/operationKey/冻结 browser grant，再通过 authority 绑定。因 public create 在前拒绝，这些安全消费者尚未到达。UI 与任何经同公共 create 的 agentic 调用均会受此准入接线影响；本轮只实际请求 collect，material/research 影响属于源码覆盖，不能写成另两项实际400。

最窄方向是让 public admission/loopType 查询接入真实已装配 worker definitions 的受限能力，而非增加硬编码白名单或注册假 legacy executor；deterministic executor 仍走现 registry。预计生产 W 可只在组合根 `frontend/src/server/persistence-client.ts` 接线；若为封装现有 definitions 查询需改业务 service，须精确说明端口和初始化时序，不改变定义表语义。不得仅 `return true` 或放宽任意 taskType。保留 spec 校验、agentic loop 类型、network deny、实际资产输入、真实浏览器授权、有限/continuous 原预算、幂等 fingerprint/attempt、冻结 owner、费用 ledger 与未知任务恢复。既有 pending/旧任务不得迁移或重发；本次 source349 可保原 ID，后续修复验收须另获合法包/入口授权。

必要 RED 是原公开入口实际拒绝，GREEN 要由相同公共链到真实 immutable worker/账本/持久终态，另外覆盖未知 task、确定性 executor、未授权 browser 参数、跨组输入和原期限不续期。不能用直接 service supports 单测或 raw AI exec.* 成功代替公开链。
