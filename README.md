<a id="readme-top"></a>

<!--
*** README 基于 othneildrew/Best-README-Template 结构改写。
*** 徽章用 reference-style 链接,定义集中在文件末尾。
-->

<!-- PROJECT SHIELDS -->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![Desktop][desktop-shield]][desktop-url]

<!-- PROJECT LOGO -->
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
    <a href="BACKLOG.md">任务看板</a>
    &middot;
    <a href="docs/superpowers/specs/">设计 SPEC</a>
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
        <li><a href="#技术栈">技术栈</a></li>
      </ul>
    </li>
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

**CreatorOS** 是一款面向中文自媒体创作者(观点视频 / 口播 / 短视频为主)的**本地桌面应用**。核心理念:产品是「编导」不是「表单填写机」——**能 AI 干的让 AI 干,人只审 / 改 / 删**。

生产流水线是**两阶段**的:

> **脚本(稿面:选题 / 脚本 / 素材 / 发布动作一体)→ 复盘(数据对照 / 经验沉淀)。**

几条不可违背的原则:

- **AI 只产候选,人确认关键产物**(确认门:AI 不直接写领域实体)。
- **每轮 AI 输出被 Zod schema 约束**,防发散,跨模型稳定。
- **复盘必须反向沉淀经验**,回流到选题 / 定位 / 校准,而不只看数据。
- **多模态模型用户可配**(生图 / 生视频走 model-config,绝不写死某家)。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

### 核心价值:飞轮复利

护城河是**「越用越准」**:

```
盲预测 → 发布 → 采集真实表现 → 对照偏差 → 沉淀经验 → 回流让下一条更准
```

创作者的**真实已发布作品 + 播放 / 评论 + 创作链**被导入为历史项目(`source: imported`),成为飞轮的真实记忆与创作来源库,同时喂:校准复盘、选题、定位、知识库、首页驾驶舱。数据是别人拿不走的资产。

### 技术栈

[![Tauri][tauri-shield]][tauri-url]
[![Next.js][next-shield]][next-url]
[![React][react-shield]][react-url]
[![TypeScript][ts-shield]][ts-url]
[![PGlite][pglite-shield]][pglite-url]
[![Playwright][playwright-shield]][playwright-url]

- **桌面壳**:Tauri(Rust core)+ WKWebView,退出即关 sidecar。
- **应用 sidecar**:Next.js standalone(`frontend/` + `backend/` + `ai-worker/` 打进同一进程)。
- **本地数据库**:PGlite(单机、单写、落盘)。除 LLM API 外全本地。
- **AI 运行时**:Vercel AI SDK,模型经 model-config 用户可配;全 `runStructuredNode` 结构化输出。
- **视频渲染**:HyperFrames(HTML + GSAP → headless Chromium 帧捕获 + ffmpeg 编码)。
- **数据采集**:Playwright `launchPersistentContext`(复用扫码登录态,抓抖音作品 / 评论 / 收藏夹 / 黑马雷达)。
- **Monorepo**:pnpm workspace(`frontend` / `backend` / `contract` / `ai-worker` / `mcp-server`)。

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
```

> ⚠️ **PGlite 单写**:同一时刻**只能有一个** CreatorOS 实例连数据库。别让 `dev server` 与打包 app 同时跑(它们连同一个库,并发会写坏)。详见 [pitfalls.md](docs/engineering-notes/pitfalls.md)。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 架构

```
Thirdspace-creator/
├── frontend/     Next.js 应用 + Tauri 桌面壳(src-tauri/)+ 打包脚本(scripts/desktop/)
├── backend/      领域服务:projects / candidate / analytics / assets / execution / ai-runtime …
├── contract/     ts-rest 契约(resources + operations),前后端单一真值
├── ai-worker/    AI 提示词模板 / skill(script-draft / video-decisions …)
├── mcp-server/   MCP 接入
└── docs/         产品定位(宪法) · SPEC · 工程坑册 · 研究归档
```

数据流:`WebView ──HTTP──► sidecar 进程内库调 backend / ai-worker ──► PGlite 落盘`。执行层「脑手分离」:AI 决策产候选(`awaiting_confirmation`)→ 人过确认门 → 落领域实体。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## Roadmap

- [x] 两阶段项目(脚本稿面 / 复盘)+ 确认门
- [x] 编导对话化 ChatBox(上下文注入 skill + Zod 约束输出)
- [x] 数据底座:真实作品导入(`source: imported`)+ 抖音采集(作品 / 评论 / 收藏夹)
- [x] 视频生产:HyperFrames 渲染(横 / 竖版 · 富动画 · 口播构图 · 成片预览)
- [x] 多模态模型用户可配(model-config)
- [ ] 飞轮闭环补链(复刻环 · 归因公式回流 · 复盘经验自动晋级)
- [ ] 受控自主运行时(自主循环交专门引擎)

已知任务与进度见 [BACKLOG.md](BACKLOG.md)(单一执行真相)。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 贡献

本仓遵循「SPEC → 拆 Task 进 BACKLOG →(改架构的)过审 → 开工」的流程铁律(详见 [CLAUDE.md](CLAUDE.md))。

1. 从 `BACKLOG.md` 顶取任务,读它引用的 SPEC
2. 开工把任务改 🔨,一次从 0 到 1 做完(禁多阶段减法)
3. 改服务端 / skill 后**必须重启 + 真机复测**那条行为(单测过 ≠ live 生效)
4. 完成改 ✅ 并提交;任务边界 checkpoint + `codegraph index --force` 重建索引

检索代码优先 codegraph CLI(`codegraph query <sym> -j`),grep 只兜底字面量。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## License

暂未指定开源 License(私有项目)。如需开放,请在根目录补 `LICENSE` 文件并更新本节。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

## 致谢

- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) —— 本 README 的结构模板
- [Tauri](https://tauri.app) · [Next.js](https://nextjs.org) · [PGlite](https://pglite.dev)
- [HyperFrames](https://www.npmjs.com/package/hyperframes)(Apache-2.0,视频渲染引擎)
- [GSAP](https://gsap.com) · [Playwright](https://playwright.dev) · [ffmpeg](https://ffmpeg.org)
- [Img Shields](https://shields.io) · [Vercel AI SDK](https://sdk.vercel.ai)

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/zzyong24/Thirdspace-creator.svg?style=for-the-badge
[contributors-url]: https://github.com/zzyong24/Thirdspace-creator/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/zzyong24/Thirdspace-creator.svg?style=for-the-badge
[forks-url]: https://github.com/zzyong24/Thirdspace-creator/network/members
[stars-shield]: https://img.shields.io/github/stars/zzyong24/Thirdspace-creator.svg?style=for-the-badge
[stars-url]: https://github.com/zzyong24/Thirdspace-creator/stargazers
[issues-shield]: https://img.shields.io/github/issues/zzyong24/Thirdspace-creator.svg?style=for-the-badge
[issues-url]: https://github.com/zzyong24/Thirdspace-creator/issues
[desktop-shield]: https://img.shields.io/badge/desktop-macOS%20(Tauri)-black.svg?style=for-the-badge
[desktop-url]: https://tauri.app
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
