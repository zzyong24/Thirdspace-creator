# 阶段状态与执行边界

本文件定义阶段状态；实际状态由项目清单、任务账本和校验脚本共同确认。授权和提问统一遵循 `workflows/_COMMON.md`，不在这里另建审批流程。

## 状态与材料

| 状态值 | 含义 |
| --- | --- |
| `not-started` | 尚无可用产物 |
| `draft` | 产物未通过检查 |
| `needs-user-confirmation` | 有当前授权未覆盖的实质性决定 |
| `blocked` | 缺少必要条件，无法合理默认 |
| `passed` | 必要产物与适用检查均通过 |
| `compact` | S 类设计内容合入产品规格，条件见下文 |
| `accepted-risk` | 检查失败，用户已明确接受具体风险 |
| `invalidated` | 上游变化使原有产物失效 |

`ARTIFACT_MANIFEST.yaml` 记录阶段、路径、依赖和检查结果；`DECISION_LOG.md` 记录必要决定。仅在启用追踪时维护 `ID_REGISTRY.md`、`TRACEABILITY_MATRIX.md`；已批准内容发生实质变化时才建立 `CHANGE_IMPACT.md`。不要为了填满模板生成空文件。

阶段通过需要真实产物和适用证据。失败、阻塞或失效的必要上游不能作为实施依据。上游变化只使受影响阶段和任务失效：需求影响对应契约及后续实现，页面结构影响对应设计，操作契约影响消费者和测试。清单记录阶段状态，看板和矩阵记录具体任务；不把局部改动扩大成全项目重审。保留历史失败及修复证据，不把失败改名为失效。

## 两种例外的机器约定

`compact` 不等于 `accepted-risk`，前者缩小表达，后者接受已知失败风险。

- `compact` 只允许 `scale_class S` 的 `3-design`，由 DEC-000 覆盖，`gate_status: "not-run"`，notes 必须为 `skipped-by-DEC-000 (class S); compact DESIGN stays inside PRODUCT_SPEC.md`。开始 BUILD 前，产品规格必须包含完整 IA 和具体 `Compact sketch`。这两个英文值是校验协议，不能翻译或换词。
- `accepted-risk` 的阶段状态与检查状态均为同值，notes 用 `accepted-risk: DEC-NNN` 指向唯一决定。决定必须绑定阶段，包含 `Type: accepted-risk`、`Owner: user`、`Status: active` 和 `Violation / Why needed / Simpler alternative rejected because / Gate-Attempt / Gate-Evidence`；失败证据必须在仓内存在且非空。Agent 不能替用户接受风险。

`reconcile.mjs` 校验清单结构、文件与 Git 状态、决策日期及已配置检查。`quick --read-only` 仅提供控制面审计，明确跳过执行型检查；不能拿它代替 full、真实业务验证或跨项目旅程。`consistency_gate.status: fail` 时，被阻塞阶段不能标为通过；确有风险授权则使用上面的例外协议。规则由项目内 `rule-bundle` 的版本及内容哈希固定；旧项目外部路径兼容不等于可复现，使用受保护更新和迁移诊断修复。

## 从建设到维护

`delivery_phase` 与规模、自治等级相互独立。新项目默认 `buildout`：实现、可执行验证、联调验收，不运行正式评审轮次。已有授权仍然有效；超出授权的产品、权限、数据归属、公开契约或发布决定才需要补充确认。

整体功能稳定且用户同意后，`delivery-phase.mjs promote --decision DEC-xxx` 绑定干净提交和用户决定，切换到 `maintenance`。此后稳定功能的改动才启用正式评审。旧项目缺少阶段字段按维护模式兼容，不静默降级为建设模式。

## 自治运行

范围确认不等于开启无人值守。L2 及以上需要 `reconcile.config.json` 显式配置，并通过 `progress.json`、`modules.config.json` 和授权预检。等级表示允许的执行方式，不能替代实际宿主能力或用户授权。

| 等级 | 执行范围 |
| --- | --- |
| L0 | 用户明确要求逐步参与时逐步推进 |
| L1 | 在已确认计划内完成单项工作 |
| L2 | 依赖就绪的任务持续执行、验证和提交；新决定进入队列 |
| L3 | 经授权可并行处理无读写或资源冲突的任务，由主会话串行集成 |
| L4 | 在明确范围内持续推进到候选交付，发布仍按具体授权处理 |

`process/harness/run.sh` 是串行 Claude CLI 适配器，不是 GPT-6 Astra 的启动器，也不会自动创建并行工作者。Codex 主会话可使用相同任务协议；并行需遵循 `rules/parallel-collab-rules.md` 与当前宿主授权。

执行循环保存提交与任务状态，运行任务验证和漂移检查。维护模式按配置启用两轮只读评审；仅运行器可在双重通过且非高影响时调用 `progress.mjs verify` 写入 `e2e_verified`。评审者只输出结论。该标记不自动授权合并、推送或部署。

遇到验证失败按实际修复预算处理；达到上限、连续无法推进、必要环境缺失或出现范围外决定时停止受影响任务，允许其他依赖就绪任务继续。研究触发条件见 `gates/04-research-first-gate.md`。产品整体审计按联调、发布或用户要求触发，不承诺运行器不存在的“每十个任务自动审计”。

## 任务状态与隔离

- `step_depends_on.<step>` 存在时使用该步的精确依赖，否则继承模块 `depends_on`。
- 中间步骤记录真实提交，看板仍为 `🔨`；最后一步完成才为 `✅`。不能通过回退、暂停或提前结束任务绕过检查。
- `claim` 和 `done` 都校验依赖、任务阻塞、隔离状态和租约所有者。提交不能覆盖他人的租约。
- 并行工作者不写控制文件、不推送；每个写入任务交回一个候选提交，由主会话领取和集成。
- 历史评审、复杂度和威胁欠账按任务隔离；基线必须绑定实际任务、事件前缀或文件哈希。旧授权不覆盖新事件，不能靠扩大基线放行当前违规。

待确认决定由 `queue.mjs` 查询；收到实际用户回答后，用 `queue.mjs resolve <DEC-id>` 记录解决，再解除对应任务阻塞。推送和部署需要具体授权；已经取得授权时不重复询问。
