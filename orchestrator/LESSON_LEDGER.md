# LESSON LEDGER（教训账本）

> 自进化 orchestrator 闭环的项目级账本(设计见 `docs/superpowers/specs/2026-06-24-self-evolving-orchestrator-design.md`)。
> **与 DECISION_LOG 的分工**:`LED-*` 记「**踩了什么坑 + 防复发的可执行规则**」;`DEC-*` 记「**主动取舍 + 接受的风险**」。一条 LED 可反向链到引发它的 `DEC-*`。
> **append-only**:不就地改历史行;状态流转只追加新信息或改 `Status`。
> **GuardCheck 是命脉**:能写成可执行命令的 LED,其 check 同步登记进 `process/reconcile.config.json` 的 `lessons[]`,`reconcile.mjs` 每次重跑——坑一复发即 `✗ exit 1` 挡住。

## 字段说明
- **ID / Date / Stage / Severity / Status**(active｜promoted｜deprecated)
- **WhatFailed**:坑本身 ·  **RootCause**:根因
- **GuardRule**:防复发的规则(人读) ·  **GuardCheck**:可执行校验命令,或 `manual`(注明为何不可自动化)
- **Outcome(T+N)**:回看复盘(借得对/借错/手搓后悔…),初期常空,靠回填 ·  **Ref**:反向链 `DEC-*` / commit / 文档

---

## LED-045 — 提交结果未知不等于所有渠道都必须停机，也不等于都能盲重放

- **Date**: 2026-08-20 · **Stage**: BUILD · **Severity**: critical · **Status**: rule
- **WhatFailed**: 官方受管网关已识别 `Idempotency-Key`，但网络提交异常被统一标成不可重试；三次封面
  和四次图片素材因同形瞬时断连直接取消，稍后的同链请求却正常成功。
- **RootCause**: 旧策略只区分“有明确 HTTP 拒绝”和“提交结果未知”，没有把已验签且提供幂等保证的
  官方网关与未知幂等能力的用户中转站分开，保守计费门反杀了官方链可用性。
- **GuardRule**: 提交未知的自动恢复必须同时满足：官方受管身份、同步生图、同一业务意图、同一真实
  幂等号和有界次数。用户自配请求与异步视频不得继承该例外；成功只能落一份候选。
- **GuardCheck**: `pnpm --dir backend exec vitest run src/modules/ai-runtime/cover-runner.test.ts
  src/modules/ai-runtime/asset-generate-runner.test.ts`。
- **Outcome(T+N)**: 红测证明两条受管生图公开链均只调用一次即取消；绿测 38/38，受管链断连后同幂等
  恢复，自配链一次即停，受管视频仍不新建第二条付费任务。真实付费 smoke 未自动执行。
- **Ref**: T-904；DEC-MODEL-057；本机 `sidecar-2026-08-20-1.log.enc`。

---

## LED-044 — 每个时间窗都有画面，不等于竖屏真人仍然存在

- **Date**: 2026-08-19 · **Stage**: BUILD · **Severity**: critical · **Status**: rule
- **WhatFailed**: 竖屏分镜用 card/B-roll takeover 连续覆盖全片，模板把 card 和历史 hidden 都执行为
  `#th autoAlpha:0`；116.6 秒成片结构、编码和码率均合法，8 个均匀抽样帧却没有一帧真人。
- **RootCause**: 质量门只验证“有主视觉”和素材/PiP 不重叠，没有验证用户确认的竖屏主体是否持续可见；
  T-896 又把布局冲突降级为隐藏人物，使可用性恢复但产品目标被静默反杀。
- **GuardRule**: 竖屏存在真实 talking-head 时，人脸必须在全部时间窗可见；talking-head beat 全幅，卡片
  和非 overlay 素材期间使用同一节点固定左下 PiP。历史 hidden 兼容为 PiP；素材舞台避让人物与字幕。
  横屏和 visual-only 不套用此偏好。
- **GuardCheck**: `pnpm --dir ai-worker exec vitest run src/prompt/templates/material-match.test.ts
  src/prompt/templates/video-decisions.test.ts && pnpm --dir frontend exec vitest run
  src/features/production/assemble-video-render-props.test.ts src/features/production/video-regression-audit.test.ts &&
  pnpm --dir backend exec vitest run src/modules/execution/video-render/template.test.ts
  src/modules/execution/video-render/executor.test.ts`。
- **Outcome(T+N)**: 已用全卡片 + hidden B-roll 连续覆盖 fixture 先红后绿；renderer 不再生成任何竖屏
  `#th autoAlpha:0`，横/方/竖素材均使用人物上方安全舞台。真实完整重渲待本地包验收。
- **Ref**: T-902；DEC-VIDEO-056；用户成片 `objkey-2c69a0f3-756.mp4`。

---

## LED-043 — 质量安全门不能把上一版可完成的合法任务变成整单失败

- **Date**: 2026-08-19 · **Stage**: BUILD→SHIP · **Severity**: critical · **Status**: rule
- **WhatFailed**: 为避免竖屏素材与左下人物框边界重合，渲染链新增 fail-closed 几何门；上一版本能成片的
  合法项目升级后，在 HTML、HyperFrames 和 ffmpeg 启动前被整单取消，连续三个真实任务稳定失败。
- **RootCause**: 把审美/布局偏好误当成不可恢复的数据安全错误；只用 16:9 素材验证孤立几何 helper，
  没有从正式分镜组装走到安全门和渲染输入，也没有覆盖方图、竖图或拿旧版成功任务做兼容回归。
- **GuardRule**: 启动、保存、生成、渲染、导出、发布等关键链路中，新增审美、布局或质量门不得把上一版
  可完成的合法输入改成整单失败。能隐藏可选图层、切换安全布局、跳过单个问题素材或回退基础动效时必须
  确定性降级；只有输入损坏、权限/归属错误或不存在任何安全输出路径时才允许 hard-fail。上线前必须用
  旧版成功样例贯穿正式公共调用链，并覆盖该门判断的全部输入族；孤立 helper/几何单测不能作为发布证据。
- **GuardCheck**: `node --test orchestrator/process/critical-path-availability-rule.test.mjs && pnpm --dir
  frontend exec vitest run src/features/production/assemble-video-render-props.test.ts && pnpm --dir backend exec
  vitest run src/modules/execution/video-render/template.test.ts src/modules/execution/video-render/executor.test.ts`
  （规则防删除；横图、方图、竖图从正式分镜组装贯穿安全降级与安全门；执行器验证继续生成 HTML 并进入
  HyperFrames。真实 1080×1920 渲染 smoke 另由 `verify-t896-video-layout-fallback.mts` 覆盖）。
- **Outcome(T+N)**: T-895 已用真实日志确认三个任务都在同一布局门失败，且旧孤立单测为绿；T-896 已让
  安全横图保留 PiP，方图/竖图冲突时确定性隐藏人物并继续出片。组装贯通、执行器和 1080×1920 真实
  HyperFrames smoke 均通过；规则同步写入项目工程约束与全局 `video-editing` Skill。
- **Outcome(T+N, T-901)**: 同日再次命中该形态：结构合格的成片因平均码率低于固定阈值被整单取消。
  已把平均码率降为 manifest/步骤告警，同时保留 codec、尺寸、fps、色彩、时长和可解码结构硬门；
  `executor.test.ts` 把该行为纳入 LED-043 既有 GuardCheck。
- **Ref**: T-895、T-896、T-897、`fdd6d7ab123413a1954085e5a51e25e89671277b`、
  `docs/research/2026-08-19-video-render-layout-guard-regression.md`。

---

## LED-042 — 首屏固定取 100 条，不等于库里总共只有 100 条

- **Date**: 2026-08-18 · **Stage**: BUILD · **Severity**: high · **Status**: rule
- **WhatFailed**: 内容雷达真实账号已有超过 100 条对标内容，但左侧“全部内容”和列表头始终显示 100；
  后续条目也没有入口读取。
- **RootCause**: `intelligence.items.list` transport 已返回精确 `meta.total`，通用 typed client 只返回
  `data` 并丢弃分页 meta；页面再用首屏 `items.length` 作为总数，而首屏 `pageSize` 恰好是 100。
- **GuardRule**: 分页列表的“总数/共 N 条”必须消费服务端同一筛选查询的 `total`；当前页长度只能
  表示“已显示”。有更多数据时必须暴露可继续读取的真实路径，禁止把 `limit`/`pageSize` 伪装成总量。
- **GuardCheck**: `pnpm --dir contract exec vitest run tests/client.test.ts && pnpm --dir backend exec vitest
  run src/modules/intelligence/intelligence.contract.test.ts && pnpm --dir frontend exec vitest run
  src/features/intelligence/intelligence-workbench.test.tsx`（已登记进 `reconcile.config.json`）。
- **Outcome(T+N)**: RED 分别得到 `requestListWithMeta is not a function` 与页面找不到“101 条真实内容”；
  GREEN 为 contract 3/3、真实 persistence/transport 3/3、页面 48/48，且可读取第 101 条。
- **Ref**: T-887、DEC-RADAR-048、PAT-002、PAT-004。

---

## LED-041 — 主线程加载了分层 resolver，不等于 worker_threads 能解析 local-ai

- **Date**: 2026-08-18 · **Stage**: BUILD→SHIP · **Severity**: critical · **Status**: rule
- **WhatFailed**: Windows 1.1.0 包中多条视频均成功取流和抽音，`whisper-local` 却在 140～167 ms 内
  稳定失败；构建时 Xenova 主进程 import 自检仍为绿色。
- **RootCause**: `worker_threads` 有独立模块加载上下文，主 server 注册的
  `creatoros-module-resolver` 不会成为 worker 的消费契约；closure smoke 又只在仓库主进程 import
  `@xenova/transformers`，没有使用随包 Node 启动生产形态 worker。
- **GuardRule**: 分层 runtime 的每个独立 Node 进程或 worker consumer 都必须显式加载同一受校验
  resolver/runtime root；发布 smoke 必须启动真实 consumer，禁止用父线程 import、开发机
  `node_modules` 或 `NODE_OPTIONS` 代替。
- **GuardCheck**: `pnpm --dir ai-worker exec vitest run src/runtime/multimodal-whisper-local.test.ts &&
  pnpm --dir frontend exec vitest run src/server/activation/managed-asr.server.test.ts && node --test
  tools/windows-closure-rat/build-production-closure.test.mjs`（已登记进 `reconcile.config.json`）。
- **Outcome(T+N)**: 红测分别证明生产 worker 无 resolver、错误码丢失、closure smoke 未启动 worker；
  修复后本机真实 worker fixture 从分层 `local-ai` 成功加载 fake transformers，Windows closure 增加
  随包 Node worker 模块加载 Gate。目标 Windows 安装包完整 ASR 待流水线/真机回填。
- **Ref**: T-885、T-886、DEC-RUNTIME-054、PAT-004。

---

## LED-040 — 候选列表里的“剔除”不等于当前分镜已删除，旧渲染会继续复活素材

- **Date**: 2026-08-17 · **Stage**: BUILD · **Severity**: critical · **Status**: rule
- **WhatFailed**: 用户在已确认分镜上剔除一个 B-roll，候选列表即时隐藏，但重新成片仍出现该素材；
  旧 render props、base decisions 和在途 render task 都仍把它当作当前真值。
- **RootCause**: 前端“剔除”只更新组件内 `excludedAuto`，没有写入 production editing-plan revision；
  调整 runner 在 `material.match` 失败时无条件复用旧 `base.broll`，渲染收口也未核对任务是否仍属于当前 plan。
- **GuardRule**: 用户删除/替换素材必须先原子生成新的 editing-plan revision，并同步清除 decisions、render
  props、inventory 与失效导演方向；局部调整只能保留当前 inventory 中的真实 ID。旧 render task 与新 plan
  解绑并尽力取消，晚到成功时若 `sourceRenderTaskId` 不匹配只能留历史，禁止覆盖当前成片。
- **GuardCheck**: `pnpm --dir contract exec vitest run tests/modules/production.test.ts && pnpm --dir backend
  exec vitest run src/modules/production/production.service.test.ts src/modules/production/production.contract.test.ts
  src/modules/ai-runtime/video-decisions-runner.test.ts && pnpm --dir frontend exec vitest run
  src/features/production/production-workbench.test.tsx src/server/__module_integration__/production.persistence-client.test.ts`
  （已登记进 `orchestrator/process/reconcile.config.json`）。
- **Outcome(T+N)**: 四层红测先分别证明 operation 缺失、service 无原子删除、runner 复活旧素材、页面未发写请求；
  修复后 contract 9/9、backend 119/119、frontend 47/47，且 backend/frontend typecheck 通过。待本地包真机
  对原项目执行一次“剔除 → 刷新 → 重新成片”回填视觉证据。
- **Ref**: T-881；用户 2026-08-17 制作页截图。

## LED-039 — 自动补位请求不等于视觉对象真实落下，计划游标会掩盖时间洞

