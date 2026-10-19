# Task Packet · T-1301

> 由 `orchestrator/process/context-compile.mjs` 确定性生成 —— 同一仓库状态重跑逐字节相同。
> read_set、write_set 与验收命令只来自本任务绑定；不得手工扩成其他任务的范围。

## 1. 目标

- **任务**:修复图片分类冻结模型路由消费不一致
- **一句话**:T1300真实新上传自动分类UNKNOWN，独立修复身份消费vision/structured不一致；保原task及409/未知，不改creation审核、worker策略或恢复授权，作为T1300验收依赖。
- **当前步骤**:acceptance
- **任务绑定**:T-1301

### 执行环境（主控制面 lease）

未绑定并行执行环境；沿用 legacy 单会话/共享控制面语义。

## 2. 看板行原文

```
|T-1301|修复图片分类冻结模型路由消费不一致|🔨|PASS[REV:438d930c5f60]|待验|[独立执行模型身份根因](docs/features/t1301-asset-classify-frozen-model-route.md)|T1300真实新上传自动分类UNKNOWN，独立修复身份消费vision/structured不一致；保原task及409/未知，不改creation审核、worker策略或恢复授权，作为T1300验收依赖。|
```

## 3. 引用文档

- `docs/features/t1301-asset-classify-frozen-model-route.md`

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

1. **谁拥有**：任务绑定 `T-1301`；当前步骤 `acceptance`。
2. **前端 / 后端 / 数据 / 宿主边界**：从当前代码树与项目权威确认实际落点；Packet 不替项目发明架构。
3. **Create / Modify / Test**：首次编辑前，把本次创建、修改、测试文件解析到下方 write_set 内；这是会话内清单，不持久化。
4. **不应触碰**：不得触碰 write_set 之外的路径；当前允许范围仅为 `docs/verification/t1301/acceptance/public/**`、`docs/verification/t1301/acceptance/runs/**`、`docs/verification/t1301/REPORT.md`、`docs/verification/t1301/GATES_REVIEW.md`、`docs/verification/t1301/PUBLIC_VALIDATION.md`；主控制面仅按既有协议由主会话更新。
5. **最小验证**：
- [模块 T-1301 · acceptance] `node tools/timeout-policy/verify.mjs`
本检查复用现有 task binding、边界与 verify，不新增状态或工件。

read_set（并行依赖）：

- `docs/features/t1301-asset-classify-frozen-model-route.md`
- `orchestrator/SYSTEM_ARCHITECTURE.md`
- `contract/src/internal/execution-engine.ts`
- `contract/src/internal/model-routing.ts`
- `contract/src/internal/execution-worker.ts`
- `contract/src/internal/chat-worker.ts`
- `contract/src/operations/ai.ts`
- `contract/src/operations/assets.ts`
- `backend/src/modules/execution/execution-codex-call.service.ts`
- `backend/src/modules/execution/codex-read-recovery.ts`
- `backend/src/modules/execution/model-call-recovery.ts`
- `backend/src/modules/execution/execution-asset-result.service.ts`
- `backend/src/modules/execution/model-worker-dispatcher.ts`
- `backend/src/modules/execution/execution-asset-processing.service.ts`
- `backend/src/modules/ai-runtime/asset-processing-business-adapter.ts`
- `backend/src/modules/ai-runtime/structured-business-execution.service.ts`
- `frontend/src/server/persistence-client.ts`
- `frontend/src/features/draft-workbench/upload-to-project.ts`
- `ai-worker/src/execution/asset-processing-worker.ts`
- `docs/verification/t1301/IMPLEMENTATION_RESULT.md`
- `docs/verification/t1301/acceptance/candidate/candidate-binding.json`
- `docs/verification/t1301/acceptance/candidate/driver/**`
- `docs/verification/t1301/acceptance/candidate/creatoros-product-manifest.json`
- `docs/verification/t1301/acceptance/candidate/creatoros-release-attestation.json`
- `docs/verification/t1301/acceptance/candidate/creatoros-release-manifest.json`
- `docs/verification/t1301/acceptance/candidate/freeze-preflight.json`
- `docs/verification/t1301/acceptance/candidate/CONTROL_SCOPE.json`
- `docs/verification/t1301/acceptance/candidate/CONTROL_PREFLIGHT.json`
- `docs/verification/t1301/acceptance/candidate/BUILD_EXECUTION.json`
- `docs/verification/t1301/acceptance/candidate/PUBLIC_A_WINDOW.json`

exclusive_resources（必须串行的逻辑资源）：

- `t1300-shared-checkout-single-writer`
- `creatoros-browser-slot`
- `owned-production-candidate`

write_set（允许修改）：

- `docs/verification/t1301/acceptance/public/**`
- `docs/verification/t1301/acceptance/runs/**`
- `docs/verification/t1301/REPORT.md`
- `docs/verification/t1301/GATES_REVIEW.md`
- `docs/verification/t1301/PUBLIC_VALIDATION.md`

说明:write_set = 本任务允许触碰的文件/目录清单。**并行任务的 write_set 必须不相交**；write_set 相交或存在语义冲突时必须串行。worktree 只隔离工作空间，不能把冲突任务变安全(协议见 rules/parallel-collab-rules.md)。子代理越出 write_set 的改动视为违规,主 agent 合并时拒收。

## 7. 验收判据

- [模块 T-1301 · acceptance] `node tools/timeout-policy/verify.mjs`

## 8. 禁止事项

指针:项目根 **AGENTS.md**。项目约束以 AGENTS.md 与本 Packet 的结构化边界为准；框架不注入项目专属优先级、模型、阶段或范围政策。

## 9. 受阻协议

同一障碍失败 2 次 = 停止并报告(带已试过什么、卡在哪、需要什么);被 hook / permission 拒 = 政策禁止,**禁止换措辞重试**。子代理不能提问 —— 受阻即返回,不许在原地打转。

## 10. 版本锚

- git HEAD:`c5f638fe5`
- BACKLOG.md sha256(前 12 位):`5605191a9c17`
