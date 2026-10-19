# T1183 独立 SPEC 初审

**PASS，仅准入精确两处测试合同校准；findings=[]。** 原失败是真实过期默认预算断言，现材料不足以签实施、Rust后段或完整Gate通过。

当前 SPEC SHA256为 `e5df8ea59cf0fa1ec655675a71dac158a0e9b7de9c3c3db8e61135db21d5781a`，constitution为 `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`，审查HEAD为 `b34447aaf7836e7798d4bd37c262eff2357aaf7d`。BACKLOG顶部T1183尚📋，产品与测试均未改。

原 `t1015-current-led018-diagnostic.json` 实际exit1、3.6733255420112982秒；原log SHA256 `5cfce07bbab012407ea7ebd846a30d83b0ed3751390836e3bb9ff16d96f326a1` 与receipt的logSha256一致。日志是douyin文件144例、总154PASS/1FAIL，首次成功用例实际传入120000而旧固定期待60000；原retry x2保留。原命令是vitest两文件成功后 `&& cargo test ... --lib windows_`，当前首段失败，因此cargo后段未执行，不能由154PASS推定Rust或Windows结果。

真实源码导出链为 `frontend/src/server/ingestion/douyin-cdp.ts:71` 原样导出worker的 `gotoWithRetry`；worker实际调用 `executionTimeoutMs(opts.timeoutMs)`，contract默认值固定120000，且保更长值。已批准T1066规范明确正执行至少两分钟。worker旧JSDoc仍写60000是既有注释欠一致，不能以它覆盖真实消费者和已批规范，也不扩本次精确写集去改worker。

唯一代码写集是 `frontend/src/server/ingestion/douyin-cdp.test.ts` 的首成功用例两处：2478行旁注默认60000→120000，2481行固定期待60000→120000。期待值必须固定，不能导入被测常量或从被测结果派生。原首次单goto/零退避、两次失败后成功的调用/退避、用尽重试的4调用/3退避及原错透传、短退避复用末位全保留。fake page抛出的 `Timeout 60000ms exceeded` 与对应正则验证原错身份和文字，应原样保留，它们不声明真实默认导航预算。原144例不删不skip，不改变产品、权限/归属、SDK、配置、guard、重试或执行预算。六个实际读取的test/runtime/contract/入口/config文件当前与b344 Git字节一致，当前diff为空。

```mermaid
flowchart LR
 A[旧固定期待60秒] --> B[实际既有合同120秒]
 B --> C[只校准期待和旁注]
 C --> D[原完整串行命令含Rust后段]
```

SPEC验收保留原完整LED018命令与显式隔离环境，不用focused首段代替cargo后段；还要求前端type、boundary/semantic/orphan/diff、实际timeout-policy公共检查和独立实施复核。已实际读公共verify消费者，其遍历contract/worker/backend/frontend/mcp/Node回归并保非零，不仅helper或词法扫描。

当前完整canonical实际1158.662259833014秒、exit1；原gzip解压SHA `34e36c225d9ab3429c82470294d13ab8c3b7adb266919d6d1e65c09713c9caee` 对receipt一致，27ERROR/1WARN与LED053失败保留。aggregate没有展开LED053公共子检查详细输出，不能凭相同marker确定根因。其原owner为T1081/T1066-timeout-policy/T1101-global-gates；校准本断言不销旧债、不改配置或门。实施后仍须取得实际公共检查结果并如实保留旧失败，收尾明确全局未绿，不盲重跑无关全系统。

本初审没有执行任何测试、服务、产品CLI、验证器、模型、DB、浏览器或实验，仅写私有材料。不签实施GREEN、cargo结果、真Windows安装、native App、平台/模型/全功能、完整Gate或T1181研究恢复。原素材研究2/2用尽继续暂停，与本合同校准无关。完整实读路径/SHA和精确范围见READ_SET.json；正式initial输入见review-input.json。
