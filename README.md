<a id="readme-top"></a>

<!--
*** README 基于 othneildrew/Best-README-Template 结构改写。
*** 仓库为私有,GitHub 动态徽章(stars/forks/…)取不到 → 用静态徽章。
*** 徽章用 reference-style 链接,定义集中在文件末尾。
-->

<!-- PROJECT SHIELDS(静态,私有仓也能渲染) -->
[![Status][status-shield]][status-url]
[![Platform][platform-shield]][platform-url]
[![Node][node-shield]][node-url]
[![pnpm][pnpm-shield]][pnpm-url]
[![License][license-shield]][license-url]

<!-- PROJECT LOGO / HEADER -->
<br />
<div align="center">
  <h1 align="center">CreatorOS</h1>

  <p align="center">
    一个<strong>编导式</strong>的自媒体内容生产系统 —— 不是项目管理工具,而是一个<strong>越用越准的「编导智能体」</strong>。
    <br />
    它替创作者出选题、起草文案与结构、管素材;发布后采集真实表现回流校准,让下一条内容更准。
    <br />
    <br />
    <a href="docs/产品定位.md"><strong>产品定位(宪法) »</strong></a>
    &middot;
    <a href="#功能特性">功能特性</a>
    &middot;
    <a href="#快速开始">快速开始</a>
    &middot;
    <a href="BACKLOG.md">任务看板</a>
    &middot;
    <a href="docs/engineering-notes/pitfalls.md">工程坑册</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>目录</summary>
  <ol>
    <li>
      <a href="#关于项目">关于项目</a>
      <ul>
        <li><a href="#核心价值飞轮复利">核心价值:飞轮复利</a></li>
        <li><a href="#不可违背的原则">不可违背的原则</a></li>
        <li><a href="#技术栈">技术栈</a></li>
      </ul>
    </li>
    <li>
      <a href="#功能特性">功能特性</a>
      <ul>
        <li><a href="#界面导航九大模块">界面导航(九大模块)</a></li>
        <li><a href="#关键能力">关键能力</a></li>
      </ul>
    </li>
    <li><a href="#核心设计">核心设计</a></li>
    <li>
      <a href="#快速开始">快速开始</a>
      <ul>
        <li><a href="#前置依赖">前置依赖</a></li>
        <li><a href="#安装">安装</a></li>
      </ul>
    </li>
    <li><a href="#使用">使用</a></li>
    <li><a href="#架构">架构</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#贡献">贡献</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#致谢">致谢</a></li>
  </ol>
</details>

## 关于项目

**CreatorOS** 是一款面向中文自媒体创作者(观点视频 / 口播 / 短视频为主)的**本地桌面应用**。它把内容生产从"靠感觉"变成"有方法":用一个上下文感知的**编导智能体**贯穿选题 → 起草 → 素材 → 发布 → 复盘,并在每次发布后用真实数据回流校准。

目标用户是持续产出、在意数据、想把创作方法沉淀下来的个人或小团队。核心理念:产品是「编导」不是「表单填写机」——**能 AI 干的让 AI 干,人只审 / 改 / 删**。

生产流水线是**两阶段**的:

> **脚本(稿面:选题 / 脚本 / 素材 / 发布动作一体)→ 复盘(数据对照 / 经验沉淀)。**

研究 / 策划 / 制作不再是独立阶段(职能由稿面的选题卡、弹药区承载);发布是稿面上的动作(盲预测 / 登记已发布)而非阶段。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

### 核心价值:飞轮复利

护城河是**「越用越准」**:

```
盲预测 → 发布 → 采集真实表现 → 对照偏差 → 沉淀经验 → 回流让下一条更准
```

创作者的**真实已发布作品 + 播放 / 评论 + 创作链**被导入为历史项目(`source: imported`),成为飞轮的真实记忆与创作来源库,同时喂:校准复盘、选题(评论需求 / 爆款经验)、定位(数据反推)、知识库(可复用 Hook / 金句)、首页驾驶舱。**数据是别人拿不走的资产。**

### 不可违背的原则

1. **每个项目必须有 Brief。**
2. **每个阶段必须有明确交付物,前一阶段产物自动流入下一阶段**(SEAM 接缝)。
3. **AI 只产候选,人确认关键产物**(确认门:AI 不直接写领域实体)。
4. **每轮 AI 输出被 Zod schema 约束**,防发散、跨模型稳定。
5. **复盘必须反向沉淀经验**,回流到选题 / 定位 / 校准,而不只看数据。
6. **多模态模型用户可配**(生图 / 生视频走 model-config,绝不写死某家)。

