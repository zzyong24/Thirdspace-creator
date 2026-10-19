# T1183 校准浏览器导航回归的已过期默认预算断言

用户要求继续完整可用性稳定性验证、发现问题建task及时修复。T1015当前原LED018完整命令当场3.673325542秒exit1；前端154 PASS/1 FAIL，唯一失败douyin-cdp.test.ts第2481行期待默认goto timeout=60000，实际为120000。后段cargo因原串行命令第一段失败未执行，不能签Rust或Windows通过。原日志SHA 5cfce07bbab012407ea7ebd846a30d83b0ed3751390836e3bb9ff16d96f326a1和重试x2保留。

stage4-build维护，只校准既有合同测试，不改变产品方向、UI、权限、服务契约或执行预算。真实消费者是ai-worker/src/runtime/browser/navigation-retry.ts的gotoWithRetry，经frontend/src/server/ingestion/douyin-cdp.ts原样导出；消费者使用contract/timeout-policy executionTimeoutMs，已确认执行正预算至少两分钟（docs/engineering/timeout-policy.md）。不能把产品退回60秒以迎合旧测试；源码旧JSDoc仍写60000，不用它代替实际消费者和已批准规范。

精确代码写集仅frontend/src/server/ingestion/douyin-cdp.test.ts：首次成功用例里固定期待值从60000改为120000，同时更新该断言旁注释。不得从被测函数/timeout常量派生期待值。原144个用例及首次成功单goto/零退避、两次失败后成功的调用/退避次数、用尽重试抛原60000ms错误文本、短退避复用末值等全部保留；人工fake error文本描述抛出的原错，不是默认goto预算，因此不修改它。其它源文件、测试、SDK、配置、guard及超时预算均不改。

先独立SPEC评审通过与taskctl start，再修改这两处。真实RED保原字节，不补造历史红测。原LED018完整串行命令在当前main和原显式隔离环境复跑，不能只跑首段；前端类型、boundary/semantic/orphan/diff检查，实际timeout-policy公共检查原失败继续按T1081/T1066-timeout-policy归属保留。独立实施复核精确diff、原日志/退出码及后段Rust实际结果。仅当前测试合同校准PASS不代签真Windows安装、原生App启动、平台采集、模型或全功能。

不触当前安装App、真实用户库、微信原研究或T1181素材刷新暂停。源代码与完整canonical配置冻结，不重建相同产品包。收尾pmem及reconcile：本次完整canonical已在b34447aa上真实运行1158.662秒/exit1/27 ERROR/1 WARN，本修改后原LED018及必要公共命令逐项实跑，对无关未变检查保留已冻结的完整证据，不盲重跑全系统；有新相关失败及时登记，不以新PASS代写旧全量结果。通过本范围后taskctl complete明确全局仍失败并提交main，不push/tag/Release。

```mermaid
flowchart LR
 A[旧测试期待60秒] --> B[实际导航已有两分钟预算]
 B --> C[只校准测试固定期待值]
 C --> D[原完整串行检查及Rust后段]
```
