# T1252 实际安装与标准验证工具（待独评）

`launch.cjs` 固定 Node25.9.0_2；两独立 mode，每次 fresh os.tmpdir realpath/nonce/marker，保原 HOME/CODEX_HOME。当前仅 node --check 和纯Node反例实际执行，未安装/运行正文。

安装精确命令：固定Node启动绑定 `/opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs --filter @creatoros/mcp-server install --offline --frozen-lockfile --ignore-scripts`。CI模式，不允许生命周期脚本或网络补包；缺离线包就保真实失败。只新增直接 undici7.27.2，运行前删精确 importer 3行还原原锁SHA，运行后全207来源逐SHA守门；安装后实际 mcp-server/node_modules/undici realpath 必须本树.pnpm/版本7.27.2。安装1,800,000；准备240,000+cleanup2,400,000+报告120,000+余量120,000，outer4,680,000ms。

checks 精确顺序：标准 mcp-server tsc --noEmit（1.8M）→真实 Vitest list --json（900k）→完整8个原MCP test文件全部case（retry0、maxWorkers1、fileParallelism=false、test/hook180k）→原 scanner全部测试+新增（600k）→原 build-runtime.mjs 输出本次runRoot/creatoros.cjs（1.8M，原脚本含实际固定Node CLI operations describe冒烟120k）。不会改正式tsconfig、mock运行结果或删原assert。list实际file集合必须精确8，case身份唯一；结果total必须同listing且pending/failed0。未知/超限listing不运行正文。

每真实case外层1800k覆盖test180k、最坏四个each hook720k、剩余900k（当前源无更多/更长hook/test声明）；全部suite收集/结束独立3.6M余量。完整tests phase=实际N*1.8M+3.6M。整体外层保上界300实际case，551,580,000ms，monotonic60k分段；正常立即EOF不等待上界。每phase仍有限独立watchdog，不靠总外层掩盖内层；所有case/hook声明比原默认长且不改persistent deadline。原现有SDK长观察测试使用fake timers，不把其配置9M当真正case执行上限。本工具未跑完整timeout verify宽门，后续另按真实全源/预算执行。

只有本次spawn且现场birth/UID/PPID/PGID确认的child进入owned集合；孙进程须当前parent birth/UID仍匹配后登记。每次signal重核原child及parent birth/UID，不对foreign/unproved PID发signal；同owned process group未登记成员显式失败。cleanup2.4M覆盖capture120k、两信号snapshot240k、两闭stdio观察240k、末snapshot120k和全部结算余量。close事件与log close均发生才收阶段回执；任何未确认保非零。不中途删除缓存、源码、node_modules或历史日志。

外网、PG、模型、主App、发布均未调用；标准单测沿原自己的mock/loopback fixture，环境不继承CreatorOS凭据。输出真实日志/JSON/新bundle全部本次owned runRoot。模块assert辅助计数不冒充产品PASS。

实际执行必须root精确独评后：

```
CREATOROS_T1252_STANDARD_TOOL_REVIEWED=1 CREATOROS_T1252_STANDARD_TOOL_SHA256=<实际toolSHA> CREATOROS_T1252_STANDARD_BINDING_SHA256=<实际bindingSHA> /opt/homebrew/Cellar/node/25.9.0_2/bin/node docs/verification/t1252/standard-check-tool/launch.cjs install
```

checks仅在实际安装成功后以同精确env单独执行。此处只声明准备，没有执行许可。
