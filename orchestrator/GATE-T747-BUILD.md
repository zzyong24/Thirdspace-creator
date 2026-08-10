# T-747 BUILD Gate — 启动进展感知软看门狗

日期：2026-08-09
状态：实现与本机回归通过

用户已明确取消视觉校验；本任务不生成或伪造视觉旅程收据，以启动契约和原生看门狗测试验收。

## 用户确认口径

用户明确要求启动时间不要硬性卡死，低性能电脑、首次解压和迁移偶尔超时属于正常情况。本次只调整
启动等待机制与诊断文案，不改页面视觉或业务功能。

## 行为

- 删除 60 秒硬截止；
- sidecar stdout/stderr 每次出现非空真实输出都刷新进展时间；
- 连续 5 分钟无任何进展才进入超时诊断；
- 保留 30 分钟最终安全上限，防止永久挂死；
- sidecar 退出或真实启动失败仍立即显示诊断页；
- 用户文案不再写死“60 秒”。

## TDD 与验证证据

RED：

```text
cargo test startup_soft_watchdog_allows_slow_but_progressing_machines --lib
结果：编译失败；软看门狗常量与判定函数尚不存在。

pnpm exec vitest run scripts/desktop/startup-safety-contract.test.mjs
结果：1 fail；仍存在 60 秒硬截止。
```

GREEN：

```text
cargo test --lib
结果：160 pass / 0 fail / 1 live test ignored

pnpm exec vitest run scripts/desktop/startup-safety-contract.test.mjs
结果：10 pass / 0 fail

pnpm --filter creatoros-frontend typecheck
结果：PASS

pnpm --filter creatoros-frontend build
结果：PASS

cargo fmt --check
结果：PASS

boundary / orphan / test-integrity / git diff --check
结果：PASS（既有 warning 见 T-746 Gate，不伪造为零 warning）

reconcile
结果：2 个范围外既有 receipt 漂移错误（T-727、T-722）；本任务对应检查无新增错误
```