### 技术栈

[![Tauri][tauri-shield]][tauri-url]
[![Next.js][next-shield]][next-url]
[![React][react-shield]][react-url]
[![TypeScript][ts-shield]][ts-url]
[![PGlite][pglite-shield]][pglite-url]
[![Playwright][playwright-shield]][playwright-url]
[![Vitest][vitest-shield]][vitest-url]

| 层 | 选型 | 说明 |
|---|---|---|
| 桌面壳 | **Tauri**(Rust core)+ WKWebView | 退出即关 sidecar;`server.app`(LSUIElement)后台隐身 |
| 应用 sidecar | **Next.js** standalone | `frontend` + `backend` + `ai-worker` 打进同一 Node 进程 |
| 本地数据库 | **PGlite** | 单机、单写、落盘;除 LLM API 外全本地 |
| 契约 | **ts-rest** + **Zod** | `contract/` 前后端单一真值,resources + operations |
| AI 运行时 | **Vercel AI SDK** | 模型经 model-config 用户可配;全 `runStructuredNode` 结构化输出 |
| 视频渲染 | **HyperFrames** + **GSAP** + **ffmpeg** | HTML+GSAP → headless Chromium 帧捕获 → ffmpeg 编码 |
| 数据采集 | **Playwright** | `launchPersistentContext` 复用扫码登录态,抓抖音 |
| 包管理 | **pnpm** workspace | `frontend` / `backend` / `contract` / `ai-worker` / `mcp-server` |

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 功能特性

### 界面导航(九大模块)

| 模块 | 做什么 |
|---|---|
| 🏠 **首页** | 驾驶舱:总播放 / 点赞 / 粉丝 / 完播率概览、继续创作、待办、热门选题、数据趋势、创作建议 |
| 🎯 **定位中心** | 账号定位(宪法级单一真值)+ 用数据反推 / 演进定位 |
| 💡 **选题** | 选题池(candidate)+ 每日出题 + 黑马雷达 + 收藏夹跟拍;按预测分 / 契合度排序 |
| 📁 **项目** | 两阶段项目(脚本稿面 / 复盘);历史作品导入为 `imported` 项目 |
| 📚 **知识库** | 可复用 Hook / 金句 / 方法论沉淀 + 知识图谱可视化 |
| 🗂️ **素材中心** | 本地素材库:图片 / 视频 / 音频 / 字幕;视频真首帧缩略 + 内联播放 + 真时长(ffprobe) |
| 🚀 **发布中心** | 多平台发布物料(标题 / 简介 / 标签 / 封面)+ 发布登记 |
| ⏰ **自动化** | 定时采集 / 每日出题等后台任务 |
| ⚙️ **设置** | 账户 / 偏好 / 外观(主题) / 模型配置 / 存储 |

### 关键能力

- **编导 ChatBox** — 上下文感知的多轮对话:按当前页面 / 按钮注入对应 skill + 提示词 + 真实数据底座;AI 功能工具化、结果渲进对话、走采纳门。
- **稿面工作台** — 立论点树、脚本起草(叙事纪律:真实场景开场 / 前因后果链 / 概念首次解释 / 素材不足不编)、素材弹药区、盲预测(immutable 日志)。
- **视频生产** — HyperFrames 渲染:横版 16:9 / 竖版 9:16 双支持、口播人脸进框(不裁)、富动画(对比条 / 数字递增 / 进度式揭示 / 建立→推翻)、B-roll 素材匹配、双语字幕、成片产出框内联预览。
- **抖音数据采集** — 复用扫码登录态,抓作品明细 / 评论 / 收藏夹跟拍 / 黑马雷达(搜索热度)。
- **复盘 / 校准** — rubric 打分 + 盲预测对照偏差 + 经验(learning)沉淀回流。
- **确认门执行层** — 脑手分离:AI 决策产候选(`awaiting_confirmation`)→ 人过确认门 → 落领域实体 / 入资产库。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 核心设计

- **确认门(HITL)** — AI 绝不直接写领域实体;所有关键产物走「候选 → 人采纳」。
- **SEAM 接缝** — 前一阶段交付物自动流入下一阶段,不断线不串台。
- **脑(决策)手(执行)分离** — 执行层任务在沙箱内跑(超时 + abort 贯通),产物收割后过确认门。
- **结构化 AI** — 全部节点 `runStructuredNode` + Zod schema 约束输出,弱模型(如 MiniMax)也稳。
- **飞轮回流** — 复盘经验有真实数据背书才自动晋级进生成,凭空 AI 推断留人工裁决。
- **模型可配** — 文本 / 生图 / 生视频模型全走 model-config,用户自选,不写死。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 快速开始

