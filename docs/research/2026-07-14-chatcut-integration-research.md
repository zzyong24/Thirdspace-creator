# ChatCut 集成调研 — 「对话式剪辑」能不能搬进 CreatorOS

- **日期**:2026-07-14
- **类型**:research-as-asset(调研归档)
- **触发**:用户诉求——现有视频剪辑效果差(①字幕文字重合 ②字幕校准不对),且③「聊天框里不能剪辑」,想把 **ChatCut** 集成进来,认为「对话式剪辑」有意义;并设想「通过 Pi 把 ChatCut 集成进来」。
- **拍板**:待用户看本报告后定;本文只做事实盘点 + 契合度评估 + 集成路径 + 可嵌入替代,不预设结论。
- **方法**:WebSearch/WebFetch + `gh api` 核 license/元数据 + 反证本仓已有能力(grep 源码)。ChatCut 官网页面被 Cloudflare 403,官方事实取自搜索快照 + `ChatCut-Inc/agent-plugin` 仓库 + 融资报道,已注明。

---

## 0. 一句话结论(详见 §2–§4)

「ChatCut」指向的**核心那个**是 **chatcut.io** —— 一家 2025-10 拿了 $1.35M 种子轮的**闭源 SaaS**,做的正是「转写式剪辑」(改文字=改视频)。它**不可自托管、不可库级嵌入**,只对外暴露一个**云端 MCP 端点**(`https://api.chatcut.io/api/external-mcp/mcp`),必须用 ChatCut 账号 + 把用户素材上传到它云上、按 credit 计费。**它能被 Pi 当工具挂载(Pi 会说 MCP),但把用户素材推到第三方云 + 不修我们自己的管线**,与本项目「本地优先桌面 / 服务端接管无 CDN / 数据归属用户」定位冲突。真正省事且合定位的路线是**照搬它的方法(transcript-based editing),用可嵌入开源件补齐**:WhisperX(词级强制对齐,BSD-2)治「字幕校准」+ 现有 SRT 真值层上加 transcript-edit + GSAP 字幕排版修「文字重合」+ 现有 copilot 聊天面当「对话式剪辑」入口。

---

## 1. 事实卡(甄别多个候选)

搜索「ChatCut / chat-cut / chatcut」命中**一个商业主体 + 一批开源替代**。逐个立卡。

### 候选 A(即用户所指):ChatCut = chatcut.io — 闭源 SaaS「对话式剪辑」

| 维度 | 事实 |
|---|---|
| **是什么** | Web 端 AI 视频编辑器(SaaS)。自然语言 prompt → 专业剪辑。定位「vibe editing / prompt-to-edit」。 |
| **公司/阶段** | ChatCut Inc.,创始人 Kaiwen Li、Alima Strickland(纪录片导演,VICE/Discovery/Airbnb 背景,2024 Telly 铜奖)。2025-10 种子轮 **$1.35M**(ZhenFund + Antler)。早期创业公司。 |
| **核心能力** | **① 转写式剪辑(核心)**:自动转写→每个词映射到精确帧;在**逐字稿里删一句/删词/删 filler/重排段落**,时间轴与音视频跟着变——「靠读稿而非拖拽来清理口播/播客/访谈素材」。**② 自动转写 + 说话人分离 + 时间码逐字稿**。**③ 自动字幕**(直接从逐字稿生成,20+ 风格、100+ 语言)。**④ Motion graphics**:纯英文描述动画→直接生成到时间轴(免 AE/免 keyframe)。**⑤ 生成补拍**:抽帧做封面 / 参考图 / 生成缺的 B-roll。**⑥ AI 生成配乐**(按视频精确时长)。⑦ 剪静音、清音频、按平台重构图(reframe)。**多轨时间轴,一切仍可手动微调**;导出无水印。 |
| **技术栈** | 未公开(闭源 SaaS)。云端推理。无自托管、无本地模型选项。 |
| **集成面** | **唯一对外接口 = 云端 MCP**:`https://api.chatcut.io/api/external-mcp/mcp`。官方开源了 `ChatCut-Inc/agent-plugin`(见候选 B)让 agent 平台(Codex)挂载。**无公开 REST API / 无 SDK / 无 CLI / 无 self-host**。Agent 可执行:导入媒体、改时间轴、生成 motion graphics、生成素材、转写、加字幕、导出。auth 由宿主 agent(Codex)走 ChatCut 账号登录流程处理。 |
| **License / 商用嵌入** | **专有闭源**。要用它的能力=你的用户注册 ChatCut 账号、素材上云、按 credit 付费。**不能把它「嵌进」你的桌面应用**(顶多在你的 agent 里挂它的 MCP,数据仍在它云上)。 |
| **定价** | 免费 25 credit(免信用卡);$25/月=100 credit;$100/月=400 credit。导出**均无水印**。 |
| **链接** | https://chatcut.io/ ; docs https://chatcut.io/docs/editor-overview ; plugin 页 https://chatcut.io/chatgpt-plugin |

