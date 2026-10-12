# T1250 实施前真实 RED 方案（未执行）

这是正式独评前的测试与依赖核对，不能作为 RED、GREEN 或运行工具准入回执。最新 SPEC SHA、24 个原源 SHA 与只读依赖 SHA 均在 `RED_TEST_PLAN.json`。当前 24 文件仍与候选原绑定相同；本轮没有修改产品、原测试、scanner、Rust 或共享构建。原两次 22FAIL 与 T1248/T1247 日志不覆盖。

先让测试真实暴露旧程序为什么提前结束，再修指定消费者。慢成功必须走公共服务或真实原生协议；模拟时间只证明截止、取消和迟到结果，不替代公共调用成功。

```mermaid
flowchart LR
 A[正式独评与root解冻] --> B[新增断言真实RED与源绑定]
 B --> C[仅24路径修原消费者]
 C --> D[旧成功与取消/unknown负例]
 D --> E[本地真实公共慢链]
 E --> F[标准类型/边界/完整超时Gate真实EOF]
```

## 依赖和执行边界

- 后端唯一 `workbench-file-recovery.service.ts` signal 转发点与对应 R15，等 root 释放 whole5/B029 全量 source 锁后再新增 RED/修复；前端、Rust、scanner 虽不属于这个锁，现在也只准备方案，正式 PASS 后才动手。
- CDP 集成沿原 `runCliCommand → POST /dispatch → analytics transport/service → CLI 幂等账本 → Chromium`；复用原本地 HTTP/DOM 和本轮 PGlite，浏览器请求只允许本轮受控路由。原 case 的 publication/revision/CAS/同 key 与跨 account 断言不削弱。不连接真实抖音，不新增登录/平台采集。
- 导出沿原 `compositeTransport → workbench-public transport → 已登记 artifact/version → representation → offline Chromium`。新的公共慢用例须先以真实合法服务/host 建立来源，不能 SQL 填 settled artifact。现有 public integration 只有能力发现与 foreign 拒绝，不能拿它目前的通过代签合法 PNG/PDF 导出。
- 当前公开 render transport 没有可用 Request.signal 参数，render 入口也只有 html/format。本任务须在既有 renderer 端口内建立 owned deadline/清理，并可接已有私有 signal；不冒称客户端断开已经从公开 HTTP 穿透。若最终发现必须新增未授权源路径，先报告并独评，不自由扩公开 schema。
- artifact-host 的 `readTaskFile` 是长存活 service callback，不带 dispatch control。24 范围可在这个 host 内建立每次 dispatch 局部上下文（例如 AsyncLocalStorage），向真实 stat/read/finalstat 传原 signal；不能用共享 mutable currentSignal，不改未授权 backend artifact service。R12 必须证明并行 A/B 不串取消。
- native-host 原 realMacFiles 用例有官方模型条件和本地 fixture 条件。**不启用 `CREATOROS_T1012_REAL_MODEL`**，不复制 auth；只有本地受控 fixture/原纯协议可准入。该 case 内第273行会共享构建 ai-worker/dist，当前不能执行；实施时须独占窗口或审过的自有副本。局部 Worker build 不代签最终11包/开发App。
- `frontend/src-tauri/src/workbench/Cargo.toml` 是不启 Tauri 的纯 workbench 单元 crate，Mac ipc 可在它中运行。browser_ipc 需 macOS + workbench-browser，standalone feature 没有主 crate 的 browser 依赖闭包；不得假称简单加该 feature 就能跑。先在自有 target 准备合法现有 Rust browser 纯 harness/完整资源，按源 SHA 绑定，只运行指定 test 二进制，不运行 CreatorOS 主程序。
- browser-host 原真实 fixture 有 `cargo`/fresh binary 条件、90秒 ready、15秒 finish 与45秒 signal；file-recovery 原 journal fixture 有60秒无条件kill、10秒 ready/观察。新测试范围中必须核真实消费者预算和退出归属，不能只提高 CLI testTimeout。指定 command_run.timeoutMs 的1000/10000等既有冻结输入保持，不混同请求外层而重写。
- Windows 必须在真实 Windows runner 运行 named pipe；当前 Mac 静态/共享 deadline 单元不代表 Windows IO 已验证。无 runner 记录 NOT-RUN，不虚造平台 PASS。

## 精确新增 RED 与保留断言

