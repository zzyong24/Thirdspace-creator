# spec-review: 2026-07-03-first-principles-redesign

- **review_mode**: cross-family(MiniMax via mmx CLI)
- **verdict**: PASS
- **summary**: SPEC 提出了一个与宪法原则完全对齐的 IA 重构方案：11→4 导航 + 对话主干，核心逻辑（降低单人创作者决策成本）有用户裁决轨迹支撑，宪法修正案 §11 与既有 §6 编导对话化原则一致，飞轮五步路径完整。未发现 blocker 或 major 问题。

## findings 与处置

### F1 [minor/traceability] §0「降级判定逐页(证据见审计)」段

- **issue**: SPEC 声称每个导航降级都有用户裁决轨迹支撑（如「topics → 作品页候选 tab」对应 T-055~T-062），但正文中没有列出具体的映射引用（如 T-055h③ 对应哪个路由变更）。如果这些映射存在断裂，实现者无法快速回溯用户原意。
- **suggestion**: 在 §0 或 §1 表格中增加一列「上游裁决引用」，格式如「T-055h③ / T-062c」，使每条降级判定可反驳。
- **处置**: 接受 —— 已内联进 SPEC(标记 [gate-F1])。

### F2 [minor/completeness] §3 T-063b 验收标准

- **issue**: 「首页每一行都可点、点了都到能干活的地方；空态诚实」是质量要求而非验收断言——没有说清楚首页应该有哪些行（比如「待裁决选题」的具体定义是什么），也没有定义什么算「能干活」。如果实现者做了但行数不够或跳转不对，算过还是不过？
- **suggestion**: 验收标准加一行可执行的断言：「首页行动队列条目数 ≥ 5，且每条有对应 deep link（导向 /projects?tab=candidates 或稿面锚点等）；空态显示引导文案而非空白或纯占位」。
- **处置**: 接受 —— 已内联进 SPEC(标记 [gate-F2])。

### F3 [minor/traceability] §3 T-063a「feature 组件与 contract ops 零删除」

- **issue**: 这是 SPEC 的一条重要承诺（影响后续所有切片的前提假设），但没有配套的保障机制（代码审查清单、回归测试套件覆盖要求等）。如果后续切片在融合过程中误删了某个 op，实现者无法从 SPEC 本身找到依据来拒绝变更。
- **suggestion**: 在 §4 全局约束中加一条：「每片验收前须运行全量 contract ops 回归测试，确保零删除。变更前须在 SPEC 留痕（变更记录节）」。
- **处置**: 接受 —— 已内联进 SPEC(标记 [gate-F3])。

## 裁决

verdict=PASS(0 blocker/0 major/3 minor),全部接受内联。**可开工 T-063a~f。**
