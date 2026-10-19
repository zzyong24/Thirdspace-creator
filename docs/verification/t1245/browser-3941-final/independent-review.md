# 3941 标题栏修复后复测：独立复核

本记录独立核对 3941 的执行收据、E2E 日志、公开回执、三视口几何附件和全部 12 张布局截图。它不改写本目录的主报告，也不把截图检查扩展为真实平台登录或采集验收。

## 实际结果与被测源

Playwright 单例自然退出码为 0，耗时 53.994 秒，1 worker、0 retry；E2E 实际用时 22 秒，断言 1 条旅程通过。当前产物目录的布局截图为 12 张，每个视口各有筛选区、快速创建卡片、原作业行和运行详情图；另外还保存了桌面/窄屏流程图、几何 JSON、公开回执和 trace。

3941 运行绑定的产品页面 `frontend/src/features/automations/automations-island.tsx` SHA-256 为 `96c88efdb8cd8d2ad4fa2e13e7450f6ac3a472c588eae72c722e113e1085e865`，E2E `frontend/tests/e2e/automations-run-now-public.spec.ts` 为 `748976450dc39d1f59991c79a624775cd993ffc6cd5e57b36c27cb635cf0e1a7`；两者运行前后均一致。HEAD 在运行前后相同。运行收据的全清单冻结仍为 `false`：3663 项中 `frontend/tsconfig.json` 从起始 SHA `895dc494…` 变为记录的结束 SHA `4a6ee444…`，其它 3662 项未变。独立复核时当前配置文件及 `HEAD` 的该文件均回到 `895dc494…`，`git diff` 为空；何时、由谁造成记录中的中间变化没有证据，因此不签署完整清单冻结。此不确定性不涉及本轮前后相同的产品页和 E2E 文件。

## 三档视口的实际表现

我逐张查看了 390×844、900×900、1536×1024 的 12 张截图，并核了几何附件。三个主滚动区的客户宽度/内容宽度分别为 `326/326`、`836/836`、`1312/1312`，都没有横向溢出。窄屏下筛选器垂直排列且在账号组卡片内；900px 与桌面视口的筛选布局也在容器内。快速创建卡片、原作业行操作与状态在三档中均到达，筛选、卡片、行操作及运行详情图均已截取。

运行详情标题和关闭按钮的几何也在三档中通过。窄屏长标题分成多行，仍与右上角关闭图标分开；900px 与 1536px 下，长标题的末行与关闭按钮保有明显间隔。几何 JSON 记录的标题最右端与关闭按钮左端间隔分别约 26.8px、104.2px、104.2px。原失败位置是 900px 的标题/关闭控件分离断言；本轮证据说明选定标题栏 patch 后该项通过。

截图证据：

- 390px：[筛选区](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-390-filters.png)、[快速创建](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-390-quick-cards.png)、[原作业行](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-390-original-job.png)、[运行详情](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-390-original-run-dialog.png)
- 900px：[筛选区](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-900-filters.png)、[快速创建](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-900-quick-cards.png)、[原作业行](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-900-original-job.png)、[运行详情](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-900-original-run-dialog.png)
- 1536px：[筛选区](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-1536-filters.png)、[快速创建](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-1536-quick-cards.png)、[原作业行](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-1536-original-job.png)、[运行详情](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-1536-original-run-dialog.png)

完整测量见 [responsive geometry JSON](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/t1245-responsive-geometry.json)。这组截图中部分 `fullPage` 截图在同一视口下字节相同；各布局部件的逐项数值仍由几何附件分别记录。

## 公开任务链与限制

公开回执和原测试断言显示：只提交了一次立即运行请求；组 A/账号的触发组合唯一，刷新后仍是同一任务、运行与 AI/执行记录；作业启用状态、排期及组/成员版本保持不变。运行进入 `needs_reconnect` / `waiting_user`，执行记录为 `blocked`，错误码是 `FLYWHEEL_LOGIN_REQUIRED`，采集数仍为 0。错组读取返回 404 `OwnershipError`，没有额外创建第二次运行。实际服务日志也记录了预期的错组 404 和一次平台需重新扫码的结果。

这些结果只证明隔离测试数据中的页面、公开调度接口、权限边界和“等待扫码”状态链路可工作；不证明小红书真实登录、账号授权、真实作品采集或平台数据成功。测试索引记录外网尝试为 0。原材料见 [公开回执 JSON](./test-output/e2e-automations-run-now-public-组内真实作业通过立即运行准入并保原任务显示待扫码-e2e/public-original-task-auth-wait.json)。

## 独立结论

3941 对这条自动化页面的**窄屏筛选区、快速创建卡片、原作业行、运行详情标题布局及公共“等待扫码”旅程**给出了实际通过证据；三种视口的页面滚动区均无横向溢出，3940 的标题栏失败点已在本轮通过。报告保留配置文件哈希曾变化且事后恢复这一完整冻结限制；它不否定相关产品/E2E源的运行一致性，但不能被写成全树无漂移。真实平台登录与采集仍不在此证据范围内。
