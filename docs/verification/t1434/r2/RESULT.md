# T-1434 用户更正后的官网交付

2026-11-01 按用户明确要求完成第二次上线：

- 日志入口改为 v1.3.0、v1.2.0，去掉月份命名；首页、页尾和当前版本均为 v1.3.0。
- 产品介绍改为多平台 AI 编导创作系统，新增多平台导览，说明抖音、小红书、视频号、B站、快手、YouTube 与公众号的创作、发布管理和运营用途。
- v1.3.0 日志补充多平台、小红书图文工作台、公众号文章工作台；各平台具体发布、采集可用性按客户端连接状态说明。
- 保持撤下旧下载区，不修改桌面版本、安装包、自动更新源与数据服务。用户授权记录见 DEC-143401。

## 当场验证

- 官网原有测试 8/8 通过，见 website-tests.log。
- 线上旧页实际失败：仍显示月份命名、当前版本1.2.0、没有多平台导览，见 production-before.log。验证脚本首次转义错误另保留 production-before-harness-error.log，不冒充产品失败。
- 本地与线上真实浏览器均通过1440×1000、390×844：七个版本记录切换、单一选中与面板、方向键、刷新、无下载块、无破图、无整页横向溢出；新增核对两个版本名及七个平台名称。见 browser-observations.json 与两张 verified 截图。
- 正式报告 frontend-report.md 绑定源代码提交1516c8b63；前端校验输出 frontend-gate.log，任务完成时由 taskctl 重新执行同一真实浏览器命令，结果见 task-complete.log。
- pmem sync 与 quick/read-only reconcile 的实际输出随附；仅控制面对账，不声称执行整个桌面产品的全量 lessons 或安装版验收。

## 发布保全

公开HTTPS回读与发布HTML的SHA256一致：19f58efbc43c554471569de35a0873b6e0adcaf568e95525783f8e97cd1d647d。

部署前原HTML备份：/var/backups/creatoros-t1434/20261101T100350Z/index.html；仅原子替换index.html，updates/prompts下6个文件元数据保持不变。详见deployment.json。
