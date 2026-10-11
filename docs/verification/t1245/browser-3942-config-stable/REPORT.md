# T1245 browser-3942-config-stable 实际PASS

仅修复自动化页局部筛选收缩/窄窗纵排和运行详情标题关闭区，没改变模板卡、任务状态、业务API、账号归属、轮询或全局导航。

单次实际公共浏览器exit0，34.566秒；worker1/retry0，fresh DB/auth/media，单Next自然结束、监听清理，无自动重跑。390/900/1536的稳定侧栏、筛选、原job开关/编辑/扫码完整几何、原run详情关闭按钮与标题分离、固定错误正文均通过，12张原PNG。390 viewport真实client/scrollWidth均326。原唯一runNow、刷新后三层同ID全值回读和错组404全部保留并通过。

3663声明文件及HEAD前后完全一致。

真实run `run-43e5898e-62a8-4a3b-9215-7b04c7dfe1fc`、AI `ai-task-dc4c8d0c-43`、execution `exec_c289c06c-201f-486a-a7a2-5032399b2bad`，触发次数1，原账号与组不变。run needs_reconnect，AI running/waiting_user，execution blocked/waiting_user，都是FLYWHEEL_LOGIN_REQUIRED真实缺绑定等待。没有点击扫码、提交编辑、真人平台登录/采集、模型生成或已安装客户端操作，不能把这些0/等待状态称为平台采集成功。

产品96c88efdb8cd8d2ad4fa2e13e7450f6ac3a472c588eae72c722e113e1085e865，测试748976450dc39d1f59991c79a624775cd993ffc6cd5e57b36c27cb635cf0e1a7。旧3939/3940 FAIL与全部历史图片保留。全局reconcile仍24错误；本地product eslint旧11诊断与原d353逐条完全一致，未新增但不能称整个lint通过，关联既有T1203。正式test lint/type已有实际PASS，最终复核报告另附。
