# GATE T-612 — BUILD

## 结论

PASS。多账号隔离后的直连 API 不再由各按钮手工拼接账号上下文：

- `fetchCreatorApi` 统一读取当前账号、同步 current-account cookie、附加
  `x-account-id`、桌面握手和 same-origin 凭据；
- `readRequestAccountId` 统一执行服务端“header 优先、cookie 兜底”，随后仍由
  `verifyAccountSelection` 校验属主与 active 状态，不放松隔离；
- 已接入 `AI 找关联`、`评论回流`、知识库 AI 搜索、本地素材路径/Finder 和模型配置转移；
- 知识 classify/distill/relate/comment-sift/search 路由均消费同一账号解析入口。

## TDD 证据

红测：

`pnpm --filter creatoros-frontend exec vitest run src/lib/http-transport.test.ts src/lib/request-context.server.test.ts`

- 新增 5 条断言初次运行全部失败：
  `fetchCreatorApi is not a function` / `readRequestAccountId is not a function`；
- 既有 35 条测试继续通过，证明红色来自本任务新行为而非基线噪声。

绿测：

`pnpm --dir frontend exec vitest run src/lib/http-transport.test.ts src/lib/request-context.server.test.ts src/features/knowledge/knowledge-graph-view.test.tsx src/features/knowledge/knowledge-comment-backflow.test.tsx src/app/api/knowledge/distill/route.test.ts src/app/api/knowledge/classify/route.test.ts`

- 6 files / 61 tests PASS；
- 图谱和评论回流组件测试直接断言真实 fetch init 中存在当前
  `x-account-id`；
- header 优先、URL 编码 cookie 兜底和诚实未选号均有覆盖。

## 静态与边界证据

- `pnpm --dir frontend typecheck` PASS；
- `node orchestrator/process/boundary-scan.mjs --quiet` PASS；
- 受影响路径 `git diff --check` PASS。

## 真实故障闭环

T-611 真机日志中的失败点是：

`knowledge.list requires a selected account (ctx.accountId missing)`

本次修复后，按钮侧与路由侧各有一道账号传递保障，且最后仍经过服务端属主校验。失败发生在
任何 AI 调用之前，因此本任务没有修改模型选择、提示词、候选确认门或知识关系写入契约。

## 文档核对

实现保持既有 T-332 多账号隔离和 T-415 桌面握手契约，只把散落的传递方式收口成共享入口；
没有修改 PRODUCT_SPEC、服务 operation、数据 schema、AGENTS.md 或系统架构拓扑。
