# 工程坑册(踩过的坑,按主题沉淀)

> 从实战提炼,新会话/新人排障先查这里。每条:坑 → 正解。持续追加。

## 桌面打包(Tauri + Next sidecar)

- **Tauri resource 丢 symlink** → 打包改用 tar 方案整体封存再解压。
- **同版本 rebuild 陈旧缓存**:同版本号重打包,旧解压产物不更新 → size 指纹变化强制重解压。
- **未签名 app 的 keychain 不持久** → 文件兜底存储。
- **playwright 走 .pnpm 的模块解析**:Next tracing 漏动态 import → 实拷完整包(含 browsers.json)。
- **混淆 turbopack chunk 会崩** → chunks 目录 rename-only;混淆后必跑运行时冒烟。
- **打包版必须隔离验证**:dev 跑通/单测过 ≠ 分发包能跑(ESM/路径/资源差异)。
- **ffmpeg/Whisper 硬编码 `/opt/homebrew/bin/ffmpeg`,sidecar 打包脚本不打 ffmpeg**(T-326 RT-H09:douyin-cdp.ts + multimodal-whisper-local.ts):Intel Mac/Windows/无 Homebrew 用户转录稳定失败。正解:外部二进制随包分发,或启动硬预检 + 缺失时 UI 诚实禁用;禁止硬编码本机路径。
- **Windows 线程栈默认 1MB 定时炸弹(T-446)**:Rust `build.rs` 或桌面运行时里的 `let mut buf = [0u8; 1024 * 1024];` **栈上分配 1MB 缓冲**——mac/Linux 默认 8MB 静默容忍,Windows 1MB 一次调用就吃光 → `STATUS_STACK_OVERFLOW (0xc00000fd)`。sha2/blake3 官方示例默认这种写法,是 Linux 视角。正解:改 `vec![0_u8; 1024 * 1024]` 堆分配,或 `Box::new([0u8; N])`。build script 里尤其致命(cargo 起的 build-script-build 进程无法调栈大小)。识别信号:CI Windows job 报 `exit code: 0xc00000fd` + `thread 'main' has overflowed its stack`,且 stdout 卡在某个 `println!` 之后再也没输出。

## 验证纪律(最重要的一册)

- **改服务端/skill 代码必须重启+真机复测**:persistence/registry 单例持旧模块;**单测过≠live 生效**,声称「修好」前必须重启后复测那条行为本身,AI 行为尤甚。
- **验证走真实调用路径**:旁路脚本假通过害人——打包器模块解析(serverExternalPackages/.pnpm)≠手写 import;必须 curl 真 dispatch 触发真代码路径。
- **写侧落库≠读侧可见**:changeReason 写进 DB 但 resource/DTO 投影漏字段,前端永远读不回(T-234)。契约改动三查:表列/写路径/读投影。
- **Monitor/轮询脚本必须锁任务身份**:按状态匹配会把旧任务当「本轮完成」误报(时间过滤 requestedAt>CUTOFF)。
- **开工前反证「是否已存在」**:子代理 map/SPEC gate 高估缺口,三次差点重造已有能力(search-factory/planning.thesis/SEAM);动手前 codegraph/grep 反证。

## 并行 subagent 协作

- **`git add -A` 会扫进并行 agent 的半成品**(伤过 3+ 次)→ 精确文件列表提交;领地重叠时等全线返回再合并提交。
- **架构边界锚用正则扫源码文本会误伤注释**(G5 案例:注释里写「object-storage」被当违规)→ 边界测试写正则时想清楚匹配面;写注释避开锚定词。
- 任务边界 checkpoint:BACKLOG 更新+提交+`codegraph index --force` 重建(禁 `sync`,增量检测会谎报最新)。

## PGlite / 迁移

- **迁移文件多语句必须 `--> statement-breakpoint`**(0037 踩过,pglite 单语句执行)。
- PGlite/PG 双栈避免方言分歧:jsonb 复杂匹配放 JS 侧过滤。
- **PGlite 单写:两个 CreatorOS 实例同连一个库 = 必写坏**(T-305 会话踩:排障期反复起打包 app,又撞上另一会话的 `desktop:dev` sidecar,两个 next-server 并发读写 `~/Library/Application Support/cloud.aitongban.creatoros/db` → 04:32 库损坏,损坏保护把它改名 `db.corrupt-<ms>` 并新建空库顶上 → 新 app 读空库(0 素材)、老 sidecar 靠已打开的 inode 句柄仍服务旧数据,现象自相矛盾极难定位)。**排障/验证打包 app 前先确认没有 dev server 在跑同一个库**;数据本体没丢(`.corrupt-<ms>` 是完整可读的原库,改名回去即恢复;asset 字节在 `~/CreatorOS/media` 从不受影响)。定位靠 `lsof -p <sidecar-pid> | grep db.corrupt` 看有没有 `.corrupt` 句柄 + 比 `db` vs `db.corrupt-*` 目录大小/时间戳。
- **T-305 现象的设计根因(T-326 DATA-H09)**:`backend/src/db.ts` 的 createDb 把 file-PGlite **一切**异常(迁移 SQL 错/权限/磁盘满)都当"库损坏"→ 改名 `.corrupt-*` + 空库顶上——自愈过宽,普通可修复错误也表现为"数据全没了",且用户无恢复入口。正解:窄匹配真正的损坏错误类型,其余 fail-stop 保留原库;自愈前留备份并给 UI 恢复入口。

## AI 行为工程(MiniMax/弱模型)

- 自由文本 parse 节点会崩(cancelled)→ 全部 runStructuredNode 结构化输出。
- 编造病治法:枚举收窄+「只从原文提取」硬约束+可溯校验(关键词须在原文出现)+伪引用模式剔除(arXiv/DOI/小数精度%/榜单名)。
- 插点/边界类输出跨模型不稳 → zod refine+后处理吸附合法值集合(SRT 行 start)。
- 降级路径(model_memory)必须显式声明来源与局限,绝不填看似真实的出处。
- **接地≠结构**:anti-fabrication(禁编数字/偷换事实)只治「像编的数据」,治不了「像编的叙事」——脚本仍会镜与镜脱节、突然抛概念、用「很多人都…」空话开场。叙事质量要单独下硬约束:真实场景开场(禁抽象结论)+前因后果链不跳步+专有概念首次出现即用大白话讲清「是什么/跟主题啥关系」+用真实素材不足不编(T-275)。两类约束正交,都要有。

## Vercel AI SDK(ai@7)HITL 授权 + 历史合法性

