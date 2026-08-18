# T-886 本地 Whisper worker 修复验收

## 结果

代码侧修复通过。Windows 分层 runtime 的 Whisper worker 现在在自身线程中显式加载随包模块解析器，
不再依赖主 server 的 module hook；传统 runtime 与开发态保持兼容。Windows closure 发布门新增随包
Node + 真实 worker 的 Xenova 模块加载 smoke。

## 红测证据

- `multimodal-whisper-local.test.ts`：新增真实 worker 分层 fixture 后，因
  `resolveWhisperWorkerRuntime is not a function` 失败 2 项。
- `managed-asr.server.test.ts`：期望稳定 `LOCAL_WHISPER_MODEL_LOAD`，旧实现没有 `code`。
- `build-production-closure.test.mjs`：期望 closure smoke 启动真实 worker，旧实现不含消费路径。

## 绿测证据

```text
pnpm --dir ai-worker test
49 files / 387 tests PASS

pnpm --dir frontend exec vitest run src/server/activation/managed-asr.server.test.ts
1 file / 14 tests PASS

node --test tools/windows-closure-rat/*.test.mjs
18 tests PASS

pnpm --dir ai-worker typecheck
PASS

pnpm --dir frontend typecheck
PASS

node orchestrator/process/boundary-scan.mjs
无新增违规（基线 5，当前 5）
```

## 全局 reconcile 说明

`node orchestrator/process/reconcile.mjs` 已执行。T-886 新增的 LED-041 防回归门、物理边界、孤儿代码与
资产门均通过；全局命令仍以 1 退出，报告 96 项既有评审回执与历史前端验收列漂移。它们不由本次
Whisper 改动引入，本轮不把全局状态写成全绿，也不扩大范围修改这些历史治理欠账。

## 真实消费证明

单测创建隔离的 `<runtime>/frontend` 与 `<runtime>/layers/local-ai/vendor`，启动真实
`worker_threads.Worker`，由 worker 加载 fixture resolver 后解析 fake transformers，并返回“分层 worker
已加载”。该测试不下载模型、不访问用户数据，也不靠父线程 import。

Windows closure 的 `runtime-smoke.mjs` 会在目标平台使用随包 `creatoros-server.exe` 启动真实 worker，
加载随包 resolver 与真实 `@xenova/transformers`；失败会阻断安装包发布。

## 诚实边界

本轮未在 macOS 上伪造 Windows 安装包真机 PASS，也未下载数百 MB Whisper 模型执行长音频推理；目标
Windows 包的完整音频转写仍以接下来的 Windows 流水线和真机日志为最终 SHIP 证据。未重跑用户旧任务、
未修改用户模型配置或数据。
