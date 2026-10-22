# v3 · Stage 5 — SHIP

## 目标

证明整个产品主线在真实环境中连续可用，已确认范围、契约、实现、证据和已知风险相互一致。片级绿不自动推出产品可发布。

## 核心动作

1. 核对 BUILD 收据与当前 commit。`reconcile --profile quick --read-only` 只证明控制面检查结果；发布所需项目验证及已启用 lessons 仍需在适当隔离和预算下完整执行，保留真实输出。
2. 以用户身份在非 fixture 数据上走完核心主线：入口、读/写、反馈、settled state、next action、返回/刷新与失败恢复。断点建任务退回 BUILD。
3. 核对实际存在的模拟退出记录、未实现需求、过期适配器和临时权限；未清项只能有绑定范围和证据的 accepted risk。
4. 记录联调与发布结论，复杂项目用 `INTEGRATION_REPORT.md` 与 `RELEASE_REVIEW.md`，简单项目可合并并同步清单的产物路径，对齐范围、契约、验证命令、真实主线、可见语言、风险和回滚/停止条件。
5. 发布前核对已有用户授权；没有授权时先完成可审查的发布准备，再请求确认。`git push` 和 deploy 不由流程默认授权。

## 条件能力

- `prompts/prelaunch-engineering-audit.md` 仅在明确发布风险或 `prelaunch` pack 触发时加载。
- `prompts/engineering-retro.md` 仅在 `retro` pack 触发时加载；`prompts/asset-distill.md` 仅在 `asset-mining` pack 触发时加载。
- 只有 `reconcile.config.json` 的 `program_completion_required=true` 才激活 program pack 和当前 release-set GO 证据；单项目不读取 program 规则。
- 采用远端 CI 的项目，用 `project-doctor.mjs` 核对本地接线；GitHub 可用初始化器的 `--ci github` 生成配置或合并候选。验证实际 workflow 结果和远端 required checks，不能以文件存在代替启用证据。纯本地项目在干净副本验证，不为没有托管而额外创建风险授权。

## 门、证据与确认

> **检查：** `gates/14-integration-gate.md`

PASS 必须引用当前 commit、全量必需验证输出、真实主线 witness、适用退出记录、已知风险归属和发布授权状态。骨架见 [`_COMMON.md`](_COMMON.md)。