> 注:另有 CapCut 的「Transcript Editing」功能(capcut.com)——同类转写式剪辑,但同样是闭源消费级产品,不可嵌入,不展开。

### 候选 B:ChatCut-Inc/agent-plugin — 官方 Codex 插件(MCP wrapper)

| 维度 | 事实 |
|---|---|
| **是什么** | ChatCut 官方开源的 **Codex 插件**,让 AI agent 编辑 ChatCut 项目。**本质是个 MCP client 配置 + 一组 workflow skill**,不含剪辑引擎本体。 |
| **技术栈** | JavaScript 100%。关键文件 `chatcut/.codex-plugin/plugin.json`。连的还是云端 MCP `api.chatcut.io/api/external-mcp/mcp`。 |
| **能力** | 暴露给 agent 的 prompt 级操作:导入视频、生成配音+配乐、转写+加字幕、导出项目等。 |
| **License** | **无 LICENSE 文件**(`gh api .../license` → 404)= 默认保留所有权利,**不建议直接复用代码**;但它示范了「agent↔ChatCut 走 MCP」的接法,有参考价值。 |
| **链接** | https://github.com/ChatCut-Inc/agent-plugin ; org https://github.com/ChatCut-Inc |

**小结**:ChatCut 生态里没有任何可自托管/可嵌入的东西。要么用它的云 SaaS(挂 MCP),要么换开源件自建。以下是开源替代。

### 候选 C:wenkipan/Mr.Director — 明确自称「chatcut 开源替代」(参考,非可嵌入)

| 维度 | 事实 |
|---|---|
| **是什么** | GitHub 描述原文:`opensource alternative to chatcut/nemovideo. Edit videos just by typing.`「LLM as Director」——自然语言描述剪辑意图→AI 先出完整剪辑 plan→用户确认→执行。 |
| **核心能力** | Gemini 多模态理解场景/节奏/风格;**本地 Whisper 转帧级逐字稿(~100ms 精度)**;自然语言生成 clip;原子操作批量编辑 + 自动回滚;Remotion 实时预览;**plan 确认工作流**;导出 MP4 / OTIO / FCPXML。 |
| **技术栈** | 前端 TS/React + Remotion(时间轴渲染,WebGPU 导出);后端 Python(`main.py` / `video_agent` / `pyproject.toml`);依赖 Node18+ / Python3.11+ / FFmpeg;LLM 走 Gemini 或 OpenAI 兼容端点(DeepSeek/Qwen/OpenRouter);ASR=本地 Whisper。本地优先,不强制上云。 |
| **成熟度 / License** | **26 stars,README 自述「懒狗…现在代码都是 vibecoding」= 个人 vibecoded 项目**;**无 LICENSE 文件**(404)→ 默认「保留所有权利」,**法律上不可商用/嵌入**。**结论:当灵感/架构参考,别搬代码。** |
| **链接** | https://github.com/wenkipan/Mr.Director |

