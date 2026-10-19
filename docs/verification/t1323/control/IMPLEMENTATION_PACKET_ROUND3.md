# Task Packet · T-1323

> 由 `orchestrator/process/context-compile.mjs` 确定性生成 —— 同一仓库状态重跑逐字节相同。
> read_set、write_set 与验收命令只来自本任务绑定；不得手工扩成其他任务的范围。

## 1. 目标

- **任务**:恢复原Codex混合工具回合的合法检查点读取
- **一句话**:T1320真实恢复保护先被通用call树分区拒绝，合法external_tool→external_agent四call树未到投影；独立诊断与最小方案待审，不扩1320生产W。
- **当前步骤**:implementation
- **任务绑定**:T-1323

### 执行环境（主控制面 lease）

未绑定并行执行环境；沿用 legacy 单会话/共享控制面语义。

## 2. 看板行原文

```
|T-1323|恢复原Codex混合工具回合的合法检查点读取|🔨|PASS[REV:18681a58c74a]|待验|[独立最小问题草案](docs/features/t1323-codex-mixed-tool-checkpoint-read.md)|T1320真实恢复保护先被通用call树分区拒绝，合法external_tool→external_agent四call树未到投影；独立诊断与最小方案待审，不扩1320生产W。|
```

## 3. 引用文档

- `docs/features/t1323-codex-mixed-tool-checkpoint-read.md`

(只给路径不展开内容 —— 子代理按需自己读,别整篇灌进简报。)

## 4. 上下文读取计划

读取根：`/Users/zyongzhu/.codex/skills/product-to-code-orchestrator`
读取模式：compat-full — legacy reconcile.config.json 缺少 context_policy，本次显式使用 compat-full；不修改项目配置

- `rules/global-rules.md`
- `workflows/_COMMON.md`
- `gates/_GATE_EVIDENCE.md`
- `workflows/v3-1-plan.md`
- `gates/01-product-gate.md`
- `templates/PRODUCT_SPEC_TEMPLATE.md`
- `workflows/v3-2-contract.md`
- `gates/03-scope-budget-gate.md`
- `gates/15b-contract-completeness-gate.md`
- `templates/SERVICE_CONTRACT_TEMPLATE.md`
- `workflows/v3-3-design.md`
- `gates/05-ui-gate.md`
- `gates/06-page-spec-gate.md`
- `templates/UI_RULES_TEMPLATE.md`
- `templates/PAGE_SPEC_TEMPLATE.md`
- `workflows/v3-4-build.md`
- `gates/13-tdd-gate.md`
- `workflows/v3-5-ship.md`
- `gates/14-integration-gate.md`
- `rules/product-integrity-rules.md`
- `rules/observability-rules.md`
- `templates/RELEASE_REVIEW_TEMPLATE.md`
- `rules/physical-architecture-rules.md`
- `gates/02-architecture-boundary-gate.md`
- `templates/SYSTEM_ARCHITECTURE_TEMPLATE.md`
- `rules/knowledge-layer-rules.md`
- `rules/program-orchestration-rules.md`
- `rules/orchestrator-state-machine.md`
- `templates/THREAT_MODEL_TEMPLATE.json`
- `rules/ui-implementation-rules.md`
- `gates/09-frontend-implementation-gate.md`
- `gates/10-frontend-validation-gate.md`
- `gates/04-research-first-gate.md`
- `templates/TECHNICAL_RESEARCH_CARD_TEMPLATE.md`
- `rules/mock-data-rules.md`
- `gates/08-mock-data-gate.md`
- `templates/UI_MOCK_PROMPT_TEMPLATE.md`
- `prompts/prelaunch-engineering-audit.md`
- `prompts/engineering-retro.md`
- `prompts/asset-distill.md`

项目权威（项目根相对路径）：

- `orchestrator/SYSTEM_ARCHITECTURE.md`
- `orchestrator/process/boundaries.config.json`
- `orchestrator/THREAT_MODEL.json`

## 5. 知识上下文

无 orchestrator/process/knowledge.config.json —— 本项目未启用知识上下文映射,跳过此节(不影响开工;需要时按 feature_map 约定补配置)。