下表的 R 编号是**拟新增测试ID**，不是实际执行 caseID。真实新增测试尚为0；实际收集后将记录 Vitest/Rust 原 names、源 SHA 和每次首次失败行。环境加载/资格前置错误须另列，不能冒称目标缺陷被测到。

|方案ID|原测试/模块|目标及预计旧程序首次失败|必须保留|
|---|---|---|---|
|R01|`frontend/src/server/ingestion/douyin-cdp-comment-diagnosis.test.ts`|inspect/observe共享观察期限：原inspect/observe各1秒先结束，或独立等值outer在投影前截断。|保原privacy/句柄dispose/节点上限；迟到不发布token。|
|R02|`frontend/src/server/ingestion/douyin-cdp-comment-diagnosis.test.ts`|active与idle分离：原touch在active开始重启90秒idle，active仍在执行便触发expire。|active不能闲置过期；真正idle仍90秒；busy/坏revision/重复key不延原300秒life。|
|R03|`frontend/src/server/ingestion/douyin-cdp-comment-diagnosis.test.ts`|原life和取消、late handle：现1秒可提前挡住目标分支；须先记录真实首次失败，不把非目标环境错称命中。|原expiresAt不变；cancel即时；点击至多1；late句柄dispose且无新token；close失败原占用不释放。|
|R04|`frontend/src/server/ingestion/douyin-cdp-comment-diagnosis.integration.test.ts`|正式CLI→HTTP→SQL账本→Chromium慢路径：原checkout5秒/goto15秒/observe1秒，合法公共操作失败。|同revision同key回放点击1；跨account拒；本地外网0；不签真实抖音站点。|
|R05|`frontend/src/server/workbench-artifact-render.test.ts`|真实Chromium PNG/PDF正槽：原goto15秒失败；PDF原within20秒或PNG20秒参数不合规。|PNG真实像素/尾标、PDF解析正文、20MiB、并发2/第3busy、文件泄漏与网络0全保。|
|R06|`frontend/src/server/workbench-artifact-render.test.ts`|完整render serial/close及迟到：原无完整wallclock/controller、close/rm吞错或有限窗口遗漏；需记录实际错误。|不能把连接关闭视为文件回滚；未知停机证据保留、临时目录归属与busy计数正确。|
|R07|`frontend/src/server/workbench-artifact-representation.test.ts`|四种representation旧成功：原body60秒未覆盖完整链（静态预算断言）；慢document仍原15秒cutoff。|sourceHash/hash/诊断降级、SVG像素、PDF文字、原script禁用及外网0不减。|
|R08|`frontend/src/server/workbench-public.integration.test.ts`|公开registered版本导出：原render短goto失败；若public fixture资格先失败独立记前置错误，不能代签超时RED。|同task/artifact/version/source hash及结果hash/PNG/PDF有效；foreign仍拒；不能fake registered DB行或模型/turn。|
|R09|`frontend/src/server/workbench-native-client.test.ts`|原Node Unix socket慢回执：原10秒idle超时拒绝合法35秒；partial bytes可无限续活动计时。|同ref/operation/request不变；绝对deadline不续；原error/unknown分类保。|
|R10|`frontend/src/server/workbench-native-client.test.ts`|socket取消前后dispatch：当前client无control参数且不能即时退出pending socket。|before connect native effect0；after frame unknown、write/command1次，original lease再次核验、监听器和本轮socket退出。|
|R11|`frontend/src/server/workbench-native-host.test.ts`|host原signal穿透：当前host只调用前后check，native请求期间不接收signal。|原command_run.timeoutMs字节不改；query/cancel仍原task目标ID；unknown/跨fence/Windows拒命令保。|
|R12|`frontend/src/server/workbench-artifact-host.test.ts`|artifact并行call-local signal：当前file端口三参数且signal未进callback。|不扩backend artifact service；可本host调用局部AsyncLocalStorage/等价封装，不能共享mutable currentSignal；取消A不能串B；CAS/claim/receipt不减。|
|R13|`frontend/src/server/workbench-browser-client.test.ts`|browser RPC absolute deadline：现125秒socket活动计时可随partial bytes重置，无墙钟截止。|原reply operationId/MAX_REQUEST/MAX_REPLY、cancel/dispatched判断与未知不重发保。|
|R14|`frontend/src/server/workbench-browser-host.test.ts`|恢复两mode完整serial及stop proof：原location10秒/cleanup15秒截断；单等值outer不足两lookup+cleanup。|只有原profile/lease/ref/fence及原owner lanes真实已停后release1；wrong/unknown/inflight/process/pending均release0；复核新holder时不释放。|
|R15|`frontend/src/server/workbench-file-recovery.test.ts`|backend已有control→named readonly receipt：readReceipt目前只有query，取消只能在I/O后check。|后端这个RED及修须等root全量source锁释放；原claim/binding/digest/CAS/paused不wake及read-only原operation1次保。|
|R16|`frontend/src-tauri/src/workbench/ipc.rs`|Unix Rust framing/response正槽：原read/write各10秒，合法慢帧或响应失败。|peer PID/MAX_REQUEST、task文件许可/原prepared/committed receipt不减；不启动主App。|
|R17|`frontend/src-tauri/src/workbench/browser_ipc.rs`|Rust browser framing及stop proof：read10秒；Node外层不足协议串行时先结束。|不得通过dummy stopProof替代原Rust状态；实际profile/lane/inflight/process negative全保；mainApp0。|
|R18|`frontend/src-tauri/src/workbench/ipc_windows.rs`|Windows named pipe IO：原IO_TIMEOUT_MS10000；必须Windows实际失败才记该平台RED。|Mac静态/纯共享计算测试不能签Windows IO运行；无Windows时NOT-RUN。|
|R19|`tools/timeout-policy/check.test.mjs`|10vendor与idle精确分类：原flat map误判Axios函数/timeout调度/动画；所有现有检测case仍必须保。|不按vendor目录排除、不按名字idle/注释泛豁免；未知timeout仍报。|
|R20|`frontend/src/server/workbench-native-host.test.ts`|真实Rust→Node→host公开能力慢回执：原Node/Rust10秒中任一端会切合法慢帧；权限/前置不全单记BLOCKED而非模型错误。|只本地fixture、不official模型、不App；原native call一次、原task/operation/hash/fence；worker构建必须独占/私有并另外源绑定。|

