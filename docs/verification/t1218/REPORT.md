# T-1218 新建项目 E2E 校准记录

本轮只调整 `frontend/tests/e2e/new-project.spec.ts`。每个用例先经公开 `accountGroups.create` 建立独立真实测试组，再设置当前组 cookie 与 localStorage，并在首页确认账号组切换器显示该组。创建消费者只要求 active group，因此没有为验收额外伪造平台账号或扫码登录状态。

两例均从首页链接打开 `/projects/new`，按当前表单检查 `name` / `brief` 顺序、主题为空时禁用创建、作品形式可多选及切换；随后通过真实 UI 提交。用例等待真实 `/projects/{id}` 消费路由并显式排除 `new`，确认弹层关闭、作品标题可见，再在当前组作用域内调用公开 `projects.get` 和 `projects.outputs.list`，核对项目 ID/标题及实际作品类型。

静态验证：`pnpm --dir frontend exec eslint tests/e2e/new-project.spec.ts` 通过；`pnpm --dir frontend exec tsc --noEmit` 通过。没有启动 Next 或 Playwright；浏览器回归、截图和公开服务实际回读仍待 root 串行运行。当前记录仅说明测试代码校准，不代表 E2E 通过。

2026-10-11 root实际3903隔离Chromium两例全部PASS（5.3s/4.2s），真实group选择、UI submit、projects.get/outputs.list按各自scope回读；原首轮失败/trace已保留。日志 ../t1208/20261011-canvas-recheck.log。