## 6. 任务边界

### 五问落位（无状态）

1. **谁拥有**：任务绑定 `T-1323`；当前步骤 `implementation`。
2. **前端 / 后端 / 数据 / 宿主边界**：从当前代码树与项目权威确认实际落点；Packet 不替项目发明架构。
3. **Create / Modify / Test**：首次编辑前，把本次创建、修改、测试文件解析到下方 write_set 内；这是会话内清单，不持久化。
4. **不应触碰**：不得触碰 write_set 之外的路径；当前允许范围仅为 `backend/src/modules/execution/execution-checkpoint.service.ts`、`backend/src/modules/execution/model-worker-dispatcher.ts`、`frontend/src/server/__module_integration__/codex-mixed-checkpoint.persistence-client.test.ts`、`docs/verification/t1323/runtime/round3/**`、`docs/verification/t1323/IMPLEMENTATION_RESULT.md`；主控制面仅按既有协议由主会话更新。
5. **最小验证**：
- [模块 T-1323 · implementation] `node tools/timeout-policy/verify.mjs`
- [模块 T-1323 · implementation] `node orchestrator/process/boundary-scan.mjs --quiet`
- [模块 T-1323 · implementation] `node orchestrator/process/semantic-boundary-scan.mjs`
本检查复用现有 task binding、边界与 verify，不新增状态或工件。

read_set（并行依赖）：

- `AGENTS.md`
- `orchestrator/SYSTEM_ARCHITECTURE.md`
- `frontend/src/server/persistence-client.ts`
- `frontend/src/server/execution-worker-path.ts`
- `backend/src/modules/execution/execution-call-tree.ts`
- `backend/src/modules/execution/execution-lease.service.ts`
- `backend/src/modules/execution/execution-call-ledger.service.ts`
- `backend/src/modules/execution/execution-codex-call.service.ts`
- `backend/src/modules/execution/execution-model-identity.service.ts`
- `backend/src/modules/execution/execution-chat-model-identity.service.ts`
- `backend/src/modules/execution/codex-read-recovery.ts`
- `backend/src/modules/execution/agentic-tool-binding.ts`
- `backend/src/modules/execution/execution-chat-tool-ports.service.ts`
- `backend/src/modules/execution/chat-tool-stream-projection.service.ts`
- `backend/src/modules/execution/chat-tool-stream-chunks.ts`
- `backend/src/modules/ai/external-chat-call-tree.ts`
- `backend/src/modules/ai/external-task-tool.service.ts`
- `backend/src/modules/ai/external-chat-turn.service.ts`
- `backend/src/modules/ai/chat-turn-submission.service.ts`
- `backend/src/application/chat/assistant-system-root.ts`
- `backend/src/modules/ai-runtime/chat-system-tool-host.ts`
- `ai-worker/src/execution/external-chat-worker-run.ts`
- `ai-worker/src/execution/external-chat-recovery.ts`
- `ai-worker/src/execution/codex-native-turn.ts`
- `ai-worker/src/execution/codex-app-server.ts`
- `ai-worker/src/execution/chat-generation-worker.ts`
- `contract/src/internal/execution-worker.ts`
- `frontend/vitest.config.ts`
- `backend/vitest.config.ts`
- `frontend/src/server/__module_integration__/mixed-codex-tool-stream.persistence-client.test.ts`
- `docs/verification/t1320/runtime/WORKER_BINDING.json`
- `docs/verification/t1320/runtime/codex-cli.fixture.cjs`
- `docs/verification/t1320/runtime/worker-entry.fixture.cjs`
- `docs/verification/t1320/runtime/vitest.config.ts`
- `docs/verification/t1320/runtime/run-owned.py`
- `docs/verification/t1320/runtime/RECOVERY_LIMITATION.json`
- `docs/verification/t1320/runtime/green-protection-v2/execution-result.json`
- `docs/verification/t1320/IMPLEMENTATION_RESULT.md`
- `docs/verification/t1323/INITIAL_REVIEW.md`
- `docs/verification/t1323/RECHECK_REVIEW.md`
- `docs/verification/t1323/ANALYSIS.md`
- `docs/features/t1323-codex-mixed-tool-checkpoint-read.md`
- `docs/verification/t1323/DEC.md`
- `docs/verification/t1323/INPUT_LOCK.json`
- `backend/src/modules/execution/execution-checkpoint.service.test.ts`
- `docs/verification/t1320/runtime/green-protection-v2/snapshot/frontend/src/server/__module_integration__/mixed-codex-tool-stream.persistence-client.test.ts`
- `docs/verification/t1320/runtime/green-protection-v2/snapshot/docs/verification/t1320/runtime/codex-cli.fixture.cjs`
- `docs/verification/t1320/runtime/green-protection-v2/snapshot/docs/verification/t1320/runtime/worker-entry.fixture.cjs`
- `docs/verification/t1320/runtime/green-protection-v2/snapshot/docs/verification/t1320/runtime/WORKER_BINDING.json`
- `docs/verification/t1320/runtime/green-protection-v2/snapshot/immutable-execution-worker.cjs`
- `docs/verification/t1323/INPUT_LOCK_AFTER_SIBLINGS.json`
- `docs/verification/t1323/REBIND_AFTER_SIBLINGS.json`
- `backend/src/modules/execution/tool-parameter-recovery.ts`
- `docs/verification/t1323/runtime/ROUND3_DELTA_PROPOSAL.md`
- `docs/verification/t1323/runtime/ordinary-source-red-v1/execution-result.json`
- `docs/verification/t1323/runtime/ordinary-source-red-v1/BEFORE_INPUTS.json`
- `docs/verification/t1323/runtime/cases/ordinary-source-red-v1/recovery/ordinary-input-target-observation.json`
- `docs/verification/t1323/INPUT_LOCK_ROUND3.json`
- `docs/verification/t1323/DEC_ROUND3.md`
- `docs/verification/t1323/runtime/red-v1/**`
- `docs/verification/t1323/runtime/red-v2/**`
- `docs/verification/t1323/runtime/red-v3/**`
- `docs/verification/t1323/runtime/green-v1/**`
- `docs/verification/t1323/runtime/green-guards-v1/**`
- `docs/verification/t1323/runtime/ordinary-source-red-v1/**`
- `docs/verification/t1323/runtime/cases/**`
- `docs/verification/t1323/MODULE_SCOPE_ROUND3_EXECUTION.json`

