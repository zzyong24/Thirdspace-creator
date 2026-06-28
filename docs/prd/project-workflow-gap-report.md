# 项目工作流 PRD v0.1 — 实现 Gap 报告

> 方法:把 PRD 拆成 10 个审计单元,并行审现有代码(契约/schema/runner/UI),逐条标 implemented/partial/missing + 文件证据,再汇总。9/10 单元成功(发布单元因结构化输出重试超限未完成,已用其余证据覆盖)。**数据模型沿用现有,本报告只评估缺口,不主张推倒重来。**

## 整体结论(成熟度 ~50-55%)
架构地基扎实(7 阶段页面壳、Project/Output/Production/Publishing/Review 全套契约+schema、状态机骨架、16 个 runner 文件、导航+stepper 都在;复盘阶段甚至到 55-60% 真实读写)。但被**三个本质断层**拉住,更像「精致演示壳」而非「跑得通的流水线」:

1. **阶段流转 gate 形同虚设** —— `assertStageTransition` 只校验状态机合法性,PRD §15 的「必填数据 / 核心交付物 / 严重问题」三项内容门禁完全没有 → 每阶段可能拿到空输入。
2. **阶段间「产物自动流入」全断** —— 研究→策划、策划→脚本、脚本→制作 只有数据容器没有编排逻辑;复盘→经验回流(§6.9)完全未布线 → 七阶段实为七座孤岛,AI 拿不到上游真实产物。
3. **AI 介入点大面积未连** —— 20+ 个 §14 介入点仅 6 个 runner 真做(且 planning.thesis 还差前端按钮);脚本编辑器只读无写 op;策划/制作多模块整页缺;立项 Brief 阶段连枚举和实体都没有。

**结论:地基可信、可增量推进,不需推倒重来;但当前端到端跑通「立项→复盘」做不到。最高优先 = 先立 gate,再竖切打通一条链路作样板。**

## 各阶段成熟度
| 阶段 | 实现 | 部分 | 缺失 | 一句状态 |
|---|---|---|---|---|
| 立项 Brief | 2 | 4 | 11 | 最低(~20%)。无 brief 阶段枚举、无 ProjectBrief 实体、§7 六模块+3 AI 全空;brief 仅 projects 表一文本字段。 |
| 研究 | 2 | 8 | 11 | ~30-40%。页面壳+7 模块展示在但多 fixture;ResearchItem/Evidence 无独立表;AI 仅 research.gather 真做。 |
| 策划 | 1 | 6 | 14 | **内核空转,最关键断层之一**。ContentContract/ArgumentNode/StructurePlan 无专属表;4 个 AI 仅 planning.thesis 真做且前端无按钮。 |
| 脚本 | 8 | 8 | 30 | ~45-50%,读侧最扎实;但**编辑器只读、无写 op**;5 个 AI 仅 script.draft 真做。 |
| 制作 | 11 | 9 | 19 | ~40-50%。Production 模型+导出 op 完整、material.match 真做;但 §11 模块 B/C/D 整页缺。 |
| 发布 | 4 | 4 | 6 | ~40-50%。Publication 模型+op 在;平台预览/检查清单缺,AI 标题/简介/合规全缺。 |
| 复盘 | 9 | 7 | 12 | 最高(~55-60%)。三套契约+schema+壳完整、review.analyze 真做;但**经验回流(Learning→选题/校准/定位)完全未布线**,Learning 入库即孤立。 |

## Top Gaps(按影响×成本)
1. **[high·M] 阶段流转 gate 形同虚设** (§15) — 给 `assertStageTransition` 加 `validateStageGate` 内容门禁(brief 六必填/研究有证据/策划论点树+结构方案…)。最高优先,所有链路的守门人。
2. **[high·L] 三条核心链路产物自动流入全断** (§6.4/6.5/6.6) — transition 时把上一阶段产物写成下一阶段初稿(研究结论→内容合同、合同+结构→脚本大纲、脚本 visual_note→制作清单)。建议先做最短的 脚本→制作 作样板。
3. **[high·M] 经验回流闭环缺失** (§6.9/§13.D) — Learning→TopicRule/CalibrationRule/PositionSuggestion 三条 write 链路 + 复盘页按钮。复盘地基已就绪,性价比高,是「越用越准」飞轮关键。
4. **[high·L] 立项 Brief 阶段缺位** (§5.2/§7) — 建 project_brief 表/字段集+resource、扩 create/patch body、建 Brief 工作台;projectStageName 加 brief 枚举。流水线第一入口。
5. **[high·M] 策划 3 个 AI runner 缺** (§14策划) — content.contract / evidence.match / outline.generate(+ StructurePlan 模型);并把已做好的 planning.thesis 接上前端按钮。
6. **[high·M] 脚本编辑器无写 op** (§10C) — 高欺骗性缺口「看着能用实际只读」。补 versions 保存/金句增删/版本恢复 write op。
7. **[med·M] Brief AI 三节点**(补全受众/校验目标/推荐指标)— 随 Brief 阶段打包。
8. **[med·L] 制作模块 B/C/D 整页缺 + 3 制作 AI** — 先做模块 B 清单+从脚本生成(绑链路一起)。
9. **[med·M] 复盘预测对照缺失** (§13.B) — ReviewPredictionLink 关联 + 复盘页对照 + review.analyze 接 prediction。校准飞轮另一半。
10. **[low·S] stageStatus 缺 needs_review + 无 ChangeLog 回退影响链** (§15/§16) — 加枚举值成本极小,随 gate 一起做。

## 建议完善顺序
1. **先打通阶段流转 gate**(§15,validateStageGate + needs_review 态)——守门人,不先做后面链路都建在空数据上。
2. **补立项 Brief 地基**(brief 枚举 + ProjectBrief 表/resource + create/patch + 工作台)——第一入口、定位约束承载点。
3. **竖切一条样板链路 脚本→制作**(§6.6)——把「产物自动流入 + gate + 下游真读」端到端跑通一次。
4. **回补上游 研究→策划→脚本**(§6.4/6.5)+ 策划 3 AI runner + StructurePlan,接 planning.thesis 前端按钮。
5. **补脚本写侧**(保存/金句增删/版本恢复)——让编辑器真能用。
6. **闭合校准飞轮**:复盘「开始/完成复盘」交互 → 预测对照(ReviewPredictionLink)→ 经验回流(§6.9)。
7. **补量大单点清晰的剩余 UI/AI**:制作 B/C/D + 制作 AI、Brief AI 三节点、发布平台预览/检查清单+发布 AI。

## 可直接保留(沿用现有,别动)
- Production/ProductionSegment/ExportRecord 模型 + 导出 ops;Publication/PublicationRevision 模型+ops。
- Review/ReviewInsight/Learning/LearningApplication/Analytics 全套契约+schema(含 funnel 维度+幂等键);Learning 状态机 + learnings ops。
- 6 个已真做的 AI runner:review.analyze / script.draft / research.gather / planning.thesis / material.match / positioning_profile / topic.enrich(planning.thesis 只差前端按钮)。
- 脚本读侧装配(outline/versions/sections/goldenQuotes 真读)。
- Project/ContentOutput/ProjectStage 模型 + transitionProjectStage 单一流转入口 + 状态机骨架(在其上加 gate,别重写)。
- 左侧 11 项导航 + 顶部 ProjectStageStepper;选题→项目立项链路(promoteCandidate→createProject)。
