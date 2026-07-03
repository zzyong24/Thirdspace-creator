# spec-review: 2026-07-03-knowledge-asset-redesign

- review_mode: cross-family(MiniMax)
- verdict: CONCERNS(已处置)
- summary: 知识库 SPEC 定位精准、设计具体、字段级可执行，符合宪法飞轮复利定位；主要缺陷是缺少对仓内/外部现有实现的设计依据说明，不符合'不造轮子'架构铁律。

### F1 [major/reinvent-wheel] SPEC 全文（缺少调研章节）
- issue: 作为 PRODUCT SPEC，没有'现成方案/设计依据'章节。知识库是对存量 30 条数据的语义重做，属于增量改造而非全新功能；classify 模板已存在。SPEC 应调研仓内现有知识库实现（或对比 Notion/Roam/Obsidian 等外部知识管理工具的原子化设计），说明本次四类型（claim/evidence/quote/qa）分类的采纳依据，而非仅靠'诊断差'推导。
- suggestion: 在 §0 之后增加 §0.5 '设计依据'节：(1) 仓内现状：现有 30 条知识内容的类型分布与标题前缀规则，classify 模板的局限；(2) 外部参考：Roam Research 的 block reference、Obsidian 的 MOC、Notion Database 的类型化字段——说明为何采用 claim/evidence/quote/qa 四原子而非上述方案；(3) 采纳/弃用理由。参考文献可引用 RFC 或竞品文档。
- 处置: 接受,已内联 [gate-F1](补 §0.5 设计依据节)。

### F2 [minor/traceability] §2 蒸馏管线（confirm 门）
- issue: spec 提到'蒸馏批量确认门'（AI 产候选 → 人勾选 → 批量物化），这是核心架构铁律#2（AI只产候选，经confirm门由backend service物化）的直接应用，但 spec 未显式标注铁律引用，降低了可追溯性。
- suggestion: 在 §2 首句或确认门描述处加注：'→ 架构铁律#2：AI 只产候选，经 confirm 门物化'；同理 §2 的 outputSchema 可标注 '→ 架构铁律#4：每轮 AI 输出被 schema 约束'。
- 处置: 接受,已内联 [gate-F2]。

### F3 [minor/completeness] §3 呈现与喂料（观点地图视图）
- issue: spec 描述'无 tag 归「未归类」'，但未说明未归类知识卡在视图中的处理策略：是固定底部、隐藏、还是允许单独浏览？读者无法判断这是有意设计还是疏漏。
- suggestion: 明确：'未归类知识卡默认折叠在视图底部，可展开；或与「全部」列表视图合并展示，仅在观点地图中展示已打 tag 的知识'。任选其一并写入验收标准。
- 处置: 接受,已内联 [gate-F3]。

## 裁决

CONCERNS(1 major/2 minor)全部处置:major=补不造轮子调研节 §0.5(仓内四件套复用+Zettelkasten/Roam/Notion/project-distiller 取舍)。**已处置→可开工 T-079a/b/c。**