每项精确 controlledInput 在 JSON 中。真实35秒慢样例允许在同一公共 family 用参数化 case 分别覆盖各原短消费者，不能让一个共用 helper PASS 替多个入口；受控计时测试明确标记协议/单元，模型/平台/App执行计数均为0。

## Rust 私有 IO 的补充依赖核对

已只读交叉核 `native-readonly-review.md`、`native-readonly-source-binding.json` 与 `native-readonly-after.json`（精确SHA纳方案JSON；peer报告本身不作为正式PASS）。Mac `read_until`/`write_all` 和 Windows 每8192字节/partial write 都会重复下层IO；仅把10秒常量改120秒不能控制整帧。冻结私有 Instant deadline 后每轮仅取原remaining，并向 framing 等待传已有 owned bridge stop。未完整帧到期不得 execute；已执行文件OS IO不声称撤销。

browser busy/error/unauthorized 回执存在常规settimeout前的写路径，也须同有界 writer。Windows CancelIoEx 后原 Wait(INFINITE) 是栈 OVERLAPPED/缓冲真实完成回收，不能简单变有限wait然后free内核仍用内存；若未确认drain完成必须记录UNKNOWN/清理待确认，不能签有限stop。必要生命周期具体实现须由独立审查核内存安全，保持scope，不靠Mac编译代签Windows。成功回执后的trailing-read属于收尾，不能新起120秒正请求等客户端；用已声明清理槽/原剩余期限。

## 完整串行预算与启动门

以下为可审核预算计算，尚未构造/运行 launcher，不是预填成功回执。使用实际 `contract/timeout-policy` 的正下限120000与共享 remaining deadline 规则；既有更长预算保留。阶段0是实际到期而退出，不将0传库作为无限或新两分钟。