- **Date**: 2026-08-17 · **Stage**: BUILD · **Severity**: critical · **Status**: rule
- **WhatFailed**: 正式任务的分场、信息卡、素材、字幕与两轮总导演模型均成功，但确定性修片仍留下
  时间洞并取消整套分镜。20 秒、两条各 10 秒的正常长字幕可稳定复现：计划补在 5 秒和 15 秒的
  卡片被句首吸附/近邻去重后未新增，局部游标却固定前进，最终实际只有 0 秒和 10 秒两张卡。
- **RootCause**: 修片循环把“调用 ensureCardAt”当成“新增成功”，没有在每次变更后重新合并真实
  card/B-roll intervals；确定性空洞兜底还误复用了 AI 语义插点的 SRT 句首吸附规则。
- **GuardRule**: 每次补位、截短、吸附或去重后必须以实际对象重算 intervals 并继续寻找首个 gap；
  补位函数明确返回是否新增，未新增不得推进游标。AI 候选仍吸附 SRT start，确定性 gap 兜底可落
  长句内部，但只能使用该时刻活动的口播原句。overlay/角标不计主舞台覆盖。
- **GuardCheck**: `pnpm --dir backend exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts`
  （已登记进 `orchestrator/process/reconcile.config.json`；覆盖稀疏长句、素材退出尾洞、短场景、
  overlay 与重复插点）。
- **Outcome(T+N)**: 红测先得到 `[0,10]` 而非 `[0,5,10,15]`；修复后 97/97，通过修后确定性
  `audit` 零 blocking。待新桌面包对原项目重新发起一次分镜，回填真实候选证据。
- **Ref**: T-879；`ai-task-23b30dc3-160`；`orchestrator/T879-BUILD-VALIDATION.md`。

## LED-038 — 持久队列有任务不等于每个任务类型都有持续消费者

- **Date**: 2026-08-17 · **Stage**: BUILD · **Severity**: high · **Status**: candidate
- **WhatFailed**: 内容雷达已经把历史作品逐字稿写成持久 `queued` 任务，但启动恢复最多只领取 20 条；
  真实运行态累计 645 条排队任务，应用正常运行也不会继续领取剩余积压。
- **RootCause**: 把“启动补捞一小批”误当成完整消费者；测试只覆盖单条执行，没有覆盖队列数量超过
  启动上限后的最终清空，也没有固定安全并发边界。
- **GuardRule**: 持久后台队列必须有可证明的持续消费路径；启动恢复应处理到队列为空，同时用固定小
  并发控制资源，不得把“全部恢复”实现成按积压数量同时调用外部服务。失败进入真实终态后继续下一条。
- **GuardCheck**: `pnpm --dir backend exec vitest run src/modules/intelligence/transcript-runner.test.ts`
  （登记进 `reconcile.config.json`；回归固定超过 20 条全部完成且最高并发为 2）。
- **Outcome(T+N)**: 源码回归已覆盖 25 条积压；待安装版启动后复核真实 queued 数持续下降并归零。
  T-893 进一步补齐 `topic_preview`：改写任务每个检查点续租，启动恢复顺序消费全部既有 queued，
  新请求即时执行与恢复消费者通过条件领取避免重复。
- **Ref**: T-632；T-893；DEC-RADAR-047；PAT-003；MOD-006。

## LED-018 — 浏览器回落写在注释里，旧下载前置门让随包能力永远到不了
- **Date**: 2026-08-09 · **Stage**: BUILD→SHIP · **Severity**: high · **Status**: active
- **WhatFailed**: Windows 少文件 production closure 已携带 Chromium，也已有“本机 Chrome → 随包
  Chromium”选择器，但抖音登录入口仍无条件先执行旧 `ensureChromiumInstalled`。该闭包按设计没有
  `node_modules`，所以一旦浏览器环境变量漂移，就在启动窗口前报“Playwright CLI 未找到”，两条
  真正可用的浏览器路径一次都没有尝试。
- **RootCause**: 打包布局、启动环境权威和业务入口的测试各自为政：runtime smoke 只证明 Chromium
  能单独启动，登录单测只注入假 context，没有断言真实入口不再经过 CLI 下载前置门；壳层只检查
  `browsers` 目录存在，没有检查浏览器可执行文件存在。
- **GuardRule**: 正式桌面态必须以壳层注入的 `CREATOROS_BROWSERS_DIR` 覆盖宿主机残留环境；浏览器
  消费入口先尝试系统 Chrome，再回落经文件验证的随包 Chromium，禁止把 Playwright CLI、全局
  Node/npm 或联网下载设为前置条件。最终安装 runtime 必须验证真实浏览器可执行文件，而非空目录。
- **GuardCheck**: `pnpm --dir frontend exec vitest run src/server/ingestion/douyin-cdp.test.ts scripts/desktop/startup-safety-contract.test.mjs && cargo test --manifest-path frontend/src-tauri/Cargo.toml --lib windows_`
- **Outcome(T+N)**: 代码与本机跨平台合同测试已通过；待下一份 Windows 安装包做真实扫码回执。
- **Ref**: T-734；T-284/T-307/T-469/T-675；用户 Windows `v0.2.1-beta.3` 截图 2026-08-09。

## LED-017 — “原文不改”只写进提示词，模型仍把原稿压成摘要后重新生成
- **Date**: 2026-08-08 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: 用户已经提供完整口播稿并多次要求一字不改，编导仍把项目 Brief/归因里的创作
  建议当成更高规则反复拒绝；最终虽调用 `script.draft`，却只传十点 `extraBrief` 摘要，让写稿模型
  重新生成，无法兑现逐字保真。
- **RootCause**: T-708 只在 system prompt 里要求“不要拒绝”，工具协议没有原文引用、保真模式、
  hash 或确定性 runner；模型既负责理解意图又负责重抄正文，提示词服从无法提供字符级保证。
- **GuardRule**: 明确保真必须走受信 `sourceRef` → 服务端精确恢复 → hash 校验 → 无模型候选的
  确定性数据通道；项目创作建议不能覆盖用户本轮明确要求；任何来源恢复失败都不得退回摘要生成。
- **GuardCheck**: `pnpm --dir backend exec vitest run src/modules/ai-runtime/chat-tools.test.ts src/modules/ai-runtime/chat-runner.test.ts src/modules/ai-runtime/script-runner.test.ts && pnpm --dir frontend exec vitest run src/features/copilot/chat-script-draft-card.test.tsx src/app/api/chat/route.test.ts`
- **Outcome(T+N)**: 已在隔离临时库用 MiniMax 完成真实项目对话：“混合聊天说明+完整稿”首次发送不自动建候选，明确授权后生成 771 字原文候选；采纳并刷新后字符数与 SHA-256 `38c473d329dd8335edb17d2d4d62ede9dc24630a6b17902db44c868a0171c23e` 一致，47 字助手说明未进入稿面。
- **Ref**: T-727；DEC-AI-727；用户实录 2026-08-08。

## LED-001 — .env.local 含真实密钥可能被提交进 git
- **Date**: 2026-06-23 · **Stage**: 通用(gen)· **Severity**: high · **Status**: active
- **WhatFailed**: 接入 MiniMax 时在 `frontend/.env.local` 写入真实 `MINIMAX_AUTH_TOKEN`;一旦误 `git add` 就会把密钥提交进库(本次靠人工核对 `.gitignore` 才避免)。
- **RootCause**: 密钥落盘文件与受版本管理的工作区同根,纯靠"记得别提交"这种纪律不可靠。
- **GuardRule**: 任何 `.env.local`(及含真实密钥的 env 文件)**绝不能被 git 跟踪**。
- **GuardCheck**: `! git ls-files | grep -qF .env.local`（已登记进 `reconcile.config.json` lessons[]，每次 reconcile 重跑）
- **Outcome(T+N)**: —（待回填）
- **Ref**: 本会话配置化 LLM 接入;`.gitignore` 含 `.env*.local`

## LED-002 — 设计文档只提交到 feat worktree，用户在 main 看不到
- **Date**: 2026-06-24 · **Stage**: 通用(gen)· **Severity**: medium · **Status**: active
- **WhatFailed**: spec/plan 提交在 `feat/service-contract`(`.worktrees/` 子目录),用户在仓库根 `main` 分支查看,顶层 `docs/` 看不到 → 无法审阅 → 形成"看不到→不能批→不能合→还是看不到"死循环。
- **RootCause**: 干活的 worktree/分支 与 用户查看的 工作区/分支 不一致;审阅产物被"等代码合并"卡住。
- **GuardRule**: 给用户审阅的设计文档必须落到用户查看的分支(通常 `main`),代码可留 feature 分支。
- **GuardCheck**: `manual` — 跨 worktree/分支可见性难用单仓命令稳定校验;靠流程纪律 + 已写入 orchestrator skill `rules/global-rules.md` 的规则约束。
- **Outcome(T+N)**: —（待回填）
- **Ref**: 已加入 `product-to-code-orchestrator/rules/global-rules.md`「Review artifacts must be visible」规则

## LED-003 — 逻辑架构做了，物理架构没人管 → 后端嵌前端、包孤儿、结构腐烂
- **Date**: 2026-06-29 · **Stage**: 通用(gen) / IA→实现之间 · **Severity**: high · **Status**: active
- **WhatFailed**: 脚手架强于逻辑设计(模块/契约/测试),但从不定义物理架构(哪些是可部署房间、谁能 import 谁、谁写库)。结果:24 个后端模块全塞进 `frontend/src/server/modules/`、`backend/` 包近乎空、`ai-worker` 包孤儿、`frontend` 里 import Agent SDK(注释明文禁止却照犯)。门卫量化:308 条边界违规。
- **RootCause**: (1) 流水线「前端优先 + mock 先行」,后端事后补→顺手落进 frontend;(2) 全程无「物理架构/系统拓扑」artifact + gate;(3) 边界只写在注释里、没做成可执行检查→漂移无人拦;(4) 前向循环无结构健康检查点,熵只增不减(并行 subagent 放大)。
- **GuardRule**: 实现前必须先产出 `SYSTEM_ARCHITECTURE.md`(三房间 + 依赖规则 + 谁写库),且依赖规则做成可执行门卫;每次 reconcile/CI 重跑,新违规即 `✗`。后端业务模块绝不准在 frontend;Agent/AI SDK 只准在 worker/ai-runtime;worker 写库经 service port 不直连。
- **GuardCheck**: `node orchestrator/process/boundary-scan.mjs --quiet`(ratchet:新违规 fail;已登记进 `reconcile.config.json` lessons[] LED-003,每次重跑)
- **Outcome(T+N)**: —（待回填:Phase 2 把 308→0 后回看搬迁是否引入回归）
- **Ref**: 设计 `docs/superpowers/specs/2026-06-29-creatoros-refactor-design.md`;房子图纸 `orchestrator/SYSTEM_ARCHITECTURE.md`;待 promote 进 skill(T-013)

## LED-006 — 桌面流水线只验安装文件存在，真实应用可以带着永久白屏出包
- **Date**: 2026-07-27 · **Stage**: BUILD→SHIP · **Severity**: critical · **Status**: active
- **WhatFailed**: Windows 流水线执行了安装器特殊入口并确认 runtime 文件存在，却从未启动用户真正点击的 `CreatorOS.exe`；后续虽补了干净 runner 真启动，仍没有覆盖“用户目录已有旧版 runtime、新安装目录已有当前 runtime”的升级机状态。sidecar 工作目录依赖、verdict 公钥读取、WebView 导航和跨版本 runtime 选择任一失真，都可能在流水线全绿后让用户真机无法启动。
- **RootCause**: 把“安装期物化成功”误当成“应用启动成功”，又把“干净 CI 首启成功”误当成“存量用户升级成功”；迁移代码见到 appData 已存在就直接跳过，没有先判断它是否属于当前安装版本。安装器随后清掉已经物化的归档，启动兜底只能报安装目录缺 `sidecar.tar.gz`。同时以 `about:blank` 注入脚本动态生成 splash，启动失败时脚本若未执行就没有可见错误页；早期 runtime 解析还曾在 logger 初始化前 panic，证据也没有落盘。
- **GuardRule**: Windows 安装包上传后必须真启动已安装 GUI，且至少覆盖干净首装与“旧 appData runtime + 新安装 runtime”升级两种状态；只有当前版本 runtime 完整性校验通过、sidecar 完成启动门且 WebView 完成 `127.0.0.1` 主页面加载才算启动 Gate 通过。替换旧 runtime 前必须验证新副本，切换失败必须恢复旧副本；sidecar cwd 必须显式固定到随包 frontend，任何 runtime 失败必须保留静态可见页并先落日志。
- **GuardCheck**: `pnpm --dir frontend exec vitest run scripts/desktop/startup-safety-contract.test.mjs scripts/desktop/windows-runtime-config.test.mjs scripts/desktop/desktop-release-workflow.test.mjs`（已登记进 `reconcile.config.json` lessons[]）
- **Outcome(T+N)**: 2026-08-13 T-826 再次由 v1.1 用户升级机命中；新 Windows 验收包 run `31766801381` 已在模拟旧 runtime 状态下完成当前 runtime 接管、GUI/主页面真启动和卸载，待用户原故障机器复验后回填最终结果。
- **Ref**: T-562、T-826；用户真机 2026-07-27、2026-08-13；`docs/research/2026-07-24-windows-first-launch-white-screen.md`；`docs/research/2026-08-13-windows-v1.1-upgrade-startup-failure.md`

