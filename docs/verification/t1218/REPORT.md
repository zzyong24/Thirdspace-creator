# T-1218 新建项目 E2E 校准记录

本轮只调整 `frontend/tests/e2e/new-project.spec.ts`。每个用例先经公开 `accountGroups.create` 建立独立真实测试组，再设置当前组 cookie 与 localStorage，并在首页确认账号组切换器显示该组。创建消费者只要求 active group，因此没有为验收额外伪造平台账号或扫码登录状态。

两例均从首页链接打开 `/projects/new`，按当前表单检查 `name` / `brief` 顺序、主题为空时禁用创建、作品形式可多选及切换；随后通过真实 UI 提交。用例等待真实 `/projects/{id}` 消费路由并显式排除 `new`，确认弹层关闭、作品标题可见，再在当前组作用域内调用公开 `projects.get` 和 `projects.outputs.list`，核对项目 ID/标题及实际作品类型。

静态验证：`pnpm --dir frontend exec eslint tests/e2e/new-project.spec.ts` 通过；`pnpm --dir frontend exec tsc --noEmit` 通过。没有启动 Next 或 Playwright；浏览器回归、截图和公开服务实际回读仍待 root 串行运行。当前记录仅说明测试代码校准，不代表 E2E 通过。

2026-10-11 root实际3903隔离Chromium两例全部PASS（5.3s/4.2s），真实group选择、UI submit、projects.get/outputs.list按各自scope回读；原首轮失败/trace已保留。日志 ../t1208/20261011-canvas-recheck.log。

## 独立复核

复核 3903 原始结果日志、共享 `scenario-index.ndjson` 最新 15 条、测试源码和原失败归档。3903 串行运行共 15 条，14 PASS、1 FAIL；其中本任务两条新建项目用例均 PASS，截图均 `captured` 且文件存在，外部网络尝试为空。对应截图：[首页表单与多格式创建](../t1207/screenshots/new-project--New-Project-dialog-opens-from-the-dashboard-follows-the-current-form-con--9d39772d7d9342667bec4f05c65347a76eafafcdf08e44c68a692e006ec31955.png)、[进入新项目工作区](../t1207/screenshots/new-project--New-Project-dialog-creates-and-enters-the-new-project-workspace-when-req--b1a5a1aa76b79897c4c1c6eb56aa08d8aa3ed3b79e975497cabf811d2b12583a.png)。

通过的 E2E 断言确实从公开 `accountGroups.create` 建组、选中该组并核对切换器，再由对话框提交创建；路由取实际 `/projects/{id}` 并排除 `/projects/new`，随后在同一 `x-group-id` 作用域调用 `projects.get` 与 `projects.outputs.list`，校验 ID、主题和所选作品类型。3903 日志的第 14、15 项各完成了创建后请求，两个用例完整通过；这是隔离 PGlite 测试环境的真实 UI/公共服务回读，不代表桌面安装版验收。

前轮失败链仍保留：3901 的两个旧失败记录、截图和 trace 见 `../t1208/20261011-before-canvas-recheck/scenario-index.ndjson`、`../t1208/20261011-before-canvas-recheck/screenshots/` 与 `../t1208/20261011-targeted-output/`；旧全量基线也仍在 `../t1207/playwright-output/`。本复核未覆盖这些原失败，也未把旧错误改写为通过。