### 候选 D:Ekaanth/OpenCut-AI — MIT、可嵌入的开源 AI 视频编辑器 ⭐推荐参考

| 维度 | 事实 |
|---|---|
| **是什么** | `Open-source AI video editor. Transcribe, edit by text, clone voices, and generate visuals. Runs locally.` 自托管,能力最接近 ChatCut 的开源件。132 stars,活跃(2026-07-14 仍在更新)。 |
| **核心能力** | **Edit by text(转写后像编辑文档一样剪视频)**;filler 词删除、静音检测、场景检测、调色、smart reframe(带人脸跟踪)、绿幕;**自动字幕带说话人标签**;声音克隆(6s 样本)+ 多语 TTS;SD 生图 + 多模型生视频;engagement 评分、A/B 封面、YouTube chapters 导出。 |
| **技术栈** | 前端 Next.js(TS 81%)+ 后端 FastAPI(Python 17%);Whisper 转写 + FFmpeg;Docker Compose(Postgres + Redis)。CPU/NVIDIA GPU 均可。本地跑(dev :3000 / prod :3100)。 |
| **License** | **MIT** ✅ 可自由复用/改/嵌入商用桌面应用。 |
| **链接** | https://github.com/Ekaanth/OpenCut-AI ;上游 https://github.com/opencut-app/opencut(MIT,**68.8k stars** 的 CapCut 开源替代,纯时间轴编辑器,可当 UI 基座) |

### 候选 E:m-bain/whisperX — 字幕**词级校准**的开源引擎 ⭐直击痛点②

| 维度 | 事实 |
|---|---|
| **是什么** | Faster-Whisper + **wav2vec2 强制对齐(forced alignment)** + pyannote 说话人分离,一条 pipeline。 |
| **核心能力** | **词级时间戳(sub-100ms)** + diarization + 长音频批量推理。直接产出精准到词的时间码——正是「字幕校准」缺的那一层。 |
| **技术栈** | Python;依赖 faster-whisper + wav2vec2 对齐模型 + pyannote;本地可跑。 |
| **License** | **BSD-2** ✅ 可商用嵌入。 |
| **链接** | https://github.com/m-bain/whisperX |

---

## 2. 契合度评估(对用户三诉求各能解决多少)

本仓现状(grep 反证,`backend/src/modules/ai-runtime/` 与 `projects/`):
- **已有** 可配 ASR 抽象 `transcribeAudio`(经 `MultimodalProviderRegistry` 注入,T-030)、`srt.ts`(SRT 解析/校验/吸附,「时间真值层」)、`transcript-artifact.ts`(逐字稿存储)、copilot 聊天面。
- **关键结构性事实**:字幕/时间轴真值是 **SRT 行级**(`SrtLine{startSec,endSec,text}`),**所有 AI 插点吸附 SRT 行首**——**没有词级时间戳、没有强制对齐**。渲染走 **GSAP**(前后端均 `gsap ^3.12.5`),**无 Remotion**。

