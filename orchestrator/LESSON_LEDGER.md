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
- **WhatFailed**: Windows 流水线执行了安装器特殊入口并确认 runtime 文件存在，却从未启动用户真正点击的 `CreatorOS.exe`；sidecar 工作目录依赖、verdict 公钥读取和 WebView 导航全部未被执行，最终流水线全绿但用户真机仍永久白屏。
- **RootCause**: 把“安装期物化成功”误当成“应用启动成功”；同时以 `about:blank` 注入脚本动态生成 splash，启动失败时脚本若未执行就没有可见错误页；runtime 解析还在 logger 初始化前 panic，证据也没有落盘。
- **GuardRule**: Windows 安装包上传后必须真启动已安装 GUI，只有 sidecar 完成启动门且 WebView 完成 `127.0.0.1` 主页面加载才算启动 Gate 通过；sidecar cwd 必须显式固定到随包 frontend；任何 runtime 失败必须保留静态可见页并先落日志。
- **GuardCheck**: `pnpm --dir frontend exec vitest run scripts/desktop/startup-safety-contract.test.mjs scripts/desktop/windows-runtime-config.test.mjs scripts/desktop/desktop-release-workflow.test.mjs`（已登记进 `reconcile.config.json` lessons[]）
- **Outcome(T+N)**: 待 Windows 新包流水线与用户真机复验后回填。
- **Ref**: T-562；用户真机 2026-07-27；`docs/research/2026-07-24-windows-first-launch-white-screen.md`

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
