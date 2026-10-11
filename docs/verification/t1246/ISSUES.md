# T-1246 问题登记（首轮保留）

先记录真实问题及未验，完成首轮后统一复核和修复。准备期工具问题与产品运行失败分开计；此表不表示首轮已经执行。

| ID | 类别 | 首次事实 | 当前状态与证据 |
|---|---|---|---|
| PREP-001 | Appium工具准备 | 独立APPIUM_HOME首次未登记mac2，doctor exit1 | 已按真实本地driver登记，installed-registered回执doctor通过；保原失败。没有App PASS。 |
| PREP-002 | App原生前置 | macOS Automation Mode disabled；用户选择暂不授权 | App所有操作未验，未建立session/触发认证/启动App；USER_NATIVE_DECISION.md。 |
| PREP-003 | 原生数据隔离 | 只改bundle identifier仍共享CLI/keychain/defaults；不能安全当隔离启动 | 未采用该方案，未触碰原App/用户数据；独评保留。 |
| PREP-004 | 浏览器证据driver | 独评发现部分历史verification与orchestrator/evidence输出未迁移 | 仅准备期修driver输出位置，不改输入/数据/断言；待新SHA独立复核，不覆盖历史。 |
| PREP-005 | 浏览器启动driver | 仅匹配.js而真实Worker bundle为.cjs，会错误拒绝启动 | 仅准备期修消费者；待独立复核真实产物清单，不改产品/build脚本。 |
| PREP-006 | 单测数据库环境 | 部分原测试硬编码55422，但此端口属于T1117另任务PG | 不连接/修改/停止旧server；本轮新临时PG50028。原guard不提前改；危险连接须外层拒绝，原FAIL/skip/NOT-RUN如实保留。 |

产品首轮FAIL由子Agent逐项追加真实case/testId、原日志、截图、归属和复测关联，不能以计划、工具doctor或历史结果代签。
