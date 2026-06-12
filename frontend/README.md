# CreatorOS Frontend

本目录用于 CreatorOS 前端实现。

当前阶段只包含前端规格文档，不包含页面代码。

## 规格入口

- [全局前端 SPEC](./SPEC.md)
- [实现架构](./IMPLEMENTATION-ARCHITECTURE.md)
- [测试策略](./TESTING.md)
- [多 Agent 执行协议](./AGENT-PROTOCOL.md)
- [前端 TDD 实施计划](./TDD-PLAN.md)
- [共享布局与组件规范](./specs/shared-components.md)
- [17 个页面拆解](./specs/page-specs.md)
- [页面实现前置模板](./specs/page-implementation-template.md)
- [设计冲突决策记录](./specs/decision-log.md)

## 实现原则

1. 以 `../ui/` 中的设计图为页面视觉真相源。
2. 不重新设计产品，不改变信息架构。
3. 先实现共享 AppShell，再实现通用组件，最后逐页实现。
4. 每次实现页面前，必须先输出该页组件树和还原计划 SPEC。

## 开工状态

当前状态：`NO-GO`。

满足以下条件后才能开始写代码：

1. 初始化 Git 仓库，并提交当前文档与 `ui/*.png` 作为基线。
2. 使用 Node.js 24 LTS，锁定 pnpm 版本并提交 lockfile。
3. 在独立 worktree 和非 `main`/`master` 分支执行前端计划。
4. 批量批准 17 个页面的实现前置 SPEC，或明确按单页批次人工确认。
5. 完成 `TDD-PLAN.md` 中的 Foundation 门禁。
