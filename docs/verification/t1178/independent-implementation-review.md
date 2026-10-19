# T1178 独立精确实施复核

结论：**PASS，限定本测试文件的审定实施与实际静态回归**。findings 为 []；不代签完整 canonical、T1015 整体、任务完成或 Windows 真实安装。

当前 HEAD `335b1b5e055b1c8cb0935fe7f512409532236592`。正式 SPEC 与原独立初审绑定未变：SPEC SHA `db792b5640469348504aa6f1ffa795d2f1259cc25dd07a9f8d9a40f122a34411`，产品宪法 SHA `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。当前测试 SHA `2318d74f2dfb4e9f48fda39579b3154a862e45d6d6acb0fa1f6be929dea7749b`。实际源、控制文件及每一原收据/日志的绝对路径与 SHA 列于 READ_SET.json。

完整 diff 确实只有首例名称、shared/Windows 的两个精确资源数组，以及新增 shared 的 `not.toContain("sidecar/")`。按审定的这三处替换与一处新增断言，可以逐字重现整个当前文件；从第二例到文件末尾的原五例字节完全一致，尾段 SHA `404445ae5476e72504e225d45dbda67fa3a922cf68d20f7b4110f12232c3b71d`。

两个配置分别严格期待 `["sidecar.tar.gz", "THIRD_PARTY_NOTICES.md"]`，没有用 contains 放宽集合；shared 和 Windows 都明确拒绝展开 `sidecar/`。原五例的安装期物化、NSIS currentUser/hooks、全平台 tar、真实 SHA、指针优先/旧 tar 兜底、损坏 runtime 原错误透传全部保留，没有 skip、删除或改弱断言。

两份 tauri 配置、声明文件、build-sidecar、NSIS hook、build.rs、lib.rs、其它两份 LED006 静态测试和 reconcile.config 全部按当前字节与 HEAD Git 对象逐字节相等。对 desktop 脚本、tauri、发布 workflows、timeout-policy 与 reconcile.config 的当前 diff 路径核查只返回本片唯一测试文件；本片没有产品、资源、打包/发布流程、预算或守卫修改。其它任务的测试/控制变更不属本片。

|实际原证据|退出码|汇总|外层秒|实算日志 SHA-256|
|---|---:|---|---:|---|
|t1015-led006-current-diagnostic|1|42 PASS / 1 FAIL|2.0262746249791235|cb48cdced5769f5cf02b956ccc86b6017d471227909747957835d1424606bdfb|
|t1178-led006-current-green|0|3 files / 43 PASS|2.156212957983371|0a30bc06c72848950d934d66209650916a859e6a78d2ca0d45561e581777f771|
|t1178-exact-resource-green|0|1 file / 6 PASS|1.4548079579835758|00733ace274ffe5c20a53f99eec890968e564e62d7607b54686351151a03a6e7|

三份收据的 logSha256 均与实读日志字节吻合，收据自身 SHA 独立记录。原完整 RED 和完整 GREEN 的 argv 相等，确实调用未改的 LED006 原三文件命令；精确 GREEN 单跑该六例文件。原 RED 的 retries x2、FAIL 和退出1保留；GREEN 中 `--localstorage-file` 警告保留，没有冒称全部日志无警告。

本复核没有执行任何测试或命令门。当前完整 canonical 尚待，且本次私有读集未取得新 T1178 boundary/semantic/orphan/diff 命令收据，后续由 root 保留真实结果再收尾；上述局部通过不消除其它历史失败。本轮不重打包，不签真实 Windows 安装、GUI/WebView 首启、原生 App、全功能或真用户安装，不涉及平台/模型执行、真实 profile 或微信研究恢复。仅写此私有目录，仓库与旧证据未改。
