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
- **GuardRule**: 结构化模型调用必须保留有界默认超时；只有经真实耗时证据确认的长节点才可在调用处
  显式放宽，且统一限幅。只对明确的结构化响应协议不支持改走“文本 JSON + 同 schema 验收”，
  鉴权、网络、限流和超时不降级。SERP 导航用可读的 DOM 就绪条件；已确认登录墙只做有上界冷却，
  到期真实重试，普通网络错误不误封。任何回退都不得用模型记忆冒充联网证据。
- **GuardCheck**: `pnpm --dir ai-worker exec vitest run src/nodes/structured-node.test.ts && pnpm --dir backend exec vitest run src/modules/ai-runtime/video-decisions-runner.test.ts && pnpm --dir frontend exec vitest run src/server/ai/search/search-browser.test.ts src/server/ai/search/browser-search-fallback.test.ts`
  （已登记进 `reconcile.config.json` lessons[]）。
- **Outcome(T+N)**: 分场/信息卡显式放宽至 120 秒，shared runner 仍限制在 15–180 秒；
  协议不兼容使用同 schema 的受控 JSON 修复；Bing 不再被长连接拖到 `networkidle`，百度登录墙默认冷却 5 分钟后重试。
- **Ref**: DEC-AI-044；T-784；T-789。

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
