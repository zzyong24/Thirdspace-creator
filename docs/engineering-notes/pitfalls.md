# 工程坑册(踩过的坑,按主题沉淀)

> 从实战提炼,新会话/新人排障先查这里。每条:坑 → 正解。持续追加。

## 桌面打包(Tauri + Next sidecar)

- **Tauri resource 丢 symlink** → 打包改用 tar 方案整体封存再解压。
- **同版本 rebuild 陈旧缓存**:同版本号重打包,旧解压产物不更新 → size 指纹变化强制重解压。
- **未签名 app 的 keychain 不持久** → 文件兜底存储。
- **playwright 走 .pnpm 的模块解析**:Next tracing 漏动态 import → 实拷完整包(含 browsers.json)。
- **混淆 turbopack chunk 会崩** → chunks 目录 rename-only;混淆后必跑运行时冒烟。
- **打包版必须隔离验证**:dev 跑通/单测过 ≠ 分发包能跑(ESM/路径/资源差异)。

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

## ECharts 在 flex 容器里高度塌成 ~100px

- **症状**:force-graph 节点全挤画布顶部一条横带、互相重叠、下方大片空白(看似 force 参数问题,其实不是)。
- **根因**:echarts-for-react 的 div `height:100%`,但**祖先链没有一处 definite 像素高度**(全 `h-full`/`flex-1`/`min-h-*`)→ CSS 百分比高需父级 definite,否则坍缩成 auto → echarts init 时量到 ~100px 并定死 canvas → force 在 100px 薄条里跑。
- **正解**:共享 EChart 渲染器里用 `ResizeObserver` 量外层容器真实像素高,把 **definite px** 喂给 echarts-for-react;容器变高时重量 → 自动 resize。别指望 `height:100%` 在 flex 链里生效(T-283;dev preview 逐层量 DOM 才逮到,盲调 force 参数会跑偏)。

## Tauri webview 细节

- webview 吞 target=_blank;tauri-plugin-opener 自带注入脚本(拦 _blank 链接);自己再拦截会双输(stopPropagation 废掉官方脚本)→ 只把缺 target 的跨域链接补成 _blank,让官方脚本接管(T-252)。
