# Task Packet · T-1305

> 由 `orchestrator/process/context-compile.mjs` 确定性生成 —— 同一仓库状态重跑逐字节相同。
> read_set、write_set 与验收命令只来自本任务绑定；不得手工扩成其他任务的范围。

## 1. 目标

- **任务**:恢复候选来源网络失败后的中文说明与原位重读
- **一句话**:T1303真实source失败仅英文且creation关开不重读；两卡来源await中文提示及原预览显式重开恢复，保具体业务错误/body-key/source/CAS，不全局改transport。
- **当前步骤**:acceptance
- **任务绑定**:T-1305

### 执行环境（主控制面 lease）

未绑定并行执行环境；沿用 legacy 单会话/共享控制面语义。

## 2. 看板行原文

```
|T-1305|恢复候选来源网络失败后的中文说明与原位重读|🔨|PASS[REV:347298be9a66]|待验|[真实来源失败提示窄修](docs/features/t1305-candidate-source-network-error-guidance.md)|T1303真实source失败仅英文且creation关开不重读；两卡来源await中文提示及原预览显式重开恢复，保具体业务错误/body-key/source/CAS，不全局改transport。|
```

## 3. 引用文档

- `docs/features/t1305-candidate-source-network-error-guidance.md`

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

1. **谁拥有**：任务绑定 `T-1305`；当前步骤 `acceptance`。
2. **前端 / 后端 / 数据 / 宿主边界**：从当前代码树与项目权威确认实际落点；Packet 不替项目发明架构。
3. **Create / Modify / Test**：首次编辑前，把本次创建、修改、测试文件解析到下方 write_set 内；这是会话内清单，不持久化。
4. **不应触碰**：不得触碰 write_set 之外的路径；当前允许范围仅为 `docs/verification/t1305/acceptance/public/a/final-t1304-t1305/**`、`docs/verification/t1305/acceptance/runs/final-t1304-t1305/a/**`、`docs/verification/t1305/UI_ACCEPTANCE.md`；主控制面仅按既有协议由主会话更新。
5. **最小验证**：
- [模块 T-1305 · acceptance] `node tools/timeout-policy/verify.mjs`
本检查复用现有 task binding、边界与 verify，不新增状态或工件。

read_set（并行依赖）：

- `docs/features/t1305-candidate-source-network-error-guidance.md`
- `orchestrator/SYSTEM_ARCHITECTURE.md`
- `.agents/skills/oil-ui-pro/SKILL.md`
- `.agents/skills/oil-ui-pro/references/interaction-and-state.md`
- `docs/features/t1022-account-group-workspace/UI_RULES.md`
- `frontend/src/components/ui/dialog.tsx`
- `frontend/src/features/draft-workbench/draft-chat-rail.tsx`
- `frontend/src/features/draft-workbench/draft-chat-request.tsx`
- `frontend/src/lib/creation-workspace-scope.ts`
- `frontend/src/lib/http-transport.ts`
- `docs/features/t1303-derived-draft-and-adoption-recovery.md`
- `docs/verification/t1303/UI_ACCEPTANCE.md`
- `docs/verification/t1303/FRONTEND_VALIDATION.md`
- `docs/verification/t1303/acceptance/runs/recovery2-8ced635/a/EVIDENCE_SHA256.json`
- `docs/verification/t1303/acceptance/runs/recovery2-8ced635/a/VALIDATION_SUMMARY.json`
- `docs/verification/t1303/acceptance/runs/recovery2-8ced635/a/article-narrow-Escape-close-immediate.json`
- `docs/verification/t1303/acceptance/runs/recovery2-8ced635/a/source-failure-result.json`
- `docs/verification/t1303/acceptance/candidate/candidate-binding.json`
- `docs/verification/t1303/acceptance/control/RECOVERY2_SHUTDOWN.json`
- `frontend/src/app/(creator)/projects/[projectId]/stage-chat-wrapper.tsx`
- `frontend/src/app/(creator)/projects/[projectId]/stage-chat-wrapper.test.tsx`
- `frontend/src/features/copilot/work-candidate-adoption.ui.integration.test.tsx`
- `frontend/src/features/copilot/chat-work-creation-card.tsx`
- `docs/verification/t1305/DEC.md`
- `docs/verification/t1305/INPUT_LOCK.json`
- `frontend/src/features/copilot/chat-work-editor-card.tsx`
- `docs/verification/t1305/IMPLEMENTATION_RESULT.md`
- `docs/verification/t1304/IMPLEMENTATION_RESULT.md`
- `docs/verification/t1304/IMPLEMENTATION_REVIEW.md`
- `docs/verification/t1304/IMPLEMENTATION_REVIEW.json`
- `docs/verification/t1304/runtime/final-source-binding.json`
- `docs/verification/t1304/runtime/EVIDENCE_SHA256.json`
- `docs/verification/t1304/control/implementation-done-attempt1.log`
- `docs/verification/t1303/acceptance/runs/final-t1304-t1305/b/**`
- `docs/verification/t1304/UI_ACCEPTANCE.md`
- `docs/verification/t1304/ACCEPTANCE_REVIEW.md`
- `docs/verification/t1304/ACCEPTANCE_REVIEW.json`
- `docs/verification/t1304/acceptance/candidate/candidate-binding.json`
- `docs/verification/t1304/acceptance/candidate/driver/**`
- `docs/verification/t1304/acceptance/candidate/runs/owned-2eec1b4db4a15e7d/ready.json`

exclusive_resources（必须串行的逻辑资源）：

- `t1300-shared-checkout-single-writer`
- `creatoros-browser-slot`
- `owned-production-candidate`

write_set（允许修改）：

- `docs/verification/t1305/acceptance/public/a/final-t1304-t1305/**`
- `docs/verification/t1305/acceptance/runs/final-t1304-t1305/a/**`
- `docs/verification/t1305/UI_ACCEPTANCE.md`

说明:write_set = 本任务允许触碰的文件/目录清单。**并行任务的 write_set 必须不相交**；write_set 相交或存在语义冲突时必须串行。worktree 只隔离工作空间，不能把冲突任务变安全(协议见 rules/parallel-collab-rules.md)。子代理越出 write_set 的改动视为违规,主 agent 合并时拒收。

## 7. 验收判据

- [模块 T-1305 · acceptance] `node tools/timeout-policy/verify.mjs`

## 8. 禁止事项

指针:项目根 **AGENTS.md**。项目约束以 AGENTS.md 与本 Packet 的结构化边界为准；框架不注入项目专属优先级、模型、阶段或范围政策。

## 9. 受阻协议

同一障碍失败 2 次 = 停止并报告(带已试过什么、卡在哪、需要什么);被 hook / permission 拒 = 政策禁止,**禁止换措辞重试**。子代理不能提问 —— 受阻即返回,不许在原地打转。

## 10. 版本锚

- git HEAD:`16d93a70d`
- BACKLOG.md sha256(前 12 位):`554482510733`