在本机跑起来(开发或打包桌面版)。

### 前置依赖

- **Node.js** `>=25 <26`(见根 `package.json` engines)
- **pnpm** `10.32.1`(`corepack enable` 即可)
- **ffmpeg / ffprobe**(视频渲染 + 素材时长探针必需):`brew install ffmpeg`
- **Rust + Tauri 工具链**(仅打包桌面版需要):见 [tauri.app](https://tauri.app) 环境准备
- **Chromium**:首次视频渲染 / 采集时按需下载,或随打包内置(见 `desktop:package`)

### 安装

1. 克隆仓库
   ```sh
   git clone https://github.com/zzyong24/Thirdspace-creator.git
   cd Thirdspace-creator
   ```
2. 安装依赖(pnpm workspace,一次装全包)
   ```sh
   corepack enable
   pnpm install
   ```
3. 起开发服务器(浏览器访问 sidecar)
   ```sh
   pnpm -C frontend dev
   ```

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 使用

```sh
# 开发:Web sidecar(热更新)
pnpm -C frontend dev

# 桌面开发态(Tauri + sidecar,带真实 webview)
pnpm -C frontend desktop:dev

# 打包桌面版 → CreatorOS.app / .dmg(含混淆 + 内置 Chromium + updater 占位)
pnpm -C frontend desktop:package
#   产物:frontend/src-tauri/target/release/bundle/macos/CreatorOS.app

# 测试 / 类型检查(各包)
pnpm -C frontend test        # vitest
pnpm -C frontend typecheck   # next typegen && tsc --noEmit
pnpm -C backend  test
pnpm -C ai-worker test

# 数据库(开发)
pnpm db:migrate              # 应用迁移
pnpm db:reset                # 重置本地库
```

> ⚠️ **PGlite 单写**:同一时刻**只能有一个** CreatorOS 实例连数据库。别让 `dev server` 与打包 app 同时跑(它们连同一个库,并发会写坏 → 库被改名 `db.corrupt-<ms>`)。详见 [pitfalls.md](docs/engineering-notes/pitfalls.md)。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 架构

```
Thirdspace-creator/                 pnpm workspace(monorepo)
├── frontend/     Next.js 应用 + Tauri 桌面壳(src-tauri/)+ 打包脚本(scripts/desktop/)
│                 · app/(creator)/  九大模块页面
│                 · features/       稿面 / 素材 / 复盘 / copilot …
│                 · server/         persistence-client(装配层,绑各领域 service)
├── backend/      领域服务:projects / candidate / analytics / assets / execution /
│                 ai-runtime(26+ AI runner)/ learnings / benchmark …
├── contract/     ts-rest 契约(resources + operations),前后端单一真值
├── ai-worker/    AI 提示词模板 / skill(script-draft / video-decisions …)
├── mcp-server/   MCP 接入
└── docs/         产品定位(宪法) · SPEC(superpowers/specs) · 工程坑册 · 研究归档
```

**运行时数据流:**

```
WebView ──HTTP──► sidecar(Next standalone)──进程内库调──► backend / ai-worker ──► PGlite 落盘
                                                    └────────────► LLM API(唯一出网)
```

- **执行层**(脑手分离):`execution.tasks.create` 后 `void runExecutionTask(...)` 后台跑,HTTP 立即返回,UI 轮询;任一失败诚实终态,绝不卡 running。
- **AI 决策**:四决策 / 多 runner 顺序编排,产候选 → `awaiting_confirmation` → 采纳落库。
- **检索**:codegraph 本地索引(`.codegraph/`,11k+ nodes),`codegraph query / callers / impact`。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## Roadmap

**已完成**

- [x] 两阶段项目(脚本稿面 / 复盘)+ 确认门 + SEAM 接缝
- [x] 编导对话化 ChatBox(上下文注入 skill + Zod 约束输出 + 采纳门)
- [x] 数据底座:真实作品导入(`source: imported`)+ 抖音采集(作品 / 评论 / 收藏夹 / 黑马雷达)
- [x] 选题:选题池 + 每日出题 + 黑马雷达 + 收藏夹跟拍 + 预测分 / 契合度排序
- [x] 稿面:立论点树 + 脚本起草(叙事纪律)+ 素材弹药 + 盲预测
- [x] 视频生产:HyperFrames 渲染 · 横 / 竖版 · 富动画 · 口播进框 · B-roll 匹配 · 成片预览
- [x] 素材中心:视频真首帧缩略 + 内联播放 + 真时长探针(ffprobe)+ Range 流式
- [x] 复盘 / 校准:rubric 打分 + 盲预测对照 + 经验沉淀
- [x] 多模态模型用户可配(model-config)
- [x] 桌面打包:Tauri + 内置 Chromium + JS 混淆 + updater 签名占位
- [x] 定位中心:定位生成 + 数据反推演进
- [x] 知识库 + 知识图谱可视化

**进行中 / 规划**

- [ ] 飞轮闭环补链:爆款拆解要素回流 · 归因可复用公式 capture · 复盘经验有数据背书自动晋级
- [ ] 受控自主运行时:三种循环分治,自主循环交专门引擎(agent 决策 · 确定性端口执行)
- [ ] 逐字稿可配 ASR · 作品明细多字段导出
- [ ] 多平台采集扩展(不止抖音)

> 完整任务与实时进度见 [BACKLOG.md](BACKLOG.md)(单一执行真相);设计决策落 [docs/superpowers/specs/](docs/superpowers/specs/)。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 贡献

本仓遵循「**SPEC → 拆 Task 进 BACKLOG →(改架构的)过审 → 开工**」的流程铁律(详见 [CLAUDE.md](CLAUDE.md)):

1. 从 `BACKLOG.md` 顶取任务,读它引用的 SPEC
2. 开工把任务改 🔨,一次从 0 到 1 做完(**禁 P0/P1 分级、禁多阶段减法**)
3. 改服务端 / skill 后**必须重启 + 真机复测**那条行为(单测过 ≠ live 生效,AI 行为尤甚)
4. 完成改 ✅ 并提交;任务边界 checkpoint + `codegraph index --force` 重建索引
5. 调研 / 踩坑归档:研究进 `docs/research/`,坑进 `docs/engineering-notes/pitfalls.md`

检索代码优先 codegraph CLI(`codegraph query <sym> -j`),grep 只兜底字面量、注释、配置值。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## License

暂未指定开源 License(**私有项目**)。如需开放,请在根目录补 `LICENSE` 文件并更新本节徽章。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 致谢

- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) —— 本 README 的结构模板
- [Tauri](https://tauri.app) · [Next.js](https://nextjs.org) · [PGlite](https://pglite.dev) · [ts-rest](https://ts-rest.com)
- [HyperFrames](https://www.npmjs.com/package/hyperframes)(Apache-2.0,视频渲染引擎)· [GSAP](https://gsap.com)
- [Playwright](https://playwright.dev) · [ffmpeg](https://ffmpeg.org) · [Vercel AI SDK](https://sdk.vercel.ai)
- [Shields.io](https://shields.io) · [Simple Icons](https://simpleicons.org)

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

<!-- MARKDOWN LINKS & IMAGES(静态徽章,私有仓也能渲染) -->
[status-shield]: https://img.shields.io/badge/status-active-success.svg?style=for-the-badge
[status-url]: BACKLOG.md
[platform-shield]: https://img.shields.io/badge/platform-macOS%20(Tauri)-black.svg?style=for-the-badge
[platform-url]: https://tauri.app
[node-shield]: https://img.shields.io/badge/node-%3E%3D25-339933.svg?style=for-the-badge&logo=nodedotjs&logoColor=white
[node-url]: https://nodejs.org
[pnpm-shield]: https://img.shields.io/badge/pnpm-10.32-F69220.svg?style=for-the-badge&logo=pnpm&logoColor=white
[pnpm-url]: https://pnpm.io
[license-shield]: https://img.shields.io/badge/license-proprietary-lightgrey.svg?style=for-the-badge
[license-url]: #license
[tauri-shield]: https://img.shields.io/badge/Tauri-24C8DB?style=for-the-badge&logo=tauri&logoColor=white
[tauri-url]: https://tauri.app
[next-shield]: https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white
[next-url]: https://nextjs.org
[react-shield]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[react-url]: https://react.dev
[ts-shield]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[ts-url]: https://www.typescriptlang.org
[pglite-shield]: https://img.shields.io/badge/PGlite-336791?style=for-the-badge&logo=postgresql&logoColor=white
[pglite-url]: https://pglite.dev
[playwright-shield]: https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white
[playwright-url]: https://playwright.dev
[vitest-shield]: https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white
[vitest-url]: https://vitest.dev