## LED-007 — 模型连通探针只读正文流，思考流与流内错误都会被误报为空响应
- **Date**: 2026-07-27 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: DeepSeek V4 默认先产 reasoning，8-token 探针没有最终正文时被判失败；AI SDK
  `textStream` 又没有把 provider 的流内 401 交给探针 catch，明确的密钥无效也被二次标成
  `empty-stream`，用户无法区分配置错误与误报。
- **RootCause**: 连通性判据只检查最终正文，没有消费 `fullStream` 的
  `reasoning-delta`/`error` 两类信号；测试预算还沿用非思考模型的极小上限。
- **GuardRule**: 文本模型连通测试必须消费完整事件流：正文或非空思考内容任一出现即证明真实
  连通，`error` part 必须显式抛出并安全归类；正文与思考均为空才允许报空响应。
- **GuardCheck**: `pnpm --dir frontend exec vitest run src/server/settings-model-test-wrap.test.ts`
  （已登记进 `reconcile.config.json` lessons[]）。
- **Outcome(T+N)**: 待包含本修复的新安装包完成 DeepSeek V4 真机配置测试后回填。
- **Ref**: T-563/T-564；本机加密日志 2026-07-27T10:58:16Z~11:00:33Z。

## LED-008 — 把授权成功误当成渠道作用域完整，缺身份被静默回退
- **Date**: 2026-08-05 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: Activity 已签名返回 `allowed=true` 但缺 `channelRef` 时，产品授权正常放行，配置同步
  却只能抛出通用授权不可用；Bootstrap 吞掉非重试错误，设置页继续暗示用户配置本地模型，真实渠道
  阻塞既不可见也不可恢复。
- **RootCause**: 将“产品授权可用”和“下游渠道作用域完整”合成一个布尔判断；跨 Rust、sidecar、
  route、SSR 的错误状态没有稳定枚举、脱敏日志和成功刷新协议。
- **GuardRule**: 任何依赖签名作用域的下游能力都必须显式区分授权放行与作用域完整性；缺 identity
  在出网前失败关闭、零伪造、零静默，并提供重新取得签名事实的真实恢复动作。
- **GuardCheck**: `pnpm --dir frontend exec vitest run src/server/activation/client-config.server.test.ts src/app/api/v1/local/client-config/route.test.ts src/components/shell/channel-config-bootstrap.test.tsx src/features/settings/settings-page.test.tsx`（已登记进 `reconcile.config.json` lessons[]）。
- **Outcome(T+N)**: 待真实 Activity 补齐 `channelRef` 后完成 live HTTPS 与 OmniHi 子 Key验收。
- **Ref**: T-701；DEC-MODEL-035；T-679 SPEC §10.4。

## LED-009 — 用代码关键词相似度冒充通用智能体的素材语义匹配
- **Date**: 2026-08-06 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: 视频制作已经存在 `material.match` Skill，却又在 runner 里增加文件名清洗、token
  coverage 和 Jaccard 排名来替 AI 选择 B-roll。该实现只能碰巧适配当前几个文件名，换行业、换表达
  或素材描述为空就失效，也造成“智能体建议上传素材，后续却不用”的职责断裂。
- **RootCause**: 把确定性代码的可测试性误当成语义判断的可靠性；没有在项目规则中明确区分
  “模型负责理解和选择”与“代码负责真实性及安全边界”。
- **GuardRule**: 意图理解、内容归类、素材/场景匹配和创作取舍必须走可配置 Skill/模型；代码只
  校验权限、真实 ID、类型、范围、时间、幂等与安全。禁止写死词表、关键词计分、字符串相似度或
  业务名称分支替代 AI。确定性相似度仅可用于去重/协议纠错/安全校验，并须写
  `SEMANTIC_BOUNDARY_ALLOW:` 说明与测试。
- **GuardCheck**: `node orchestrator/process/semantic-boundary-scan.mjs && pnpm --dir backend exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts`（已登记进 `reconcile.config.json` lessons[]）。
- **Outcome(T+N)**: 待新包实测跨行业素材匹配后回填。
- **Ref**: T-712；DEC-AI-039；`material.match` v4。

## LED-010 — 本地打包每次临时补同一组环境变量
- **Date**: 2026-08-06 · **Stage**: BUILD→SHIP · **Severity**: high · **Status**: active
- **WhatFailed**: 本机 CreatorOS 验收包长期直接调用底层 `package.mjs`，不同会话反复漏掉
  projectKey、verdict 双密钥或 Growth 公共验签配置；失败发生在已经开始打包之后，用户每次都在为
  同一环境漂移付费。
- **RootCause**: 只有底层通用流水线，没有把“本机安全密钥位置 + CreatorOS 固定公共配置”收敛成
  项目级入口；知识只留在对话和操作者记忆里。
- **GuardRule**: CreatorOS 本机验收包必须走 `desktop:package-local`；入口只从项目外
  `~/.creatoros/` 读取私密 verdict 密钥，自动补齐固定公共配置，缺失时在重型构建前失败。禁止会话
  手工重复拼接这组环境变量，私钥不得入库或输出。
- **GuardCheck**: `pnpm --dir frontend exec vitest run scripts/desktop/package-local.test.mjs`
  （已登记进 `reconcile.config.json` lessons[]）。
- **Outcome(T+N)**: 待后续任一新会话直接运行唯一入口复验。
- **Ref**: T-713；`frontend/scripts/desktop/package-local.mjs`；`docs/RELEASING.md`。

## LED-011 — AI 选中了素材，但渲染协议把所有素材缩成同一张小卡
- **Date**: 2026-08-06 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: 项目已有四段 3456×1992 真实系统录屏，`material.match` 也能把素材写入 B-roll，
  但决策产物没有“主画面/大舞台/辅助卡”语义，组装器从未设置旧 `big` 字段，渲染模板把全部
  B-roll 固定成 460px 宽；竖屏人物又被塞进 300×300 正方形 `contain`，最终成片是大片黑底、
  左下微缩人物和不可读录屏。
- **RootCause**: 只验了 assetId 是否穿过时间线，没有验证最终像素占屏、容器比例和真实可读性；
  个人竖屏视频 Skill 的“录屏必须大且足够久”没有进入运行时 Skill 与渲染 contract。
- **GuardRule**: 创作素材的语义呈现层级和时长由运行时 Skill 返回；渲染 contract 必须携带该
  决策并施加物理可读性下限。界面截图/录屏保持 `contain`，竖屏 `full_frame` 宽度至少 90%、
  `large_stage` 至少 83%；无主视觉时恢复大幅人物，竖屏 PiP 必须使用 9:16 容器。验收不能只数
  B-roll 条数，必须断言最终 HTML 的真实像素尺寸。
- **GuardCheck**: `pnpm --dir ai-worker exec vitest run src/prompt/templates/material-match.test.ts && pnpm --dir frontend exec vitest run src/features/production/assemble-video-render-props.test.ts && pnpm --dir backend exec vitest run src/modules/execution/video-render/template.test.ts`（已登记进 `reconcile.config.json` lessons[]）。
- **Outcome(T+N)**: 待新包用本次两条 109 秒实拍与四段系统录屏重跑，回填实际成片抽帧。
- **Ref**: T-712；T-687/T-703 SPEC；本机 `objkey-b64a7c64-1014.mp4` / `objkey-a8b87722-758.mp4`。
- **2026-08-06 补充证据**: `objkey-fcbd25b0-1110.mp4` 中 1440px 居中大卡压住
  右侧 500px 人物层，只露出半张脸；外框很大但内部录屏仍不可读。规则补强为：
  `full_frame` 必须真占整画布，`large_stage` 必须与人物零重叠；渲染前跑几何门，配置
  `asset.classify/vision.default` 时对最终成片 4×2 接触表做一次非阻断视觉审核并把问题清单展示给用户。

## LED-012 — 主画面大卡压住人物，系统却没有成片级视觉审核
- **Date**: 2026-08-06 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: `objkey-fcbd25b0-1110.mp4` 把系统录屏放进 1440px 居中卡片，卡片压住右侧
  人物，只露出半张脸；录屏内部内容仍然偏小，长时间没有镜头运动，但渲染完成仍被当作可交付成片。
- **RootCause**: `full_frame` 只是“更大的 overlay”而不是真切走，`large_stage` 没有人物安全区；
  验收只看文件生成成功，没有对最终画面抽帧检查遮脸、可读面积和静态感。
- **GuardRule**: `full_frame` 必须占满整张画布并盖住旧人物层；`large_stage` 必须使用与人物零
  重叠的安全分屏。渲染前用确定性几何门拒绝遮挡；配置视觉模型时，对最终视频 4×2 接触表做
  一次非阻断视觉审核，审核结论和问题清单必须在任务卡可见，模型不可用不能破坏已生成成片。
- **GuardCheck**: `pnpm --dir frontend exec vitest run src/features/copilot/execution-task-card.test.tsx && pnpm --dir backend exec vitest run src/modules/execution/video-render/template.test.ts src/modules/execution/video-render/executor.test.ts`
  （已登记进 `reconcile.config.json` lessons[]）。
- **Outcome(T+N)**: 待本地新包用同一口播和录屏重新渲染后，以抽帧复验人物完整、界面可读和镜头运动。
- **Ref**: T-712；`objkey-fcbd25b0-1110.mp4`；`video-render/template.ts`；`video-render/executor.ts`。

## LED-013 — 人工选材沿用旧时间线，编辑标签被烧进成片
- **Date**: 2026-08-06 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: 首次 AI 分镜没有充分使用用户上传素材；用户随后手动指定素材时，系统把选择直接
  塞进旧时间线并统一截成固定 4 秒。横屏成片还把竖图套进横卡，并持续显示 `SCENE n`、场景名和
  整段口播摘要，最终作品像内部审片 PPT。
- **RootCause**: 把人工选材误当成局部 UI 编辑，没有把它视为会改变叙事节奏的编导硬约束；同时
  混淆了编辑器元数据与观众可见画面，渲染协议缺少源尺寸。
- **GuardRule**: 首次素材选择由 `material.match` 综合原文件名、类型、尺寸、时长、描述、口播和
  场景语义完成；人工指定/替换/剔除必须重新调用分镜并重算边界、插点、展示时长。媒体始终保持源
  比例；`SCENE/分镜序号/title/summary` 只在编辑器显示，成片只允许 AI 有意选择的短数据、金句、
  清单、对比、代码或必要图示。
- **GuardCheck**: `pnpm --dir frontend exec vitest run src/features/production/video-decision-preview.test.tsx src/features/production/assemble-video-render-props.test.ts && pnpm --dir backend exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts src/modules/execution/video-render/template.test.ts`。
- **Outcome(T+N)**: 待本地新包用横屏口播 + 竖图 + 人工指定录屏真机复验。
- **Ref**: T-712；`material.match` v5；`video-decision-preview.tsx`；`video-render/template.ts`。

## LED-014 — 局部改稿把技术锚点交给模型补，模型反过来要求用户提供内部 ID
- **Date**: 2026-08-06 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: 用户从稿面点击“AI 改写本段”并已给出修改要求，Copilot 却声称缺少
  `artifactId/versionId/sectionId/originalText`，要求用户重新选段、手工编辑或复制粘贴；功能按钮
  实际没有完成它承诺的一次点击局部改稿。
- **RootCause**: 把并发校验需要的可信稿面锚点设计成模型可填写参数；没有在按钮点击时把当前
  artifact、版本、段落和原文绑定到服务端工具依赖，也没有覆盖未保存稿面先落新版本的真实链路。
  后续补了服务端重绑门，却仍把 `script_section` 做成跨轮粘滞状态；终态冲突没有清理锚点，
  结果安全拒绝从“只挡错误覆盖”扩大成“阻断此后全部普通对话”。同时 AI 整稿长期写入无 ID
  `sections`：稿面临时合成 `script-saved-N` 后能显示多段，执行侧却要求 `id &&正文` 并把同一
  当前版本过滤成 0 段；即使点击正确第 2 段也会在调用模型前失败，采纳侧又会二次找不到段落。
