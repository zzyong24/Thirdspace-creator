# 2026-07-25 已完成任务落库波次

## 目标

把已在混杂工作区实现但未进入 Git 的 T-520、T-522、T-523，基于干净基线
`4349ea4c` 重新构造为可独立验证的提交；T-521 已先行落库。

## Lane 与 write_set

| Lane | 任务 | 隔离 | write_set | 合并顺序 |
|---|---|---|---|---|
| A | T-520 | 独立 worktree | `frontend/src/features/intelligence/`、`frontend/src/server/ingestion/`、必要的收藏 RPC/contract 错误映射、视觉测试 | 1 |
| B | T-522 | 独立 worktree | `backend/src/modules/ai-runtime/chat-history-window*`、`chat-tool-gate*`、`chat-tools*`、`scheduled-collection-scheduler*`、`backend/src/modules/ai/` 的任务日志窄改、`frontend/src/server/seeds/` | 2 |
| C | T-523 | 独立 worktree | Copilot chat/cover 工具、intelligence 分享导入、分享转写 runner、对应 contract/UI/测试 | 3 |

三个 Lane 的共享聚合点包括 `chat-tools.ts`、`persistence-client.ts` 与 chat route，因此禁止在
共享工作区并行修改；每条 Lane 使用独立 worktree。主 Agent 按 A→B→C 串行集成，每次集成后
重新运行目标测试、四包 typecheck、boundary 与 diff-check。若后续 Lane 与新基线冲突，
以已合入行为和任务验收为准人工重放，不接受文本合并即通过。

## 受阻协议

- 同一障碍失败两次即停止并报告现场。
- hook 或权限拒绝视为策略阻断，不换措辞重试。
- 不修改 `BACKLOG.md`、`events.ndjson`、manifest 或用户原混杂工作区；控制面由主 Agent 最后统一收口。

## 执行结果

- T-521：`4349ea4c`
- T-520：`38739370`
- T-522：`702000d5`
- T-523：`2f3d4e76`，否定意图授权补丁 `5c7bbd7b`
- 四条 Lane 合并后在干净集成树跑过 616 项聚焦测试与四包 typecheck；恢复原混杂工作区并完成
  27 个语义冲突后，再跑 638 项聚焦测试与四包 typecheck，全部通过。
- 原工作区 176 个 tracked、99 个 untracked 项在操作前进入
  `codex-pre-integration-T520-T523-20260725` stash；恢复审计确认任务范围外 tracked 内容无差异，
  99 个 untracked 路径全部存在。唯一同名差异为已经提交的
  `frontend/tests/visual/pages/intelligence-dark.spec.ts`，保留了断言更完整的新版本，旧草稿仍在 stash。
- 浏览器视觉运行受 T-451 verdict-token 门阻断；真实抖音登录/CDP/ASR、付费模型、签名桌面包未运行，
  均未写成 PASS。
- 全局 `test-integrity` 仍有 4 条既有 T-507 欠债：`settings.service.test.ts` 少 6 个断言/2 个
  用例、`skills-data.test.ts` 少 1 个用例、`script-runner.ts` 多 1 个未登记 suppression。
  本波次新增/修改测试均被 gate 判定 intact 或 net-new；`reconcile` 为 0 error/0 warning。