- **悬空工具调用崩整流(MissingToolResultsError)**:HITL 授权卡处于 `approval-requested`(用户没点)时,用户改发新消息 → useChat 内存历史把这条「未批准、无结果」的 tool-call 随新消息 POST 回来 → `convert-to-language-model-prompt` 遇到其后的 user 消息发现有 tool-call 没配对 tool-result → 抛 `MissingToolResultsError` → 整条流 error(前端「出错了,请重试」)。表现为「上一轮授权没处理干净,下一轮任意功能都报错」。
- 治法(两层,喂模型前净化,存储层不动):① 纯函数摘掉**最后一条 user 消息之前**、assistant 里 {approval-requested,input-available,input-streaming} 的悬空 tool 部件(被新对话遗弃);② `convertToModelMessages(msgs,{ignoreIncompleteToolCalls:true})` 兜 input-available/input-streaming 中断态。**不误伤正常批准 resume**:源码核实 resume 是 sendAutomaticallyWhen 自动重发,末条是 approval-responded 且其后无 user 消息;已批准的会在校验前从 toolCallIds 剔除、被拒的有合成 denied 结果,两者都不崩——只有 approval-requested 崩(T-274)。
- `ignoreIncompleteToolCalls` 只丢 `input-streaming`/`input-available` 两态(源码 convert-to-model-messages.ts),**不碰** approval-* 态——别指望它单独治 HITL 悬空崩。
- **一步内并发授权 = 弹 N 张卡**:模型对一个文件夹并发发 N 个 local.read,同一步全部先于任何授权判定 needApproval → N 张卡;首张点「总是允许该目录」时卡 2..N 已生成、不回溯解除(授权表覆盖子路径没用,因为判定发生在授权落库之前)。治法:一张卡点目录授权 → 父组件据服务端已落的目录授权,把**直接父目录相同**的其它待决卡一并 addToolApprovalResponse 批准;有待授权时 submit 排队(button disabled),不并发触发新一轮(T-276,仿 Claude Code 权限门)。

## 打包/bundle 上下文的模块解析(playwright/hyperframes 等外置包)

- **同一份 `require.resolve` 代码,frontend 上下文能跑、backend 包里崩**:`createRequire(import.meta.url).resolve(...)` 的解析基准是 `import.meta.url`。frontend/src/server 的模块,基准指向能 resolve 到外置包的位置;`@creatoros/backend` 里的模块被打进另一个 chunk,基准指向 bundled chunk → resolve 不到 → 运行时崩。**跨包搬「运行时 resolve 外置包」的代码前先想清楚解析基准**(T-281:把 douyin-cdp 能跑的 `require.resolve(playwright)` 抄进 backend executor → 运行时「Cannot find module as expression is too dynamic」)。正解:把这类定位留在 frontend 上下文,经依赖注入把能力传进 backend executor。
- **`require.resolve(<外置包>/package.json)` 字面量 vs 包名拼接**:字面量能不能过 Turbopack 取决于该包的 `exports` 字段。`hyperframes` 无 exports → 字面量 `require.resolve("hyperframes/package.json")` OK;`playwright` 的 exports 挡 subpath → 字面量 → **build error `Can't resolve`**;包名拼接动态串藏过静态解析但会 build 期 `<dynamic>` 警告 + 某些 chunk 里运行时 too-dynamic。**别假设两个外置包能用同一种写法**。
- **教训(验证纪律)**:T-281 首修单测过、build17 装机冒烟也过(冒烟只测 GET/dispatch,没触发「缺 Chromium 时渲染视频」这条真实路径)→ 用户一渲染就崩。**打包冒烟 ≠ 覆盖真实功能路径**;前端/服务端 bug 优先起 dev server 用 preview 工具走真实路径(build error/运行时错当场现形),别只靠打包冒烟。
- **`require.resolve(字面量)` 在混淆 bundle 里返回数字模块 ID,不是路径**(T-289,查了极久):`createRequire(import.meta.url).resolve("gsap/package.json")` 被 Turbopack 转换,打包混淆 runtime 里返回 webpack 数字模块 ID(如 371609)→ `path.dirname(371609)` 抛「The "path" argument must be of type string. Received type number (371609)」;dev 里返回 `[externals]/gsap/package.json` 占位同样坏。**即便包在 serverExternalPackages 里也这样**(T-254c 以为字面量+外置能修,实际不行)。**正解:运行时定位 node_modules 里的文件一律用确定性 fs 扫描**(扫 `process.cwd()` 及父级的 `node_modules/<pkg>/<sub>` 与 `node_modules/.pnpm/<pkg>@ver/node_modules/<pkg>/<sub>`),别用 require.resolve。
- **Next tracing 漏掉「运行时 require 的文件」**(T-289):gsap.min.js / hyperframes dist/cli.js 不是 import 而是运行时 require.resolve 定位的,Next standalone tracing 追不到 → 打包后 sidecar 的 .pnpm 里这俩包**只剩 package.json、dist 全缺**(同 playwright browsers.json 坑)→ 渲染崩。build-sidecar 必须像 bundlePlaywright 那样从源仓整份实拷(dereference,含 dist+deps)+ **硬自检 dist 文件到位**。视频渲染因这两条**打包版从没成功过**,build21 之前一直卡 Chromium、build21 后卡这。
- **调试利器:ai_task_steps 步骤流**。执行层任务每阶段 `reportStep`,`ai.tasks.steps.list` 读回最后一步 = 崩溃阶段(getExecutionTask DTO 不含 steps,别被「steps=0」骗)。混淆 bundle 的 err.stack 难读时,步骤流 + dev server 用真实 spec 复现(execution.tasks.create 直接派)是最快定位法(T-289 靠这个逐步逼近)。

## ECharts 在 flex 容器里高度塌成 ~100px

- **症状**:force-graph 节点全挤画布顶部一条横带、互相重叠、下方大片空白(看似 force 参数问题,其实不是)。
- **根因**:echarts-for-react 的 div `height:100%`,但**祖先链没有一处 definite 像素高度**(全 `h-full`/`flex-1`/`min-h-*`)→ CSS 百分比高需父级 definite,否则坍缩成 auto → echarts init 时量到 ~100px 并定死 canvas → force 在 100px 薄条里跑。
- **正解**:共享 EChart 渲染器里用 `ResizeObserver` 量外层容器真实像素高,把 **definite px** 喂给 echarts-for-react;容器变高时重量 → 自动 resize。别指望 `height:100%` 在 flex 链里生效(T-283;dev preview 逐层量 DOM 才逮到,盲调 force 参数会跑偏)。

## Tauri webview 细节

- webview 吞 target=_blank;tauri-plugin-opener 自带注入脚本(拦 _blank 链接);自己再拦截会双输(stopPropagation 废掉官方脚本)→ 只把缺 target 的跨域链接补成 _blank,让官方脚本接管(T-252)。
- **sidecar 架构(窗口 `WebviewUrl::External(http://127.0.0.1:PORT)`)= 远程 origin,Tauri v2 ACL 对它的 `invoke` 默认全拒**(T-408,2026-07-18 真机:激活直接失败,devtools 抓到 `Command license_activate not allowed by ACL`,Rust 决策链零执行/零日志/零网络)。修两块缺一不可:① capability 加 `"remote": {"urls": ["http://127.0.0.1:*", "http://localhost:*"]}`;② **app 自定义命令的 `allow-*` 权限默认根本不存在**——必须 build.rs `tauri_build::try_build(Attributes::new().app_manifest(AppManifest::new().commands(&[...])))` 声明命令,构建期才自动生成 `allow-<command-kebab>`(`_`→`-`,tauri-utils acl/build.rs 源码坐实),capability 再引用。**坑的阴险处**:init script 注入、Rust→JS 事件广播、sidecar fetch 全正常,只有 JS→Rust `invoke` 静默死 → 无 IPC 的功能全好,极易误判成服务器/签名问题(本次先在服务器侧逐环验了一整圈才回头)。排查铁律:从终端 exec 内层二进制看 Rust stderr 是否根本没到命令(Finder 启动 stderr 被丢)+ devtools 看 JS 真实报错。最小授权:remote capability 绝不含 `shell:execute/kill`(spawn sidecar 是 Rust 的事,前端拿到 = 被投毒页面可执行任意进程)。

