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
- 代码检索：已安装 `/opt/homebrew/bin/codegraph`（当前版本 `0.9.4`）；跨层需求先执行 `codegraph index --force --quiet .` 刷新索引，再用 CodeGraph 查调用图并以 `rg` / TypeScript 引用核对动态装配。不得因旧会话记忆误判为未安装。

## 会话路由

任何 Agent（包括 Codex 和 Claude Code）处理需求时：

1. 读 BACKLOG 顶部任务及其 SPEC；
2. 核对 product-to-code-orchestrator 技能版本；
3. 按 `prompts/stage-router.md` 选择入口；
4. 通过 Gate 后才能转换任务状态；
5. 没有发生过的历史证据不得追溯伪造。


T-1238源码已整合本地共享目录，设置43项、真实旅程10项与清理后类型检查在共享源码独立通过。严格taskctl完成在codex/local-codex-unified-engine工作树执行（代码ebd31b714、验收77b939320ddf、完成事件重新跑真实旅程）；共享目录他人未提交修改保留，不手改状态或代签共享HEAD。证据同步docs/verification/t1238/GATES.md，原全量25ERROR与范围外T1204未消失；日期已单项修验，不签新完整24ERROR回执。发行安装包及23族全部账户真机未验。
