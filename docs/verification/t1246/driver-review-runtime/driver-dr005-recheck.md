# T1246 DR005 独立复评

结论：当前精确 driver 版本通过只读运行前复评，可继续已授权原 54 文件 / 170 用例首轮；本结论不是产品测试 PASS。候选产品仍 533224f334c43cdb81a344424e420cad93784dd1。未修改源码或执行长测。

绑定：manifest SHA ffad154d551cff348965ff995ea44883db99b53f52392517041db429e3783524；config SHA 78f9b52e25056a4c29341e48a11efce748e7f35fdbd2631f27be66006bd6e395。独立 Node 字节/UTF16 逆构验证：100 original +100 generated 文件名与 SHA 全匹配，59 变换文件/252 记录逐一恢复原文件精确内容；8 driver 文件真实 SHA 匹配，0 integrity errors。实际检查回执 /tmp/t1246-driver-dr005-integrity.json。

DR005 两处输出：generated visual/__setup__.ts ARTIFACT_DIR 改 RUN_DIR/visual-baseline，teardown FINGERPRINT_PATH 改同目录 baseline-fingerprint.json；config 全局生命周期明确选 generated 两文件。原 REFERENCE_BASELINES_DIR 仍 frontend/tests/visual/__screenshots__/reference-images，原 17 PNG SHA 与 original 库存完整不变。count===17 及前后 count/hash/entries 断言未变；逆构证明除了两段路径不存在其它生命周期正文变更。生成器明确仅追加这两 visual 生命周期文件，不拓宽 visual 用例或改 baseline。

全 FS 输出审计新增发现并已关闭：ai-recovery-guidance 两张 t913、ai-reliability-recovery 两张 t806 screenshot 原 ../.codex-tmp 写入路径，现机械迁至 RUN_DIR/original-output/.codex-tmp；保原文件名、截图参数、断言及响应。该 4 处已纳 changes、库存 SHA、outputSuffixes 创建父目录及逆构。此前仅搜索 docs/verification 或 orchestrator/evidence 无法覆盖全部 FS 消费者，此漏项及 DR005 启动失败诚实保留，不签旧版本全闭包。

独立 AST 全树初扫 184 个实际 writer/screenshot/download.saveAs/outputPath/snapshot 消费者（/tmp/t1246-browser-fs-consumer-audit.json）找出上述遗漏；新 driver runtime-output-consumers.json 186 行补 setup/teardown read 对与输入验证，8 driver SHA 包含该报告及 path-consumer-audit.json。另人工核 t1070 evidence helper 按 RUN_DIR 显式解析、download.saveAs 沿 helper；普通 info/testInfo.outputPath 归 config.outputDir=RUN_DIR/test-results；shared auto screenshot/NDJSON=RUN_DIR/scenario；旧 verification/orchestrator/.codex-tmp=RUN_DIR/original-output。所有 FS import 均为可盘点 node:fs(或 promises) named import，无未盘点 namespace writer。唯一旧 verification user-baseline.png 是真实只读输入；visual toHaveScreenshot 未入 --project=e2e，且原 updateSnapshots=none 保留。没有给全库存 guard 开豁免。

其他真实运行产物：reporter JSON/HTML、trace/自动 screenshot、下载/附件、execution-binding/Next launch-cleanup 都归本轮 runDir；Next cache 为 frontend/.next/t1246 唯一路径，使用已有实际 loadConfig/standalone-config、不重写 next.config。runtime 数据沿原 webServer 使用本轮新建 /tmp 隔离根（不复制用户库/凭据）。原产品脏改 guard、PACKAGE_READY+worker entry/dist SHA、源候选/100库存/8driver SHA 仍保留；DR004 显式 cwd=frontend 消费者保留。运行时再次执行这些 guard 才实际准入，复评不代签未知 runtime。

历史证据：本次原 globalSetup 新生成 fingerprint（不是 INPUT）先归档 driver-before-dr005/owned-original-baseline-fingerprint.json 后移走，独立验证归档 SHA ba1b6cc8ca6c7c0a050e00f135aa761eaa27f3856e7123013d7dfd2508f094d0、766 bytes，原 output 现在不存在；old/new allOriginalTestFiles 完全相同。原三个 console 和 browser-original-ready/results.json（395749 bytes）保留。该轮 54 loader FAIL /116 not-run、0 body，不能计产品测试已跑或产品缺陷已确认。list-dr005 仍只 --list，不算实跑。

本版运行前 findings=[]。只对上述新精确 SHA 生效；继续运行不得修改产品、INPUT、原断言或覆盖首轮红日志。若新的实际 runtime 失败仍如实记录，不能把运行前复评当测试成功。
