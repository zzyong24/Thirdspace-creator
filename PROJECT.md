# PROJECT.md — 项目活记忆(新会话先读这一个文件)

> 本文件由 `node orchestrator/process/pmem.mjs sync` 生成,**勿手改生成段**。
> 人写的「定位/为什么」改 pmem.mjs 顶部常量与 SYSTEM_ARCHITECTURE.md。

LAST_SYNCED: main @ 98c9dad5

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

