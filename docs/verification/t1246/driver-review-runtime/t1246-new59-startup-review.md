# T1246 新 59 项启动准入独立复核

结论：允许开始实际独立浏览器批次；本结论仅覆盖启动、冻结绑定和运行依赖隔离，不代表 49 个生成能力、UI消费、账本或包内 Worker 已通过。

产品候选 `533224f334c43cdb81a344424e420cad93784dd1`；运行副本 `/private/tmp/t1246-native-runtime-533`。实际读取与重新计算 manifest SHA `3c342bbc4966b11d34c3066c5706e004ce98a51ed6132444837e232c6b459708`、config SHA `9484160f21e28bc44dce74805b81761d2eff7a7e4ac459bb957a16071a5d6e98`。四测试文件与 driverFiles 全部匹配；253来源文件、11 Worker文件SHA与自身realpath、10深层工作区链接重新核对无差异。继承配置的原100文件、生成100文件完整库存及全部SHA、base driverFiles均匹配，base manifest SHA `b7ac9e7f5d6b6f86f4d07bf2ddba67db3f21d2d0ea0c10d3d6dd695b5d780459`。实际 HEAD 与候选相等。既有真实 --list-v2 59tests3files仅证明选择，不冒充运行。

启动真实消费者继承 explicit frontend cwd、独立 Next loadConfig/distDir、禁止复用server、不predev重建Worker、完整构建入口库存；globalSetup/teardown使用已迁输出的副本。数据库/媒体/登录态由原config明确覆盖为新私有根。运行须使用未使用过的61347、全新 `/tmp/t1246-new-native-data-533-v1` 和新的独立RUN_DIR；环境中的真实包完成门为 `CREATOROS_T1246_PACKAGE_READY=1`，README简写 `PACKAGE_READY` 不是读取字段。绑定原 DMG SHA与候选，清除真实App/PG/secret/probe桌面变量，保持官方本地Codex环境原位使用、不复制凭据。

预算消费者 request/action/navigation/expect 为120000ms；原任务仅同ID观察1980000ms，正test外层21600000ms，继承fixture/hook至少180000ms；启动300000ms，清理120000ms；retry0/workers1/globalTimeout0。不是CLI延长任务期限；unknown只诊断、禁止重发。

真实回执会在 generationKey 或存在真实任务时将成功写为pending_ledger，INT-FREEZE同样不提前PASS。输出附原task/execution/group、图片原file bytes/mime/size/SHA、UI操作响应和截图；功能收尾仍须独立原call/thread/turn/预算/API0与blob checksum对账。复杂UI及合法缺前置必须保实际失败/BLOCKED，不能由共享helper或主页截图推定49项通过。

审查机制：独立子Agent只读源码、配置和证据并重新计算SHA；无长测试、无收费调用、无App会话；模型标识unknown/inherited。此报告不修改冻结source和driver。