## serde 容错解析:服务端下发 snake+camel 双份键 → strict 结构体 duplicate-field 崩解析(T-408)

- **症状**:桌面激活死活不成,报「响应 nonce 与请求不一致(疑似重放)」,但服务器**明明返回 `success:true` 且 nonce 正确回显**(诊断日志:发/收 nonce 完全一致、cache=MISS、无压缩)。
- **根因**:activation-manager 对同一字段**同时下发 snake_case + camelCase 两份**(`expires_at` 和 `expiresAt`、`license_mode` 和 `licenseMode` 都在)。Rust 端 `#[derive(Deserialize)] + #[serde(rename_all="camelCase")] + #[serde(alias="expires_at")]` 遇到「rename 目标键 + alias 键**同时**出现」→ serde 判 **duplicate field → 整个 body 解析直接 Err** → `unwrap_or_default()` 把 `nonce` 抹成 `None` → 决策链 `body.nonce != req_nonce` 成立 → 误判疑似重放拒绝。
- **为何潜伏到最后才现形**:壳层激活链一路被上游卡点(Tauri ACL 拒 invoke → CDN TLS 证书 → …)挡在前面,**从没真正跑到"解析成功响应"这步**(`.license` 从没写成),所以这个从第一天就在的解析 bug 一直没暴露。诊断法:临时在 HTTP 端口打印「发出的 nonce vs 收到的 nonce vs cache 状态 vs body 片段」,一眼看出"服务器回得对、是客户端解析丢了"。
- **正解**:不要用 strict 结构体解析"字段可能重复/可能 snake 可能 camel"的外部响应。走 `serde_json::Value`(**重复键 last-wins,不报错**)+ 每字段 camel/snake 双取(`v.get("expiresAt").or_else(|| v.get("expires_at"))`),和前端 `license-client.ts` 的 `body.licenseMode ?? body.license_mode` 同策略。**测试要用真实响应形状**(含双份键)锚定,别只用自己造的干净单份 body(FakeServer 的 `valid_body` 只有单份 → 测过也漏)。

## 机密从 env 迁到 stdin/fd 时,消费点要全量改(T-408 master key 漏改)

- **症状**:桌面激活成功后无限跳转激活页。Rust 壳 `licensed=true 已激活`,但 sidecar 日志 `[activation] .license 解析失败…缺 master key,无法解密`。
- **根因**:T-391 H-key 把 master key 从 `env.CREATOROS_MASTER_KEY` 明文改成经 Tauri ChildStdin(fd 0)注入 + `resolveMasterKey`(fd 通道 + `fdKeyCache` 缓存,stdin 只能读一次靠它兜)。DB 加密路(secret-crypto / persistence-client)改到了,但**另一个消费点** `license-file.server.ts` 还直读旧 `env.CREATOROS_MASTER_KEY`(已 undefined)→ 缺 key。修:所有 master key 消费点统一走 `resolveMasterKey`(从 `@creatoros/backend` 引,与 DB 层**同模块实例同缓存** —— 靠 bundler 去重,别各自造轮子)。
- **教训**:把一个机密的传递方式换掉(env→stdin/fd、明文→keychain 等),必须 `grep` 出**所有**读取点全量迁移,漏一个就潜伏。尤其"只在某条从没端到端跑通的链路上才被消费"的点最容易漏(本例 sidecar 读 `.license` 直到激活首次成功才被触发)。
- **调 fd 单读要缓存**:stdin/fd 是一次性流,多个消费点必须共享一次读取的缓存(`fdKeyCache`),否则第二个消费点读到 EOF→空→降级/错 key。

## 桌面激活 0→1 的"层层潜伏 bug"教训(T-408,一次剥 5 层)

- 桌面壳层激活链**从没端到端真正跑通过**(`.license` 从没成功写盘),导致 5 个独立 bug 层层叠压、只有修掉上一层才暴露下一层:① Tauri v2 远程 origin invoke 被 ACL 拒(见「Tauri webview 细节」)→ ② CDN 边缘证书 SAN 不含域名 TLS 失败 → ③ 瞬态验签失败把「疑似重放」甩用户脸上(缺重试自愈+友好文案)→ ④ WireBody 对服务端 snake+camel 双份键 duplicate-field 崩解析(见「serde 容错解析」)→ ⑤ 本条 master key 漏改。
- **教训**:一条关键用户链路(激活/支付/登录)在**真机端到端至少成功跑通一次**之前,别信"各层单测都过";多层潜伏 bug 只有真机逐层剥。诊断法屡试不爽:从终端 exec 内层二进制看 Rust stderr + 临时打诊断日志(发/收对比)+ 逐环 curl 反证「哪一侧才是坏的」。

## Next build / 工程门禁(T-326 ENG-H02 / B-04)

- **`next build` 会真跑你的组合根**:静态生成(Generating static pages)worker 里任何一次 `getBundle()` 就把 buildPersistence 全套副作用带进 build——连 DB、跑迁移、seed、sweep、起 node-cron;且 11 个预渲染 worker 各自进程各建一份连接(并发写同一 PGlite,违反单写者)。**正解:组合根唯一入口处判 `process.env.NEXT_PHASE === "phase-production-build"` 直接拒绝**(Next 16 在 `build/index.js` 设该 env、worker 继承,Next 自己运行时代码也用这字符串判 build 阶段——官方语义信号);scheduler 等副作用点再各留一道纵深守卫。验证判据:build 全程 0 条 seed/cron/master-key 日志 + 指过去的 PGLITE_DATA_DIR 目录保持**空**。
- **backend 自己的 tsc 过 ≠ 跨包 frontend tsc 过**:frontend 带 Next 全局类型增强(`ProcessEnv.NODE_ENV` 必填 readonly),backend 源码里 `spawn/execFile` 的 `env: Record<string,string>` 在 frontend tsc 视角不再兼容 ProcessEnv → overload 解析失败连环崩成 never(报错样子像 @types/node 坏了)。正解:构造用普通 Record、**出口断言为 `NodeJS.ProcessEnv`**(child-env.ts);改 backend 里会被 frontend 引用的代码,收口必须把 frontend `tsc --noEmit` 也跑一遍(aa64e83 只验 backend → 挡住 T-326 验证门)。
- **Playwright webServer 两坑**:① 默认 `pnpm dev` 继承 .env.local → E2E 直连开发/装机真库(PGlite 单写者 + 脏数据);正解 webServer.env 显式 `DATABASE_URL=""` + `PGLITE_DATA_DIR=mkdtemp(...)`(fresh 库 seed canonical user → 单机免登录直通,测试开箱可用)。② 根路由**冷 Turbopack 首编译 + fresh 库迁移/seed 实测 ~2.8min**,旧 timeout 120s 必超时(审计 B-04「停在 Compiling」的真相);按实测+余量设 300s。config 顶层 `mkdtempSync` 要用 env 记忆化——worker 进程会重复加载 config,否则每 worker 白建一个空临时目录。
- **仓里唯一 workflow 不是验证 CI**(T-326 ENG-H01):`.github/workflows/harness.yml` 是可写仓的 Autonomous Harness,锁死旧分支 `feat/service-contract`,不跑 typecheck/test/build/lint/boundary,且用 Node 24 而根 `engines` 要求 `>=25 <26`——main 可以在零门禁下进分发。正解:补 main/PR 验证 CI(五件套全跑),Node 版本与 engines 对齐;"本地跑过"不算发布证据。
- **lint 默认扫进 `src-tauri/sidecar` 生成物:81,593 problems**(T-326 ENG-M01):真信号(剥离后 55 errors/153 warnings)被噪声淹没。eslint.config.mjs 必须 ignore 生成物;见到异常大的数字先查 scope 再评代码。
- **updater 缺 `CREATOROS_UPDATE_BASE_URL` 时产出占位下载 URL 的 latest.json,只 warn 不失败**(T-326 ENG-H03):签名正常但客户端永远下载失败。release 脚本缺关键配置要 fail,不要 warn——发布链上的 warning 没人看。

