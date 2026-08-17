# T-869 构建验证：视频逐帧缓存与临时工作区清理

## 用户确认的范围

- 不做引用、软链接或硬链接改造。
- 视频渲染允许在编码过程中临时生成帧，但任务结束后不得长期保留 `captured-frames`。
- 成功后只保留待用户确认的 `out/` 产物；失败、取消仍清理整个沙箱。
- 正式素材、数据库、最终成片和持久任务诊断不得删除。

## 根因

HyperFrames 0.7.54 的正式渲染会在临时 `work-*/captured-frames/` 中生成浏览器画面帧，再交给
FFmpeg 编码。正常成功、失败或取消会由 HyperFrames 自己删除 `work-*`；但应用或 sidecar
进程被直接结束时，子进程的清理逻辑无法执行。CreatorOS 原有兜底只会在启动时删除超过 7 天的
整个孤儿沙箱，因此中断渲染留下了大量逐帧图、输入副本、转码副本和 `render_raw.mp4`。

## 实现

1. `runExecutionTask` 在产物清单已经收割并持久化后，立即删除沙箱的 `input/` 与 `work/`，仅保留
   `out/` 供确认、采纳或丢弃。
2. CreatorOS 构建持久层时同步执行一次中断帧定向清扫；它只在任务 `work/` 内删除名为
   `captured-frames` 的真实目录，不跟随软链接，不碰 `out/`。
3. 失败和取消继续复用原有 `cleanupSandbox`，删除整个任务沙箱。

## TDD 证据

RED（实现前）：

```text
Test Files  2 failed (2)
Tests       3 failed | 19 passed (22)
```

失败点分别为：缺少 `pruneSandboxIntermediates`、缺少 `sweepInterruptedRenderFrames`，以及成功渲染后
`input/` 仍存在。

GREEN（实现后）：

```text
pnpm --dir backend exec vitest run src/modules/execution/sandbox.test.ts src/modules/execution/run-execution-task.test.ts
Test Files  2 passed (2)
Tests       22 passed (22)

pnpm --dir backend exec vitest run src/modules/execution
Test Files  15 passed (15)
Tests       203 passed (203)

pnpm --dir backend typecheck
PASS

pnpm --dir frontend typecheck
PASS

node orchestrator/process/boundary-scan.mjs
PASS：无新增违规，仍为既有基线 5 条

pnpm --dir frontend exec eslint src/server/persistence-client.ts
PASS：0 error；1 条既有 `_ctx` 未使用 warning，位于本次未改动的 10637 行
```

覆盖行为：

- 成功：`out/final.mp4` 可读，`input/`、`work/`、逐帧图和 `render_raw.mp4` 消失。
- 失败：整个沙箱删除（既有回归继续通过）。
- 取消：整个沙箱删除，并且无固定总超时的视频仍可被用户中止。
- 重启：中断遗留的逐帧目录删除，`out/` 诊断/候选文件保留。

## 本机存量清理证据

清理前先确认没有 HyperFrames、FFmpeg 或 Chromium 进程访问 CreatorOS 工作区。CreatorOS CLI 因本机
激活状态刚被清空而未连接，因此没有伪造 CLI 任务状态；本次只依据无运行进程和用户对临时文件的
明确删除授权，定向处理已停止的 8 个旧任务沙箱。

- 删除 4 个 `captured-frames` 目录，其中 2 个为空，另外 2 个共 1,331 张 JPEG；释放约 292 MiB。
- 删除 8 个旧任务的 8 个 `input/` 与 8 个 `work/`。
- 保留 4 个 `out/final.mp4`，总计 671,328,458 bytes（约 640 MiB）。
- `~/CreatorOS/workspaces`：11,611,488 KiB → 655,600 KiB。
- `~/CreatorOS`：19,479,564 KiB → 8,523,676 KiB，本轮合计释放约 10.45 GiB。
- 清理后扫描结果：没有 `captured-frames`、任务 `input/` 或任务 `work/` 目录残留。

## 文档核对

本次没有修改服务契约、页面绑定、正式素材归属、用户确认门或最终成片生命周期。变化仅收紧既有
execution sandbox 的临时文件生命周期；`out/` 仍是候选产物唯一真相，采纳/丢弃后仍清整个沙箱，
与现有执行层契约一致。

全局 `reconcile.mjs` 本轮如实返回失败：包含 BACKLOG 超硬上限、多个历史 SPEC review hash 过期、
历史 frontend receipt 漂移和旧表缺验收列等仓库既有治理欠债；本任务首次运行时另暴露 T-869 把非 UI
任务的验收列误写为裸 `PASS`，已改回不适用的 `—`。本任务自身的 TDD、类型、lint、边界、语义边界
和 orphan gate 均已独立通过，不把全局 106 项既有错误写成全绿。
