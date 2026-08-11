# T-765 BUILD Gate

日期：2026-08-10
结论：任务范围 PASS；已用本机真实 FFmpeg、Google Chrome 与 HyperFrames 0.7.54
完成短片全链路渲染。未运行 GitHub 打包或发布。

## 根因与收口

- 旧链路把所有输入先转成 CRF18 proxy，HyperFrames 再编码，最后又做一次
  CRF18 交付转码，源素材最多经历三代有损编码。
- 新链路对 H.264 的 profile、`yuv420p`、BT.709 三项标签与 FFmpeg 全流解码
  全部过门后只 remux；其他输入只生成一次 CRF10/slow 高质量 mezzanine。
- 每个正式输入均由本次实际 Chromium 通过 DevTools 运行 `video` 元数据与首帧
  canvas 解码 smoke；remux 不兼容时只回退一次 mezzanine，再失败则中止。
- HyperFrames 以 `high` + PNG 帧 + 画幅/fps 换算的目标码率做唯一一次正式
  视频编码；`final.mp4` 只做 stream-copy faststart remux。
- 最终 ffprobe 对 H.264、尺寸、fps、`yuv420p`、BT.709 三项标签、时长和
  最低视频码率失败关闭；`stream.bit_rate` 缺失时只统计 `v:0` packet bytes。
- 未改视觉、画幅选择、帧率契约、上传或发布逻辑。

## TDD 与自动回归

- 红测：新增正式输入/交付契约后 `executor.test.ts` 实跑 6 failed / 9 passed。
- 绿测：
  - `executor.test.ts`：18/18 PASS。
  - `executor.test.ts` + `template.test.ts` + `run-execution-task.test.ts`：76/76 PASS。
  - T-759 两个前端聚焦测试：40/40 PASS。
  - backend typecheck：PASS。
  - frontend typecheck：PASS。
  - 聚焦 ESLint：0 errors；只保留测试文件未使用变量 warning。
  - `git diff --check`：PASS。

## 真实本机媒体证据

- 工具：`/opt/homebrew/bin/ffmpeg` + `ffprobe`，系统 Google Chrome，HyperFrames 0.7.54。
- 输入兼容性：H.264 High / 640×360 / 30fps / `yuv420p` / BT.709 三项标签；
  FFmpeg 全流解码 PASS，Chromium 元数据+首帧 canvas 解码 PASS。
- 全链短片：实际捕帧 60/60，实际编码后交付文件 2.000s、640×360、30fps、
  H.264 High、`yuv420p`、BT.709 三项标签，视频码率 3236kbps。目标 4000kbps，
  最低门 2000kbps，PASS。FFmpeg `-xerror` 全流解码 PASS。
- 真实短片中输入策略为 `remux`，最终交付也是 stream copy；未发生多余有损编码。

## 物理边界门

- boundary-scan：PASS，无新增违规（5 条均为已有基线）。
- orphan-scan：0 errors / 100 warnings，双向链路 PASS；warning 为既有 PLANNED/未追踪 FR。
- semantic-boundary-scan：PASS。
- test-integrity：0 errors / 1 warning，新增测试数与断言数均增加，无跳过或抑制放宽。
- reconcile：如实 FAIL（3 errors / 9 warnings）。三个 error 均是本任务范围外的既有回执
  漂移：T-746 review receipt、T-727 frontend receipt、T-722 frontend receipt；T-765 独立评审
  receipt 未漂移，本任务的 boundary/orphan/semantic/test-integrity 子门均通过。

## 发布边界

本 Gate 只证明 T-765 的本地实现与真实短片链路。没有运行官方或渠道 GitHub
打包，没有创建 tag/Release，没有上传、分发或更改 Activity 生产版本。