exclusive_resources（必须串行的逻辑资源）：

- `t1323-owned-checkpoint-runtime`

write_set（允许修改）：

- `backend/src/modules/execution/execution-checkpoint.service.ts`
- `backend/src/modules/execution/model-worker-dispatcher.ts`
- `frontend/src/server/__module_integration__/codex-mixed-checkpoint.persistence-client.test.ts`
- `docs/verification/t1323/runtime/round3/**`
- `docs/verification/t1323/IMPLEMENTATION_RESULT.md`

说明:write_set = 本任务允许触碰的文件/目录清单。**并行任务的 write_set 必须不相交**；write_set 相交或存在语义冲突时必须串行。worktree 只隔离工作空间，不能把冲突任务变安全(协议见 rules/parallel-collab-rules.md)。子代理越出 write_set 的改动视为违规,主 agent 合并时拒收。

## 7. 验收判据

- [模块 T-1323 · implementation] `node tools/timeout-policy/verify.mjs`
- [模块 T-1323 · implementation] `node orchestrator/process/boundary-scan.mjs --quiet`
- [模块 T-1323 · implementation] `node orchestrator/process/semantic-boundary-scan.mjs`

## 8. 禁止事项

指针:项目根 **AGENTS.md**。项目约束以 AGENTS.md 与本 Packet 的结构化边界为准；框架不注入项目专属优先级、模型、阶段或范围政策。

## 9. 受阻协议

同一障碍失败 2 次 = 停止并报告(带已试过什么、卡在哪、需要什么);被 hook / permission 拒 = 政策禁止,**禁止换措辞重试**。子代理不能提问 —— 受阻即返回,不许在原地打转。

## 10. 版本锚

- git HEAD:`b7e3753a8`
- BACKLOG.md sha256(前 12 位):`ee3d25650755`
