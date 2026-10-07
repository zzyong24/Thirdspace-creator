# T-1071 收尾记录

本轮完成的是全系统资源诊断。报告确认 8 项缺陷，另外列出 9 类未完成实测的静态风险；未修改产品运行代码、安装版或真实数据，未做正式发布。6 个根因修复任务已进入 BACKLOG，修复与对应公共调用链验收尚未执行。

## 当场证据

| 验证 | 结果与边界 | 原始证据 |
| --- | --- | --- |
| 实际前端 hook、组件与 SDK | 4/4 缺陷复现通过；归档为仓库相对入口后再次 4/4 | `frontend/vitest-output.txt`、`frontend/verification-portable.log` |
| 宿主任务回执缓存 | 两次独立运行均保留 100 个 512 KiB Buffer，共 50 MiB；停止和 clearRun 后存活数为 0；相对入口重跑一致 | `worker/run1.ndjson`、`worker/run2.ndjson`、`worker/verification-portable.ndjson` |
| Whisper 成功线程生命周期 | 3 次成功后存活线程 1→2→3，自动关闭为 0；仅持有 WeakRef、释放 provider 等引用并跨轮 GC 后一致；探针最终清理为 0 | `worker/whisper-provider.ndjson`、`worker/whisper-verification-portable.ndjson`、`worker/whisper-verification-weakref.ndjson` |
| 实际响应流和历史订阅 | 合成 500/1000/2000 个事件，未消费时仍全部产生；取消后 ArrayBuffer 回基线；相对入口重跑 500 个一致 | `backend-sse-500.json`、`backend-sse-1000.json`、`backend-sse-2000.json`、`backend-sse-portable.json` |
| 实际后台 start/tick | 10 次人工调度回调叠加到 10 并发，释放后为 0；相对入口重跑一致 | `backend-cron.log`、`backend-cron-portable.log` |
| 原生 sidecar 停止模块 | 隔离最小工具链直接加载实际模块，12/12 通过；自建进程组全部由测试负责清理，非桌面真机验收 | `native-sidecar-tests.log` |
| 本机只读采样 | 120 秒内 5 次采样，15 个进程均为外部客户端启动的 MCP 桥；总 RSS 147.61→146.27 MiB，无持续增长证据 | `process-samples.json`、`process-roles.json` |
| 源码归属 | 39 个源码摘要全部与起始记录一致；产品目录工作树差异为空 | `source-anchors.json` |
| 本任务治理检查 | 首次 progress done 被诊断工件的 5 个未登记复杂度标记拒绝；按授权诊断范围登记 4 份工件准确哈希后，progress done 与本任务 preflight 均实际通过 | `orchestrator/COMPLEXITY_LEDGER.json`、`governance-final.log` |

隔离脚本的通过表示成功观察当前缺陷，不代表修复后的正确性。虚拟时间、轻量线程、合成回执及端口不冒充真实模型、慢网、数据库或安装版资源表现。现有 LED-047/049 检查通过只覆盖其已有用例，本轮发现的其它页面消费点仍需在修复时补入公共调用链回归。

## 项目对账

先运行 `node orchestrator/process/pmem.mjs sync`，再运行完整 `node orchestrator/process/reconcile.mjs`。初次与最终均退出 1：**34 个错误、1 个告警**。与既有 T-1069 原始记录按每条 ERROR 文本比较，新增 0、解决 0；准确消息也存入 `reconcile-comparison.json`，不依赖旧日志在新 checkout 中存在。

- 1 项结构门失败：门卫仍发现 7 处、基线为 5 处，两处 SDK 前端导入在本轮起始源码已存在，本轮没有修改产品代码或扩充结构基线。
- 17 项既有评审回执失败、16 项既有 LED 失败，保留根因任务 T-916 / T-1015 / T-1018；本诊断不改变其验收状态。
- BACKLOG 体积告警继续保留。
- 本任务不涉及界面交付，验收列为 `—`；没有补拍 TDD 红测、UI 证据、真机 E2E 或全绿回执。

原始输出仅去除末尾冗余空白行，事件与测量值未改写。原始记录为 `boundary.log`、`reconcile-before.log`、`reconcile-final.log`，差异为 `reconcile-comparison.json`。当前任务验收只要求真实排查、隔离复现、报告与诚实对账，已完成；全局既有失败不是本诊断新增或可在诊断范围内修改的问题。

任务步骤由 `node orchestrator/process/progress.mjs done T-1071:audit` 推进，不直接改步骤状态。工具未重算 summary，本轮仅从现有步骤状态重新推导汇总，未改变其它任务状态。BACKLOG 完成必须经 `taskctl complete` 留审计事件；随后同步项目记忆并仅提交 T-1071 诊断及其控制工件，不包含其它会话的 T-1072 需求、决策或源码。

本次本地提交成功，但全局 Git 钩子输出 `Can't find lefthook in PATH`；没有声称该钩子执行。上表中的检查均为本轮显式调用的实际结果，`git diff --cached --check` 已通过。
