# PROJECT_CONTEXT — Agent 执行上下文

## 固定约定

- 输出语言：简体中文；代码标识符、路径、命令、稳定 ID 保留英文。
- 项目规模：M/L 级既有产品，涉及真实用户、本地数据、桌面双平台和外部模型契约。
- 产品流程：`product-to-code-orchestrator`。
- 任务真相：`BACKLOG.md`。
- 阶段与 Gate 真相：`orchestrator/ARTIFACT_MANIFEST.yaml`。
- 状态转换：`orchestrator/process/taskctl.mjs`，事件写入 `orchestrator/events.ndjson`。
- 项目记忆同步：`orchestrator/process/pmem.mjs sync`；`pmem` 不负责 BACKLOG 状态。
- 物理架构：`orchestrator/SYSTEM_ARCHITECTURE.md` 与 `boundary-scan.mjs`。

## 会话路由

任何 Agent（包括 Codex 和 Claude Code）处理需求时：

1. 读 BACKLOG 顶部任务及其 SPEC；
2. 核对 product-to-code-orchestrator 技能版本；
3. 按 `prompts/stage-router.md` 选择入口；
4. 通过 Gate 后才能转换任务状态；
5. 没有发生过的历史证据不得追溯伪造。