| 用户诉求 | ChatCut(SaaS) | 可嵌入开源组合 | 判断 |
|---|---|---|---|
| **① 文字重合**(字幕/文字在画面上叠一起) | 有 20+ 字幕风格模板 + motion graphics 布局,能规避;但你得整条素材上它云、用它的渲染器,**修不了我们自己的 GSAP 渲染** | 这是**本仓 GSAP 字幕排版/避让**问题,不是 ASR 问题。开源件不直接给,但 OpenCut-AI 的 caption 布局逻辑可参考 | **属渲染层,自修**。ChatCut 帮不上(除非整体换成它)。优先级:改 GSAP 字幕 layout(测量文本框 + 行/块避让 + 安全区)。 |
| **② 字幕校准不对**(时间轴对不准) | 它「每词映射到精确帧」,校准是强项——但仍需素材上云 | **WhisperX 词级强制对齐** 直击:把现有 SRT 行级真值升级为**词级**时间码,插点/字幕吸附到词而非行 | **开源件完胜且合定位**。根因=本仓只有行级 SRT。引入 WhisperX(或让 `transcribeAudio` provider 返回 word timestamps)即根治。 |
| **③ 对话式剪辑**(聊天框里改文字=改视频) | 这是 ChatCut **看家本领**,产品级成熟 | Mr.Director/OpenCut-AI 已证明开源可做:逐字稿↔时间轴双向绑定 + LLM 出 plan→确认→执行原子操作 | **理念完全契合**,且本仓已有 copilot 聊天面 + 逐字稿 + SRT 真值层,**离「transcript-edit」只差一层映射 UI/端口**,不必外接 ChatCut。 |

---

## 3. 集成路径

### 3A. 直接集成 ChatCut(SaaS)——技术可行但不合定位

- **怎么接**:本仓已是「agent 决策 + MCP 工具」架构,理论上可把 `api.chatcut.io/api/external-mcp/mcp` 当一个远程 MCP server 挂进来(Pi/copilot 调它导入/转写/加字幕/导出)。参考 `ChatCut-Inc/agent-plugin` 的接法。
- **硬阻塞**:
  1. **数据出境**:用户全部素材必须上传到 ChatCut 云——直接违反本仓「服务端接管无 CDN / 数据归属用户 / 本地优先桌面」定位(见 `docs/产品定位.md`、memory `controlled-agentic-runtime-direction`)。
  2. **账号 + credit 计费**:每个用户要自己有 ChatCut 账号并付费;你无法替他托管。
  3. **不修自家管线**:①「文字重合」是本仓 GSAP 渲染问题,挂 ChatCut 治不了(除非放弃自渲染、整条产线迁到 ChatCut)。
  4. **无 self-host / 无 SDK / license 专有**:不能库级嵌入,只能远程调。
- **适用场景**:仅当你愿意做「导出到 ChatCut 精修」的可选外链,不作为核心剪辑引擎。

### 3B. 和 Pi 怎么配合(用户设想的组合)

- 用户设想「Pi 当决策/编排层、ChatCut 当执行工具」——**架构上成立**(Pi 走 MCP,ChatCut 出 MCP),符合 T-256「agent 决策 · 确定性端口执行」的分层。
- **但** 若执行工具=ChatCut SaaS,则「确定性端口」落在**第三方云**上,不可控、要联网、数据出境——与 T-256「服务端接管、弱模型退确定性、数据归属用户」相悖。
- **更合理的同构方案**:**Pi/copilot 当决策层不变,执行层换成「本地 transcript-edit 端口」**——即把「删这句/挪这段/去 filler/字幕对齐」做成一组**确定性本地端口**(输入:逐字稿编辑意图 + 词级时间戳;输出:时间轴 diff → GSAP 渲染),LLM 只出意图、端口确定性执行。这正是 ChatCut 的「plan→确认→原子操作」范式,但跑在本地、数据不出境。ChatCut 的 MCP 工具清单(导入/转写/字幕/motion/导出)可当**端口设计的参考蓝本**。

### 3C. 推荐落地路径(合定位、最省事,按 ROI 排序)

