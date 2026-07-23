# T-471 流程补正与统一 Agent 入口 SPEC

> 任务：T-483
> 状态：用户已确认（2026-07-23），可实施
> 性质：流程治理与历史补正，不改变 CreatorOS 产品方向、数据归属或物理架构
> 评审判定：不触发跨模型产品/架构 SPEC review；本 SPEC 的目标正是恢复既有
> `product-to-code-orchestrator` 门禁。历史缺口不得通过补文档伪装成“当时已执行”。

## 1. 问题

CreatorOS 原本以 `product-to-code-orchestrator` 作为产品到代码的控制流程，但当前
`AGENTS.md` 只要求读取 `PROJECT.md`、查看 `pmem` 和阅读物理架构，没有明确要求：

- 识别产品需求后加载 `product-to-code-orchestrator`；
- 检查 vendored orchestrator 与技能版本；
- 通过 `stage-router` 选入口；
- 用 `taskctl` 转换任务状态并写入 append-only 事件；
- 使用 SPEC 与任务看板作为计划，禁止另建 writing-plans 风格实施清单；
- 在契约、架构、数据归属等变化前运行相应 Gate。

结果是 T-471（OpenAI Responses 协议支持）虽然实现和测试完成，却绕过了控制层：
没有前置 SPEC、DEC、稳定 ID、追踪矩阵和 TDD 红测证据，任务状态也没有经过
`taskctl`。

## 2. 目标

1. 让 Codex、Claude Code 和其他 Agent 进入仓库后执行同一套 orchestrator 流程。
2. 把 T-471 已经发生的需求、契约、实现与测试重新建立可追踪关系。
3. 对无法追溯的历史事实明确标记为缺失或 accepted-risk，不伪造证据。
4. 保留 T-471 已验证的代码，不以“流程补正”为理由无意义重写。

## 3. 非目标

- 不重做 CreatorOS 全产品 PLAN → SHIP。
- 不声称 T-471 在实现前已经通过 SPEC review 或 TDD 红测。
- 不把本任务扩成全量 `BACKLOG.md` 清理；现有看板膨胀另行治理。
- 不触发付费 GitHub Actions，也不使用真实付费模型额度做探测。

## 4. 现成方案与仓内复用

| 能力 | 采用方案 | 依据 |
|---|---|---|
| 产品到代码流程 | 已安装的 `product-to-code-orchestrator` | 技能 `SKILL.md` 是当前流程定义 |
| 任务状态 | `orchestrator/process/taskctl.mjs` | 唯一程序化状态写入口，写 `events.ndjson` |
| 阶段路由 | `prompts/stage-router.md` | 选择最早开放阶段和 BUILD 顶部任务 |
| 漂移检查 | `orchestrator/process/reconcile.mjs` | 校验 manifest、边界和控制层 |
| 双向追踪 | `ID_REGISTRY.md` + `TRACEABILITY_MATRIX.md` + orphan scan | 防止需求或实现成为孤儿 |
| 物理边界 | `SYSTEM_ARCHITECTURE.md` + `boundary-scan.mjs` | 本任务不改变现有三房间边界 |

不另造第二套 task runner、第二份 manifest 或新的 Agent 专用流程。

## 5. 设计

### 5.1 会话入口

`AGENTS.md` 首屏增加一条不可跳过的产品流程：

1. 读 `BACKLOG.md` 顶部可执行任务及其 SPEC；
2. 当用户提出需求、产品变更或跨层能力时，必须加载
   `product-to-code-orchestrator`；
3. 比较技能 `VERSION` 与 `orchestrator/process/.skill-version`；
4. 运行 `stage-router`，说明阶段、产物、Gate 和确认点；
5. 用 `taskctl start/complete/block` 转换状态；
6. 禁止使用 writing-plans 文档替代 SPEC/看板；
7. 结束前运行任务对应测试、Gate、`pmem sync` 与 `reconcile`。

`pmem` 保留为项目记忆同步工具，但不再承担 BACKLOG 状态转换。

### 5.2 T-471 历史补正

- 新建聚焦 SPEC：`2026-07-23-openai-responses-protocol-design.md`。
- 删除错误形态的 writing-plans 实施文档；Git 历史仍保留原始记录。
- 登记 `FR-069`、`FLOW-023`、`API-008`、`API-009` 和 T-471 测试 ID。
- 在 `DECISION_LOG.md` 记录：
  - 用户确认正式支持 Responses；
  - Chat 与 Responses 必须显式分流；
  - 历史 TDD 红证据缺失，不能补拍。
- 在 `CHANGE_IMPACT.md` 记录契约枚举变化及已重验的下游。
- 在 `TRACEABILITY_MATRIX.md` 增加 T-471 完整链。
- 生成补正 Gate 报告，区分已通过、accepted-risk 和尚待真机验证。

### 5.3 诚实边界

可以补做并作为当前证据：

- 类型检查、单元/集成回归；
- CreatorOS 对 `/responses` 的请求形状测试；
- 本地 Thirdspace-api（New API fork）的 Responses 路由/转换测试；
- sidecar 包含三种 Pi 协议模块的自检；
- boundary scan、orphan scan、reconcile。

不能追溯为历史事实：

- “测试在实现前先红”；
- “SPEC 在实现前已评审”；
- “T-471 当时通过 taskctl 从 📋→🔨→✅”。

这些缺口写入 DEC 与 Gate，不能改写成 PASS。

## 6. 验收标准

- [x] `AGENTS.md` 明确指向 `product-to-code-orchestrator`，同时适用于 Codex/Claude。
- [x] `PROJECT_CONTEXT.md` 记录中文输出、流程技能和版本策略。
- [x] T-471 的 BACKLOG 文档链接指向正式 SPEC，行内容符合一句话规则。
- [x] 新增 T-483 经 `taskctl` 留下 start/complete 事件。
- [x] T-471 在 DEC、ID、追踪矩阵、变更影响和 Gate 报告中均可查询。
- [x] 原 writing-plans 文档不再作为当前流程产物。
- [x] 相关测试、Thirdspace-api 兼容测试、边界扫描与 reconcile 有新鲜证据。
- [x] 无法补回的历史证据明确标记为 accepted-risk，而不是 PASS。

验收执行结果见 `orchestrator/GATE-T471-RETROSPECTIVE.md`。其中功能与本次补正工件已
通过；项目级 reconcile 受既有活动台账膨胀阻断，已登记独立任务 `T-484`，不在本任务
内大范围重写历史任务语义。
