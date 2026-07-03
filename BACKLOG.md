# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 文档 | 一句话 |
|---|---|---|---|---|
| T-055 | 稿面工作台重做(AI 交互收敛+项目板块重构+素材倾倒场) | 🔨 a b ✅(2026-07-02)c~h 📋 | [draft-workbench-redesign](docs/superpowers/specs/2026-07-02-draft-workbench-redesign.md) + [设计稿](https://claude.ai/code/artifact/c7665b6a-4cbb-4960-ae5e-e42d510f84eb) | 用户三拍板已录(§0):稿面形态认可/制作台保留+素材倾倒场/论点树内容合同连数据删。含宪法 §4 修正案。八切片:a ✅ 稿面骨架(稿面页+选题卡折叠BriefWorkbench+脚本TipTap迁入+发布包锁定/解锁+成熟度点×5+四阶段路由301锚点+shell去双头+创建后直达稿面;验收:真机渲染/301落锚/首存ensure落库v2/刷新读回/全测1153绿;截图 frontend/docs/t055a-draft-workbench/) b ✅ 对话进稿面(AICopilotContent embed 模式挂稿面右栏 surface=project+会话按 project:<id> 隔离;上下文 chip 常驻可摘+摘后「未关联项目」空态不静默 [gate-F2];fn 预调改预填进输入框绝不自动发=机制性消灭重复两遍;定位岛任务流按钮退役只留「在对话里聊定位」;正文 14px/行高 1.7/产物卡 13px;验收:真机 chip 显项目名/摘除回空态/预填不发消息数 0/1155 测试绿,截图 frontend/docs/t055b-chat-rail/) c 产物卡片(写入稿面+撤销) d 本地存储(~/CreatorOS 目录树+Finder 打开+下载=复制) e 素材倾倒场(dropzone 批量+确定性归类+原名保真) f 退役清算(thesis/contract 实体数据删+AdoptCandidateCard 全退) g 知识库弹药化(可写+sourceRef 来源链+@引用) h 二波增强(asset.classify AI 归类+经验注入+发布操作流)。gate ✅ PASS(2026-07-02 MiniMax cross-family,2 minor 已内联 [gate-F1][gate-F2]) |
| T-056 | 用户反馈批快修(不动方向的 7 个体验 bug) | 📋 | 本反馈 | ①✅定位页双 AI 入口合一(随 T-055b:任务流按钮退役,唯一入口「在对话里聊定位」) ②✅聊定位重复两遍+无 @项目 chip(随 T-055b 机制性消灭:fn 自动 sendMessage 改预填输入框;chip 常驻头部) ③✅对话区字体过小(随 T-055b:正文 11px→14px 行高 1.7,产物卡 13px) ④✅创建项目弹窗留白过多(根因固定h-860px为裁宪前5字段设计;已改高度随内容+max-w 640,随 T-055a 提交) ⑤brief(立项)进项目导航/stepper 可达 ⑥素材「更多」按钮改真实语义(删除要明示+确认,不许叫更多) ⑦素材下载在 local-fs 下做真(复制到用户位置/Finder 显示) |
| T-054 | UI 视觉质量提升(全站去丑:样板间→设计规范→推平) | 🔨 样板间首刀已落 | [对比图](frontend/docs/t054-ui/) | 样板间首页三刀落地(bb6fe6a):MetricCard 空 delta 灰杠全站消除、数据概览删重复 KPI 瓷砖、待办空态引导卡;前后对比图落 docs/t054-ui/(baseline + after)。**下一步待用户看图拍板**:①对首页改进方向给反馈(或给目标图/参考产品) ②复盘页样板 ③提炼 token 规范(globals.css 已有 130 变量底子)→ 全站分组推平 ④每页 design-shot 闭环 |
| T-053 | 七步主线贯通(业务流做真·端到端走查验收) | ✅ | [ALIGNMENT](docs/product-audit/ALIGNMENT.md) + [走查截图](frontend/docs/t053-walkthrough/) | 四断点全通:①脚本 ensureScriptArtifact(AI 岛/首存 write-on-intent 建 artifact,假保存修真) ②制作死锁双层拆(StartProductionIsland 全前端首个 outputs.create 入口+有 wiring 即渲染工作台) ③reviews.list 全链新增(复盘记录读真)+校准旧预测残留清零(录入回流可达)+评论 basis 出题在选题会可达 ④研究页读 trend_analysis 重建产物;真机走查 10 截图落档,「开始制作」点击→工作台贯通实证(e657721+47f39e7) |
| T-049 | 审计修复 Wave A:止血(数据破坏+核心路径 bug) | ✅ | [ALIGNMENT §五](docs/product-audit/ALIGNMENT.md) | 9 bug 全修:B1/B2 projectWorkspaceHref 统一(完整 id+brief 落总览)、B3 partial-merge+定位数据恢复、B4 带简介、B7 NULLS LAST、B8 热度直读、B10 onConflict、B12 prepareInput 延迟建 artifact、B17 富录入+项目选择器+清 6 垃圾、B5 相对路径 PUT+catch;1169 测绿,真机验 5 项通过 |
| T-050 | 审计修复 Wave B:数据清算(治「怪」根源) | ✅ | [ALIGNMENT §五/§六](docs/product-audit/ALIGNMENT.md) | 按裁决全删:DB 级联删 62 旧项目(139→77 全真建)+seed 8 块手术(项目图/artifacts/analytics/publications/校准预测/douyin/通知全退役)+搜索索引接真六表+读侧 7 注入路径清算(script artifactId 走 DB,research/production/review/experience/publishing-center 诚实空);1169 测绿+真机零泄漏+重启不复活(16c0f54+1e69386) |
| T-051 | 审计修复 Wave C:假交互清算 | ✅ | [ALIGNMENT §五](docs/product-audit/ALIGNMENT.md) | 全清:三件套接真(90a845e)+死按钮/⌘K/偏好环(1021ff6)+经验研究tab/收藏★(3f7969e)+搜索倒置三断点(a7c0914)+脚本6/发布4死tab砍(2580c60)+录制开关读真+segments.list 全链(6b8a919);复盘tab已真、制作模式 T-050 已修、素材分类 D1 已删、日历环归 T-052 合并处理;全量 1172 测绿 |
| T-052 | 审计修复 Wave D:术语对齐+违宪处置 | ✅ | [ALIGNMENT §三/§四/§六](docs/product-audit/ALIGNMENT.md) | 五裁决全落地:③monetization 物理删除(15 文件删+14 改,-4637 行,contract 18 op/backend 5 表/复盘收益装配全链,真机 404) ④表单按宪法裁(画幅唯一区分,project_target_platforms 停写) ⑤孤儿页接入口(calendar→发布中心/accounts→设置);STAGE_LABELS 单一词表(lib/stage-labels,修 research=复盘中 bug,4 消费点迁移)+相对时间真时钟;三仓 1153+782+97 全绿(b6d1c5c~133c939);确认门分级随 T-012 gate 机制 |
| T-048 | 产品全面审计(逐页/逐钮/逐数据源 + 统一对齐) | ✅ | [ALIGNMENT](docs/product-audit/ALIGNMENT.md) + [pages/](docs/product-audit/pages/) | 14 组代理审 22 页(885 tool calls,curl 真机验证):394 原始发现(147 设计/117 bug/130 对齐)→ 聚类为 7 大主题+30 条 high bug+13 组术语分裂+5 违宪项;根源诊断=数据三代并存+假交互流行+写真读假;修复拆 T-049~052,5 个裁决点待用户拍板 |
| T-047 | CodeGraph 纳入硬流程(检索先行+任务边界重建索引) | ✅ | orchestrator `rules/code-retrieval-rules.md` + CLAUDE.md 执行策略 | 诚实盘点:此前找代码全 grep、索引从不更新(sync 谎报最新+混 9200 非源码文件)。固化:检索 query/callers/impact 先行(grep 只兜字面量)、任务 ✅ 时 `index --force`+新符号验证;已重建(947 纯源码文件) |
| T-046 | 去登录门槛:本机单用户直通(打开即用) | ✅ | — | 无/失效 session 一律以本机主用户(最早创建)直通:identity +findLocalUser/resolveLocalContext、resolveSession+resolveRequestContext fallback(页面单点+dispatch/chat/blob/me 四 route)、/login /register 307 回首页;8 旧 401/redirect 断言改守新语义,全测+tsc 绿;真机验清 cookie 直进首页 |
| T-045 | 激活码授权 + 本机单用户模式(完整方案) | ⏸️ 用户暂缓·gate CONCERNS 已落档 | [activation-single-user](docs/superpowers/specs/2026-07-02-activation-single-user-design.md) + [REVIEW_LEDGER](docs/superpowers/specs/REVIEW_LEDGER.md) | 用户暂缓。reviewer CONCERNS(3 major:middleware 现状描述错/seed 用户交互未定义/activate-setup 时序矛盾,详见 SPEC 顶部裁决注);恢复时先处置再在 T-046 直通层上叠激活码/向导 |
| T-044 | 登录按钮 autofill 死灰修复 | ✅ | — | 密码管理器 autofill 不触发 React onChange→按钮死灰;改 FormData 从 DOM 读凭据+按钮仅提交中置灰+空值内联提示,8 测绿真机验可点 |
| T-043 | BACKLOG 瘦身 + 台账规范/踩坑经验回流 orchestrator | ✅ | `~/.claude/skills/product-to-code-orchestrator/rules/`(项目外·全局 skill) | 看板 58KB→13KB(-78%,31 行零丢失,done 状态列同步);台账规范落 `task-ledger-rules.md`、54 条实战教训落 `field-lessons.md`、SKILL.md Startup 挂引用 |
| T-012 | SPEC 审核 gate | 🔨 | orchestrator `prompts/spec-reviewer.md` + [REVIEW_LEDGER](docs/superpowers/specs/REVIEW_LEDGER.md) | SPEC 过审机制已实战验证(reviewer+REVIEW_LEDGER+SessionStart 注入)。剩:① reviewer 走 MiniMax spec.review 自动化 ② PreToolUse 硬 hook 自动拦未过审实现 |
| T-003 | 三方向读侧接真(底座→各模块) | 📋 数据卡 | [同上 §2](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | 三方向读侧接真、mock 让位。已完成:§1.4 hasImportedProjects 单一判据+首页/复盘读真让位+修 2 真 bug(指标 key views??plays 归一;标题回退实为缺 DATABASE_URL 环境态),集成测绿。剩:①选题评论 basis ②知识库过往脚本导入 ③定位 portfolio 接真(净增 feature,非 fixture 让位) |
| T-004 | ChatBox 进化(上下文感知) | 🔨 | [同上 §3](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | Copilot→useChat+ChatContext 三层注入。slice1+2 done:首波 5 工具+4 surface skill+functionKey 置顶+一键岛深链预调+generative UI,前端 813 测绿。剩:二/三波工具(planning 三件套/script.draft/material.match/publish.platform_adapt)+project surface 深化 |
| T-007 | 任务调度系统 + 调度页面 | 🔨 | [data-source-pipeline-design](docs/superpowers/specs/2026-06-30-data-source-pipeline-design.md) | 调度系统+页面(gate FAIL→重写→PASS)。可自主切片全 done:S0 富录入(d1f236c)/D1 数据模型/D2 评论抓取(e817297)/D3 cron+runner(885eb6e)/D4 needs_reconnect+D5 立即运行(7f21da2)/D6 任务中心(2e6bea0)/D7 消费已通。剩:D7 recipe 发现-重放(未来优化);真机 e2e 已随 T-033/T-036/T-041 落地 |
| T-032 | 抖音账号绑定/扫码入口 + 采集反馈 + 修评论静默 bug | ✅ | [data-source-pipeline](docs/superpowers/specs/2026-06-30-data-source-pipeline-design.md) + [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 设置「账户」Tab 加抖音账号绑定卡+扫码入口+状态探针(9d68409);采集反馈分档做真(✅新增N条/⚠️需重连/❌失败,747ff25);核查评论链路无静默 bug |
| T-033 | 采集真机 bug 修 + Playbook 真跑复现(用户已扫码) | ✅ | [data-source-pipeline](docs/superpowers/specs/2026-06-30-data-source-pipeline-design.md) | 真机 2 报错修:comments 无 awemeId 改遍历 imported 作品(6b02e7d)、self.detail「no collector」=旧 dev server 未重启;headless 导出修「点错 tab」根因(1b38ed8)+评论单 context 复用(bad4248)。遗留 title↔external_id 断裂拆 T-034 |
| T-034 | 明细落库最后一里:修 title↔external_id 断裂 | ✅ | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 修 title↔external_id 断裂:catalog 加 content_output 标题回退+分层匹配(精确→首行→唯一前缀)+回填 72 条 revision;真跑 metric_snapshots +27 真 finish_rate/ctr,复盘从 0 变真 (59bab3d) |
| T-035 | 复盘做真 + 去假图 + ECharts 可视化 | ✅ | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 复盘读侧接真(views??plays+每发布最新快照,f682489)+fixture 假图全删换「规划中」诚实占位;ECharts 漏斗/趋势真图+漏斗去假转化系数(ec5884b/6db1910) |
| T-038 | 抖音采集统一限流/退避子系统(防封 IP/账号) | ✅ | [throttle-and-backoff](docs/superpowers/specs/2026-07-02-douyin-collection-throttle-design.md) | 统一限流/退避子系统:网关核心+风控分类+持久 cooldown(f874fb3)、5 插装点集成+dispatch 串行闸(0da6ce0)、可观测 throttleStatus+任务中心限流 eta 文案(d0be597) |
| T-036 | 明细导出补全(37→全部作品·走 T-038 限流) | ✅ | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 发布时间「全部」preset 破默认近90天限制 + 匹配层修时区/时刻/无题池/externalId 四根因;真机覆盖 30→73(imported 100%) (63a6616) |
| D8b | 单视频维度真数据(观众画像/来源/留存/关键时刻·走 T-038 限流) | 📋 依赖 T-038 | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 复盘四块「规划中」占位做真:xlsx 导出无此数据,需抓创作者后台单视频分析页→落库喂 ECharts;逐作品抓量大最易封号,必须走 T-038 限流慢速后台 |
| T-039 | ChatBox 对话复盘/研究 per-action 上下文注入做真 + 提示词/skill 透明 + @项目引用 + 当前项目指示器修复 | ✅ | [data-foundation-and-director-chatbox](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md)(关联 T-004/T-027) | 复盘 per-action 注入做真:prompt 加文案/数据/评论三块+projectId 全链路+指示器去 fixture(645dfc6)、收窄 review skill 治模型凑数(f0e82d8)、@项目引用+shell 显真标题+修 route 漏转发 reviewSubject(9468cf4);端到端真验 learnings 扣真脚本、0 他作标题 |
| T-040 | 提示词/skill 服务端可配可更新(不写死) | ✅ | [server-configurable-prompts](docs/superpowers/specs/2026-07-02-server-configurable-prompts-design.md) | 提示词/skill 服务端可配可热更:迁移0013 存库 override+装配读表(932e70d)、11 结构化 runner 走 getTemplate(a40a191)、settings.prompts.list/get/put op+put 后热更不重启(df477ed/8bc2704,含撤销 schema 粘住 bug 修);真机端到端验过,覆盖 18 skill |
| T-041 | 全量评论采集(每作品热榜前100)+ 复盘评论区落数据 | ✅ | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 评论采集做真:根因=抖音评论页 URL 迁到 interactive/comment(旧 URL 被重定向→XHR 0 次→succeeded 却 0 条),修常量+重采(959dd9f);+219 条真评论覆盖 73 作品,复盘评论区显真(前100/作品) |
| T-042 | 评论热榜排序做真(采集存点赞数 + 复盘评论区按点赞降序展示前100) | ✅ | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 评论热榜做真:迁移0014 like_count 全链路落点赞+跨作品按点赞降序前100+🔥徽标仅>0 显(f39fa1f/7dd9026);headed 证实本账号评论 digg_count 真为 0(非 bug),有赞时自动排前 |
| T-037 | 全量作品完整化(真跑管线:逐字稿全量 + reconstruct 全量) | 🔨 | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md) | 全量作品完整化。已完成:先验 1 条逮修 ASR baseUrl 双拼 404(eeade81)后全量真跑,32/72 视频作品逐字稿+research/planning 重建完整;41/72 为图集无音频天生无逐字稿(非 bug),慢速批 0 风控。剩:可选图集用 caption 代逐字稿喂 reconstruct;2 条 reconstruct 瞬时失败(529)可重跑 |
| T-030 | 真实作品数据管线 2.0(采集指令化 + 逐字稿内置 + 作品初始化分析 + 已发布100%/自由跳 + 复盘评论 + 明细数据) | 🔨 D1–D8a 全完成·D8b 规划中 | [real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md)(切片见下「🧬 T-030」section) | 管线 2.0 六需求(指令化采集/逐字稿/auto-fill/已发布100%自由跳/复盘评论/明细)。SPEC 过 gate,D1–D8a 切片全 done(见下表),真机 e2e 已随 T-033/T-036/T-037/T-041 落地。决策:对标 deferred→T-031、ASR 云端可配、历史作品直接 auto-fill。剩:D8b 单视频维度(规划中) |
| T-031 | 对标库(存他人作品·浏览+喂选题/定位参考) | 📋 deferred·单独 SPEC | 对标专属 SPEC 待写 | 对标库:采他人主页→存对标作品(标题/指标/逐字稿/封面)→浏览+喂选题/定位。重新引入=方向变更(此前 T-007 不纳入/T-017 删竞品/宪法§7 未含),做前须写 SPEC+过 gate+宪法补注;排 T-030 后 |

## 🎬 生命周期重设计 L0–L7(SPEC PASS-ready 2026-07-01,按序做)

> SPEC:[lifecycle-redesign-creation-first](docs/superpowers/specs/2026-07-01-lifecycle-redesign-creation-first.md)(gate CONCERNS→补清→PASS-ready,`5bb29c7`)。核心:每阶段 AI 干重活+产具体创作物+无真东西不摆空+创作向非学术;本地优先存储。**全做,无优先级,按 L 序(L0 地基先)。** 横切 Copilot/导航 bug 已修(T-014)。

| ID | 任务(切片) | 状态 | 一句话 |
|---|---|---|---|
| T-016 | L1 立项简化 | 🔨 | 去刚立项必为 0 的空区折叠 + 单一主行动(去双按钮歧义)。「进入下一步」无反应已修(T-014) |
| T-020 | L5 录制(素材) | 🔨 M1-M4✅ | 已过审([SPEC](docs/superpowers/specs/2026-07-01-multimodal-model-config-and-recording-design.md))。M1 多模态解析层+M2 asset.generate runner+M3 设置页文生图/视频配置卡+M4 录制页三区 UI 全 done。剩:M5 真链路验收(需用户配 image/video key) |
| T-022 | L7 复盘 | 📋 依赖 T-007 | **依赖 T-007 整套实现**:调度抓抖音→snapshot 时序图表 + 只已发布(`hasImportedProjects`)可复盘门。排 T-007 之后 |

## 🧬 真实作品数据管线 2.0(T-030 切片,D1–D8a 全完成 ✅,剩真机 e2e 卡 DATA-1/2)

> SPEC:[real-works-data-pipeline-v2](docs/superpowers/specs/2026-07-01-real-works-data-pipeline-v2-design.md)。**✅ gate CONCERNS→补清 F1-F4(SPEC 修订版)→可开工**(见 [REVIEW_LEDGER](docs/superpowers/specs/REVIEW_LEDGER.md))。垂直切片、各自可验,非阶段。开工顺序:D5→D3 快赢 → D1→D2→D4→D6→D7→D8a(D8b 单视频分析页规划中)。

| ID | 切片 | 状态 | 一句话 |
|---|---|---|---|
| T-030-D1 | ASR capability(model-config) | ✅ `7d539dc` | transcribe.audio capability 镜像 image/video:resolveTranscribeSpec+openai-asr 适配器(SiliconFlow/OpenAI/Groq)+设置页 TranscribeConfigCard |
| T-030-D2 | 逐字稿管线 | ✅ `69bfde3` | parseDouyinVideoUrl+ffmpeg 取音频+transcribe-runner(F7 失败分类)+只读 hasTranscriptArtifact 探针+dispatch 装配,17 测绿 |
| T-030-D3 | 存量回填 | ✅ `d5815c6` | ensureTranscriptArtifact 幂等+backfill:transcripts 脚本;已真跑:月明水清深 30/30 条逐字稿落 imported 项目 script 阶段 |
| T-030-D4 | 作品 auto-fill 分析 | ✅ `40c464a` | 迁移0010 artifacts.origin+reconstruct-runner(逐字稿+真指标→research/planning artifacts,origin=reconstructed)+brief 加「AI历史反推未确认」标注 |
| T-030-D5 | 已发布 100% + 自由跳阶段 | ✅ `ce0138b` | imported 项目 7 阶段 progressPct=100+免 stage gate 自由跳;存量 72 项目 SQL 回填至 100% |
| T-030-D6 | 复盘评论 | ✅ `43fba59` | 迁移0011 audience_signals.publication_id+读 op publications.comments.list+复盘页 CommentsSection(前100/demand_tag,空态诚实) |
| T-030-D7 | 采集指令化 UX | ✅ `fc17cb4` | cadence 纯编译器+CadenceEditor/TimePicker(cron 从不显示)+NL prompt+意图模板卡/确定性分类,58 测绿 |
| T-030-D8a | 明细数据导出采集 | ✅ `c5f532f` | parseDouyinWorkListXlsx(中文表头模糊匹配)+完播率/CTR→rawMetrics+matchDetailsToPublications+Playwright 导出移植 TzFilm+self.detail collector 装配 |
| T-030-D8b | 单视频分析页(观众/来源/留存) | 📋 规划中 | 观众画像/来源/留存曲线/关键时刻:xlsx 导出没有、需单独抓单视频分析页(工程大);先标规划中,D8a 后单列(OQ-2 待用户) |

## ✅ 已完成

> ✅ 已完成任务全文已归档到 [BACKLOG-archive.md](docs/BACKLOG-archive.md)(减小本看板体积;单一执行真相仍是本文件)。
