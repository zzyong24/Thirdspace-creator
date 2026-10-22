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

第二轮提交时，Chromium 新诊断计划在下一 CI 用已安装真实 binary，在父 TMP、HTML 子 TMP 和 T1324 任务 TMP 三种环境产生真实800×600 PNG，并保留全部 stderr、exit/signal；当时只有 `node --check` 通过，没有冒充 Linux 实跑。它不能代签原 Playwright PNG/PDF、HyperFrames 视频、安全与任务链断言。资源采样目标间隔30秒，慢采样会推迟后续样本；缺 cgroup 明记 unavailable，采样最大值不是瞬时峰值上界，也不能用最后一次 oom_kill=0 排除随后发生的 OOM。

## 第二轮新增 CLI 诊断缺陷及修复

[第二轮39769166511](https://github.com/zzyong24/Thirdspace-creator/actions/runs/39769166511)的原前端第6、7片测试已通过，其中真实跨目录PNG像素与PDF正文原失败用例通过。但新增的CLI `--screenshot` 诊断三环境均未生成PNG、未自行退出，120秒后被诊断脚本主动SIGKILL，导致job失败。这不是系统OOM，也不是原SIGTRAP；DBus/gcm/GPU警告不能确定CLI内部挂住的唯一原因。原完整suite按设计仍执行，旧诊断负证据保留。

修复只改诊断脚本，使用锁定Playwright的实际launch→离线route→导航→screenshot→await close控制链，仍要求真实800×600 PNG及正常浏览器退出。三个环境继续保留原父/子TMP关系；probe共享120秒绝对期限，清理最多另30秒，父watchdog150秒，不能让内层各自续满预算。保存完整pw:browser日志，driver退出与Chrome实际退出/信号分别记录；不存在browser、假可执行返回0仍硬失败，不扩known，不改生产与原测试断言。

修后本机真实Chromium148三环境共3.00秒、3张PNG及正常close，缺browser和假exit0两个负例均失败，独立审查通过。最终字节还把context默认动作/导航预算设置为同一绝对期限的剩余时间，并重新实跑上述正反例。平台明确为macOS，不能代签Linux；最后一轮CI仍必须实际验证该脚本和原完整套件。证据：`chrome-independent-review/playwright-smoke-v2/budget-final-commands.json`，脚本SHA256 `52389c62d5b27613debab6e917eb5bebafa7ef9ed43c97ec46bb6e7b0e6b2676`。

第三轮提交前的timeout-policy静态检查还发现：第二轮新增、现已受Git跟踪的资源采样脚本为ps设置5000ms，低于执行预算下限120000ms。现按既有规则改为120000ms，不新增豁免；此同步调用仅在独立后台采样进程内执行，失败记录unavailable，不阻塞原测试主进程。语法、一次本机采样及完整timeout-policy回归实际exit0（`timeout-policy-round-3-fixed.log`）；macOS缺少Linux资源文件的结果不冒充Linux采样通过。

第二轮前端第5片实际浏览器安装12分17秒，媒体安装到11:54:35 UTC已25分46秒且仍在进行，job累计39分25秒尚未进入测试；已完成片原完整测试约25分钟。最后一轮unit外层预算由60改90分钟：准备约40＋测试约25＋三个诊断最坏7.5，约72.5分钟后仍留上传和波动余量。只改job总期限，不改case/hook、分片、并发、堆或失败门。该处理针对实际安装挤占预算，不宣称修复原143来源；YAML和全部Bash块已验证，独立评审记录`chrome-independent-review/round3-unit-90min-budget-review.json`。

## 两次 exit143 的平台复核

原run39711648579与首轮backend第4片实际runner均为2.338.0。精确版本[JobRunner.cs](https://github.com/actions/runner/blob/v2.338.0/src/Runner.Worker/JobRunner.cs#L126)表明原shutdown文案来自内部`UserCancelled`分支；[Runner.cs](https://github.com/actions/runner/blob/v2.338.0/src/Runner.Listener/Runner.cs#L350)也会把SIGTERM/unload映射到此名，所以不能等同“用户手动取消”。两job未到40分钟，check API无额外原因字段，也没有OOM/cgroup/内核记录；现存main Verify创建窗口未显示终止前有新run，不能归于新push并发取消。

原run单测默认只把stdout写文件，未启用QUALITY_VERBOSE且中断后没有artifact，静默18分39秒不能证明卡死。首轮第4片到143前约50秒仍完成真实业务用例，也不支持整轮始终卡死。已确认终止机制为runner收到通用关闭信号并伴随143，上游触发仍未知；确定来源需要托管平台内部runner/worker诊断，公开job日志与REST无法提供。该边界与四个明确40分钟超时job分开。原件、精确源码和hash见`chrome-independent-review/exit143-platform-audit/`。

安装慢点的完整片对照：前端第3片同样87个FFmpeg依赖包共62.8MB，下载耗13分53秒（75.4kB/s），解包/配置仅约4.23秒，apt update约1秒。136条Ign集中在Azure HTTP包源，切官方HTTPS后余包约16秒完成；第2/6/7片同包下载约4秒。第5片到11:57:21 UTC准备已42分11秒尚未进入测试，不能把安装等待误写为测试卡死。证据`frontend/ci-39769166511/apt-readonly-review.json`。

第5片最终12:02:27 UTC才进入完整分片，准备累计47分17秒。本轮原日志明确实际入口是`file:/etc/apt/apt-mirrors.txt`。官方[configure-apt-sources.sh](https://github.com/actions/runner-images/blob/416ad027415129c880fc76669a2c063b0a39b4a0/images/ubuntu/scripts/build/configure-apt-sources.sh#L9)把Azure HTTP设首选、官方archive HTTPS设备用；精确镜像tag取回404，不冒称已读该tag。最后一轮在Playwright安装前，将该镜像表及已有兼容源文件里的精确Azure HTTP地址替换为原备用官方HTTPS，保留发行版/组件/Signed-By/签名校验和所有安装包；不加PPA或不安全apt选项。此举消除已观察到的Azure重试入口，不能保证未来公网速度，90分钟总预算仍保留。独立证据`chrome-independent-review/apt-source-audit/`。

## 第二轮单文件内存压力与 mock 保留链

后端第8片在12:02:42 UTC收到runner shutdown并exit143，未能上传完整测试JSON。恢复的最后资源样本12:02:25显示该片`ai.service.test.ts`独立Node进程RSS约6.61GiB、MemAvailable约394MiB、swap约2.83GiB；上一个articles文件用的是不同PID，因此是单文件内增长，不是跨文件fork复用。最后样本cgroup oom/oom_kill仍为0，只能证明明显内存压力，不能伪称已取得内核OOM或平台上游关闭原因。

锁定Vitest4.1.8的spy用强Set保存mock，`vi.fn(initialImplementation)`会把初始闭包作为reset目标继续保留；PGlite0.2.17的close执行shutdown但不清除WASM模块字段。makeService的数据库闭包与其他常量mock共享词法上下文，所以仅close或仅改adoption mock均不足。真实锁定spy/V8的三组外部WeakRef诊断确认：原结构、只改adoption在reset和GC后仍可达；全部factory mock使用无初始基线的mock再安装实现、reset后才不可达。该机制实验不是实际数据库套件或Linux验收，原件见`chrome-independent-review/pglite-resource-audit/`。

最终夹具修复只影响`ai.service.test.ts`的mock构造与四处关闭hook的finally reset，close错误继续传播，保留全部54例业务断言；不增加堆、不强制GC、不跳例、不加known。最终字节SHA256 `80b75d53ddfa230d6572bf3b76a9611fc4f5c39adc6e00709d8c2e3212e8e21c`实际54/54、runtime0、149.39秒，backend6144类型检查exit0，独立逆向字节审查确认业务输入/断言不变。相同3072堆/单worker，本机close-only进程树RSS峰3854.66MiB→最终1944.38MiB（下降49.56%），单进程3635.81→1673.63MiB（下降53.97%）。这是本机对照，Linux峰值与完整分片仍以最后一轮CI为准；旧close-only和只改adoption的不足证据保留。完整证据`backend/ci-run-39769166511/ai-service-retention/FINAL-HANDOFF.json`。

## 第二轮终态与最后一次推送边界

第二轮run39769166511实际FAIL，`gh run watch`收口exit1。后端除第8片runner143外，其余15片原run-tests全部PASS；第10片总59分49秒，距60分钟仅11秒，但原测试完整通过，不能误记超时。前端7个完整分片545文件、5374PASS/64精确env/6skip，new/runtime均0；第5片因精确60分钟job上限取消，缺78文件的完整报告，不能签全量。首轮后端14项新增失败均已逐一PASS；前端20项中15项PASS，其余5项属于未完成第5片。contract、ai-worker、mcp-server、checks与build均成功，原非阻塞lint债务仍如实保留。

本轮失败同时包含新增CLI诊断、单文件mock保留内存与安装挤占job预算；最后一次推送同时修这些已证问题，不扩104项known清单、不改原断言或跳过未完成测试。最终结果仍须以最后一轮真实Linux全量Verify为准，不提前声明main变绿。