- **GuardRule**: 局部修改的对象标识、版本、选区和原文必须由用户点击时的可信 UI 状态绑定，
  绝不向模型或用户索取。模型只产目标段的新正文；点击前若稿面有未保存修改，系统先自动保存。
  更一般地，任何工具中的客户端 ID、版本、正文和状态都只是意图线索，执行前必须经 backend
  service port 重读当下服务端真值；能唯一重绑则覆盖旧快照，不能则明确冲突，禁止继续执行。
  无法重绑是该次局部命令的终态：必须同时清理 pending/sticky/in-flight/functionKey，恢复普通
  对话，且不提供必然重复冲突的“重试上一轮”；重新局部改稿只能由用户再点当前稿面段落。
  所有脚本版本写入时必须在 artifact service 单写边界补齐稳定段落 ID；存量无 ID 版本由稿面、
  执行重绑与补丁应用复用同一确定性兼容 ID，并在新补丁版本中自愈，禁止修改不可变历史版本。
  采纳只替换目标段并追加完整新版本，其他段落逐字不变，版本冲突必须拒绝覆盖。
- **GuardCheck**: `pnpm --dir frontend exec vitest run src/app/api/chat/route.test.ts src/server/__module_integration__/artifacts.persistence-client.test.ts src/features/script/script-editor-data.test.ts src/features/script/script-structure-view.test.tsx src/features/copilot/chat-script-patch-card.test.tsx src/features/copilot/ai-copilot-interactions.test.tsx src/features/copilot/chat-api-error.test.ts && pnpm --dir backend exec vitest run src/modules/artifacts/artifacts.service.test.ts src/modules/ai-runtime/script-runner.test.ts src/modules/ai-runtime/chat-tools.test.ts src/modules/ai-runtime/chat-runner.test.ts`。
- **Outcome(T+N)**: 待本地测试包用真实稿面按钮完成一次“自动保存 → 局部改写 → 采纳 → 版本回退”后回填。
- **Ref**: T-716、T-732；`script-structure-view.tsx`；`ai-copilot-content.tsx`；`chat-tools.ts`；用户 2026-08-06 与 2026-08-09 真实失败对话。

## LED-015 — 安装备份留在 Applications，Launchpad 显示多个真假难辨的 CreatorOS
- **Date**: 2026-08-06 · **Stage**: BUILD→SHIP · **Severity**: high · **Status**: active
- **WhatFailed**: 真机替换安装时把旧 App 重命名为 `CreatorOS.app.pre-*` / `before-*` 后继续留在
  `/Applications`；Launchpad 将每个目录都识别成独立应用，用户无法判断哪个才是本轮验收包。
- **RootCause**: 把操作者内部的回滚备份暴露到了系统应用目录，同时直接把 Tauri 的架构后缀文件
  当成交付物，没有统一稳定的用户侧文件名。
- **GuardRule**: `/Applications` 只保留一个 `CreatorOS.app`；备份只能进入临时目录或废纸篓。
  `desktop:package-local` 构建成功后必须复制为 `~/Downloads/CreatorOS-<version>.dmg`（Windows 为
  `.exe`），用户只验收该固定名称，架构、任务号、时间戳不得进入用户侧交付名。
- **GuardCheck**: `pnpm --dir frontend exec vitest run scripts/desktop/package-local.test.mjs`。
- **Outcome(T+N)**: 已将 4 个历史备份 App 移入废纸篓，Launchpad 只保留一个 CreatorOS；后续包待
  下一轮真实构建复验固定交付名。
- **Ref**: T-713；`frontend/scripts/desktop/package-local.mjs`；用户 2026-08-06 Launchpad 截图。

## LED-016 — 有信息卡不等于有信息密度，角落小标签仍会留下大段空镜
- **Date**: 2026-08-07 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: 109 秒横屏成片虽然存在信息卡，但在人物靠右的段落里，左侧只出现一条很小的
  「下周的作品就有着落了」标签，其余大面积仍是黑底；验收只统计卡片是否存在，没有审查连续
  空档、卡片实际像素宽度和一段口播内的信息节拍数量。
- **RootCause**: `video.cards` 把长场景压成一张卡；确定性总导演只检查“有无卡片”，渲染器的
  设计宽度没有真正写进 HTML，短 quote 因内容自适应缩成角落标签。
- **GuardRule**: 无真实素材的场景必须按时长形成连续信息节拍：8–14 秒至少 2 个、14–24 秒
  至少 3 个、超过 24 秒最多 4 个；任意连续视觉空档不得超过 7 秒。模型负责从当前口播决定
  stat/list/compare/quote 等语义形式，代码只守时长、覆盖和原文可溯。信息卡必须占用固定信息
  主舞台并使用可读大字，不能依内容宽度收缩成标签；与下一段真实主画面不足 1.2 秒的闪卡直接
  跳过。
- **GuardCheck**: `pnpm --dir ai-worker exec vitest run src/prompt/templates/video-decisions.test.ts && pnpm --dir backend exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts src/modules/execution/video-render/template.test.ts`。
- **Outcome(T+N)**: 10/18/28 秒三组无素材分镜分别验证至少 2/3/4 个信息节拍；横竖屏渲染
  快照与类型检查通过。待新包用同一 109 秒实拍再次真机渲染并抽帧复验。
- **Ref**: T-712；`objkey-5d35239f-1740.mp4`；`video-decisions-runner.ts`；`video-render/template.ts`。

## LED-019 — 在线 ASR 的额度或授权错误不应让已有本地能力失效
- **Date**: 2026-08-11 · **Stage**: BUILD · **Severity**: high · **Status**: candidate
- **WhatFailed**: CreatorOS 已有本地 Whisper，但受管 ASR 对未绑定、额度不足、坏响应等部分错误仍
  直接阻断，用户实际拥有的本地转写能力没有成为统一安全网。
- **RootCause**: 回退条件按在线错误枚举逐项放行，并且只包裹 `per_request` 渠道调用；解析、用户自配
  云端 ASR 和部分 lease 错误各有不同终态。
- **GuardRule**: 所有非本地 ASR 的解析、授权和调用错误都必须丢弃在线凭据，对同一音频只尝试一次
  `whisper-local`；本地失败不递归、不伪造成功。正式包必须验证本地运行时与安装版短音频推理。
- **GuardCheck**: `pnpm --dir frontend exec vitest run src/server/activation/managed-asr.server.test.ts src/server/activation/managed-credential-lease.server.test.ts && pnpm --dir backend exec vitest run src/modules/ai-runtime/multimodal/resolve.test.ts src/modules/ai-runtime/transcribe-runner.test.ts && pnpm --dir ai-worker exec vitest run src/runtime/multimodal-whisper-local.test.ts`。
- **Outcome(T+N)**: 待 T-768 双平台安装候选各完成一条本地短音频转写后回填。
- **Ref**: DEC-ASR-014；T-768；PAT-001 T1。

## LED-020 — 用系统工具探测代替应用能力调用，导致可用的生图链被对话自己拦截
- **Date**: 2026-08-11 · **Stage**: BUILD · **Severity**: high · **Status**: candidate
- **WhatFailed**: 用户明确要求参考历史作品生成封面，真实日志只调用了 `context.publications` 与
  `local.tools`，随后文本回复“探测不到生图模型”并结束；真正的 `cover.generate` 一次都未调用。
  同时“生成封面”入口仍绑定通用 `material.generate`，发布清单还把 draft 混进参考候选。
- **RootCause**: 将“需要判断能力能不能落地时先探系统工具”的通用说明扩大到了 CreatorOS 内部
  模型能力；组合工具没有确定性只读→执行顺序，按钮 functionKey 与专用封面工具长期漂移。
- **GuardRule**: `local.tools` 仅用于 ffmpeg/node/python/git 等系统可执行文件，禁止探测模型配置、
  provider 或 CreatorOS 服务能力。明确参考历史作品生成封面时，必须先读取真实已发布且有封面的
  候选，由模型判断“最新且最关联”，再把真实 `coverAssetId` 传入 `cover.generate`；入口必须绑定
  专用封面工具，缺参考或生成失败不得静默降级。
- **GuardCheck**: `pnpm --dir backend exec vitest run src/modules/ai-runtime/chat-runner.test.ts src/modules/ai-runtime/chat-tools.test.ts src/modules/ai-runtime/cover-runner.test.ts src/modules/ai-runtime/multimodal/resolve.test.ts && pnpm --dir frontend exec vitest run src/features/copilot/ai-copilot-content.test.tsx src/features/copilot/chat-generate-card.test.tsx src/app/api/chat/route.test.ts`。
- **Outcome(T+N)**: 代码聚焦回归已通过；待用户在本地包对同一项目发起真实封面生成后回填。
- **Ref**: DEC-AI-043；T-779；本机日志 2026-08-12T02:37:46Z。

## LED-021 — Node 声称支持 reflink 不等于 macOS 真正使用了 APFS clonefile
- **Date**: 2026-08-11 · **Stage**: BUILD · **Severity**: high · **Status**: candidate
- **WhatFailed**: 首版使用 `COPYFILE_FICLONE_FORCE`，单测只验证副本独立和兼容回退；真实 `256 MiB`
  磁盘探针却显示新增约 `256 MiB`，重复占盘并未解决。
- **RootCause**: 把跨平台 API 名称当作物理占用证据，没有在目标 APFS 卷比较复制前后的可用块。
- **GuardRule**: 所有宣称“稀疏、去重、压缩、reflink/clone、零拷贝”的存储优化，必须在目标文件系统
  用大于元数据噪声的真实文件核对物理增量；macOS clone 使用系统 `cp -c`，保持 execFile 参数隔离，
  不支持时普通复制。禁止 hardlink/symlink 冒充独立副本。
- **GuardCheck**: `pnpm --dir backend exec vitest run src/lib/copy-file-copy-on-write.test.ts src/modules/assets/localfs-object-storage.integration.test.ts src/modules/assets/assets.service.test.ts src/modules/execution/sandbox.test.ts src/modules/execution/run-execution-task.test.ts src/modules/execution/video-render/executor.test.ts`，并在 APFS 对 `256 MiB` 临时文件运行 T-782 物理块探针，副本增量应接近元数据量而非文件逻辑大小。
- **Outcome(T+N)**: 当前 APFS 实测副本逻辑大小 `256 MiB`，新增物理空间 `4 KiB`；待 Windows 安装包真实任务确认普通复制回退后回填。
- **Ref**: DEC-STO-001；T-780；T-782。

## LED-022 — 单平台命令混入跨平台桌面能力，旧审计提醒没有形成门卫
- **Date**: 2026-08-12 · **Stage**: BUILD→SHIP · **Severity**: high · **Status**: rule
- **WhatFailed**: Windows 用户在素材中心打开两个真实存在的文件时，桌面应用连续 7 次执行 macOS
  `open -R`，全部报 `spawn open ENOENT`。2026-07-15 上线前审计已指出非 macOS 页面仍显示 Finder
  操作，但该发现只停留在报告中，没有变成归属任务、失败测试和发布守卫，最终同一形态进入正式包。
- **RootCause**: 素材打开链路在调用点内联单平台命令；契约没有同时约束系统 API/命令、参数与路径、
  进程完成时机和用户文案，也没有要求 Windows 最终安装物上的真实操作证据。审计发现与工程门禁断链。
- **GuardRule**: 所有桌面本机能力必须先形成支持平台矩阵，逐平台明确 command/native API、独立 argv
  与路径编码、spawn/exit/callback 完成语义、用户文案和不支持行为；纯 planner 测全平台，SHIP 在每个
  目标 OS 的最终安装物上验证真实动作。审计 Blocker/High 必须同时进入 BACKLOG，并以红测或守卫闭环。
- **GuardCheck**: `pnpm --dir frontend exec vitest run src/app/api/v1/local/reveal/plan.test.ts src/app/api/v1/local/reveal/route.contract.test.ts src/app/api/v1/local/reveal-logs/launcher.test.ts src/features/assets/assets-interactions.test.tsx`（已登记进 `reconcile.config.json` lessons[]）。
- **Outcome(T+N)**: T-788 已将素材与项目目录的打开行为收敛为 win32/darwin/linux 纯 plan，route
  统一消费现有 launcher；平台计划、路径含空格/中文、spawn/exit、route 接线和平台中性文案回归通过。
  Windows 最终安装物的 Explorer 真机回执仍属于后续出包验收，不能由 macOS 单测替代。
- **Ref**: T-786；T-787；T-788；`docs/research/2026-08-12-windows-assets-reveal-open-command-diagnosis.md`；
  `docs/research/2026-07-15-prelaunch-full-engineering-data-audit-research.md` FE-L01。

## LED-023 — 外部模型与搜索引擎被统一等待策略误杀
- **Date**: 2026-08-12 · **Stage**: BUILD · **Severity**: high · **Status**: rule
- **WhatFailed**: 用户自配文本模型的分场和信息卡在约 90 秒被统一超时杀掉，而同端点
  曾在 83.86 秒真实成功；兼容端点明确不支持 `response_format/json_schema` 时直接失败。
  搜索页则因广告/统计长连接等不到 `networkidle`，并且已确认的百度登录墙在后续请求里重复浪费时间。
