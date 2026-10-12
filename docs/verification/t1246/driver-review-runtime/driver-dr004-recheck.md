# T1246 DR004 独立窄复评

候选产品 HEAD：533224f334c43cdb81a344424e420cad93784dd1。
新 config SHA：2b414f4373e0ca9da5979f6f22752f86fb46036c64fa9269bf924e96a4815064；新 manifest SHA：9d0eb9e0cbf28d6778d76e4450b81e5c20b2beda670882178ae409fbb0efeccd。

结论：DR004 的启动 cwd 窄修在实际消费者上正确。未执行浏览器/Next，不能声称启动或任何用例 PASS；允许主线程在真实 PACKAGE_READY 与冻结产品绑定后重新启动完整原170。上一版 reviewer 静态审查漏核 Playwright webServer 的 configDir 默认 cwd，旧准备审查不构成成功启动证据，实际 0 tests 的红日志必须保留。

独立读取已安装 playwright@1.60.0 的 lib/runner/index.js:801：this._options.cwd = options.cwd ? path.resolve(configDir, options.cwd) : configDir；:837 真实 launchProcess 消费该 cwd。原 docs/verification/t1246/driver config 所在目录是 configDir，因此原相对 node ../docs/... 出现 double docs。现在绝对 cwd=resolve(root, frontend) 会原样指向冻结 frontend；原相对 command 恰好解析唯一真实 docs/.../start-isolated-next.cjs。launcher 自身 process.cwd()===frontend 的原拒绝门也一致。

git show 冻结 config 与当前 diff 仅一个新增 cwd 属性；原 command、timeout、assert/test selection、data、所有原/generated 100 文件 SHA 和 inventory 不变，6 driverFiles SHA 全部吻合。manifest 除 driverFiles 外没有字段改动，产品 HEAD 不变。未把原 MODULE_NOT_FOUND 或 0 tests 升格为测试失败后的产品修复；本次属于 driver 开始执行所必需的 cwd 消费者校正，与首轮产品集中修复分开。

报告仅写 /tmp；实际列表、启动、完整测试结果由执行 Agent 保留新 SHA 的 execution-binding 和日志。模型标识 unknown/inherited。
