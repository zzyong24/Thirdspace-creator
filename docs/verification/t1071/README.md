# T-1071 复现说明

所有命令从仓库根目录执行。脚本只使用合成输入，不需要启动 CreatorOS 或数据库，不调用真实模型、不读取真实媒体。需要现有 pnpm 依赖、Node 25 和 Rust 工具链。

```bash
frontend/node_modules/.bin/vitest run --config docs/verification/t1071/frontend/vitest.config.mjs --reporter verbose

node --expose-gc docs/verification/t1071/backend-probe.cjs sse 500
node --expose-gc docs/verification/t1071/backend-probe.cjs sse 1000
node --expose-gc docs/verification/t1071/backend-probe.cjs sse 2000
node docs/verification/t1071/backend-probe.cjs cron

node --expose-gc --import ./backend/node_modules/tsx/dist/loader.mjs docs/verification/t1071/worker/probe.mjs
node --expose-gc --import ./backend/node_modules/tsx/dist/loader.mjs docs/verification/t1071/worker/whisper-provider-probe.mjs

python3 docs/verification/t1071/native-sidecar-probe.py
python3 docs/verification/t1071/process-sample.py
```

前端测试断言的是当前缺陷行为，修复后这些复现断言可能失败；它们不是永久的正确性回归门。后端 JSON/NDJSON 是原始观测结果，不是产品 Gate 回执。SSE 比较 ArrayBuffer，IPC 比较 WeakRef 存活数及 external；RSS 保留不作为“GC 后仍泄漏”的判据。

原生探针在系统临时目录创建最小 Cargo 项目，直接加载仓库真实 sidecar 模块；该模块的测试只操作自身新建子进程组。测试最长约 60 秒，正常结束清理临时项目。没有从整个桌面项目启动或运行授权逻辑。

进程采样每 30 秒一次，共 120 秒，只读取进程信息；参数仅在内存分类，输出不含参数值。新的采样写入 `process-samples-current.json`，不覆盖本轮原始证据。