- **RootCause**: 把“防永久挂起”简化成所有结构节点同一 90 秒，没有区分已知协议不兼容与
  鉴权/网络等致命错误；浏览器把“整页网络完全静默”误当成“搜索结果可读”，双引擎回退又无运行期失败记忆。
- **GuardRule**: 结构化模型调用必须保留有界默认超时；纯文本 Agent 节点也必须允许调用方按真实耗时
  设置有限上界，并在到期时同时中止 provider 请求、让持久任务进入可重试终态。只有经真实耗时证据
  确认的长节点才可在调用处显式放宽，且统一限幅。只对明确的结构化响应协议不支持改走“文本 JSON + 同 schema 验收”，
  鉴权、网络、限流和超时不降级。SERP 导航用可读的 DOM 就绪条件；已确认登录墙只做有上界冷却，
  到期真实重试，普通网络错误不误封。任何回退都不得用模型记忆冒充联网证据。
- **GuardCheck**: `pnpm --dir ai-worker exec vitest run src/nodes/structured-node.test.ts src/runtime/agent-runtime.test.ts && pnpm --dir backend exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts && pnpm --dir frontend exec vitest run src/server/ai/search/search-browser.test.ts src/server/ai/search/browser-search-fallback.test.ts`
  （已登记进 `reconcile.config.json` lessons[]）。
- **Outcome(T+N)**: 分场/信息卡显式放宽至 120 秒，shared runner 仍限制在 15–180 秒；
  协议不兼容使用同 schema 的受控 JSON 修复；Bing 不再被长连接拖到 `networkidle`，百度登录墙默认冷却 5 分钟后重试。
  T-893 为纯文本改写节点增加 provider 中止与 Promise 硬终止，补上结构化节点之外的永久挂起缺口。
- **Ref**: DEC-AI-044；T-784；T-789；T-893。

## LED-024 — 动画枚举不等于内容可视化，单字符串会把不同关系压成同一张卡
- **Date**: 2026-08-12 · **Stage**: BUILD · **Severity**: high · **Status**: rule
- **WhatFailed**: 信息卡已有 counter/bar/reveal/strike 等动画，但模型只返回一段 `content`，组装器
  按标点拆分，渲染器主要让整卡淡入、上移或补通用色条；不同主题看起来仍是“字冒出来”。
- **RootCause**: 把“选择动画标签”误当成“把认知关系画出来”，AI 的语义结构在进入渲染前丢失，
  确定性代码只能用同一容器表达数字、步骤、因果和推翻。
- **GuardRule**: `video.cards` 必须可选声明内容关系与原文部件；关系选择归 AI，代码只做溯源、role、
  数量、长度和安全区校验，再落独立 DOM/GSAP 配方。没有合法计划就兼容降级，禁止关键词猜语义。
  信息型视频底层可用静态低对比虚线网格建立空间秩序，但不能用高亮或持续运动与内容竞争。
- **GuardCheck**: `pnpm --dir ai-worker exec vitest run src/prompt/templates/video-decisions.test.ts && pnpm --dir backend exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts src/modules/execution/video-render/template.test.ts && pnpm --dir frontend exec vitest run src/features/production/assemble-video-render-props.test.ts && node orchestrator/process/verify-t794-motion-card-preview.mjs`。
- **Outcome(T+N)**: 五种核心关系横竖版真实 Chromium PASS；三题自评平均 `68.67→96.33`。待用户
  下一条真实稿件端到端出片后，复核模型 visualPlan 产出率和实际观看节奏。
- **Ref**: DEC-AI-045；T-794；`content-driven-motion-rubric.md`。

## LED-025 — 高信息主图被当辅助叠画，旧信息卡跨口播段继续占屏
- **Date**: 2026-08-13 · **Stage**: BUILD · **Severity**: high · **Status**: rule
- **WhatFailed**: DeepSeek Harness 成片已有四层架构图，但素材被选成 `overlay`，渲染后只在左上露出
  一小块；同场的巨型黑色信息卡持续盖住主图。口播和字幕已经进入“可观测层”约 6 秒，画面仍显示
  上一段“模式层”，直到后续插点才切换。
- **RootCause**: `material.match` 只区分 still image/live footage，没有明确“需要阅读素材本身”的
  高信息静态图必须成为主视觉；渲染器又把 `overlay` 当成可与信息卡共存，两个图层使用同一舞台。
  信息卡仅保存模型手填秒数，没有绑定它服务的真实 SRT 行，录制节奏偏离稿件计划后就会跨段滞留。
- **GuardRule**: 架构图、流程图、数据表、界面/代码截图等需要阅读文字或结构的静态图，只要承担
  当前口播解释或证据，素材 Skill 必须选择 `large_stage`；`overlay` 只用于无需阅读细节的辅助画面。
  主图持续期间，信息卡只能降为主图边界外的短标注，禁止生成遮图大卡；任何真实素材进场都结束
  此前大卡。新信息卡必须由 AI 返回所服务的 `srtLineIndex`，代码以该行真实起秒落轴，旧任务才兼容
  `at` 吸附。语义选择仍归 AI，代码只执行显式层级、行号与几何安全边界。
- **GuardCheck**: `pnpm --dir ai-worker exec vitest run src/prompt/templates/material-match.test.ts src/prompt/templates/video-decisions.test.ts && pnpm --dir backend exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts src/modules/execution/video-render/template.test.ts && node orchestrator/process/verify-t823-main-visual-preview.mjs <talking-head-video> <architecture-image>`。
- **Outcome(T+N)**: 真实 Harness 架构图 + 本人口播源的横屏 Chromium 双关键帧通过：主图、人物、字幕
  零重叠，大卡数量为 0；第 2 秒显示“模式层”，第 8 秒按下一条 SRT 切成“可观测层”。待用户确认
  预览后再用当前项目重跑正式成片，不能拿小样冒充最终导出。
- **Ref**: T-823；`objkey-016270fc-6527.mp4`；用户 2026-08-13 成片截图；
  `video-decisions-runner.ts`；`video-render/template.ts`。

## LED-026 — 把外部生成仓整包接入，会形成第二套分镜、审批、素材和成片真相
- **Date**: 2026-08-14 · **Stage**: DISCOVER/DEFINE · **Severity**: high · **Status**: rule
- **WhatFailed**: 外部 H3 B-roll 仓库同时提供计划 JSON、文件审批、Python 调用与 FFmpeg 成片；若按
  “功能齐全”直接安装，CreatorOS 将出现一套数据库任务/候选/素材/渲染链和一套可手改文件链。
- **RootCause**: 把“可借鉴的创作方法”与“可作为产品运行时收养的系统边界”混为一谈，没有先做
  borrow-before-build 和现有能力盘点。
- **GuardRule**: 接入外部 AI 媒体项目时先拆成方法、协议、运行时三层。方法可进 Skill/rubric；协议
  只进既有 provider adapter；任务、费用确认、候选、采纳、素材和渲染必须复用单一数据库真相。
  只有现有边界确实不存在且独立 SPEC 通过，才允许新增模块。外部许可与模型权重许可分开审查。
- **GuardCheck**: T-836 必须通过旧 MiniMax v1 回归、H3 v2 adapter、source-slot 冻结、checkpoint、
  pending→adopt→material link→restoryboard、boundary/orphan/reconcile 测试；仓内不得新增
  `broll-plan.json`、平行 FFmpeg 生成链或运行时 Python H3 CLI。
- **Outcome(T+N)**: 待 T-836 实现和真实付费 smoke 后回填；当前调研已决定采用 PAT-001 T1 薄适配。
- **Ref**: T-834；T-836；DEC-AI-049；PAT-001/PAT-003/PAT-004；MOD-002。

## LED-027 — 先检查版本再无条件写，仍会在检查后覆盖并发保存
- **Date**: 2026-08-14 · **Stage**: BUILD · **Severity**: critical · **Status**: rule
- **WhatFailed**: 局部改稿和撤销都先读取 `currentVersionId` 做比较，再通过另一条无条件更新移动
  当前版本指针；并发保存可落在两步之间。transport 还提前读取“上一版”，可能把撤销目标绑到
  实际写入前更早的版本。
- **RootCause**: 把 service 层的先读后验当成并发控制，没有把 expected version 放进数据库写条件，
  也没有让版本追加与指针移动共享事务。
- **GuardRule**: 所有会移动当前稿指针的采纳、保存和撤销，只要带 expected version，就必须在同一
  数据库事务内执行条件更新；零行更新即冲突并回滚全部新增行。响应里的 previous version 必须来自
  成功事务采用的真实当前值，禁止 transport 预读拼接。
- **GuardCheck**: `pnpm --dir backend exec vitest run src/modules/artifacts/artifacts.repository.integration.test.ts src/modules/artifacts/artifacts.service.test.ts && pnpm --dir frontend exec vitest run src/features/copilot/chat-script-patch-card.test.tsx`。
- **Outcome(T+N)**: 并发双写红测已从“两者都成功”收口为恰好一个成功，陈旧撤销零写入；待本地包
  真实连续采纳多张卡并手动保存冲突后回填。
- **Ref**: T-833；DEC-DATA-051；PAT-002 RF-002/RF-003。

## LED-028 — 可配置 Base URL 不能假定永远是纯域名

- **Date**: 2026-08-14 · **Stage**: BUILD · **Severity**: high · **Status**: rule
- **WhatFailed**: 官方渠道保存了完整 `https://api.minimaxi.com/v2/video_generation`，H3 adapter 和
  设置探测仍无条件追加 `/v2/video_generation`，真实请求变成重复路径并返回 HTTP 404。
- **RootCause**: 配置字段名叫 Base URL，但实际兼容输入允许域名、版本根、完整端点和中转前缀；生成
  与设置探测各自手拼路径，而且测试只覆盖了纯域名默认值。
- **GuardRule**: 可配置 provider 端点必须先由共享纯函数确定性规范化，再同时派生提交/查询地址；
  至少覆盖纯域名、版本根、完整端点和带路径中转。付费生成 POST 不得在 404 后盲试候选路径。
- **GuardCheck**: `pnpm --dir ai-worker exec vitest run src/runtime/multimodal-minimax.test.ts && pnpm --dir frontend exec vitest run src/server/settings-model-test-wrap.test.ts`（已登记进 `reconcile.config.json`）。
- **Outcome(T+N)**: 红测复现三种重复拼接，修复后 H3 21 项、设置探测 28 项通过；旧 MiniMax v1、
  OmniHi/Seedance 与 checkpoint 恢复回归通过。真实付费成片仍待用户用新本地包验收。
- **Ref**: T-837；DEC-MODEL-052；MOD-002；用户真机任务 `ai-task-b269a0a7-610` 的脱敏日志。

## LED-029 — 兜底卡数量达标不等于内容动效生效，场景级布局会把局部空窗放大成黑屏

- **Date**: 2026-08-14 · **Stage**: BUILD · **Severity**: high · **Status**: rule
- **WhatFailed**: 157 秒真实成片的 `video.cards` 经可溯校验后为 0，系统自动补了 14 张
  `list + reveal` 卡并让总导演复审通过；这些卡没有 `visualPlan`，8 条 B-roll 又全部是 `static`。
  横屏布局因“本场存在过视觉节点”把真人整场固定在右侧，最终出现约 15.3 秒真实空舞台，左侧约
  65% 的 1 秒采样为极暗画面，用户认为动效无效且黑屏更多。
- **RootCause**: 把“时间线上有足够数量的卡”当成“每个时间窗有有效视觉”，把确定性口播摘句兜底
  当成内容动效成功；布局模式按整场静态决策，而不是按当前视觉有效窗切换。最终视觉审核未配置时
  只记 `skipped`，技术成功仍可直接交付。
- **GuardRule**: 成片 Gate 必须分别统计 AI 内容动效命中、确定性降级、真实素材覆盖和无有效主视觉
  空窗；`visualPlan=0` 且全为同类兜底卡时不得冒充“动效已优化”。人物/舞台布局按当前时间窗切换，
  卡片与 `large_stage` 重叠后必须恢复接力。视觉审核未配置或返回 warn 必须对用户可见，编码成功不
  等于观看质量通过。
- **GuardCheck**: `pnpm --dir backend exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts
  src/modules/execution/video-render/template.test.ts && node orchestrator/process/verify-t839-real-timeline-preview.mjs
  <task-record.json> <pglite-db> <media-root> <talking-head-video> <output-dir>`（固定测试已登记进
  `reconcile.config.json`；真实时间线验收按证据任务显式运行，避免门卫依赖用户私有素材）。
- **Outcome(T+N)**: T-839 已让卡片可溯真值同时覆盖冻结稿与权威 SRT，合法 Scene Graph 不再被误删；
  纯基础补位明确显示“未生成内容动效”，不再冒充成功。`large_stage` 结束后信息卡恢复，横屏统一用
  同源低亮度人像承接短空窗。原 157 秒时间线的 1.5s、25.6s、30s、35s、85s、86.5s 六帧回归
  通过，接触表见 `orchestrator/evidence/T-839/contact-sheet.jpg`。