## 本地 loopback / 文件系统 / 注入安全(T-326 审计,证据全文见 docs/research/2026-07-15-prelaunch-full-engineering-data-audit-research.md)

- **用户输入拼路径 + 递归删除 = 可删到 appData 之上**(B-01):web-session route 只查 `domain` 非空就 `path.join(webAuthDirBase, domain)`,remove 走 `rm(target,{recursive:true,force:true})` → `domain="../.."` 能删数据库/master key/浏览器 profile。正解:hostname 白名单解析 + `resolve/relative` containment + realpath 复查;**新增任何"外部输入拼路径"的 route 照此办理**,并覆盖 `../`/绝对路径/编码分隔符测试(本仓 local-read 已有 containment 可抄,见审计"已核对的正向控制")。
- **随机端口不是鉴权**(RT-H01):loopback API 无/坏 cookie 会静默回退本地主用户,dispatch/chat/web-session 均无启动级 token 和精确 Origin/Host 校验——与 B-01 组合 = 恶意网页可驱动删除。正解:启动级本机令牌统一中间件,新 route 禁止各自裸奔。
- **web reader/capture 有 SSRF**(RT-H04):只查 http/https 就 `page.goto`,无私网/loopback/link-local/云元数据地址阻断,重定向不逐跳复检。
- **不可信网页正文原样回模型,同一会话挂着付费/有副作用工具**(RT-H05):恶意页面可诱导消耗额度、推进流程。注入面(网页/文件正文)与副作用工具必须隔离或加人工确认。

## 执行层(Pi / execution)边界(T-326)

- **构造了 systemPrompt ≠ Pi 收到**(RT-H02):agentic-executor 组装了 `input.systemPrompt`,但 pi-engine 的 `createAgentSession` 没传受控 ResourceLoader、之后只 `session.prompt(input.goal)`——Pi 实际从 ResourceLoader 构造 system prompt(依赖源码 agent-session.js),CreatorOS 的诚实/预算/工具策略模型根本没收到。**改 Pi 行为前先读依赖源码确认消费链,别信自己这侧的组装代码**。
- **Pi 默认 ResourceLoader 扫 cwd 和 `~/.pi/agent` 并自动加载 extensions/custom tools;`noTools:"builtin"` 只禁 builtin**(RT-H03):"工具白名单物理隔离"必须显式传受控(空)loader,测试要断言**生效工具集合 == 白名单**,不是"那四个 builtin 不在"。
- **contract 声明 `network:"deny"` 但 runExecutionTask 只消费 timeout/output;video child 直接继承全部 `process.env`**(RT-H06):沙箱内代码可读模型 key/DB 配置并外传。策略字段动手前先找消费点,child env 显式白名单。
- **execution timeout 只放弃 Promise,子进程树还在跑**(RT-M03):要进程组 kill 并等退出再清 sandbox。
- **Pi 发生工具副作用后异常会整体 fallback = 重放副作用**(RT-M01):只有零副作用才允许整体回退,否则 checkpoint + 幂等工具。

## 发布/指标双轨数据链路(imported vs manual,T-326)

- **external key 先到先得,publication 永不迁移**(B-03,T-323 的源码根因):`createImportedPublication` 按 external key 命中既有行就直接返回(不比较 `contentOutputId`);register 只把请求 output 标已发布、不迁 publication;后续日拉继续按旧 publication 的 output 归属指标 → 同一作品永久分叉 imported/manual 两个项目,指标/封面/复盘流向空壳。正解:事务化 re-parent + 合并派生数据 + 归档空壳 + external key 唯一约束;**动发布/登记/日拉链路前先读这段归属逻辑**。
- **imported 发布 `currentRevisionId=null`,transport 伪装成 `""` 过 contract 的 `z.string().min(1)`**(B-02):client 对 envelope 做 Zod parse → 日拉一条作品就能让 publication list/detail 整体解析失败。空值语义在 contract 层一次说清(允许 null 或导入时原子建 revision-1),**禁止占位假值**。
- **并发日拉先 `ensureImportedProject`(先查后建、项目无外部键唯一约束)后建幂等 run**(DATA-H08):幂等键挡不住已建的重复空壳项目——幂等键要在链路第一个写操作上。
- **publishing create 不校验 outputId 归属且 schema 无 FK**(DATA-H03):可建跨属主/悬空 publication。**先调平台、再写 publication、最后更新 output/project,同状态重试直接返回**(DATA-H04):中断后可能重复发平台或本地永不跃迁——外部副作用要有意图记录 + 对账路径。
- **scheduler 先查当日 run 再建,无 DB 唯一约束**(RT-H08):两个 tick 并发通过 = 重复运行重复计费。去重靠唯一键,不靠先查后建。

## 数据完整性:多账号 / 事务 / AI 采纳(T-326)

- **多账号 scope 三处缺一即串号**(DATA-H01/H02):publication 所有权与列表只按 `userId`;analytics 写入 stamp account、读取聚合只传 user;favorites 唯一键 `(user_id,name)`/`(user_id,aweme_id)`、topic_preferences 唯一键与 conflict target 均不含 account → 双抖音号混读、第二账号建不了或改写第一账号数据。**新表口诀:凡用户级数据先问"要不要 account 维度";要,就唯一键/查询 where/upsert conflict target 三处全带**。
- **AI 批量采纳逐条落库、最后才标 task 成功,无事务无逐项幂等**(DATA-H06/RT-H10,ai.service + execution.service 同坑):第 N 条失败重试 = 重复前 N-1 条。
- **asset-generate-runner 在生成阶段就持久化资产,拒绝/失败不清理**(DATA-H07):违反本仓"AI 只产候选、人确认后落库"铁律,产生永久孤儿资产。新 runner 一律 candidate→adopt 两段式。
- **projects 删除事务遗漏 production/analytics/attribution/learning**(DATA-H05):这四组全是无 FK 软引用,删完 dashboard 仍聚合已删项目。删除/归档实体时对照"谁软引用了我"清单逐表清。

## 前端诚实与恢复(T-326)

