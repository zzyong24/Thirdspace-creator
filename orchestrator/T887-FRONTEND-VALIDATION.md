# T-887 内容雷达真实总量验收

## 结论

用户截图中的“100”不是数据库真实总量，而是首屏 `pageSize=100` 被页面误当成总数。修复后，首屏仍只
传输 100 条以控制渲染成本，但“全部内容”和当前筛选结果显示服务端真实 `meta.total`；存在后续内容时
显示“继续加载（已显示 X / 共 Y）”，可以读取第 101 条及之后的真实作品。

```text
intelligence.items.list
  ├─ data: 当前页（最多 100 条） ─→ 卡片列表 / 已显示 X
  └─ meta.total: 完整查询总量 ───→ 全部内容 / 共 Y / 是否继续加载
```

## 红测证据

- contract client：新增分页 meta 消费测试后失败，`requestListWithMeta is not a function`。
- 内容雷达组件：传入首屏 100 条、真实总量 101 后仍找不到“101 条真实内容”，也没有后续加载入口。

## 绿测证据

```text
pnpm --dir contract exec vitest run tests/client.test.ts
3/3 PASS

pnpm --dir backend exec vitest run src/modules/intelligence/intelligence.contract.test.ts
3/3 PASS（真实 persistence + transport：第一页 100，第二页 1，总量均为 101）

pnpm --dir backend exec vitest run src/modules/intelligence/intelligence.contract.test.ts src/modules/intelligence/intelligence.service.test.ts
26/26 PASS

pnpm --dir frontend exec vitest run src/features/intelligence/intelligence-workbench.test.tsx
48/48 PASS（显示 101，并读取第 101 条）

pnpm --dir contract typecheck
PASS

pnpm --dir frontend typecheck
PASS

pnpm --dir frontend exec eslint <T-887 affected files>
PASS

node orchestrator/process/boundary-scan.mjs
无新增违规（基线 5，当前 5）
```

## 真实运行边界

用户截图是非 fixture 的失败见证，证明当前安装版本把真实内容截显为 100。本轮尝试通过官方 CreatorOS
CLI 对当前运行账号做只读总量/第二页核对，但运行中的安装版返回 `CONNECTION_NOT_FOUND`（本次启动未
提供可用 CLI 完整访问连接），因此没有绕过 contract 直读数据库，也不伪造当前账号的精确总数。

实际桌面页面在安装包含本提交的新包后，仍需以当前账号完成一次“打开内容雷达 → 核对真实总量 →
继续加载第 2 页 → 刷新保持”的真机回填；这属于 SHIP/安装物证据，不影响本次 BUILD 代码与回归结论。

## 全局 reconcile 说明

`node orchestrator/process/reconcile.mjs` 已执行。T-887 新增的 LED-042、防回归测试、物理边界、孤儿代码
与资产门均通过；全局命令仍以 1 退出，报告 96 项既有评审回执/历史前端验收列漂移和 1 项看板体积
告警。它们不由本次分页修复引入，本轮不把全局状态写成全绿，也不扩大范围修改历史治理欠账。