- **Ref**: T-838；`objkey-62e5771a-1694.mp4`；`ai-task-b269a0a7-699`；
  `ai-task-62e5771a-391`；`docs/research/2026-08-14-video-editing-regression-black-stage-diagnosis.md`。

## LED-030 — 开发态 MCP 能列出全部 operation，不等于安装版全能力 CLI 已可用

- **Date**: 2026-08-15 · **Stage**: DISCOVER/DEFINE · **Severity**: critical · **Status**: candidate
- **WhatFailed**: 仓库已有 `mcp-server` 会把全部 contract ENDPOINTS 自动转成工具，但只认识固定
  `localhost:3000`，不会发现桌面随机端口或携带启动级授权；它还只按 HTTP method 推断调用语义，
  缺少写入幂等、真实影响目标、安装交付和完整读写授权边界。
- **RootCause**: 把“协议适配器可列工具”误当成“正式安装版可完整授权执行”，没有同时验证连接发现、
  当前账号归属、操作元数据、持久幂等、安装交付和权限撤销。
- **GuardRule**: 任何 CLI/MCP 对外入口必须复用同一 contract-first registry 与 backend Gateway；全部
  正式 contract operation 都可见可调用，同时每个 operation 必须显式声明 effect、确认语义、异步和
  幂等，漏分类即构建失败。安装版必须使用当前启动随机端口与启动级完整读写授权，写入仍经 schema、
  ownership 和 service port；内部 route、数据库、密钥和私有文件不因“全能力”被顺带暴露。
- **GuardCheck**: T-843 实现后接入 248/248 contract policy 穷尽测试、raw dispatch/跨账号绕过负例、
  随机端口与授权撤销真安装回归、写入幂等/结果不明不重放、CLI/MCP 一致性与 macOS/Windows 全域
  读写端到端 Gate；实现前只作为 candidate，不冒充已有守卫。
- **Outcome(T+N)**: 待 T-843 评审、用户确认和实现后回填。
- **Ref**: T-843；DEC-CLI-001；PAT-001/PAT-003/PAT-004；`mcp-server/`；
  `docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md`。

## LED-031 — 打包 RAT 预加载了解析器，不等于生产子进程会继承模块 hook

- **Date**: 2026-08-16 · **Stage**: BUILD→SHIP · **Severity**: critical · **Status**: rule
- **WhatFailed**: Windows 少文件 runtime 的 HyperFrames CLI 和真渲染 RAT 全部通过，但用户正式成片
  连续两次在捕帧前以 `ERR_MODULE_NOT_FOUND` 退出；上游分镜、素材、字幕与导演决策均成功。
- **RootCause**: RAT 直接使用 `node --require creatoros-module-resolver.cjs`，生产执行器只使用
  `node <hyperframes-cli>`。主 server 内注册的 Node module hook 不会继承到新进程，安全环境又正确
  排除了 `NODE_OPTIONS`，分层 vendor 依赖因此在生产子进程不可见。
- **GuardRule**: 任何分层 runtime 的独立 Node consumer 必须在生产 argv 显式加载随包解析器，并与
  RAT 使用同一绝对路径契约；禁止用继承主进程 hook、`NODE_OPTIONS` 或开发机 `node_modules` 假定
  用户机可解析。验收必须同时约束生产 argv 和真 consumer smoke。
- **GuardCheck**: `pnpm --dir backend exec vitest run src/modules/execution/video-render/executor.test.ts
  src/modules/execution/child-env.test.ts && node --test tools/windows-closure-rat/*.test.mjs`。
- **Outcome(T+N)**: 先红后绿已证明生产 argv 加入同一 resolver、缺 resolver 前置失败、传统布局兼容、
  缺失包名与错误码可诊断；Windows 安装包真渲染待下一次正式候选回填。
- **Ref**: T-844、T-845；DEC-RUNTIME-053；
  `docs/research/2026-08-16-windows-video-render-module-resolution-diagnosis.md`。

## LED-032 — 方向 JSON 生成成功，不等于正式成片真的执行了方向

- **Date**: 2026-08-16 · **Stage**: BUILD · **Severity**: critical · **Status**: rule
- **WhatFailed**: 竖屏模板按场景是否存在 `large_stage` 提前把人物缩成角落，造成“上方横卡、右下
  小人、中间黑洞”；修正模板后又发现正式 executor 会把资产 ID 改成沙箱媒体文件名，却没有同步
  改写 `direction.beatGraph.subject.ref`，AI 给出的真实起止拍点因此在正式渲染中静默失效。
- **RootCause**: 把场景级静态布局当成时间窗级运动状态；并且只重命名媒体节点，没有把引用同一节点
  的编导图当成一个不可分割的引用闭包。旧字幕契约也只有整行文字，没有重点词字符与时间范围。
- **GuardRule**: 竖屏人物默认始终是同一全画布基底；素材物化改名必须原子改写 B-roll 与全部方向
  ref。字幕重点词只能来自
  `video.subtitles` AI 的 Unicode 字符范围与行内时间窗，代码只校验和渲染，不做关键词猜测。
- **GuardCheck**: 已登记进 `reconcile.config.json`：contract、AI prompt、runner、template、executor、
  props 组装与前端生产旅程必须共同通过；真实视觉另显式运行
  `node orchestrator/process/verify-t858-unified-stage-preview.mjs <task-record> <db> <media-root> <talking-head> <output-dir>`。
- **Outcome(T+N)**: 第一版 14 秒短样片虽完成方向执行与字幕强调，但其“主视觉窗自动缩人到 PiP”
  策略随后被用户明确否定，不能继续作为视觉通过证据；由 LED-033 和 DEC-VIDEO-043 接管修复。
- **Ref**: T-858；DEC-VIDEO-042；`orchestrator/evidence/T-858/contact-sheet.jpg`。

## LED-033 — 精确回位不能挽救错误的自动 PiP 镜头语法

- **Date**: 2026-08-16 · **Stage**: BUILD · **Severity**: critical · **Status**: deprecated
- **WhatFailed**: 第一版 T-858 样片把人物默认铺满竖屏；横版素材或动态卡出现时，人物仅在对应时间窗
  居中缩小，结束后精确恢复原几何。实现满足原测试，用户仍判定整个策略“错误、很奇怪”。
- **RootCause**: 把人物持续可见和几何回位误当成剪辑连续性，造成两个视觉主体同时竞争；缩小/放大
  运动让观众注意布局机关，画面更像视频会议或直播连麦。
- **GuardRule**: 竖屏人物、横版素材、动态内容按 beat 轮流成为唯一主体。素材/内容接管时人物完全
  不可见；结束后直接切回未变形的全画布人物。正式组装不得自动产出 PiP，模板不得因主视觉窗生成
  人物缩放/位移 tween；PiP 只有用户明确选择或另立可解释契约才允许。
- **GuardCheck**: T-858 聚焦测试共同断言 props 不产 `pip_bottom_left`、主视觉/动态卡层覆盖人物、最终
  HTML 不含素材窗驱动的 `tl.to("#th",{left/width...})`，真实短样片抽取接管前/中/后三态确认。
- **Outcome(T+N)**: 待修订短样片与用户验收回填。
- **Outcome(T+N, T-902)**: 2026-08-19 用户以真实成片明确改变竖屏默认：真人主导、人脸常驻；本条
  “自动 PiP 禁令”由 LED-044/DEC-VIDEO-056 取代，仅作为历史教训保留。
- **Ref**: T-858；DEC-VIDEO-043；用户 2026-08-16 预览反馈。

## LED-034 — 配置里的数字正确，不等于 multipart 出站仍有数字类型

- **Date**: 2026-08-17 · **Stage**: BUILD · **Severity**: high · **Status**: rule
- **WhatFailed**: `image2-edit` 的 `n` 取值为合法的 1，但 OpenAI-compatible 图片编辑适配器执行
  `form.append("n", "1")`，真实出站被记录为字符串并被严格上游以 HTTP 400 拒绝。
- **RootCause**: 把配置/TypeScript 中的数字语义误当成 wire 类型；标准 `FormData` 的普通字段只能
  编码成文本，即使传入数字也会字符串化。旧测试还把 `form.get("n") === "1"` 当成正确契约。
- **GuardRule**: multipart 中具有数值语义的可选字段，在系统使用协议默认值时应省略；确实必填时
  必须按具体上游的 multipart 解析契约做真实 wire 兼容验证，不能靠类型断言伪造数字。计费 POST
  不得用多编码盲试。JSON 路径必须单独断言数字类型，未知设置保持白名单不透传。
- **GuardCheck**: `pnpm --dir ai-worker exec vitest run src/runtime/multimodal-openai-images.test.ts`
  （已登记进 `reconcile.config.json`）。
- **Outcome(T+N)**: RED 为 `1 failed | 11 passed`，证明编辑请求仍含字符串 `n`；GREEN 为 12/12，
  Node 实际 multipart wire body 已不含 `name="n"`，纯文生图 JSON 仍为数字 `n: 1`。未调用真实计费
  生图，待包含本修复的开发包真机复测后回填上游结果。
- **Ref**: T-864；DEC-MODEL-054；`orchestrator/T864-BUILD-VALIDATION.md`；用户 2026-08-17 日志。

## LED-035 — 创作数组里一张坏候选，不应拖垮同批全部合法结果

- **Date**: 2026-08-17 · **Stage**: BUILD · **Severity**: high · **Status**: rule
- **WhatFailed**: `video.cards` 的结构化首路落空后，文本兜底返回了可解析 JSON，但第 12 张卡的
  `kind` 越过六值枚举，整批信息卡和整条 `video.decisions` 因一张坏卡失败；前一天还出现过
  `visualPlan.relation` 枚举越界后靠人工重试才成功。
- **RootCause**: `video.cards` 是可编辑创作候选，却未接入已有 `creative-partial` 恢复；协议随着
  Scene Graph 增加枚举面后，弱模型的局部漂移被错误升级成整批失败。文本兜底还是第二次请求，
  既增加等待/计费，也可能再次产出局部坏值。T-868 进一步证明动态 `.refine()` 只返回根级
  `custom path=[]`，通用按路径恢复器无法定位具体坏卡；仅接入静态恢复仍会再次整批失败。
- **GuardRule**: 创作候选数组必须让原 schema 指认坏字段/坏项后局部恢复：关键枚举非法只丢该项，
  可选动效/视觉计划非法只降级可选字段；未知值禁止猜映射，恢复后必须回到原静态 schema、动态
  refine、可溯门与导演审核。根级动态 issue 必须逐项交回同一个动态 schema：去掉可选字段后合法
  才保留，否则只丢该项；禁止解析错误消息猜路径。判断/控制型输出继续 fail-closed，不得套用创作恢复。
- **GuardCheck**: `pnpm --dir ai-worker exec vitest run src/nodes/structured-node.test.ts
  src/prompt/creative-output-recovery.test.ts src/prompt/templates/video-decisions.test.ts && pnpm --dir backend
  exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts`（已登记进
  `reconcile.config.json`）。
- **Outcome(T+N)**: T-865 的静态失败形状与 T-868 的根级动态 `custom` 失败形状均已先红后绿；单张
  `kind`/sceneIdx/at 越界只丢坏卡，可选 `motion`/`visualPlan` 静态或动态协议非法只降级计划；首响应
  其余结构完整时 1 次模型调用即可恢复，不再追加第二次请求。待新开发包由用户真机复测。
- **Ref**: T-865；`ai-task-32c67e5c-1139`；
  T-868 用户根级 `custom` 错误；`docs/research/2026-08-17-video-cards-schema-fallback-diagnosis-and-fix.md`。

## LED-036 — AI 素材匹配返回空数组，不等于自动分镜已经成功

- **Date**: 2026-08-17 · **Stage**: BUILD · **Severity**: high · **Status**: rule
- **WhatFailed**: 当前确认稿已经生成并采纳了 8 个项目素材，但 `material.match` 的空 `matches`
  仍通过动态 schema；素材链接的 `addedByType=ai` 又被投影成 `manual`，前端遂把全部素材列为“可选
  补充素材”，要求用户逐条选择场景。
- **RootCause**: 自动匹配链路只校验了“返回项是否真实”，没有校验本稿专属生成素材整批落空；素材
  库投影丢失 AI 来源，生成器保存描述时还裁掉了口播原文绑定，导致模型与界面都失去可靠上下文。
- **GuardRule**: AI 加入当前项目的素材必须保留来源；本稿专属生成素材必须保存服务原文和画面职责，
  `material.match` 必须逐项做语义匹配。存在本稿绑定素材时，整批空匹配须携带真实素材 ID 定向修复
  一次；仍失败时只能按生成时保存的“服务原文”精确恢复 SRT 来源时间，不能取消整条分场，更不能
  退化成逐条人工选场景。人工控件只用于纠正少量误配。代码只识别系统绑定协议并校验真实 ID/场景
  边界，不按文件名、关键词或字符串相似度替模型做创作选择。
