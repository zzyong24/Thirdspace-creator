# T-1414 恢复关键链路可用性规则摘要

2026-10-25，沿用用户“有问题继续修复，复验通过后再推送”的授权。冻结候选 922b2afbc 的真实完整对账已发现 LED-043 首项失败：AGENTS.md 摘要仅剩简写，原守卫要求的四项既有规则在摘要中缺失。完整原文仍在 docs/engineering/agent-rules.md 第15–20行；不新增产品规则。

## 精确变更

仅把 AGENTS.md 的“严禁假按钮；关键链路不许被新质量门反杀，能安全降级就先降级”恢复为完整规则文件中的两条原规则：严禁假按钮，以及关键链路禁止质量门反杀可用性。保留合法任务不得整单失败、必须先确定性降级、hard-fail 仅限原有例外、旧版成功样例与完整公共链及全部输入族回归、孤立 helper 不得代签。按原文字节复制，不只拼测试关键词。

不改测试、lesson check/预算/阈值、账本、历史验收要求、产品实现或用户确认。当前运行的 full 工作树继续冻结；本片在主 checkout 登记，待该 full 结束后再整合复验，不改运行中候选。

## 写入边界

- AGENTS.md 的上述一条摘要；其它内容保持原样。
- 本 SPEC、对应审核文档、docs/verification/t1414/**。
- root 登记所需 BACKLOG、modules.config、context/T-1414、progress、taskctl/review 事件及 pmem 生成 PROJECT.md。

## 验收

1. 保存当前真实 full 的 LED-043 失败片段及测试四项断言缺失事实；它是已发生的失败，不补拍 TDD。
2. 证明新段与 docs/engineering/agent-rules.md 两条现存规则逐字一致，其余 AGENTS 内容未变。
3. 运行原 node --test orchestrator/process/critical-path-availability-rule.test.mjs，保留真实退出和完整输出；不改测试。
4. 在干净验证工作树跑原完整 LED-043 命令（含既有 frontend/backend 回归），再把结果带入 root 的整体对账。其余未过项继续保留，不以文档修复签整体验收。
5. git diff --check；root 按既有 pmem sync → reconcile → taskctl 流程收尾。

无产品、UI、数据或架构变化，不需要新业务测试。独立评审只核现有规则恢复的完整性及范围，不能授权降低验收标准。
