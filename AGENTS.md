# AGENTS.md — CreatorOS 唯一规则入口（Codex / Claude Code / 其他 Agent）

本文件是项目规则的唯一真相；CLAUDE.md 只指向这里。规则全文、原 CLAUDE.md 条款与已废止条款见
[docs/engineering/agent-rules.md](docs/engineering/agent-rules.md)。产品到代码流程由技能
`product-to-code-orchestrator` 管理，接需求、设计、跨层改动时必须按它走，不退回自由编码。

## 开工必读（只读这些）

1. **任务包**：`node orchestrator/process/context-compile.mjs <T-id>` → `orchestrator/context/<T-id>.md`。
   必读 §1–5、§7–9；§6 任务边界只在写文件前核对自己要改的路径。编不出任务包时，读
   BACKLOG.md 该任务那一行和它引用的 SPEC 段落。
2. **规则包按需读**：任务包 §4 列的规则文件，到对应阶段 / Gate 时再读，不在开工时全读。
3. **不再默认全读**：PROJECT.md、PROJECT_CONTEXT.md、技能 SKILL.md / stage-router、
   [SYSTEM_ARCHITECTURE](orchestrator/SYSTEM_ARCHITECTURE.md) 只在跨层、改架构 / 数据归属、
   技能版本漂移（`.skill-version` 与技能 `VERSION` 不一致）时读。BACKLOG 不整读，用 `rg` 找行。
4. 历史只考古：`BACKLOG-archive.md`、`orchestrator/archive/`（旧 DEC / LED 正文）。

## 任务与状态

- **沿用上下文，不拿非阻塞问题打断用户（用户2026-10-24纠正）**：已有账号选择、授权和偏好持续有效；不能因 CLI 列出多个账号组就重新询问。本项目当前已确认使用“月明水清深”，通过公开 CLI 核实真实 ID 后继续测试。测试对话归属、测试命名、串行顺序等可恢复细节由 Agent 决定并记录；只有确实缺少授权或无法安全核实目标、且会造成实质影响时才提问。技能的通用选择流程不能覆盖用户已明确的选择。
- **需求即任务**：用户提需求立即写入 `BACKLOG.md`（📋，引用 SPEC）；写完 SPEC 立即拆任务进 BACKLOG。
- `BACKLOG.md` 是任务真相，`ARTIFACT_MANIFEST.yaml` 是阶段 / Gate 真相，`pmem` 不能代替。
- 状态只用 `taskctl`，禁止手改 🔨/✅、禁止 `pmem set` 改状态：

```bash
node orchestrator/process/taskctl.mjs start <T-id>
node orchestrator/process/taskctl.mjs complete <T-id> --evidence "<commit / test / gate 证据>"
node orchestrator/process/taskctl.mjs block <T-id> --reason "<阻塞原因>"
```

- 改产品方向、架构、数据归属：先有 SPEC 并过独立评审；契约、IA、安全、发布标准或范围变化记录用户确认与 DEC。
- SPEC + BACKLOG 就是计划：不另写 writing-plans 式拆解，不做 P0/P1、V0.1/V0.2 式切割。

## 收尾

先跑 SPEC 要求的 TDD / frontend / contract / e2e / boundary Gate，再
`pmem sync` → `reconcile` → `taskctl complete`。reconcile 失败不得写成全绿：属本任务范围用
`taskctl block`；确属范围外既有欠债且本任务 Gate 已过，才可在 evidence 写明后完成。
没有当场发生的证据（TDD 红测、前置评审、真机 E2E）不得补拍成 PASS。

## 硬规矩（全文见 agent-rules.md）

- 工作树按需建、结束回收；复用现有目录，保全未提交内容后再移除。
- 页面沿用项目已有稳定风格与 tokens，不引入第二套风格（OilUI 要求已撤销）。
- 界面性能 LED-047、超时预算 LED-053：改相关路径必须跑对应回归（`node tools/timeout-policy/verify.mjs`）。
- **严禁假按钮**:UI 控件要么真实有效,要么删掉。
- **关键链路禁止质量门反杀可用性**:启动、保存、生成、渲染、导出、发布等上一版可完成的合法任务，
  不得因新增审美、布局或质量规则变成整单失败。存在隐藏可选图层、切换安全布局、跳过单个问题素材、
  回退基础动效等安全输出路径时必须先确定性降级；只有输入损坏、权限/归属错误或不存在任何安全输出
  路径时才允许 hard-fail。新增 fail-closed 门上线前必须有旧版成功样例、完整公共调用链回归和其判断所
  覆盖的全部输入族；孤立 helper/几何单测不能作为发布依据。
- 前后端分离；AI / Agent SDK 只在 worker / ai-runtime；worker 写库走 backend service port；AI 只产候选，用户采纳后由 backend 落库。
- 语义判断归 AI，代码只守权限、ID、类型、范围、幂等、安全；确需确定性算法要写 `SEMANTIC_BOUNDARY_ALLOW:` 并有测试。
- 诚实置 0；给人看的解释用大白话 + 一张图。
- 检索符号优先 `codegraph query/callers/impact`，`rg` 兜底字面量。
- 调研结论归档 `docs/research/`，踩坑写 `docs/engineering-notes/pitfalls.md`。
- 语言：面向用户与项目工件一律简体中文；代码标识符、路径、命令、ID 保留英文。

## 教训账本

`orchestrator/LESSON_LEDGER.md`（LED-*）：每条一句规则 + 守卫命令；能写成命令的登记进
`reconcile.config.json` 的 `lessons[]`，每次 reconcile 重跑。