- **GuardCheck**: `pnpm --dir ai-worker exec vitest run src/prompt/templates/material-match.test.ts && pnpm
  --dir backend exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts
  src/modules/ai-runtime/asset-generate-runner.test.ts && pnpm --dir frontend exec vitest run
  src/features/production/video-decision-preview.test.tsx`（已登记进 `reconcile.config.json`）。
- **Outcome(T+N)**: 真实失败形状先红后绿；AI 来源不再伪装成人工上传，生成素材保留服务原文；
  首轮协议失败会定向修复，两次失败会按服务原文恢复而不是取消任务，未匹配的 AI 项目素材也不再
  生成逐条手选控件。待新开发包真机重跑分场验证。
- **Ref**: T-867；用户 2026-08-17 “AI 分场决策”真机截图；`orchestrator/T867-BUILD-VALIDATION.md`。

## LED-037 — 成功写操作的重放不能用“已经完成”作为错误回应

- **Date**: 2026-08-17 · **Stage**: BUILD · **Severity**: high · **Status**: candidate
- **WhatFailed**: Candidate promotion 第一次成功后，完全相同的第二次调用抛出“已经立项”；弱网下若
  第一次响应丢失，用户重试会看到失败，虽然项目其实已经存在，也无法从响应进入原项目。
- **RootCause**: 只把幂等理解为“不创建重复记录”，没有把“重放返回同一业务结果”纳入成功契约。
- **GuardRule**: 会创建唯一业务实体的用户动作必须让成功重放返回原结果；已有状态与关联行一致时读回，
  状态与关联缺失时明确报一致性错误，禁止再创建或猜测关联。
- **GuardCheck**: `pnpm --dir backend exec vitest run src/modules/candidate/candidate.service.test.ts
  src/modules/candidate/candidate.contract.test.ts`。
- **Outcome(T+N)**: T-870 红测证明第二次 promotion 原先抛错；修复后 service 与 contract 重放均返回
  同一 promotion，Project 创建调用仍恰好一次。
- **Ref**: T-870；DEC-RADAR-047。

## LED-046 — 网页追踪完整，不等于独立 Worker 的安装依赖完整

- **Date**: 2026-09-14 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: Windows精简包漏Worker入口；随后Pi旧目录加载、PDF只含ESM不含CJS逐项阻断。只验证主页面无法发现后台不可用，抢跑双端构建造成额外取消。
- **RootCause**: 网页追踪、Worker装配、搬移Node及运行时解析约定未一起验证；把manifest存在误当作依赖完整。
- **GuardRule**: 同一装配入口必须包含全部Worker；在最终布局下真实握手并正常退出，验证外置消费者；同版本依赖补缺失文件且保留已有转换内容。数量只告警，缺依赖和实际执行失败继续阻断。候选完整验证前不抢跑正式双端，不将确定性缺依赖当网络错误重试。
- **GuardCheck**: `node --test tools/windows-closure-rat/*.test.mjs && pnpm --dir ai-worker exec vitest run src/runtime/agentic/pi-packaged-runtime.test.ts && pnpm --dir frontend exec vitest run scripts/desktop/execution-worker-runtime.test.mjs`。
- **Outcome(T+N)**: 6147d380对应run34802836581 Windows消费者、安装、启动、卸载通过；Mac公证与真启动通过。运行级证据不代表已登录抖音或真实模型业务全量E2E。
- **Ref**: T-974；docs/research/t974-pipeline-root-cause.md。

## LED-047 — 打开弹层不应等待整页加载，慢轮询不能互相作废

- **Date**: 2026-09-14 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: AI 助手打开慢；优化链接后，AI 蒸馏和补全选题按钮仍绕回服务端导航。任务请求超过 8 秒时继续发新请求，旧结果不断被判过期。
- **RootCause**: 只覆盖链接未覆盖程序化入口；折叠工具详情提前处理大对象；固定间隔轮询缺少在途保护。
- **GuardRule**: 同页弹层通过共享本地导航打开，保留深链与浏览器前进后退；真实切页和筛选继续使用路由。隐藏详情展开后再序列化；慢轮询限制在途请求，保留过期和卸载保护。不得通过删除历史或质量门拒绝任务解决性能问题。
- **GuardCheck**: reconcile.config.json 的 LED-047 执行助手、知识蒸馏、选题、弹层导航、工具详情六组回归。
- **Outcome(T+N)**: T-978 先复现 4 项失败（包括慢请求累计 5 次），修复后 116 项通过；T-977 同页模拟慢导航由 2778ms 降至 39ms。后者为旧安装页面注入候选导航代码验证，不代表新安装包已验收。
- **Ref**: T-977、T-978；docs/features/t978-ui-performance-guard.md。自动化页面历史与步骤轮询仍需专项修复，不声称全站性能问题已清零。

## LED-048 — 大批采集必须独立调度，资源等待不能制造连续失败

- **Date**: 2026-09-14 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: 合并作品、评论、封面和流量后互相拖累；长任务被30分钟清扫器误判失败，跨计划绑定重复失败，浏览器占用逐作品计错。拆分回归还发现批次累计统计被重复相加。
- **RootCause**: 业务任务、计划运行和浏览器资源寿命混在一起；全局串行尾链阻挡其它账号；关闭与取消未等待实际资源退出；累计与本批计数口径混用。
- **GuardRule**: 四项独立任务按作品、流量、评论、封面优先领取；已有持久执行不按总时长清理。跨计划只去重不换父任务；占用时原ID等待并保存成功进度。按账号控制并行，同账号共享会话仍各自授权和隔离页面，真实关闭才释放。计数按各源口径、每attempt幂等保存。关闭开关不得被补偿唤醒绕过。不能以TTL或“没查到进程”作为跨重启释放证明。
- **T985 安装版补充**: 素材记录存在不代表文件可读；后台候选须检查当前文件，未知逐项待重试且不覆盖用户新版本。等待/恢复/终态进度同序保存，每批保留回执；OS进程标题不等于可执行路径，正式安装版资源恢复必须有实际进程证据回归。
- **T983 错峰与入口补充**: 默认采集按北京时间00/15/30/45分错峰；查看已有运行以服务端当前态为准，手动与定时提交共用短锁。已确认完整页面没有来源栏目属于“平台暂未提供”，不等同网络失败；保留历史数据，按尝试水位再次检查，未知页面仍如实失败。
- **GuardCheck**: reconcile.config.json 的 LED-048 执行跨计划、跨天、资源等待、开关、真实优先级与批次恢复回归。
- **Outcome(T+N)**: 拆分SQL、界面、公开调用链和真实Chromium测试已通过对应验证；旧版崩溃遗留租约仍缺跨宿主停止证明，未宣称根治或安装版通过。
- **Ref**: T-982、T-983；docs/verification/t983-collection-split.md。


## LED-049：展示缓存漏接与全量历史读放大（T-987）

已存在缓存不代表每个页面已接入；发布中心绕过缓存，七日趋势先加载全部快照再截断；自动化分页为count读取全部历史ID，闲置页持续抢本地服务。没有native点击耗时不得拿HTTP耗时代替。

防复发：页面汇总复用有界展示缓存，key含用户/账号及真实日期时区，错误不缓存，业务版本和写入口共同失效；动态日历/运行状态保持真值。按日图表在数据库只取所需采样日每日最后值；保留稀疏采样/漏采/账号隔离，不偷换指标口径。分页count在SQL聚合；客户端岛只传实际使用字段；隐藏暂停轮询且恢复维持单在途。主导航未点击不自动预取整页；集合页不得逐项Promise.all反查，复用分页批量读并用唯一ID稳定排序。验证命令由reconcile LED-049执行；不把所有页面一律拉长TTL。

## LED-050：导航连点排队与首页先展开后截断（T-988）

复现：安装版同账号首页5连点产生5个RSC，请求顺序等待，约4秒才出现指标。loading提示不是防重；先为100条近期作品解析版本再展示5条，会把无关读取放大。

防复发：主导航首次立即执行，只合并同一完整目标的在途意图，不用固定延迟；用真实React过渡及完成token解锁，支持缓存瞬时完成、错误页、不同目标、A→B→A与切号，旧完成不得解开新意图。集合必须在解析详情前按真实ID/展示数量收窄；单次查询共享判据，独立读并行。首页只缓存按版本失效的指标重读，待办/排期/账号基线实时读取。验收记录真实浏览器请求数和页面完成条件；HTTP响应头/SSR耗时不得冒充原生点击。

执行：reconcile LED-050覆盖真实useTransition/Suspense失败和连点、指标缓存隔离失效、近期作品SQL次数上限以及动态待办读取。

T988安装验证补充：Next可能在数据未返回时先提交骨架并结束transition，防重还需识别同一完整URL的可见route-loading；Activity隐藏的旧骨架不得阻断。公共及运营分析独立骨架均纳入，回归覆盖可见/隐藏与不同筛选。


## LED-051 — 构建子进程默认堆不足不能靠重复跑流水线解决

T991：Windows 源码编译成功后，TypeScript 检查在约 2 GiB V8 堆耗尽，exit134。先分清主机内存和子进程堆上限，再为构建阶段设置有限预算：按有效主机容量最多 60%、至少保留 2 GiB、上限 6 GiB。用真实 Next Worker 验证继承；保留类型检查，禁止全局环境污染安装后运行时。记录实际机器容量与预算，最终以 Windows 安装、启动、卸载验证为准，不原样重试或跳过类型错误。

执行：`node --test tools/windows-closure-rat/build-memory.test.mjs tools/windows-closure-rat/build-production-closure.test.mjs`。

## LED-052 — 归档执行豁免不能只判断账号ID存在

- **Date**: 2026-10-05 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: 新建普通任务已拒绝归档组，但归档前排队或已认领的普通写稿/source_sync仍可claim并进入lease admission。独立真实PG探针实证该缺口，131条绿测未覆盖反例。
- **RootCause**: 创建口验证真实私有作业，认领/模型/lease口却用 accountId 存在放行归档，未共享同一权限证明。
- **GuardRule**: 所有新动作与claim在同一事务重验冻结成员；仅四类私有collector且真实job、账号、组、owner、membershipVersion一致时可继续。普通队列不执行；已有同键调用的安全settlement仍可幂等结算，不能取消合法采集或反杀已发生用量。
- **GuardCheck**: `node docs/verification/t1022/run-archive-guard.mjs`；缺隔离PG配置必须失败，不能skip成绿。
- **Outcome(T+N)**: 当场负向RED 3 FAIL/4 PASS后修复，作者86条及追加56条通过；增量及test-only按SHA集成，独立最终复验B1 PASS，4个不同测试文件62条通过（两次PG运行不累加），组合22文件ROOT/候选匹配；原FAIL证据保留。
- **Ref**: T-1022；docs/verification/t1022/startup-permission-review-initial-fail.md；archive-admission-freeze.json。

<!-- T1080：下列为本地main独有原记录，来源main12288cef；重复教训编号见整合报告 -->
## LED-055 — 回放历史模型请求不能混入最新计划

- **Date**: 2026-09-22 · **Stage**: BUILD→SHIP · **Severity**: critical · **Status**: active
- **WhatFailed**: 原综合任务重启续跑时，模型未知已安全superseded，但没有下一次新调用，最终CHAT_MODEL_REQUEST_REPLAY_MISMATCH。
- **RootCause**: 宿主在历史stop之后生成的续行读了当前计划；当年rev3的文本被当前rev4多出的步骤改变，完整模型请求指纹因此不再一致。真实Pi/durable/SDK脱敏回放已复现。
- **GuardRule**: 参与模型请求的宿主派生上下文必须按该历史模型调用读取当时已证明的快照；顺序和真实结算事实均须校验。不得用最新状态替代历史，不得忽略digest或覆盖旧费用/回执；历史证据缺失必须明确诊断，不能编造。新增证据门同时覆盖历史成功公共链，避免不相关未来状态反杀可用性。
- **GuardCheck**: reconcile LED-055覆盖正式plan历史读取、原请求严格匹配与worker续行回放；具体运行结果另记当前验收，不以门存在代表已通过。
- **Outcome(T+N)**: 第七安装实测发现，修复与新安装原任务复验进行中。
- **Ref**: T-1026；docs/verification/t1026-cli-acceptance.md。


## LED-054 — 外部 I/O 不能占住任务数据库事务

- **Date**: 2026-09-21 · **Stage**: BUILD→SHIP · **Severity**: critical · **Status**: rule
- **WhatFailed**: 聊天 Agent 调用浏览器或本机命令时，任务查询、心跳、取消和恢复全部等待；产物自动
  对账也会卡住全部数据库读取。重启后即使原产物已完成对账，任务仍停在 `unknown_result`，页面长期
  显示“自动恢复中”。
- **RootCause**: PGlite 使用单连接，宿主把 execution lease 数据库事务跨越到 socket/原生 I/O；产物
  结算又在独占事务内经根连接读取对象存储设置，形成自等待。对账完成后没有把同一任务重新入队，
  纯模型进程退出后的未知候选也缺少安全续跑路径。
