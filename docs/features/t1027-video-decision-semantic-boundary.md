# T-1027 视频决策语义边界回归

2026-09-30 执行 `node orchestrator/process/reconcile.mjs` 与 `semantic-boundary-scan.mjs`，发现 `backend/src/modules/ai-runtime/video-decisions-runner.ts` 未调用 `material.match` Skill。调查该执行路径中素材/场景选择是遗漏 Skill、迁移断线还是门卫适用范围漂移；若确为产品缺陷，恢复 Skill/模型决定语义、代码只验证真实 ID、归属、类型、时间及幂等。若门卫不适用于该路径，用执行证据调整检查并独立评审，不能仅跳过扫描。验收包含旧版成功样例、实际公共调用链、候选采纳与安全降级回归。当前 T-1020 平台代码未改该文件；此任务是全局 reconcile 的独立根因。

## 2026-10-02 开源工作台整合再验证

video-decisions-runner.ts 未调用 material.match 的检查仍失败。本轮原生工作台没有加入对应 SDK 或改该决策 runner；失败继续由本任务跟踪，不提高基线或虚记通过。见[全仓失败登记](../research/evidence/t1042/complete-editors/global-checks.md)及原始日志。
