# PROJECT.md — 项目活记忆(新会话先读这一个文件)

> 本文件由 `node orchestrator/process/pmem.mjs sync` 生成,**勿手改生成段**。
> 人写的「定位/为什么」改 pmem.mjs 顶部常量与 SYSTEM_ARCHITECTURE.md。

LAST_SYNCED: main @ 25690757

## 这是什么(定位)

CreatorOS —— 一个编导式的自媒体内容生产系统(非项目管理工具),核心是「越用越准的编导智能体」:出选题、起草文案与结构、管素材,发布后采集真实表现回流校准。项目主干两阶段:脚本(选题/脚本/素材/发布动作一体)→ 复盘(数据对照/经验沉淀);研究/策划/制作不再是独立阶段。护城河=飞轮复利(盲预测→发布→采集→对照偏差→沉淀经验→回流)。pnpm monorepo(frontend Next.js / backend 库 / contract zod / worker)。

物理架构与依赖规则见 [orchestrator/SYSTEM_ARCHITECTURE.md](orchestrator/SYSTEM_ARCHITECTURE.md)。
正在进行:彻底重构,见 [docs/superpowers/specs/2026-06-29-creatoros-refactor-design.md](docs/superpowers/specs/2026-06-29-creatoros-refactor-design.md)。

## 重构进度:物理架构边界(门卫)

剩余违规 **5** 条(目标 0,随 Phase 2 消减):

- 4 × `R2-no-agent-sdk-in-frontend-pages`
- 1 × `R3-no-cross-module-repository-import`

查实时:`node orchestrator/process/boundary-scan.mjs`

## 开放任务(欠债)

- [wip] T-663 内置“薛辉·怎么做 IP”课程并重做知识库课程阅读体验，完成双平台安装包【知识课程·发布·用户 2026-08-02】
- [wip] T-662 根治成片把内部结构标签当正文并优化卡片文字重合【视频内容质量·用户 2026-08-02】
- [wip] T-661 根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名【制作闭环·用户 2026-08-02】
- [wip] T-660 根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失【项目状态回显·用户 2026-08-02】
- [wip] T-657 根治定位前采二次联网搜索串用旧结果，并默认国内中文来源优先【搜索体验·用户 2026-08-02】
- [wip] T-656 收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点【安全加固·用户 2026-08-02】
- [wip] T-655 接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider【文生视频阻断·用户 2026-08-02】
- [wip] T-654 新增 Qwen 方言 ASR 适配器并接入设置预设【逐字稿质量·用户 2026-08-02】
- [open] T-653 支持本地自配与渠道子 Key 托管双模式模型供给【模型商业化·跨仓·用户 2026-08-02】
- [wip] T-652 重构定位前采为必经的编导式访谈与证据辅助工作流【定位业务流·用户 2026-08-01】
- [wip] T-650 知识倾倒输入框支持拖拽文件直接导入【知识录入体验·用户 2026-08-01】
- [wip] T-651 内容雷达默认按作品真实发布时间倒序【排序语义·用户 2026-08-01】
- [open] T-649 调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界【商业渠道·跨仓·用户 2026-08-01】
- [wip] T-646 统一优化结构化 AI 工具为结果优先、分段生成与局部修复【性能与可靠性·用户 2026-08-01】
- [wip] T-645 收敛模型配置项并同步精简 Growth 渠道模板【设置体验·跨仓配置·用户 2026-08-01/02】
- [wip] T-644 根治 CreatorOS macOS 客户端持续闪屏【运行态阻断·用户 2026-08-01】
- [open] T-643 收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口【商业激活主线·用户 2026-08-01】
- [wip] T-642 打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链【产品链路·用户 2026-08-01/02】
- [wip] T-641 根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”【线上数据回流·用户 2026-07-31】
- [wip] T-640 配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包【发布·用户 2026-07-31】
- [wip] T-635 把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签
- [wip] T-633 根治内容雷达生成选题卡失败并恢复创作者中心自动扫码【线上阻断·用户 2026-07-30】
- [wip] T-632 根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果【线上阻断·用户 2026-07-30/31】
- [wip] T-631 根治大视频上传被 10MB 截断并误报 ffmpeg 缺失【线上阻断·用户 2026-07-30】
- [open] T-621 补齐渠道模型 authority snapshot 生产链路回归【非阻断测试增强·T-606 复核】
- [wip] T-576 统一跟进尚未关闭的飞书线上用户反馈【线上支持】
- [wip] T-575 接通 CreatorOS 权益领取、渠道配置与问题反馈【跨系统上线闭环】
- [wip] T-562 根治 CreatorOS 0.2.0 Windows 安装后持续白屏【发布阻断】
- [wip] T-548 根治视频渲染重试后成片脱离项目且制作页实时预览消失【发布阻断·用户 2026-07-26】
- [wip] T-538 接通渠道签名上下文的产品问题反馈【跨仓契约·上线闭环】
- [wip] T-536 根治“我的收藏”同步错误分类与浏览器档案锁恢复【bug·多账号采集·用户 2026-07-26】

任务真相：`BACKLOG.md`；查看可执行任务：`node orchestrator/process/pmem.mjs tasks`。

## 模块地图(生成自 backend/src/modules)

`ai` · `ai-runtime` · `analytics` · `artifacts` · `assets` · `benchmark` · `browser-sessions` · `calibration` · `candidate` · `content-calendar` · `execution` · `favorites` · `identity` · `ingestion` · `intelligence` · `knowledge` · `learnings` · `material-links` · `notifications` · `platform-account` · `positioning` · `production` · `projects` · `publishing` · `query-services` · `review` · `reviews` · `scheduling` · `search` · `settings` · `taxonomy` · `topic-attribution` · `trend-sources`