- **GuardRule**: 外部 I/O 必须使用“短事务读取可信身份 → 事务外调用 → 短事务复核租约”；禁止在 lease
  回调内等待 socket、浏览器、命令、网络或会再次查询根数据库的存储端口。无外部副作用且没有 provider
  job/回执的纯模型未知调用可标记 `superseded`，在同一任务、同一 operation key 和既有预算内续跑；
  工具副作用未知继续等待同键对账，对账结算后必须自动把原任务重新入队。长度截断有限续写后以已生成
  内容 `partial` 收口。
- **GuardCheck**: `reconcile.config.json` 的 LED-054 运行数据库活性、租约复核和模型未知恢复回归。
- **Outcome(T+N)**: 红测复现浏览器等待及产物对账读取存储设置时 PGlite 查询阻塞；绿测验证前台读取
  在 1 秒门内完成、原产物调用同键结算、同一任务从 `unknown_result` 自动回到队列，外部工具未知不盲重放。
- **Ref**: T-1024-runtime-liveness。

---


## LED-059 — 自动恢复必须有进展证据，内置工具必须经过真实聊天装配

- **Date**: 2026-09-21 · **Stage**: BUILD→SHIP · **Severity**: critical · **Status**: rule
- **WhatFailed**: Mac 内置浏览器工具声明了合法的 `format: "uri"`，聊天参数桥在创建持久任务前拒绝
  整轮请求；页面没有任务回执却持续显示“自动恢复中”，形成无限请求和永久转圈。
- **RootCause**: 工具目录与参数桥只分别做了局部测试，没有用真实内置 Schema 跑聊天装配；前端恢复循环
  没有连续无进展预算，也没有区分“已有持久任务”和“任务尚未建立”。
- **GuardRule**: 内置工具 Schema 必须通过真实聊天装配并执行其约束，未知约束继续 fail-closed。前端只有在
  有持久任务回执或有限提交预算内才能显示自动恢复；三次无进展后停止自动请求、保留原轮并提供继续恢复。
- **GuardCheck**: `reconcile.config.json` 的 LED-059 运行工具参数桥、真实工具装配、任务回执和恢复活性回归。
- **Outcome(T+N)**: 红测复现 `format` 阻断；绿测覆盖 URI 执行校验、未知格式拒绝、真实 `browser.navigate`
  装配、同轮手动继续、持续 503 请求停止、持久任务提示和卸载清理。
- **Ref**: T-1023-agent-recovery。

---


## LED-058 — 模型断流和格式不完整不能把恢复责任推给用户

- **Date**: 2026-09-21 · **Stage**: BUILD→SHIP · **Severity**: critical · **Status**: rule
- **WhatFailed**: 内容雷达在逐字稿拆解后因模型输出不完整显示手动重试，AI 助手在模型断流后显示
  “这次没有生成成功”；原任务、输入和部分结果仍在，却被页面变成阻断终态。
- **RootCause**: 模型连接中断统一进入未知结果冻结，格式不完整直接映射失败；调用账本没有区分可废弃的
  模型候选与可能有外部副作用的未知调用，页面又把普通临时错误交给用户重新提交。
- **GuardRule**: timeout、可重试 HTTP、网络断流及模型候选不完整必须保留同一任务和检查点，由 Agent
  loop 退避、修复或续跑；废弃模型调用继续保守占用预算。只有没有可用模型时引导设置。用户取消保持
  停止，工具、发布等外部副作用结果未知仍先对账，禁止盲目重放。
- **GuardCheck**: `reconcile.config.json` 的 LED-058 运行模型流、账本、原任务恢复、内容雷达和助手界面回归。
- **Outcome(T+N)**: 单元与集成回归覆盖模型流缺 finish、流内 error、429、网络断开、持久任务重领、同键
  重试、最终聊天提交、配置缺失入口及页面无手动重试；安装版证据见 T-1022-agent-recovery 验证记录。
- **Ref**: T-1022-agent-recovery；DEC-AI-037。

---


## LED-056 — 工具宿主有实现不代表新任务能调用

- **Date**: 2026-09-22 · **Stage**: BUILD→SHIP · **Severity**: critical · **Status**: active
- **WhatFailed**: artifact.copy扩展到v2后，安装CLI能力目录只剩20项，真实新任务完全拿不到copy；宿主复制测试通过仍无法交付。
- **RootCause**: 生产内置目录selector固定所有工具schemaVersion1，过滤了新copy@2；此前测试直接注入host.catalog，绕过实际装配。
- **GuardRule**: 工具版本变更必须经过同一生产selector、公开capabilities投影、prepareChatReply与正式任务冻结、真实宿主/账本结算验收。各工具明确当前版本，不泛化接受未知版本，不把新定义伪装旧v1；旧任务完整冻结定义和历史执行语义保留。
- **GuardCheck**: reconcile LED-056运行真实目录→新任务→copy@2执行/同键重放及旧v1兼容，非被测工具夹具明确fail-fast且零调用。
- **Outcome(T+N)**: 第八安装实际失败已记录，精确目录红后绿；新包CLI复制仍待通过，不以回归存在或任务succeeded冒充交付。
- **Ref**: T-1026；docs/verification/t1026-cli-acceptance.md。

LED055追加（第八实际恢复）：历史上下文修正后，原task256仍因MODEL_CALL_REQUIRES_RECONCILIATION停止。正式PGlite/SDK链确认后续unknown准备失败会清空既有安全根模型retry锚，启动恢复又未重建；不是再次摘要漂移。保留/重建锚必须持同任务锁，证明完整已确认前缀与唯一无外部结果逻辑尾，原reserve继续严格摘要/预算，不修改历史账本，不解除未知工具。LED055追加model retry-anchor与pause恢复门；第九安装原任务仍待复验。


## LED-057 — 干净安装通过不代表 Windows 保留目录下的首次启动可用

T992：Windows 卸载会保留 AppData 中的业务数据和可再生成运行环境。新包完整解压后，目录切换仍可能因暂时占用返回拒绝访问；干净 CI 没有这类现场状态，把原子改名失败直接作为启动失败会让合法安装无法使用。

防复发：安装期继续严格写入并校验正式运行目录；启动期只有在解压已经完成、版本标记匹配、入口哈希和完整性检查全部通过时，才允许从隔离目录继续运行。后续启动可复用重新校验通过的隔离目录，损坏候选必须跳过。诊断保留操作阶段、来源、目标、原始系统错误和回滚结果。跨平台容忍路径由 `runtime_cleanup_tests::windows_*` 守护；原生独占句柄复现带 `#[cfg(target_os = "windows")]`，只在 Windows 开发机上编译进这组测试，macOS 上不参与。该组测试不进发布流水线——它在 sidecar 与 externalBin 产出前会让 tauri_build 资源校验 panic。Windows 流水线继续执行安装、启动、首页加载和卸载验收；禁止靠清空 AppData、关闭校验或重复构建掩盖问题。

执行：`cargo test --manifest-path frontend/src-tauri/Cargo.toml --lib runtime_cleanup_tests::windows_ --no-default-features`（本地/reconcile guard）。前置条件:`frontend/src-tauri/binaries/` 与 `sidecar.tar.gz` 必须已存在,否则 build.rs 在 tauri_build 资源校验处 panic,与测试本身无关。

<!-- T1080：下面保留workbase6b1322af独有决定/教训；撞号映射见resource-control-resolution。 -->
## LED-053 — 执行预算必须从完整内部流程向外计算

- **Date**: 2026-10-06 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: 安装版素材准备约31秒失败；Worker固定30秒普通宿主等待包住匿名请求、登录导航、重试与抽音。前端观察窗口到期又把后台仍运行的任务显示为失败。
- **RootCause**: 把端口等待、业务总预算、观察窗口和库默认混用；只改外部配置不能覆盖SDK内部30秒默认。新增预算没有在正式持久创建口首次冻结下限。
- **GuardRule**: 新正执行/有限观察至少120秒，原长预算保留；独立外层大于全部内部墙钟预算，计入串行尝试、退避、排队、启动和清理余量。同一原绝对deadline向内传播且到期立即结束，历史不续期；continuous沿原归属、取消和心跳。观察结束保留原ID，不能伪造失败或重建任务。间隔/授权TTL/输入长度和取消后强杀宽限分开。依赖默认及单位、0禁用逐消费者检查。
- **GuardCheck**: `node tools/timeout-policy/verify.mjs`；reconcile.config.json LED-053。含正式Worker→ASR准备、真实沙箱执行、PGlite持久入队/历史claim、前端原任务观察、CLI等待、依赖补丁及真实CLI解析；完整渲染导出证据另存。
- **Outcome(T+N)**: 当场旧30秒红测失败；修复后31秒、125秒和超过10分钟continuous慢成功，取消/原deadline仍停止。新持久入队1秒旧预算红测失败，修复后冻结两分钟且历史过期不认领。依赖公共CLI实际隔离导出成功。全部222条原清单有归属；真实供应商、Windows与安装版未冒充通过，全局既有Gate失败保留。
- **Ref**: docs/engineering/timeout-policy.md；docs/verification/t1066/REPORT.md；通用Skill 3.27.4。


## LED-060 — 完整模型响应与转录回放必须在同一真实链路验收

- **Date**: 2026-10-07 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: T-1068-radar-transcription实际HTTP证明完整Chat Completion JSON被SSE消费者误判未知；转录共享节点裸jsonSchema在text模式没有validator，尚未请求模型即阻断真实后端回放/保存。
- **RootCause**: 完整JSON与SSE的wire形状未兼容；只有发给模型的schema，没有回放/文本模式实际消费的validator；单测只注入结构化返回，未覆盖真实business port。
- **GuardRule**: 同一次完整JSON响应仅在明确结束事实和可验证形状下映射原流消费者；保留正文、reasoning、工具参数和真实usage，不增加请求、不制造结束码。共享schema必须提供严格validator，wire schema与冻结摘要保持兼容；最终稿由真实后端回执回放决定，明确失败沿原文降级。started/unknown、取消、旧fence与原deadline耗尽不能伪造成功或获得重发资格。至少覆盖真实Worker/Pi/HTTP/账本终态和后处理全部业务端口、artifact写后读回。
- **GuardCheck**: reconcile.config.json LED-060；pi-provider-json-compat、radar-model-result-unknown.repro与transcribe-postprocess.integration实际回归。
- **Outcome(T+N)**: 修复前协议6失败/8通过；真实后处理9失败/1通过。补丁和validator修复后最终自包含构建门协议19、原复现8、真实后端集成13共40通过；另有相关后端53通过及正式bundle旅程，保留异常/断流/取消对照。全局reconcile34错误/1告警与原基线逐项一致；具体日志在docs/verification/t1069与t1070，不代称真实供应商或安装版验收。


## LED-061 — 资源释放必须走实际消费者并保持原任务归属

- **Date**: 2026-10-08 · **Stage**: BUILD · **Severity**: high · **Status**: active
- **WhatFailed**: 转录成功遗留Whisper线程；宿主累积已消费音频；聊天提前读完整历史；完成会话/预览无界缓存；稿面与Radar重复读取；成功任务卡反复观察；后台调度/心跳叠加。独立复核还发现无审批等待误淘汰，以及显式停止后running元数据永久保护。
- **RootCause**: 创建和释放没有同一归属、缺背压/终态映射/单在途屏障；缓存未关联实际任务状态和当前turn。
- **GuardRule**: 每任务finally等待自己的线程退出；双向协商消费确认并用单调水位/紧凑区间释放已消费字节，旧peer保持原协议兼容；流只按pull读取当前有限页；只淘汰无观察者的完成会话，真实等待状态按原任务ID保护；停止接受只释放对应turn本地引用，不伪造cancelled；同一读取/调度/心跳最多一份，重复唤醒有界合并，dispose关闭入口并等待清理。保持原execution/attempt/fence/deadline、幂等收费、完整历史、合法大输出与跨页回复。
- **GuardCheck**: `node docs/verification/t1073/verify-resource-lifecycle.mjs`；已登记reconcile.config.json，覆盖全部8处实际消费者。单测/hook各120秒；没有整套watchdog，不冒称整组有总上限。
- **Outcome(T+N)**: 各根因当场正确行为RED后同测GREEN保留。整合聚合301/301通过（7+83+62+121+28）；无消费者SSE读0页、100份已消费音频liveBuffers=0、线程归属退出、慢读取peak=1、根dispose计时器为0。无审批等待、原任务停止和最终确认经真实隔离持久服务/SDK链23项及独立复跑通过。真实模型容量、安装版RSS和浏览器像素证据未验证，全局历史失败保留。内存探针新输出写本次门日志并还原旧证据；失败后的旧字节不得视为新观测。
- **Ref**: DEC-T1073；docs/features/t1073-resource-memory-fixes.md；docs/verification/t1073/REPORT.md。
