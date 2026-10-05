# T-1022 测试类型增量冻结

仅改 2 个原 owned test，未修改生产逻辑、ROOT 源码或全局控制面。新 SHA 和 ROOT 集成前 SHA 为 `/tmp/t1022-test-types-freeze.json`；逐项 SHA 为 `/tmp/t1022-test-types-owned-files.sha256`。

startup.test.ts：mock 签名从 runAccountGroupStartup 实际 port 类型派生，fixture 按 PlatformAccountResource / GroupMemberResource / AccountGroupResource 填全类型，删除该文件旧 as any 调用；mock 参数类型由真实 port 推导。PG test：enqueue input 用 satisfies EnqueuePersistentTaskInput 固定 literal 与真实合同；读取 seen[0] 前明确断言存在；dispatch callback 使用 RequestContext / AITaskResource。没有新增 as any 掩盖诊断。

真实 full backend tsc：`pnpm exec tsc --noEmit` exit 2，日志 `/tmp/t1022-backend-full-types-test-cleanup.log`。本任务这 2 个 owned tests 的 9 项诊断全部消失；剩余恰为 ROOT 初始日志中的其它 12 项旧诊断（asset-business、chat-assembly、signal-quality、transcribe-runner、asset-worker-runtime），保留不扩范围。不能称全量 tsc 全绿。

受影响两套实际重跑：workspace startup 6 + isolated PG 28 = 2 files /34 PASS /0 FAIL，exit 0，日志 `/tmp/t1022-test-types-cleanup-green.log`。PG 显式 55422，每 fixture 随机 isolated DB 并清理；无真实数据库/外部平台访问。owned diff-check exit 0。ROOT baseline 在冻结时均未漂移。
