# 八条原lesson命令的内部诊断

八条原命令已在干净7f1外盘逐个串行执行，完整日志、exit与清理均保。八条都exit1；本次诊断完成不代表八道Gate通过。所有执行后tracked源与绑定输入未变、无残留进程、没有模型/业务提交。原reconcile32ERROR保持。

|原命令|实际首错/阶段|短路未执行|
|---|---|---|
|LED-052|CREATOROS_TEST_POSTGRES_URL缺失，原脚本第6行主动拒绝；未运行归档事务测试。|无|
|LED-051|14PASS/1FAIL：现package.mjs无CREATOROS_PRODUCTION_CLOSURE字面；是否真实安全门接线缺口尚需独立调查，不仅凭正则失败称旧测试。|无|
|LED-006|41PASS/2FAIL：startup期望_window而实际window，原MAIN_PAGE_LOAD_FINISHED仍在；Windows资源期望两项而现含sidecar.tar.gz.sig。|无|
|LED-018|154PASS/1FAIL；前段Vitest失败，不能把未运行Cargo当已验证。|cargo windows_|
|LED-031|backend执行/child-env32PASS；后段Windows closure缺CREATOROS_PRODUCTION_CLOSURE字面失败。|无|
|LED-041|本地Whisper26PASS/managedASR15PASS；后段closure同正则失败，不能判本地ASR功能失败。|无|
|LED-046|首段Windows closure同正则失败，不能据该身份推Pi包运行或正式execution worker失败。|pi-packaged-runtime；execution-worker-runtime|
|LED-058|worker58PASS，backend117PASS/1FAIL；定位normalizer语义断言通过，resolveCredential spy只期望4参而现7参（末三undefined/undefined/false）。7参源自T1278 03d60d39c899c08f15c6cebee3d2516079c45a74，旧test317来自4b10e89e22；非T1337修改。|frontend intelligence-workbench/ai-copilot-interactions/chat-execution-stream|

定位节点参数差异来自既有T1278，不能把它称本轮历史恢复/Provider失败；最小候选若后续授权，仅在原测试中精确补末三实参，保上下文/能力/ref/原normalizer候选身份断言。当前未改任何旧测试。生产闭包marker缺失仍需核真实打包调用门，不能仅给它贴“正则过时”标签。

八个内部首因已从原无日志状态补为当场证据；这不补拍历史红测，不替代各UI/模型Task Gate，后续逐任务closing须明确引用真实适用门与未运行部分。