1. **治②字幕校准(根因,收益最大)**:让 `transcribeAudio` 的 provider 产出**词级时间戳**(接 WhisperX,或换支持 word-timestamp 的 ASR),把 `srt.ts` 真值层从行级扩到**词级**,AI 插点/字幕吸附到词。BSD-2,可嵌入 Node sidecar(Python 子进程或本地服务)。
2. **治①文字重合**:改 GSAP 字幕渲染——文本测量 + 多行/多块避让 + 安全区约束;参考 OpenCut-AI(MIT)的 caption 布局。纯前端/渲染活,不依赖外部服务。
3. **上③对话式剪辑**:在现有 copilot 聊天面 + 逐字稿 + 词级 SRT 之上,做「逐字稿↔时间轴双向绑定」+ 一组**确定性剪辑端口**(删句/删词/去 filler/静音/重排),LLM 出 plan→用户确认→端口执行。范式抄 ChatCut/Mr.Director,代码可借 OpenCut-AI(MIT)。
- **嵌入形态**:全部走**本地 Node sidecar**(现有 Tauri sidecar 架构),WhisperX 以本地 Python 服务/子进程接入(本仓已有 ffprobe 探针先例)。**无需外部 SaaS、无 CDN、数据不出境**。

---

## 4. 可嵌入替代方案汇总(若不接 ChatCut SaaS)

| 方案 | 解决 | License | 嵌入形态 | 备注 |
|---|---|---|---|---|
| **WhisperX** | 字幕**词级对齐**(诉求②根治) | **BSD-2** ✅ | 本地 Python 服务/子进程,接 `transcribeAudio` provider | 直击本仓「只有行级 SRT」的结构性缺口;首选。 |
| **OpenCut-AI (Ekaanth)** | edit-by-text / 字幕带说话人 / filler·静音·场景检测 / smart reframe | **MIT** ✅ | 代码可借用(转写式剪辑逻辑、caption 布局);或整站自托管当参考实现 | 能力最接近 ChatCut 的开源件,活跃(132⭐)。可借它的 transcript-edit 与字幕布局代码。 |
| **opencut-app/opencut(上游)** | 多轨时间轴编辑器 UI 基座 | **MIT** ✅ | 前端组件参考 | 68.8k⭐,纯 CapCut 替代(非 AI/非转写),要 transcript-edit 得自己加。 |
| **Mr.Director** | 「LLM as Director」plan→确认→原子操作范式 | **无 license**(不可商用) ❌ | 仅读架构/PRD 当灵感 | vibecoded 个人项目,别搬代码。 |
| **ChatCut SaaS(经 MCP)** | 全套转写式剪辑,产品级 | 专有 ❌ 嵌入 | 只能远程挂 MCP,数据上云 | 与本项目本地优先定位冲突;仅宜作可选外链。 |

> 说明:字幕对齐领域还有 aeneas / gentle / stable-ts 等强制对齐/词级时间戳工具,但 **WhisperX 是当前生产级、社区最成熟、且自带 diarization** 的一站式选择,优先它。

---

## 附:证据来源

- ChatCut 官方:https://chatcut.io/ · https://chatcut.io/features · https://chatcut.io/docs/editor-overview · https://chatcut.io/chatgpt-plugin(官网页 Cloudflare 403,内容取自搜索快照)
- ChatCut 官方 agent 插件:https://github.com/ChatCut-Inc/agent-plugin(MCP 端点 `https://api.chatcut.io/api/external-mcp/mcp`)
- 融资/背景:https://www.techedt.com/chatcut-secures-us1-35-million-to-reinvent-video-editing-with-conversational-ai
- 第三方评测:https://www.toolworthy.ai/tool/chatcut · https://moge.ai/product/chatcut
- 开源替代:https://github.com/wenkipan/Mr.Director(无 license,26⭐) · https://github.com/Ekaanth/OpenCut-AI(MIT,132⭐) · https://github.com/opencut-app/opencut(MIT,68.8k⭐)
- 字幕对齐:https://github.com/m-bain/whisperX(BSD-2)
- 本仓反证:`backend/src/modules/ai-runtime/srt.ts`(SRT 行级真值层)、`transcribe-runner.test.ts`(`transcribeAudio` 可配 ASR 抽象)、`backend/src/modules/projects/transcript-artifact.ts`(逐字稿存储)、`frontend/package.json` & `backend/package.json`(`gsap ^3.12.5`,无 Remotion/Whisper 依赖)
