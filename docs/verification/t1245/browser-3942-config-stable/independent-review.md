# 3942 配置冻结后复测：独立复核

本报告独立核了 3942 的实际 trace、公开回执、响应式几何、三档共 12 张原始截图和运行前后清单。它不覆盖或替代本目录的执行报告。

## 真实执行与冻结

原 E2E `组内真实作业通过立即运行准入并保原任务显示待扫码` 单次自然退出码 0，耗时 34.566 秒；1 worker、0 retry。Playwright 记录 3663 项清单全部与运行开始时一致，HEAD 前后为 `4df3424972831acfdd091056b3045b2472120692`，无残留 Next/listener。此前 3941 出现的 `frontend/tsconfig.json` 差异在本轮通过逐字节冻结配置解决：本轮保存的 `tsconfig-before.json`、运行前后清单、当前文件哈希均为 `895dc494185b91b5848eea41db3df0302d3406fc3bb98dbb4e8186e96f967b2d`。

本轮被测页面源 SHA-256 `96c88efdb8cd8d2ad4fa2e13e7450f6ac3a472c588eae72c722e113e1085e865`，测试源 `748976450dc39d1f59991c79a624775cd993ffc6cd5e57b36c27cb635cf0e1a7`。它们与 3941 的产品/E2E源一致；本轮使用新的隔离运行数据，没有重放或复用上一轮创建的作业。

## 三个视口和实际画面

我实际查看了 390×844、900×900、1536×1024 的全部 12 张原图。每个视口均分别留有筛选区、快速创建卡片、作业行和运行详情截图。配套几何附件记录主滚动区分别为 `326/326`、`836/836`、`1312/1312`（`clientWidth/scrollWidth`），横向溢出断言在三个视口都通过。筛选控件、快速创建卡片、原任务的启用/编辑/扫码按钮与运行详情在各档都能进入视口并落在各自容器内。

标题栏和关闭按钮的断言也实际通过。三档标题最右端分别为 `309.38`、`644.05`、`962.05` 像素，关闭按钮左边缘分别为 `338`、`750`、`1068` 像素；窄屏标题分行，桌面标题也断成两行，均与关闭按钮分开。390px 和 900px 下筛选器纵向排列/适配，1536px 下沿桌面布局展开。原 3940 在 900px 失败的标题栏问题，在修复后的真实页面截图中已解决。

逐张截图：[390 筛选](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-390-filters.png)、[390 快速创建](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-390-quick-cards.png)、[390 作业行](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-390-original-job.png)、[390 运行详情](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-390-original-run-dialog.png)；[900 筛选](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-900-filters.png)、[900 快速创建](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-900-quick-cards.png)、[900 作业行](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-900-original-job.png)、[900 运行详情](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-900-original-run-dialog.png)；[1536 筛选](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-1536-filters.png)、[1536 快速创建](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-1536-quick-cards.png)、[1536 作业行](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-1536-original-job.png)、[1536 运行详情](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-1536-original-run-dialog.png)。全部逐项测量在 [几何 JSON](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-responsive-geometry.json)。

## 原任务与授权边界

trace 显示测试创建隔离账号组/账号/作业，UI 先真实启用作业，再点击一次“立即运行”，没有点击“编辑”或“扫码绑定”。之后打开该次运行详情并查看运行记录，刷新页面再核对原作业。公开回执中的 job/run/AI task/execution ID 前后一致；只发生一次触发，状态进入 `needs_reconnect` / `waiting_user`，采集新旧计数均为 0。错误码 `FLYWHEEL_LOGIN_REQUIRED` 与明确待扫码 UI 相符。最后同一作业在正确组下仍可读取；错误组请求得到 404 `OwnershipError`。测试还逐对象比对最终 run/task/execution 与已确认原值，并核对作业排期、启用状态、组版本和成员版本未变。公开回执见 [JSON](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/public-original-task-auth-wait.json)。

该结果证明隔离数据中的页面操作、公开服务响应、刷新后状态保持及错组访问拒绝。它**不**证明真实小红书账号登录、扫码授权、平台作品采集或真实平台结果；本轮看到的是预期的未授权等待状态。全程外部网络尝试为 0。

## 结论

3942 对 390px、900px、1536px 三档页面几何及视觉，运行详情标题/关闭按钮布局，以及原作业单次触发、授权等待、刷新后同 ID 保持和错组 404，均有同一实际 E2E 旅程的通过证据。配置文件前后字节一致，HEAD 和清单冻结也通过；结论仅限隔离的 UI/公开业务链，不替代真人账号绑定及平台采集验收。
