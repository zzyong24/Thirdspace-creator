# T-1289 修复原生构建清单随解包目录深度变化

用户已授权合并源码、开发包及全部回归，遇问题记录集中修复。本叶来自R独立归档重建实际失败。原生715个源文件在原归档与标准patch fuzz=0重建后逐文件相同；JS/CSS等六产物逐字节一致，唯一差异是NATIVE_BUILD_GRAPH.json中虚拟Vite WASM helper错误当成物理路径，从五层相对目录变为十二层，随解包目录深度变化。原日志/差异/真实FAIL保留在 docs/verification/t1278/integration-candidate/native-owned-644ebbd6336048a9b92daa4cca6fbd67 与 r-native-rebuild-current.log。

目标是同一源码和依赖在不同目录深度产生相同真实构建清单。只修归档内 apps/web/scripts/build-native.mjs 的虚拟module ID规范化；原真实文件模块仍按原sourceRoot相对路径，原module数、renderedLength、WASM版本与运行JS/CSS保持。不硬编码解包路径或旧相对层数，不删模块或编造产物摘要。代码仅核构建机械身份，不做创作判断。

正式产物写集须独审绑定：reference-editors/opencut-classic/native/native-source.tar.gz、native-from-t1046.patch、SOURCE_CHANGES.json、README.md、NATIVE_BUILD_GRAPH.json，以及 frontend/public/reference-editors/opencut-classic/native/NATIVE_BUILD_GRAPH.json；准确archive内部唯一代码文件为上述build-native.mjs，必需的原重建元数据依实际消费者查清再明确，禁止顺带改其它源或JS/CSS。新增候选/验证工件限docs/verification/t1289/**，Root串行接入。

独立审查必要性与write_set，实际先复现不同解包深度的清单RED，最小规范化后浅/深两目录正常生产构建七产物全部逐字节一致、原六runtime产物不变；标准patch fuzz=0和全部源摘要一致，再完整原native类型/lifecycle/command/host/workspace/resources/preview原测试。缺依赖/工具失败保留，不冒产品RED。不得只改构建后的JSON或跳过第七产物洗绿。全包/实际GPU/公共MP4/App另验，不代签历史回执。

```mermaid
flowchart LR
 A[同一源码不同解包位置] --> B[虚拟模块使用稳定身份]
 B --> C[物理模块仍按真实源归属]
 C --> D[两深度七产物一致再整包]
```

准确必要元数据补齐（独审前明确，非新增运行行为）：归档内 README.creatoros.md 与 NATIVE_REBUILD_CONSISTENCY.json，以及外部 reference-editors/opencut-classic/native/DELIVERY.json、SHA256SUMS、VERIFICATION.md。它们由当前消费者实际引用的源码/archive/patch/graph摘要决定，不能保持旧摘要冒本次重建；完整payload九文件与原六runtime字节不变绑定见 docs/verification/t1289/candidate/SCOPE_CANDIDATE.json 和 FINAL_BINDING.json。
