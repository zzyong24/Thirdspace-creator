# T-1415 恢复验收后的控制面收口

2026-10-25，沿用用户“把没通过的验收处理好，复验通过后再推送”及“先停一下清理空间”“好的，继续吧”的明确授权。本项只处理已发生的两类控制面问题，不修改产品实现、验收门或审核引擎。

## 事实与最小变更

1. 磁盘清理时 Stop hook 又启动了默认 full，缺本轮 owned PG 且与手动运行重复。暂停时已临时改为 `node orchestrator/process/reconcile.mjs --profile quick --read-only --concise`。保留这个日常只读入口，注释明确完整验收必须显式执行原 `--profile full`。不取消 Stop、不吞退出码、不把 quick 当 full；原55项命令、预算、阈值和本次完整验收义务保持。
2. T-1414 在 `f9e5e5ece` 恢复 AGENTS 中既有完整规则，其 SHA 从 `966350c9181a8b4cd32d03cab4d4516b3c79f9af39f950576ac3e058e0a29f27` 变为 `cfc103d1f2772a3c373005e48191ce1990c73d237e52464f5f16084da51571e9`。直接绑定 AGENTS 的 T-915 与 T-859 因此过期；这不是两个产品缺陷，也不能靠换宪法或手改哈希消除。分别完整独立审核当前 SPEC、当前 AGENTS 及原 finding，保全部历史事件与验收要求。现 reviewctl 要求宪法变更使用新周期：各按上述既有修复授权生成一次精确 typed DEC，绑定 task、上一 spec/constitution SHA、唯一 change ID、新 nonce、Max-Cycles=1；由 reviewctl 正式消费，不复用已消费授权。审核有实质问题则保留 finding，不能照抄旧 PASS。
3. 保全清理时自动 full 实际生成的 `orchestrator/.lessons-stats.json` 变更与原收据，不手改统计数值。其历史失败不能被后续 quick 或本地构建成功覆盖。

## 精确写集

- `.codex/hooks/stop-reconcile.sh`：仅上述参数和注释；shell 定位、Node 缺失提示、退出语义不变。
- `docs/superpowers/specs/2026-09-04-agent-runtime-refactor.review.md`、`docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.review.md`：只由 reviewctl 写当前真实审核快照，保原 lineage；对应 SPEC 与 AGENTS 只读。
- 本 SPEC、其审核、`docs/verification/t1415/**`；BACKLOG、modules.config、context/T-1415、progress、DEC、review-events、taskctl events、pmem 生成 PROJECT，以及原程序已生成的 lessons-stats 变更。

## 验收

运行 `bash -n .codex/hooks/stop-reconcile.sh`，核 hook 精确执行 quick/read-only/concise 且没有额外命令或吞错；当前审核落盘后实际运行 hook，保退出和输出。两份审核须有当前源码/宪法哈希与真实独立初审、一次授权消费，`reviewctl audit`、`backlog-health`、`reconcile --profile quick --read-only` 如实运行。`git diff --check`；pmem sync → reconcile → taskctl 收尾。

完整原门及55项 full 由 T-1412 在独立外盘候选运行；本项通过不签官方 Pi、图片幂等、UI 或完整产品验收。构建与安装产物绑定 `f9e5e5ece`，本项仅控制面文件变化，不把已有二进制改称新提交的构建。