- **`fixtures/selectors` 层的 catch→fixture 兜底已成惯性模式**:settings 读取失败回退 fixture(伪造模型/路径/18GB 占用,FE-H02)、shell-router 真实项目阶段回退 `research`/0%(FE-M07)、dashboard 缺数据伪造"全部处理完/多平台"(FE-M04)。本仓铁律:读失败显 ErrorState,缺数据诚实置 0/「未设置」;**新页面禁用该模式,审查 grep catch 块里的 fixture 引用**。
- **creator layout 无降级地等待通知请求**(FE-H03):铃铛接口一坏,首页/项目/素材/发布/设置全部不可用。次要功能的请求失败不得阻塞 layout。
- **长任务轮询三件套缺一不可**(FE-H01,production-workbench):决策轮询 ~10 分钟静默退出、渲染轮询不处理 `failed` 永久转圈、刷新恢复漏 `queued/running` 与 failed render——全终态匹配 + 超时上限 + 刷新恢复枚举中间态。
- **日历"今天"写死 `REFERENCE_INSTANT=2026-07-03`**(FE-H04):过去/未来/默认月份全由它派生,7 月 15 日还允许把 7 月 10 日排为未来。时钟必须注入,写死的参考时钟属于"非数据 fixture",出生即登记退役条件。

## 装机换包时 pkill 硬杀 sidecar → PGlite 半写损坏(2026-07-16 数据事故)

**坑**:装机流程 `osascript quit + pkill -f creatoros-server` 硬杀 sidecar;当时后台采集任务正在写库,PGlite(WASM Postgres)WAL 半写 → 下次启动 `RuntimeError: Aborted()` 打不开 → app 判损坏移目录建空库,用户当天数据"消失"。

**正解(恢复)**:PGlite data dir = 标准 PG16 格式。`cp` 副本 → 删残留 `postmaster.pid` → 本机 `postgresql@16` 的 `pg_resetwal -f` 重置半写 WAL → PGlite 即可重开(代价=丢最后未 checkpoint 的事务;本次丢了最后绑的账号+其未落盘写入,其余全回)。corrupt 原件永远保留不动。

**正解(预防)**:①装机脚本**禁 pkill 硬杀**——`osascript quit` 后轮询等 sidecar 自然退出(超时才升级);②sidecar 收 SIGTERM 应 graceful close PGlite(产品缺陷,T-362);③绝不在 app 运行中用第二进程碰同一 PGlite 目录(单写者)。

## 换库/清库会带走 user 级共享配置(2026-07-16 模型配置丢失)

**坑**:model_configurations(含加密 key)存 db 内;装机「归档旧库换新库」+ 后续「清理旧归档」= 配置无声丢失,且采集/转写有本地兜底不报错,丢失长时间不暴露。

**正解**:①清库/换库前 sanity check:老库有非空 model_configurations 而新库没有 → 迁移或明确提醒;②根治=T-363(配置独立于工作区库存储/导出导入)。

## 手写 drizzle 迁移多语句必须加 `--> statement-breakpoint`(2026-07-17 T-372)

**坑**:0049 手写迁移一个文件里放 3 条 `ALTER TABLE`,不加分隔标记 → PGlite 报 `cannot insert multiple commands into a prepared statement`,所有走真库的 vitest 全红。drizzle migrator 只按 `--> statement-breakpoint` 切句,分号不算。

**正解**:手写 `.sql` 迁移每条语句之间插一行 `--> statement-breakpoint`(先例:0000/0009/0047);单语句迁移(0045 式)不用。写完新迁移先跑一个真 pglite 的 repository 测试验证迁移能 apply,再跑全量。

## master key 静默降级 → 用户报"配置消失"(T-453,2026-07-21)

**坑**:mac ad-hoc 签名(`codesign -s -`)每次 rebuild CDHash 都变,keychain access 绑签名 identity → **读不回旧 master key**;而 `.master-key` 文件走 keychain-first 逻辑,即便存在也可能被跳过。新 master key 与 DB 里旧密文不匹 → `decRow`(settings.repository:200-212)**静默把 secretValue 置 null** → `resolveLlmConfig` 报"capability xxx 无可用 LLM 凭据" → **用户前端看到"没配"**,以为要重配,配到山寨中转/错模型名 → provider 403/429 → "对话没反应"。整条链每一步都"符合预期",但用户体验是"配了保存下次又空"。

**信号识别**:sidecar.log 里出现 `LlmCredentialError capability "xxx" 无可用 LLM 凭据`,而用户明确说配过;或 sidecar 启动横幅 `签名自校验: 已签名 valid=false team_id=<none>`(ad-hoc 签名典型输出);或换新版包/rebuild 后突然"配置消失"。

**正解**(T-453):①`decRow` 从"静默返 null"改为"写入 sentinel `dec-fail:v1`"——保住"曾配过"信号;②`putModel` 加密后立即 round-trip 解密断言(失败即拒绝入库,保存路径永不给用户"看似成功、下次读空");③`resolveLlmConfig` 认 sentinel 后抛新文案「已配但密钥无法解密,请重填」(区别于"从未配");④contract + service 加 `secretDecryptFailed` 位透给 UI。**未做**:master key 逻辑反转(文件-first / keychain-cache)——短期是 UI 层的诚实交代兜底,长期治本要改 master key 持久化。

## T-451 verdict-token fail-closed 把打包冒烟测试拦了(T-454,2026-07-21)

**坑**:T-451 verdict-token 校验在 `verdict-token-gate.ts::verifyVerdictTokenOrExit` 里 fail-closed —— 缺 token 就 `process.exit(1)`;但 `desktop:package` 有一步"混淆后运行时冒烟"(`obfuscate.mjs --smoke-only`)**直接 spawn `node server.js`**,不经 Rust 壳、没 token,冒烟 100% 拒 spawn。dev 分支只放行 `NODE_ENV!=production && CREATOROS_DEV_MODE=1`,而 smoke 时 `NODE_ENV=production`(打包版环境)→ 走不进 dev 豁免 → 打包总在 smoke 步跪。

**信号识别**:打包 log 里冒烟前一切绿,冒烟输出 `[T-451] verdict-token 缺失(未由 CreatorOS Rust 壳启动) → 拒绝 spawn` + `[obfuscate] ✗ 冒烟失败:read ECONNRESET`。

**正解**:①`verdict-token-gate.ts` 加 build-only bypass 分支——**双条件 opt-in** `CREATOROS_SMOKE_BYPASS_VERDICT===1 && CREATOROS_DESKTOP===1`;②`obfuscate.mjs` smoke spawn 时**只在这里**注入 `CREATOROS_SMOKE_BYPASS_VERDICT=1`。Rust 壳 spawn packaged app 时永不设该 env,攻击者拿到 packaged exe 从二进制里也翻不出该分支的触发路径(在源码明文,但 Rust 壳链断了透传),故不降低安全性。**教训**:安全 fail-closed 加固时必须一并审视**打包内部的自我调用路径**(smoke test / self-test),它们和用户机不是同一条路径,同一套 gate 会误伤。

## Tauri CLI 不认 `--profile`,cargo 参数要在 `--` 后透传(T-452,2026-07-21)

**坑**:`tauri build --profile release-fast` 报 `error: unexpected argument '--profile' found ... tip: to pass '--profile' as a value, use '-- --profile'`。tauri CLI 只透传 `--` 后的参数给底层 cargo。

**正解**:`tauri build -- --profile release-fast`(Node argv 数组里 `["build", "--", "--profile", "release-fast"]`)。同时**若走非默认 profile,产物路径变**(`target/release-fast/bundle/` 而非 `target/release/bundle/`)—— 后续所有产物收集/校验脚本要一起改路径,否则 upload-artifact 空手。CI 场景下更简单的方案是**强制走正式 `release` profile**(`CREATOROS_RELEASE=1`),既是发布档、又不用改后续脚本;`release-fast` 留给本地内测快通道。

