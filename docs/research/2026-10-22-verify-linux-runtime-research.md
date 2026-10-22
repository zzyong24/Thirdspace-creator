# Verify 首轮 Linux 运行差异（T-1397，2026-10-22）

协调者依据用户修复 Verify 的授权决定以下修复，仍需下一次真实 CI 验收。首轮为 [39763542125](https://github.com/zzyong24/Thirdspace-creator/actions/runs/39763542125)，提交 `6dca2f71c`。原日志、完整测试 JSON、逐项诊断与独立审查保存在 `/Users/zyongzhu/terminals/ci-green/`。这里不把源码推断写成已经拍到的运行事实。

|现象|核实证据|采取的修复与边界|
|---|---|---|
|公共聊天入口没有 chatWorker；转录 bundle 退出；粗剪请求未发出|单测 job 没有运行 worker build，真实入口引用的 `ai-worker/dist` 不受 Git 跟踪；独立 build job 的产物不共享|backend/frontend 单测前运行原正式 worker build。保留真实执行和全部断言，不把运行时缺失列入 known|
|Chrome 148 启动 SIGTRAP；视频预览另报 launch code:null|HTML 子 TMP 长 71 字节；T1324 例内再覆盖 TMP，pure/legacy 长 77/79 字节。Chrome 原版源码追加 SingletonSocket 后超过 Linux 107 字节可用上限|workflow 同时缩短父 TMP 与 T1324 根，保留独占隔离。原日志没有原始 FATAL，直接因果由下一 CI 的全 stderr 和完整渲染套件验证|
|4MiB RAW 回读用例三次达到 20 秒|耗时集中在 Vitest 对 Uint8Array 的逐元素对象深比较；本机原例约 5502ms|长度严格相等，再对原视图 Buffer.equals 完整逐字节比较；本机约 4.81ms，整文件原 8 例通过。没有抽样或放宽字节断言|
|动态合成 AAC 原逐词正例降级为 text|生产精度证据要求 movieTimescale=48000；FFmpeg 6.1 默认 1000，本机新版默认 auto 实产 48000|合成正例显式指定 48000。固定 canonical 原文件、PCM、精度守卫及词边界断言不变|
|backend 第4片 runner 收到 shutdown，exit143|约 11 分钟即终止，远早于 40 分钟；没有 OOM killer/cgroup、完整 time-v 或 Vitest 报告|不武断归因 OOM、超时或卡死。减少每机并发，并在运行中记录内存/cgroup/进程 RSS；发现的 ai.service 夹具逐例创建 PGlite 却丢失 client，改为正式 afterEach.close|
|部分分片安装已耗时 22 分钟，测试另需近 22 分钟|真实 job/step 时间戳|完整分片增加到 backend16/frontend8，每片1worker；60分钟涵盖准备与测试。ffmpeg 使用 no-install-recommends 保留硬依赖，减少额外推荐包|

## 未采用的处理

- 不把 `SIGTRAP` 说成 `SIGKILL` 或内存不足。Crashpad 读不到 CPU 频率的两条警告不是致命分支证据。
- 不重复添加现有 `--no-sandbox`、`--disable-dev-shm-usage` 旗标，也不更换浏览器逃避原渲染测试。
- 不用本机旧 dist 或空 worker 代替正式构建，不把 CI 可补齐的构建前置放进 env 清单。
- 不把动态 AAC 正例改成接受 text，不放宽精度证明；正例必须明确自己的物理媒体前置。
- 不用扩大单进程堆代替管理并发；3072MiB 仅为 old-space 上限，不是 RSS 上限。
- 不把 `vitest list --filesOnly --shard` 的输出当分片证明：4.1.8 的此入口返回全量文件。已对真实发现的 689/623 文件调用安装版 `BaseSequencer.shard`，16/8 片并集无漏重；这只是发现/分片验证，实际执行仍由完整 CI 验收。

## 官方源码依据与验证限制

- [Chrome 148.0.7778.96 process_singleton_posix.cc](https://chromium.googlesource.com/chromium/src/+/refs/tags/148.0.7778.96/chrome/browser/process_singleton_posix.cc)：独占临时目录及 SingletonSocket；SetupSockAddr 检查 sun_path 容量。
- [同版 file_util_posix.cc](https://chromium.googlesource.com/chromium/src/+/refs/tags/148.0.7778.96/base/files/file_util_posix.cc)：TMPDIR 优先；品牌目录前缀使旧 HTML socket 实长 112/116，T1324 pure 为118/122、legacy为120/124。新短根分别为84/88、91/95（按同样层级计算）。
- [FFmpeg n6.1 movenc.c](https://github.com/FFmpeg/FFmpeg/blob/n6.1/libavformat/movenc.c)、[movenc.h](https://github.com/FFmpeg/FFmpeg/blob/n6.1/libavformat/movenc.h)：默认 movie_timescale 来自 MOV_TIMESCALE=1000。本机默认与显式48000实际生成同字节，强制1000不同；完整跨工具验证另保留日志。

PGlite 生命周期修复前后整文件均54/54通过，但本次采样的修后 RSS 更高，不能宣称降低了内存或已证明 runner143 的原因。实际 AAC 对照采用本机静态 FFmpeg6.0 与系统9.0.1；这不等于 Linux6.1 修后已验收，后者仍以新 CI 为准。

Chromium 新诊断计划在下一 CI 用已安装真实 binary，在父 TMP、HTML 子 TMP 和 T1324 任务 TMP 三种环境产生真实800×600 PNG，并保留全部 stderr、exit/signal；提交前只有 `node --check` 通过，没有冒充 Linux 实跑。它不能代签原 Playwright PNG/PDF、HyperFrames 视频、安全与任务链断言。资源每30秒采样，缺 cgroup 明记 unavailable；采样最大值不是瞬时峰值上界，也不能用最后一次 oom_kill=0 排除随后发生的 OOM。