|层|测试方案的有限预算|覆盖与不得混淆|
|---|---:|---|
|单个正观察/请求/协议 IO|至少120000ms|原固定 task/session deadline 较早则用剩余值；不续期。interval/TTL/媒体长度仍原语义。|
|慢成功 fixture|实际延迟35000ms|超旧10/15/20/30秒，低于合法正常槽；不得提高延迟去占满两分钟后洗红。|
|render 单尝试组合示例|780000ms|setup120k + launch120k + load120k + output120k + close120k + rm120k + 60k余量。newContext/newPage/route须共享 setup 绝对槽，不各自另设120k又不重算。实际原更长和额外源检查槽必须重新加。|
|browser recovery 组合示例|780000ms|primary lookup120k + anonymous lookup120k + cleanup/stop-proof120k + fresh/释放结算120k + owned close120k + dispose120k + 60k余量。协议RPC自身若更长，用真实更长值重算，此示例不能反杀下层。|
|Node native/browser RPC 组合示例|420000ms|framing/read120k + native响应120k + write/reply120k +60k余量；若实际动作拥有更长原预算，外层按原remaining/call预算重算；socket活动不续墙钟。不得把这个方案常数当已审的通用执行上限。|
|CDP|原固定life300000ms、idle90000ms|每正阶段正常槽≥120k，全部 stage 共享原 expiresAt；两revalidate/queue/newPage/动作/settle/observe/pending/close可超过life总和，真实到期必须停，不能承诺或续life到各槽和。完整测试body须覆盖ready/关闭，不重写产品life。|
|每次 Rust/Worker 构建|各1200000ms|单独构建 child close+log-close受控；若 beforeAll 两次build，不能只给1200000 hook。当前构建0。|
|单次fixture startup/stop|各至少120000ms|fork/cargo启动与PID-bound ready；关闭握手→exit+close→日志关闭→owned descendants0，不根据socket断开代签Rust物理停止。|
|构建后复制/资源/源核/报告|每个完整串行阶段至少120000ms|按实际git/tar/资源数和消费者计槽；不复制用户库/凭据、不改 HOME/CODEX_HOME。|

最终 launcher 准入前按**真实收集**推导，不静态捏造用例数：

`testFamilySerial = Σ每个真实case的有效body上限 + Σ实际beforeEach/afterEach上限 + Σ每个suite的beforeAll/afterAll上限 + pool启动/teardown槽`。

`runnerOuter = source核/准备槽 + Σ实际构建槽 + fixture startup槽 + testFamilySerial + owned shutdown/exit/log-close/资源检查槽 + report/afterSHA槽 + 独立结算余量`。

同一个已列构建不得重复计入 hook 又另记外层，也不得漏计；CLI 120000只提供默认，不覆盖原900000 body与大beforeAll，取每个真实有效消费者的更长值。CLI retry=0、bail=0、fileParallelism=false/单worker仅用于新隔离运行工具，不改产品并发能力。若保重试，则每次完整attempt及queue按实际次数加入。有限safeInteger严格验；外层超过int32用≤60000ms单调分段 timer，每次按真实绝对deadline余量触发，正常完成立即收据/清理，不等满预算。任何缺case预算/NaN/零/不足，执行前拒绝。

完整 `node tools/timeout-policy/verify.mjs` 原8组不改：它自身逐组 spawn，不设通用outer。实施后的 owned wrapper 必须收集这8组真实参数/cases/各scope hooks，为总外层留足，并保每组真实 exit/close；不靠只运行check.test或裁掉失败组签Gate。Rust standalone/主crate harness也必须先collect实际filter list并绑定实际bin/source，命令与环境交独立 reviewer；本方案不签未知launcher。

## 运行事实和归属回执（实施后才生成）

每轮 RED/中间失败/GREEN 独立目录保 console、JSON、每case起止/原失败行、before/after源SHA、真正调用的port/API、owned local URL/socket/root/PID birth/parent及cleanup。真实公共慢成功保存 PNG/PDF/hash/长度与网络0；CDP保存原diagnosis/revision/key/click计数；native保存原task/call/operation与receipt摘要，不能泄露正文/密钥。

Node/Rust owned Unix fixture 只在自有临时root和专用socket；真实等待错误只kill已证明owned子进程，不碰App/foreign profile/foreign PostgreSQL。默认PGlite临时库，不设置真实PG；外网拒绝。原原生/模型条件未交付明确未执行，不临时跳过negative或删原case洗绿。

标准 `frontend` tsc 未裁剪必须保真实结果；当前已留 `frontend-standard-types-attempt2.txt` 的4个封存first错误：T1062 generated:616/621/630 的union.document、T1070 generated:75 的resolve。不得修、exclude或删除first100；全局 exit非零仍据实。若出现新错误，必须逐源SHA归因并修授权新增错误，不以这4个旧错作所有新错免责。

收尾只在正式解冻后：24源及只读依赖重核→新增真实RED→窄修→对应旧成功/负路全body→公共本地慢链→纯Rust安全测试→标准前后端types→boundary/orphan→完整timeout verify。原 first22、T1248 PG3skip、T1246官方49/包/App事实独立保留。当前 all runs=0；本文件不构成formalPASS或任务complete。