## Windows 本地打包 fixOutOfTreeSymlinks 卡死大目录(2026-07-21)

**坑**:`build-sidecar.mjs::fixOutOfTreeSymlinks()` 在打 tarball / Windows direct resource 前扫**整个 sidecar 目录**(815k+ 文件条目)找悬空 symlink,Windows NTFS + 大目录 + 干扰因素(杀软/索引服务/pnpm .pnpm store 深链)会**卡死单线程 stat 递归 15+ 分钟不出信号**(HandleCount / WorkingSetSize 不变 = 单纯 IO wait / 内核卡)。**GHA runner VM 是干净盘、无干扰,同样代码 30 秒内跑完**。

**信号识别**:build-sidecar 打完 `verdict 公钥已烘焙` 后**无新输出 15+ 分钟**,主 node 进程还活但 HandleCount 8-60 秒观察不变,`sidecar/node_modules/.pnpm/` 目录已存在且巨大。

**正解**:①短期 = **本地 Windows 打包不可靠,改走 GHA**(runner 干净盘 + Swatinem/rust-cache 加速);②长期 = 拆 fixOutOfTreeSymlinks 为**分批扫**(每处理 N 个 log 一次),或改为**只扫 pnpm 链的可疑白名单目录**(不必全 sidecar 递归);③避免 dereference 全展开导致 815k 文件条目(但代价是要重新验证 pnpm junction / Tauri resource / hyperframes 三个历史陷阱都不复现,不能盲改)。

## GHA secrets 与 build.rs `env!()` 编译期依赖(T-451/T-454,2026-07-21)

**坑**:`build.rs` 用 `env!("CREATOROS_VERDICT_SIGNING_KEY_B64")` 读私钥 —— 这是**编译期**读环境,workflow 若没在 build 步骤显式引用 `${{ secrets.XXX }}` 到 env,cargo build 直接 `env-var not set` 编译失败。CI 上默认不会自动透传 secrets 到 subprocess。

**正解**:workflow 的"打包"步骤显式写 `env: { CREATOROS_VERDICT_SIGNING_KEY_B64: ${{ secrets.CREATOROS_VERDICT_SIGNING_KEY_B64 }} }`,同时**仓库 secrets 必须提前配好**(缺任一 → env 值为空串 → cargo 编译报错或运行时公钥载入失败)。用 `gh secret set NAME`(stdin 传值,不落磁盘/日志)配置。

## sccache 装了但 rustc-wrapper 路径要绝对(T-454,2026-07-21)

**坑**:`~/.cargo/config.toml` 的 `[build] rustc-wrapper = "sccache"` **只在 PATH 有 sccache 时**能用。winget 装的 sccache 落 `%LOCALAPPDATA%\Microsoft\WinGet\Links\sccache.exe`,但**新装当前 shell 的 PATH 是旧的**,cargo 找不到就报 `unable to spawn rustc-wrapper`,build 直接崩。

**正解**:`rustc-wrapper` 写**绝对路径**(如 `C:\\Users\\zyongzhu\\AppData\\Local\\Microsoft\\WinGet\\Links\\sccache.exe`),或**重启终端让 PATH 生效**再改回相对名。首次 build 无命中(纯 miss 写缓存),第二次同 hash 依赖 build 才吃到 20-60% 命中率——不要期望首装立刻加速。

## 日志加密文件解密工具工程化(T-455,2026-07-21)

**坑**:sidecar.log.enc 是 X25519 + HKDF-SHA256 加密(T-391),每次要用户报问题时排障都要「装 Rust 工具链 → cargo build logdec → 手工传 --key 参数」——用户机不可能装 Rust,只能开发机跑;开发机每次删 sidecar 重打包又要重建 logdec(build.rs 依赖 tauri_build 走 sidecar 目录)。

**正解**:①产出 `creatoros-logdec.exe` 后**单独拷一份到 `tools/`** 目录,cargo clean 不带走;②做个 shell/PowerShell wrapper `decrypt-log.sh` 自动找密钥文件+批量解密+按目录聚合输出;③把 wrapper 加进 `docs/RELEASING.md` 或 `docs/support-toolkit.md`,新排障时"从这里起步"。

## Tauri Windows 同时打 nsis+msi + LZMA 极致压缩 = GHA 90min timeout(T-454,2026-07-21)

**坑**:`tauri.windows.conf.json` targets `["nsis", "msi"]` **打两份 installer**,每份都要独立压缩整个 `sidecar/` 目录(1.5GB, Chromium/Playwright/Xenova 全部 co-ship)——**等于压两遍大文件树**。默认 NSIS 用 **LZMA 极致压缩**,大目录 30-60 分钟起,单次 stdout 静默,GHA log 就卡在 `Info Target: x64` 之后不再输出。GHA runner 90min timeout 打完 cargo(28min)后 34min 内没进后置步骤 → 直接被 `##[error]The operation was canceled`。

**信号识别**:GHA log 末尾 `Info Target: x64` 后长时间无新行;GHA billable duration 仍在增长(runner 未死);job step "打包(release.mjs 全链)"卡 in_progress。**用户看着以为死了,实际是 NSIS 单线程 LZMA 在啃**。

