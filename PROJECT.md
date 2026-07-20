# PROJECT.md — 项目活记忆(新会话先读这一个文件)

> 本文件由 `node orchestrator/process/pmem.mjs sync` 生成,**勿手改生成段**。
> 人写的「定位/为什么」改 pmem.mjs 顶部常量与 SYSTEM_ARCHITECTURE.md。

LAST_SYNCED: main @ 0c566266

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

- [open] T-007 (P2) 清 R2(31 处 AI SDK 前端泄漏)+ R3(跨模块 repo)
- [open] T-010 (P4) ~13 runner 迁移成 skill+工具,删孤儿 ai-worker 与旧 frontend/src/server/ai/*
- [open] T-011 (P5) 多模型按 capability(DeepSeek写文案/GPT做图/Claude推理)+ 即时可视化 spec
- [open] T-012 (P6) (后续 YAGNI)Redis+BullMQ 持久队列 + worker 独立进程 + DB 写属主收口
- [open] T-013 (SKILL) 房子图纸 gate + 门卫 + pmem + 大白话输出规则 promote 进 skill lab
- [wip] T-033 (P2) [Feature] 发布/项目列表默认只显示已通过:detail ingest 同步 platform_status 进 publications;listPublications 过滤 hidden_at + (platform_status='已通过' OR NULL),'显示已隐藏'开关打开才显所有(修 T-073 死按钮+加 status 维度)

全部任务:`node orchestrator/process/pmem.mjs tasks`

## 模块地图(生成自 backend/src/modules)

`ai` · `ai-runtime` · `analytics` · `artifacts` · `assets` · `benchmark` · `browser-sessions` · `calibration` · `candidate` · `content-calendar` · `execution` · `favorites` · `identity` · `ingestion` · `knowledge` · `learnings` · `material-links` · `notifications` · `platform-account` · `positioning` · `production` · `projects` · `publishing` · `query-services` · `review` · `reviews` · `scheduling` · `search` · `settings` · `taxonomy` · `topic-attribution` · `trend-sources`

