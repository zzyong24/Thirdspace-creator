# AGENTS.md — 新会话入口（Codex / Claude Code / 其他 Agent）

CreatorOS 的产品到代码流程统一由已安装技能 **`product-to-code-orchestrator`** 管理。
这不是 Claude Code 专属流程；任何 Agent 接手需求、设计、跨层功能或产品改动时都必须加载
该技能，不能退回自由编码模式。

## 新会话固定顺序

1. **先读任务真相**：[BACKLOG.md](BACKLOG.md) 顶部可执行任务；再读该任务引用的 SPEC。
2. **再读项目记忆**：[PROJECT.md](PROJECT.md) 与 [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)。
3. **加载产品流程**：读取 `product-to-code-orchestrator` 的 `SKILL.md`；比较技能
   `VERSION` 与 `orchestrator/process/.skill-version`。旧版先按技能的 `--update` 流程升级并
   运行 `reconcile`，不能带着漂移开工。
4. **执行阶段路由**：按技能 `prompts/stage-router.md` 判断当前阶段、上游依赖、产物、Gate
   与用户确认点，并在动代码前说明结论。
5. **守物理边界**：改代码前读
   [orchestrator/SYSTEM_ARCHITECTURE.md](orchestrator/SYSTEM_ARCHITECTURE.md)；门卫会阻断新增违规。

## 需求与任务状态

- **需求即任务**：用户提出需求时立即写入 `BACKLOG.md`，不得只留在聊天里。
- `BACKLOG.md` 是任务队列真相；`ARTIFACT_MANIFEST.yaml` 是阶段/Gate 真相；不要让 `pmem`
  代替它们。
- 状态转换只使用：

```bash
node orchestrator/process/taskctl.mjs start <T-id>
node orchestrator/process/taskctl.mjs complete <T-id> --evidence "<commit / test / gate 证据>"
node orchestrator/process/taskctl.mjs block <T-id> --reason "<阻塞原因>"
```

- 禁止直接把任务手改成 🔨/✅，也禁止用 `pmem set` 改 BACKLOG 状态；`taskctl` 必须留下
  `orchestrator/events.ndjson` 审计事件。
- 产品方向、架构、数据归属变更必须先有 SPEC 并通过独立评审；服务契约、IA、安全、发布标准
  或实现范围变化必须记录用户确认和 DEC。
- **SPEC + BACKLOG 就是计划**：禁止另建 writing-plans 风格的任务拆解文档替代 SPEC，
  禁止 P0/P1 或 V0.1/V0.2 式切割已确认范围。

## 干完一个重大任务后(收尾必做)

```bash
# 先运行任务 SPEC 要求的 TDD / frontend / contract / e2e / boundary / orphan Gate
node orchestrator/process/pmem.mjs sync
node orchestrator/process/reconcile.mjs
node orchestrator/process/taskctl.mjs complete <T-id> --evidence "<commit / test / gate 证据>"
```

若 `reconcile` 失败，禁止写成全绿：先登记根因任务。失败属于本任务验收范围时用
`taskctl block`；确认是范围外既有欠债且本任务 Gate 已通过时，才可在 evidence 中明确
保留该全局失败后完成当前任务。

没有当场发生的历史证据（特别是 TDD 红测、前置评审、真机 E2E）不得补拍成 PASS；只能记录为
缺失、待验证或经用户确认的 accepted-risk。

## 硬规矩(踩过的坑,别再踩)

- **严禁假按钮**:UI 控件要么真实有效,要么删掉。
- **前后端分离**:后端业务模块不准放 `frontend/`;AI/Agent SDK 只准在 worker/ai-runtime;worker 写库经 backend service port,不直连 PG。(门卫 LED-003 执行)
- **AI 不直接写库**:只产候选,用户采纳后由 backend service 落库。
- **语义归 AI，代码守边界**:理解意图、内容归类、素材/场景匹配、创作取舍必须由可配置的
  Skill/模型完成；代码只做权限、真实 ID、类型、范围、时间、幂等、安全和用户明确选择的落实。
  禁止用写死词表、关键词计分、字符串相似度或业务名称分支冒充“智能判断”。确需确定性算法做
  去重、协议纠错或安全校验时，必须写明 `SEMANTIC_BOUNDARY_ALLOW:`、说明其不做创作选择并有测试。
- **大白话 + 配图**:给人看的设计/解释,必须有人能懂的版本 + 一张图,不只堆术语。
- **诚实置 0**:数据缺就显示真实的 0 / 空,绝不编。
- 语言：面向用户与项目工件一律使用简体中文；代码标识符、路径、命令、ID 保留英文。

## 教训账本

`orchestrator/LESSON_LEDGER.md`(LED-*)记「踩了什么坑 + 防复发的可执行规则」。能写成命令的坑都登记进 `reconcile.config.json` 的 `lessons[]`,每次 reconcile 重跑。

## Imported Claude Cowork project instructions
