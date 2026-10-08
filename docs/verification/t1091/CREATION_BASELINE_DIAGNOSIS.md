# 联合创作旧测试的工具回执解包漂移

本轮扩大回归为154 PASS / 2 FAIL；失败均在 `work-creation-chat.integration.test.ts:104`，直接将带可信展示回执 `__creatorosOutcome` 的 `part.output` 交给严格业务 schema。两例分别覆盖纯组和旧账号，错误相同。

当场用已提交旧 main `fae2d1f595b70a45d3c8b40c424c035150f5a851` 的 contract/backend/ai-worker 跟踪源码建立临时隔离夹具，工作区包解析均指向该夹具，未建 worktree，未复制用户数据库/素材。原测试4例实际2 PASS / 2 FAIL，仍在同一行报 `Unrecognized key: "__creatorosOutcome"`。临时源码目录已清理，日志与SHA保留，未修改旧断言。

实际页面消费者 `ai-copilot-content.tsx` 先经 `readChatToolOutcome(part.output)`，再把 `outcome.data` 给文章图文/剪辑候选卡；这是静态消费者证据，不能代签页面点击。原完整 Worker 两文件8例另行实跑通过。

原日志、基线源码哈希、当前对比及清理记录：外部 `main-installed-20261008/t1091/original-creation-baseline-comparison.json`。基线日志SHA：`e49dfb803f36a9370117490b3c64098f7b3f77200641d0f6f870b48b9c5a815c`；当前扩大回归日志SHA：`c16fa3f53c2f9176082d6a18c07b57a206ff11ea4d3d1c69668d5cc3cb270be8`。

登记 T1092 核对原断言与可信回执协议并独立复核校准；T1091 不改该旧文件、不丢弃失败、不签全仓全绿。
