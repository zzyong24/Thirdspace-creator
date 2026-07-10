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
- [product-walkthrough-report.md](product-walkthrough-report.md) —— 产品走查报告。

## 数据 / 存储 / 运行时(历史设计,以现行 SPEC + 代码为准)

- [CreatorOS-运行时协同设计.md](CreatorOS-运行时协同设计.md) —— 运行时协同设计(历史稿)。

## 桌面端 / 部署 / 变更

- [desktop-architecture-rfc.md](desktop-architecture-rfc.md) —— 桌面端架构 RFC(另见 specs/2026-07-05-desktop-app-architecture-overview.md)。
- [DEPLOYMENT.md](DEPLOYMENT.md) —— 部署说明。
- [PROTECTION.md](PROTECTION.md)、[SHARED-CHANGE-REQUEST.md](SHARED-CHANGE-REQUEST.md) —— 保护规则 / 共享变更请求约定。

## 进度 / 状态

- [project-progress-overview.md](project-progress-overview.md)、[project-status-review.md](project-status-review.md) —— 进度总览 / 状态复盘(快照,以 BACKLOG 为准)。
- [BACKLOG-archive.md](BACKLOG-archive.md) —— 已归档任务。

---

> 维护提示:新增 `docs/` 顶层文档时在此登记一行;新增 SPEC 请登记到 [superpowers/specs/INDEX.md](superpowers/specs/INDEX.md) 而非本文件。
