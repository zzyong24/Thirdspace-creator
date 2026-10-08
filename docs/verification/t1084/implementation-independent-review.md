# T1084 独立实施复核

结论：**限定实施 PASS，当前无必修 finding。完整 Gate 与修复后安装版验收未签。** 本报告由独立子代理只读核源码、差异及既有真实日志；没有运行测试、公共业务、付费模型、数据库或 App 操作，没有修改源码、Git、控制面或正式审核状态。

- 基点：`0bc810de8458b7f18a15a5d78492cdbea8617be8`；核查时间：`2026-10-08T15:45:39.003165+00:00`。
- 已读 SPEC：`docs/features/t1084-chat-workbench-preparation-order.md`，前置 PASS 回执 `REV:e209f8301608`。
- 产品写集恰为 `chat-turn-preparation.ts` 的一个属性替换及一行注释；测试写集恰为 `chat-assembly.test.ts` 两个 import 和新增五个参数化用例。
- 两文件实际 `git diff` SHA256：`974b7642b56bcb9c5f620cab1675cb00b7be15446fc5ebae08a68df0f223dabb`。

## 实现判断

首轮 `prepareChatAssembly` 只建立已有业务工具，使用 `{...frozenOptions,workbenchCapabilities:[]}` 避免提前要求尚未注入的 Workbench 原型。之后仍由原代码注入 `plan.update` 和实际声明的其它 Workbench 原型，再以原完整 `frozenOptions` 执行最终 `prepareChatToolDefinitions`。逆向还原一个属性和注释后，产品文件逐字等于 HEAD；除这一步之外的代码未变。

```mermaid
flowchart LR
 A[已有业务工具及原引擎筛选] --> B[注入 Workbench 原型]
 B --> C[按完整冻结目录严格检查]
 C --> D[原任务提交和租约内执行]
```

最终检查仍要求真实登记的 native executor、精确名称、声明/schema/描述一致、副作用与版本冻结、能力存在及不覆盖业务工具。描述、schema、版本三类计划漂移新增用例均要求在最终层拒绝。没有修改这些守卫或制造假执行 handler。

`frozenOptions` 其余 atomic/worker 标志在内层通过展开完整保留，最终层仍用原完整对象；原 Pi/Codex 的定义筛选和 Worker 原提交快照未改。新增两个引擎用例调用真实 `prepareDurableChatTurn`，验证计划与 `files.read` 目录、参数解析、平台、输入/Skill 快照未改写，且两个准备原型执行均按原租约错误拒绝。已有旧快照不含计划、账号快照归属、异步输入冻结和 Codex 目录用例正文全部保留：去掉新增 import 和用例后，原测试文件逐字等于 HEAD。

生产 `plan.update` 的真实执行仍由 `createChatWorkbenchPlanToolHost` 装配，在原 `scope.execution` 下调用 `plans.save`，保留原冻结版本、租约、CAS、产物回执及未知结果边界。普通准备阶段仍不能执行该入口。执行组合、frontend 真实能力选择及提交服务均与 HEAD 字节一致。

## 实际证据及未完成项

- `existing-plan-preparation-red.log`：原用例 1 FAIL / 100 过滤，错误为 `Workbench 能力未装配执行入口：plan.update`。
- `new-preparation-red.log`：新增五例 5 FAIL / 101 过滤；Pi/Codex 在同一提前检查处失败，三个漂移例因收到提前检查错误而未达到预期最终拒绝。
- `preparation-and-host-green.log`：4 文件、146 PASS，未报告 skip。主会话已读取真实运行退出码 0；本报告独立读到日志汇总。目录未提供该运行的单独 argv/exit JSON，因此不把日志本身当成独立进程回执。
- backend/frontend 类型日志无类型错误，实际命令分别为 `tsc --noEmit` 和 `next typegen && tsc --noEmit`；主会话真实 exit 0。boundary 日志无新增违规，原基线 5 保留；semantic 日志通过，主会话两项真实 exit 0。
- `public-plan-integration.log`：原公开计划集成 **2 PASS / 2 FAIL，实际 exit 1**。非法回执纠错例实际任务 `failed`，预期 `succeeded`；暂停恢复例实际 `succeeded`，预期 `unknown_result`。源码通过自定义 `assemble` 提交，不调用本次修改的 `prepareChatTurn` / `prepareDurableChatTurn`。本报告没有查明这两项根因，不将它们记作通过，也不推定其业务风险已经排除。
- `timeout-policy.log` 的动态套件通过，主会话报告完整扫描因既有静态债 exit 1；全局失败保留。
- 其它正在运行的集成、重新打包、修复后安装、原会话公开任务读回、Pi/Codex 真实模型执行、原生 UI 和 T1062 全功能矩阵均不由本报告签署。五个新增准备用例是确定性 service 夹具，不是安装版或真实模型证据。原失败消息、幂等键和历史日志没有重写。

