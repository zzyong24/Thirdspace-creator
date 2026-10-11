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


## T-1238 本地Codex统一执行（2026-10-11）

已在独立工作树实现，并三方合并回共享源码，保留其他会话修改。新任务/子任务/后台冻结Codex，文本、图片理解、内置生图不需独立供应商配置；语音、视频、Embedding保持原能力。实际官方文本、知识、蓝圆生图、绿圆参考编辑、绿圆理解成功；设置10项真实浏览器、恢复隔离整链与Pi回归通过。源码独评发现全部关闭，详见docs/verification/t1238/COVERAGE.md和GATES.md。原全量相关偏好/路径fixture回归已按完整组修复；范围外超时、构建环境及控制面欠债不签全绿；安装发行版未验证。


T-1238独立工作树实际taskctl严格完成：代码ebd31b714、UI回执77b939320ddf，完成命令重新执行真实10项并写原审计事件。所有相关全量LED与原checkpoint关闭；最终完整对账原25ERROR保留，日期错误已单项修验，其余24项按原清单交T1204，并非新的完整24ERROR回执。共享源码整合且单独复验通过，因他人未提交的watched-path改动未代签共享HEAD或手改共享状态。安装版及23族全部账户真机仍未验。