**正解**:①`targets` 内测收窄成 `["nsis"]`(msi 只在企业分发要;内测/日常不需要);②`bundle.windows.nsis.compression = "zlib"`(默认 LZMA → zlib,速度快 3-10×,包大 30% 但内测可接受;LZMA 只在真正要"极致压缩下载体积"时用);③`installMode: "currentUser"` 显式化(承接 T-449:装到 `%LOCALAPPDATA%\Programs\`,ACL 天然只该用户可读)。④GHA `timeout-minutes` 从 90 → 180 兜底(即使 NSIS 有意外也不再被 90min 顶死;正常 45-60min 内应完成)。

## Windows tauri-plugin-shell 的 fd 0 不是真管道,readSync 阻塞 60s+(T-460,2026-07-22)

**坑**:CreatorOS Windows 首启白屏 6-10 分钟。日志显示 sidecar `10:37:32 Ready` → `10:43:46 [scheduler] 起`,中间 **6 分钟没日志**。定位到 `backend/src/secret-crypto.ts::readMasterKeyFromFd`:主线程在 `while (Date.now() < deadline_3s) { readSync(fd, ...) }` 循环里读 master key。**mac 上 fd 0 是真 pipe(壳 write 完 close → EOF)**,读 32B 立即返回;**Windows 上 tauri-plugin-shell 是 IPC channel 抽象**,fd 0 语义不同,`readSync(fd, 1)` **单次调用阻塞 60 秒+才返回**——`while` 的 3 秒超时**根本检测不到**,一次 read 就把整个 deadline 吃光;然后循环还继续,直到 20+ 分钟意外恢复。期间 Next.js 端口 LISTEN 但整个 sidecar 主线程 pinned → webview 拿到 `http://127.0.0.1:<port>` 但服务器不处理任何请求 → **纯白屏**。

**信号识别**:Windows 日志「`Ready in 0ms` 到 `[scheduler] 起` 之间几分钟没输出」+ 用户报"打开是白屏,等半天才能用",mac 完全没此问题。

**正解**(T-460):`readMasterKeyFromFd` 头部 `if (process.platform === "win32") return "";` **直接短路 fd 通道**,让上层走 `CREATOROS_MASTER_KEY_FILE` 文件兜底(T-425 已在)。启动直接快 3-5 分钟。这是**平台差异**必须显式分支处理,别指望"跨平台 API 语义一致"。类似坑:Node@25 Windows 上 `process.kill(ppid, 0)` 会抛 EPERM(UAC/进程隔离)——见 T-457。

## Tauri setup 内 splash 窗建了但内容不渲染(T-461/T-467,2026-07-22)

**坑**:T-457 已在 setup 头部 `WebviewWindowBuilder::new(handle, "main", WebviewUrl::External("about:blank"))` + `initialization_script(SPLASH_JS)` 建 splash 窗,期望 sidecar 首启解压 tarball 的 3-5 分钟里,用户能看到「正在校验/正在展开首启资源…」进度文案。**真机验证:纯白屏,一个字都没**。

首次误判(T-461):以为 setup 阻塞主线程 → webview event loop 冻结 → splash 不渲染。改成 `std::thread::spawn` 把整片 setup 逻辑丢后台线程,让 event loop 立即跑。**没生效**——CreatorOS.exe 存活但 sidecar 永不起,主页永白屏。后台线程内多个 `.expect(...)` 静默 panic(打包态 stderr 拿不到),整片搬后台涉及 20+ Tauri API 调用,时序敏感面太大。**回退**。

真正根因(T-467):`SPLASH_JS` 用 `window.addEventListener('DOMContentLoaded', function(){...})` 注册建 DOM。**Windows WebView2 上 `about:blank` 加载极快**,initialization_script 注入时 `DOMContentLoaded` **可能已经触发过一次** → 监听器**永远不跑** → splash 空白。mac WKWebView 加载稍慢/事件时序不同,恰好没踩。

**信号识别**:setup 有建 splash 窗代码,`get_webview_window("main")` 能拿到,但 webview 内容永远白屏,DevTools 里 body 是空的、`window.__creatorosSplashStatus` 不存在。跨平台差异:mac 好,Windows 挂。

**正解**(T-467):改用 IIFE 立即执行 + `document.readyState` / body 就绪短轮询兜底:`(function(){function build(){if(!document.body){setTimeout(build,16);return;}/*建DOM*/}build();})();`。跨 WebView2/WKWebView 都稳。**教训**:webview 里 `addEventListener('DOMContentLoaded')` 是**赌事件时序**,在 initialization_script(navigation 前注入)场景**必输**——脚本执行时 body 可能已在;正确姿势是"检查+等",不是"注册监听"。

## 直觉误诊:sidecar setup 阻塞不冻 WebView UI 线程(T-461 回退教训,2026-07-22)

**坑**:凭直觉断言"Tauri setup 阻塞主线程 → webview event loop 冻结 → splash 不渲染",大动干戈把 setup 挪后台线程,回退时才想清楚:**Windows 上 WebView2 由独立 GUI thread 跑消息泵**,setup 阻塞的是 Rust 主线程(setup 回调运行在 Tauri 主 event loop 线程,但 webview 渲染在 WebView2 自己的 UI thread),两者不同线程。setup 里 `tar.status()` 阻塞 3-5 分钟期间,WebView2 可以正常渲染 about:blank 并跑注入的 initialization_script——**只要 SPLASH_JS 自己不出问题**(见 T-467)。

**信号识别**:大改架构(整片搬后台/整体重构线程模型)修完真机还挂,说明**根因不在架构**,在具体 API 使用姿势(事件时序/参数/平台差异)。

**正解**:排障顺序应该是**先在 Rust stderr / webview DevTools 里精确定位报错**(用 dev build 或加临时 log)→ 再动结构。**不是**"我觉得应该是这个原因,直接大改"。整片搬后台线程涉及 20+ API 调用(state/manage/handle/plugin extensions)全都要考虑 Send/Sync/'static,风险面 >> 收益。**教训**:改架构前先用最小可能的 diff 排除单点问题(SPLASH_JS 一行 JS 改动即验)。

## 字节码化护栏漏 Playwright 大 chunk,采集收藏夹 well-serializable 崩(T-462,2026-07-22)

**坑**:用户「采集收藏夹失败:`page.evaluate: Passed function is not well-serializable!`」。栈指向 `_17k3mqw._.jsc:1:1776374` —— **1.1MB 大合并 chunk 被 bytenode 化了**。Playwright `page.evaluate(fn)` 要求 fn 有可 `.toString()` 的源码字符串;bytenode 编译后的函数 `.toString()` 返回 `[bytecode]` 占位 → Playwright 拒绝序列化 → 挂。

T-459 已加护栏 `requiresSerializableFunctionSource(code)`(regex 检测 `.evaluate(/.evaluateAll(/.evaluateHandle(/.waitForFunction(/.addInitScript(/.$$?eval(`),命中即 return "rename-only" 不走字节码。**但 GHA build 环境下这个 chunk 仍被字节码化了**——原因待精查(chunk 内容漂移?打包合并规则不同?),但**结论**:单层护栏(bytecode.mjs `if (requiresSerializableFunctionSource(code)) return false;`)不够,还得**第二层**。

**信号识别**:打包版跑抖音采集报 `Passed function is not well-serializable`,栈里 `.jsc` 扩展名的文件即字节码化 chunk。查 sidecar 目录 `frontend/.next/server/chunks/ssr/*.js`(stub `require('bytenode');require('./x.jsc')` 十来行)对应 `*.jsc` 存在 → 字节码化了。

**正解**(T-462):`bytecode.mjs::shouldBytecode` 加双护栏,`if (preset === "rename-only") return false;` —— **任何** rename-only chunk 都不字节码化。因为 rename-only 分档条件本身 =「requiresSerializable / chunks 含字面 require」,两者都不适合字节码。防第一层护栏被绕(未来触发条件变化)。**另加打印**:`runBytecode` 主流程末尾输出被跳过的 chunk 列表,下次崩能立即诊断"是不是没跳到"。**教训**:JS 打包混淆链有多个转换阶段(next build → obfuscate → bytecode → decoy → legal-stamp),中间任一阶段的护栏漏了都会到运行时崩,冗余护栏比"依赖精准单点判定"稳。

## chat-turn completed 但 text 为空 → UI 一字不显(T-464,2026-07-22)

**坑**:用户「AI 助手发消息没回答」。日志显示 `[chat-turn] outcome=completed durationMs=1578`(1.5s),`[chat-context] est=2981→2981 tokens cleared=0`(上下文未变),**没有任何 `[chat-tool]` 调用**。往前翻:`[api/chat] stream errored: Error [AI_APICallError]: Unauthorized` + `url: 'https://codex.hiyo.top/v1/messages'` + `responseBody: '{"code":"INVALID_API_KEY","message":"Invalid API key"}'`。

第三方 Anthropic 代理(`codex.hiyo.top`)对新消息**返 200 + 空 SSE 流**(SDK `onFinish` 视作成功触发 `completed`),但 `responseMessage.text=""` 且 `parts=[]`。route 层 `hasRenderable = text.length > 0 || parts.some(tool)` 为 false → `if (!hasRenderable) return;` **不落库、不给前端反馈** → UI 空白气泡都不生成 → 用户看到"AI 一字没回"。

**信号识别**:多次 `chat-turn completed` 但 durationMs < 2000ms 且 `chat-context tokens 恒等未增`,说明**模型端返 200 空内容**(vs 真短回复也会走 tool 调用/写入上下文)。对照 API 密钥 provider 的 URL 或代理服务日志。

**正解**(T-464):`onFinish` 里 `if (!hasRenderable && !isAborted && conversationId)` → **落一条信封 assistant 消息**「AI 未返回任何内容(可能:①代理返空流 ②模型名无效 ③密钥被限流。建议:换模型/换 key)」。用户刷新即看到,自诊断快;非中断轮才落(中断=用户主动停,本就该空)。**教训**:"静默丢弃空 completed 保持 UI 干净"是错的——**空回复本身就是异常信号**,应该让用户知道。**空数据 ≠ 无异常**:HTTP 200/onFinish 触发都可能配合空内容欺骗上层"成功"逻辑。所有"成功但空"的分支都要有可见落地。

## 抖音数据中心「投稿列表」子 tab 偶发不渲染 —— 不是版式变化,是慢(T-463,2026-07-22)

**坑**:Windows 真机日志报 `fetchDouyinWorkListExport: 切到「投稿作品」tab 后未见「投稿列表」子tab —— 无法进入出 xlsx 的视图`。第一反应"抖音改版了"。写诊断脚本 `tools/diag-douyin-page.mjs`(headed Chromium 复用登录态)扫页面,**用户截图+扫描双证**:子 tab 存在(在 `douyin-creator-pc-radio` 组件里,不是 `douyin-creator-pc-tabs-tab`),charCodes 完全对得上 `SUBTAB_LIST_CODES = [25237, 31295, 21015, 34920]`。**不是版式变化,是时序偶发**——Garfish 微前端在弱网/低配机上首次渲染可能 30s+,代码原 `6s × 3 = 18s` 等待窗口不够。

**误诊警戒**:AI 看到"XX tab 找不到"极容易脑补"抖音改版"直接改代码删逻辑。**必须先真机看页面**——诊断脚本花 5 分钟,能直接给出 charCodes/class/位置的客观事实,避免拆真逻辑。**我第一次改动就是把「投稿列表」子 tab 步骤删掉、直接找「导出数据」按钮**,用户截图打脸才回退。

**正解**(T-463):①等窗口 `6s × 3 = 18s` → `15s × 3 = 45s`;②`markAndClick` 第 3 轮 attempt 改成非 silent,暴露真实点击错误;③错误消息带 `[点击错误] xxx` / `[点击无报错但子 tab 未渲染]` 二选一,下次挂能直接看是**点不上**还是**点上了但页面不动**。**没改** codes / 主流程结构 / 点击器(先加窗口再看,不瞎改)。**教训**:抖音元素错定位报错 = 客观事实(能定位到就是能定位),没定位到 = 结构变了或渲染没就绪或点击没生效——三选一,用诊断脚本给出客观证据再动手,不猜。

## Windows Tauri v2 安装器强制 currentUser 装 %LOCALAPPDATA% + 不给选路径 = 非业界标准(T-466,2026-07-22)

**坑**:`tauri.windows.conf.json` 里 `installMode: "currentUser"`,Tauri v2 NSIS 该模式下 **强制装到 `%LOCALAPPDATA%\Programs\<name>\`,不弹路径选择页也不弹"仅当前用户/所有用户"选择页**。用户报"装抖音这种大型软件都能选路径,你们凭啥不给选"。

**信号识别**:安装向导简化到只有"欢迎/开始装/完成"三页,没 InstallDirPage,没 UAC 提升选项。业界标准(Discord/VSCode/大多数 NSIS 常规安装器)都有:欢迎/协议/组件/**路径**/**用户范围**/开始菜单/桌面快捷方式,多页向导。

**正解**(T-466):改 `installMode: "both"`。Tauri v2 NSIS 双模式下**自动**:①弹"仅当前用户 / 所有用户"选择页(选后者需 UAC 提升,装 `C:\Program Files\`);②弹 InstallDirPage 让用户选路径。**教训**:Tauri v2 提供的选项级功能(installMode)不是"技术选择"是"用户体验选择",技术团队顺手写的 `currentUser` 隐含限制了终端用户的自主权——**默认选保守值(both)不选最简(currentUser)**,除非有明确理由。

## CI 步骤插在产物生成之前 → tauri_build 资源校验必然 panic(T-992,2026-09-15)

**坑**:为守护 T-992 的启动容忍分支,往 `desktop-release.yml` 里加了一步 `cargo test --lib runtime_cleanup_tests::windows_ --no-default-features`,插在 `安装 Windows production closure 的 Chromium` 之后、`构建并接入 Windows production closure(T-675)` 之前。Windows job 直接挂:`build.rs:404` panic `tauri_build 失败: resource path binaries\creatoros-server-x86_64-pc-windows-msvc.exe doesn't exist`,exit 101(run 34942593764)。**不是测试失败,是这一步根本编译不起来**。原因:`binaries/` 被 gitignore,该 exe 在 Windows 上由 `prepare-packaged-runtime.mjs` 写出,而它只在 `build-production-closure.mjs --prepare-package` 里被调用 —— 也就是紧跟其后那一步;另一条会填充该目录的 `build-sidecar.mjs` 挂着 `runner.os != 'Windows'`,Windows 上不跑。

**`--no-default-features` 挡不住**:cargo 编译 lib 前**必先执行 build.rs**,`tauri_build::try_build` 会校验 `tauri.conf.json` 的 `externalBin` / `resources` 声明的路径是否存在。feature flag 管不到 build script。即任何 cargo 命令(test/check/clippy 都算)在 sidecar 产出前跑,都会被这道资源校验拦死。

**信号识别**:CI 报 `resource path ... doesn't exist` 且路径指向 `binaries/` 或 `sidecar.tar.gz` → 看该步在 workflow 里的**位置**,不是看测试内容。开发机复现不出来是因为本地 `binaries/` 里已躺着上次构建的产物(mac 上是 `creatoros-server-aarch64-apple-darwin`),build.rs 不 panic —— **本机绿 ≠ CI 绿,差别就是这个 gitignored 目录**。干净 worktree 能复现:panic 换成 darwin 那个文件名。

**正解**(T-992):撤掉该步。这组测试是纯 `std` 临时目录测试,不需要真实 Windows 也不需要发布流水线,留在本地 / reconcile LED-052 guard 即可。若确实要进 CI,必须排在 closure 构建**之后**。**同时**:撤步后要回头改 LESSON_LEDGER 里「Windows 流水线必须用原生独占文件句柄复现」那句 —— 步骤没了,声明就成了假的;`reconcile.config.json` 那条同名 check 也脆(任何没有 `binaries/` + `sidecar.tar.gz` 的干净检出跑它都会 panic,reconcile 会报 "LED-052 RECURRED" 假红)。

**教训**:**给一个修复加守护时,守护自身的依赖前置条件要跟着排序**。「加个测试步骤总不会错」是错的 —— 在有构建产物依赖的流水线里,步骤位置和测试内容同等重要。另一条:**声明和机制要同步改**。ledger / config 里写「流水线必须 X」,当 X 被撤掉时那句话不会自己失效,它会变成一条误导后人的假证据。
