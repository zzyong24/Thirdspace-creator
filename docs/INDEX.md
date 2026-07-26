# docs/ 顶层导航索引

> 这是 `docs/` 目录的**导航索引**,不复述任何内容——只告诉你「哪份文档是什么、去哪找」。
> 真值分布在各文档里,本索引只做指路,避免造双真值。

## 单一真值(读任何设计/实现前先对照)

- **产品定位宪法 = [产品定位.md](产品定位.md)** —— 产品定位的**唯一真值**。所有 SPEC / 实现是否「合定位」以它为准。改方向/架构/数据归属须过 spec-review gate。
- **执行总账 = [../BACKLOG.md](../BACKLOG.md)**(repo 根)—— 任务队列看板,唯一执行真相。需求即任务,状态强制落此。
- **SPEC 审核台账 = [superpowers/specs/REVIEW_LEDGER.md](superpowers/specs/REVIEW_LEDGER.md)** —— 每份 SPEC 的 gate 裁决(PASS/CONCERNS/FAIL/未审)durable 状态。

## 设计规范(SPEC)

- **[superpowers/specs/](superpowers/specs/)** —— 全部设计规范落点。**先看 [superpowers/specs/INDEX.md](superpowers/specs/INDEX.md)**(按主题分组的顶层索引 + 一句话摘要 + 审核状态)。
- **[superpowers/plans/](superpowers/plans/)** —— 历史实施计划(stage 化流程遗留;当前流程不再产 task 级重计划,见 CLAUDE.md 铁律 6)。

## 核查 / 对齐

- **[product-audit/](product-audit/)** —— 产品与实现对齐核查。见 [product-audit/INDEX.md](product-audit/INDEX.md)、[product-audit/ALIGNMENT.md](product-audit/ALIGNMENT.md)。

## 产品 / 工作流

- [CreatorOS-产品评审与工作流重设计.md](CreatorOS-产品评审与工作流重设计.md)
- [CreatorOS-七步整合设计.md](CreatorOS-七步整合设计.md)
- [CreatorOS-module-and-workflow-map.md](CreatorOS-module-and-workflow-map.md) —— 功能模块与端到端链路地图。
- [product-walkthrough-report.md](product-walkthrough-report.md) —— 产品走查报告。

## 使用 / 配置指南

- [model-configuration-guide.md](model-configuration-guide.md) —— 模型配置教程(用户向)。
- [desktop-activation-guide.md](desktop-activation-guide.md) —— 桌面激活授权接入指南(T-147 P5)。
- [all-skill-prompts.md](all-skill-prompts.md) —— 全部内置提示词(skill 模板)导出快照。

## 数据 / 存储 / 运行时(历史设计,以现行 SPEC + 代码为准)

- [CreatorOS-data-model.md](CreatorOS-data-model.md) —— 数据地图:现状、全链路与修复后目标。
- [CreatorOS-运行时协同设计.md](CreatorOS-运行时协同设计.md) —— 运行时协同设计(历史稿)。

## 桌面端 / 部署 / 变更

- [desktop-architecture-rfc.md](desktop-architecture-rfc.md) —— 桌面端架构 RFC(另见 specs/2026-07-05-desktop-app-architecture-overview.md)。
- [DEPLOYMENT.md](DEPLOYMENT.md) —— 部署说明。
- [RELEASING.md](RELEASING.md) —— 桌面版发布手册(渠道化分发,T-396c)。
- [PROTECTION.md](PROTECTION.md)、[SHARED-CHANGE-REQUEST.md](SHARED-CHANGE-REQUEST.md) —— 保护规则 / 共享变更请求约定。

## 进度 / 状态

- [project-progress-overview.md](project-progress-overview.md)、[project-status-review.md](project-status-review.md) —— 进度总览 / 状态复盘(快照,以 BACKLOG 为准)。
- [../BACKLOG-archive.md](../BACKLOG-archive.md) —— 已归档的 ✅ 完成任务全文(单一份,repo 根;原 `docs/BACKLOG-archive.md` 已于 T-529 并入根版并删除)。

## 工程笔记 / 调研 / 交接 / 安全 / 素材(子目录)

- **[engineering-notes/](engineering-notes/)** —— 实施踩坑册([pitfalls.md](engineering-notes/pitfalls.md))+ 基建配置(CDN 等)。
- **[research/](research/)** —— 调研归档(盘点/对比/核查/源码蒸馏,按 `YYYY-MM-DD-<topic>-research.md` 命名)。
- **[tasks/](tasks/)** —— 任务详情长文(如 [T484.md](tasks/T484.md)、[T510.md](tasks/T510.md))+ 落地交接单。
- **[handoffs/](handoffs/)** —— 跨会话/跨仓交接单。
- **[security/](security/)** —— 安全审计(白盒桌面安全审计等)。
- **[marketing/](marketing/)** —— 营销物料(产品介绍视频 brief / 口播稿)。
- **[licenses/](licenses/)** —— 第三方依赖许可证留存(如 HyperFrames Apache-2.0)。
- **[assets/](assets/)** —— 文档配图与可交互 HTML(orchestrator 地图/环图、贡献活跃度 SVG)。

---

> 维护提示:新增 `docs/` 顶层文档时在此登记一行;新增 SPEC 请登记到 [superpowers/specs/INDEX.md](superpowers/specs/INDEX.md) 而非本文件。
