# T1106 安装版只读诊断

2026-10-09使用本机安装的creatoros CLI。公开status/access确认已连接，groups.list唯一匹配截图账号组“月明水清深”，成员version=1、组version=1、active。随后按该group执行两个只读操作，实际请求编号见installed-witness.json。

```
creatoros call intelligence.workspace.get --group grp_legacy_acct-ae1a8346-9 --input '{}'
creatoros call execution.tasks.list --group grp_legacy_acct-ae1a8346-9 --input '{"query":{"kind":"radar_project_upgrade","page":1,"pageSize":100}}'
```

Geo逸哥等来源9月26日的LOGIN_REQUIRED仍是各自的最新历史结果；同collector的王温特来源10月6日成功（扫描29、新增1、更新28）。因此左侧“登录”不是当前Cookie状态探针，不能要求用户先扫码。本次没有实际平台认证探针，Cookie当前有效性未验证。

原作品升级parent execution-task-db19e969-418同时缺groupVersion及membershipVersion，错误精确匹配截图。checkpoint保留原转写child execution-task-db19e969-419。0128历史迁移只回填group_id；新任务创建已有backend锁盖章。修复需证明原账号从未转组，沿原任务恢复，不能拿当前页面覆盖版本。

仅保存最小相关状态与任务元数据。未读取Cookie/用户数据库/浏览器profile，未重试真实任务或调用模型。
