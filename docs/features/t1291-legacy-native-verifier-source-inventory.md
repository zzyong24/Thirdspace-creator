# T-1291 核对旧原生编辑器验证器与当前715源码库存

T1290合并/本地包过程中独立发现既有额外验证漂移。verify-native-editors.mjs原live manifest摘要已落后于实际native产物；其旧710归档存在native-document-contract.ts/native-preview.ts，而当前715原生源不包含这两模块，实际graph430也无两旧条目。旧validator先hash拒绝；隔离派生mirror/manifest候选后仍在tar原合同读取失败。原FAIL和准确缺口保存在 docs/verification/t1289/integration-metadata-candidate/COMPOUND_BINDING.json 与原日志。715/F0/七产物/原六runtime及native86/380证明的是当前明确范围，不替代本旧验证器。

固定本地包入口package-local默认PACKAGE_BUILD_ONLY=1；已只读核package.mjs/build-sidecar.mjs不调用本脚本。本任务仅登记，旧额外门不冒PASS、不以新增假module/放松validator洗绿，也不阻断本轮用户明确本人验收的合法本地开发包。后续应核原已批准T1274实际宿主/严格共享v31合同和真实模块边界、许可源码镜像，再独评准确scope；目前不授权修改合同/源码/validator或借复制旧710倒灌715。

```mermaid
flowchart LR
 A[旧验证器与历史710库存] --> B[核已批准当前715真实消费者]
 B --> C[独评后准确接线]
 C --> D[保原FAIL再完整实跑]
```
