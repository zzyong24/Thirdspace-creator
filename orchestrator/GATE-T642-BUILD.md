# T-642 BUILD Gate

日期：2026-07-31  
结论：PASS（本任务范围）；未构建安装包。

## 已实现

- `@query` 选中后不再把完整项目标题写进消息正文；上下文标签显示“项目 · 标题”，完整标题保留。
- `chatContext.projectId` 作为 host 可信绑定，单项目档案、产物索引、产物正文与指标工具可省略 ID。
- 绑定项目时模型工具集合不再包含 `context.projects`，因此无法退回全量项目库翻页找当前作品。
- 模型显式传入其他项目 ID 时，单项目工具仍只读取 host 绑定 ID。
- 账号级无引用时，项目库列表与显式 ID 查询保持原行为。

## 验证证据

- backend：`chat-tools.test.ts` + `chat-runner.test.ts`，286 tests PASS。
- frontend：`project-mention.test.ts` + `ai-copilot-interactions.test.tsx`，46 tests PASS。
- backend/frontend `tsc --noEmit` PASS。
- `boundary-scan` PASS：无新增物理边界违规，剩余 5 条等于既有基线。
- `git diff --check` PASS。
- `project-mention.ts` 与对应测试目标 ESLint PASS。

## 已知全局状态

`reconcile` 已执行。本任务相关 artifact、orphan、boundary、backlog 与知识检查均通过；全局仍因
T-635 review receipt 及 T-639/T-638/T-637/T-634 frontend receipt 在当前整合分支上过期而失败。
这些是本任务开始前已存在的跨任务回执债务，不属于 T-642 验收范围，本 Gate 不把它们写成全绿。

`ai-copilot-content.tsx` 全文件 ESLint 仍命中既有 React Compiler/hooks 债务（ref render 访问、
effect setState、manual memoization 等）；本任务未改这些生命周期逻辑，聚焦行为测试和 typecheck 已通过。
