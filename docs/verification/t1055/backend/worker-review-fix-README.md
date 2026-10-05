# T-1055 Worker 独立评审整改增量

交付：`delivery-worker-review-fix/`，5 文件。`worker-review-fix-delivery-manifest.json` 的 before SHA 为根已整合首轮实现，after SHA 为本次整改冻结内容；对应补丁 `worker-review-fix.patch`。根源码未改。

1. 取消 ARTICLE_METADATA_CHANGED 整单失败。无 conversion 时，既有非空 title/summary 及当前稿的真实历史引用确定性透传；模型错写或留空 metadata 时保留合法正文/事实/结构。空字段仍允许原候选，转换授权不变。未采用模型 metadata 的引用不拿来反杀正文；正文和事实的新引用继续限制于冻结来源。
2. 共享 schema 兼容旧 assetId-only visual hint，禁止孤 file。runtime 区分是否冻结 imageLibrary：新目录任务必须 exact pair 且在目录；旧无目录只保留 ID-only 建议，不能提出可采用的未冻结 exact file。
3. structured-business-schema 原 superRefine 丢弃 validator 返回值，改为 Zod transform 让安全透传值进入完整 Worker 保存结果链。

证据：
- `worker-review-fix-red.log`：真实 4 failed / 8 passed，两族旧成功输入回归失败。
- `worker-review-fix-runtime-intermediate.log`：runtime 修复后仍有 2 failed / 10 passed，证明原 business schema 丢弃归一化值。
- `worker-review-fix-public-chain-green.log`：4 files / 72 tests passed，retry=0。
- `worker-review-fix-typecheck.log`：worker tsc --noEmit 成功。
- lint baseline/delivery 比对无新增，`worker-review-fix-lint-delta.json`；原测试 lint 欠债保留，不写全量 PASS。

完整 generateStructuredInWorker -> 本地静态供应商桩 -> saveGenerationResult 测试覆盖原生 JSON 与文本兼容两路径；分别验证模型改写/留空 metadata 和旧 ID-only hint，实际保存字段/出处正确。重复执行复用原调用。正文越界来源、目录任务单 ID/错 pair、旧无目录未冻结 exact pair 和孤 file 继续拒绝。

本地供应商桩仅为测试，不执行真实模型或浏览器。根整合及全局 Gate 仍由主会话完成。