## 源码 SHA256 绑定

| 路径 | SHA256 | 状态 |
| --- | --- | --- |
| `backend/src/modules/ai-runtime/chat-turn-preparation.ts` | `4bcd064091f18250f1aaf97f6efdcdc06d4b426158dbdc0604cc67e404977ef5` | 当前候选 |
| `backend/src/modules/ai-runtime/chat-assembly.test.ts` | `1829fe2e89c1373db0e09a43f39b913e65d5c82be19916dcdd778dcc8d6d4470` | 当前候选 |
| `docs/features/t1084-chat-workbench-preparation-order.md` | `f51f7610908bad84f0546af3f77e72ee364aa54431ebec4788cc0ea6e789b559` | 新 SPEC/评审 |
| `docs/features/t1084-chat-workbench-preparation-order.review.md` | `35998b04ba478ede509a7ad3636081e95c1ee285c80fc19cfede25e6e8b1be7f` | 新 SPEC/评审 |
| `backend/src/modules/ai-runtime/chat-tool-definitions.ts` | `6d887db42a10c5fe703fc0fc6eb77568353aeb0f35a3a89e11f7f435028e6de4` | HEAD 未改 |
| `backend/src/modules/ai-runtime/chat-tool-gate.ts` | `39450144d713f5f154431a489ac810ed979c434a631d3a85dcb5d22bac836357` | HEAD 未改 |
| `backend/src/modules/ai-runtime/chat-assembly.ts` | `dc35a2c20d031e79e1c2e09dec8a8f9156cac42003a6c41b534981490f693985` | HEAD 未改 |
| `backend/src/modules/ai-runtime/assistant-operation-policy.ts` | `994c8977317616d3e139656b5dcaa8bf0e05078f85b3f12d11ad4570797be731` | HEAD 未改 |
| `backend/src/modules/ai-runtime/chat-workbench-plan-tool-host.ts` | `e6a806b25ec212c9d99f5cfccf769cc6409d1c26eaf828f1de2f4e9a360a2b4f` | HEAD 未改 |
| `backend/src/modules/ai-runtime/chat-production-composition.ts` | `0cbf570c281b36fe0aa1c7bf442b43dcae33600f08922b15a0f650d92eaba7af` | HEAD 未改 |
| `backend/src/modules/ai/chat-turn-submission.service.ts` | `cb3b9c8d4f9c8a9f84175ba80e123ac1e8002256f9cba15988427ef6ffa56b3a` | HEAD 未改 |
| `frontend/src/server/prepare-chat-reply.ts` | `9cf8800c09c2f5b428a566f7de3cf1b9e0e894e2ecbddc0a3a70c52127e2fbc5` | HEAD 未改 |
| `backend/src/integration/chat-workbench-plan.integration.test.ts` | `e166b824e3c301dfaccbaea5836bafa98b6ee0b6611c9290284e43666eba1585` | HEAD 未改 |

## 日志 SHA256 绑定

以下日志均位于本报告同目录。

| 文件 | SHA256 |
| --- | --- |
| `existing-plan-preparation-red.log` | `acf9169be484cbb6771d9c896b4ea17cef69063230d78e618b2517eb52e62c2c` |
| `new-preparation-red.log` | `870f930a96525e8bafb5345779e184b923ebc5520b5fc40e4be7095f06d22789` |
| `preparation-and-host-green.log` | `e161306e72c4e6e8360a5ea5110a22312d1978d596e8dde82a983e44b5919c12` |
| `public-plan-integration.log` | `b127d2e0fec582a84f404e44511731d988c00b01c9866c52fe40151a25257c11` |
| `backend-typecheck.log` | `931327292db1bbff62320abd8dd57032ae19ad39b9e012d04233dc49d716637b` |
| `frontend-typecheck.log` | `4c0cd880abe2a1a1a1f20e2f9d2825951e19ae4e848a3f36d2216d3b9e20d035` |
| `boundary.log` | `21063424253db0601ff571f39f0474072b3476d34ee10a8920361b20db642f24` |
| `semantic-boundary.log` | `b972b2b1d6a12435c4034d60290afc2db036e5e439f96cc3f617e5e78a476923` |
| `timeout-policy.log` | `e6a2e7fb97d3f0904a3142904ad8d0cdc4d99d7f20455267097a9d5048e671f0` |

本结论只绑定以上候选字节；产品或测试再变更须重新绑定。首次接口长等待根因仍为 UNKNOWN，不纳入本次修复的已关闭问题。
