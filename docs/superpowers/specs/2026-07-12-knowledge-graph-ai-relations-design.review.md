# SPEC 审核记录:knowledge-graph-ai-relations(T-260)

- **裁决**:⚠️ CONCERNS(cross-family MiniMax gate)→ 6 findings + 修订裁决 全内联 → 可开工(待用户审)
- **summary(原文)**:方向强合宪法(AI 产候选/人确认门+编导干重活);复用锚基本属实(graph-view/vm 在 a7ef732^ 完整可取,runKnowledgeRelate+/api/knowledge/relate+确认门全真实为 AI-候选形态);3 major 使范围被低估。
- **合定位(强)**:「关联=脑力活归 AI 走确认门物化」精确命中宪法 §5.3/§5.5/§9.2;复原图非花架子(节点=创作弹药/边=AI 语义/usedCount 战绩挂飞轮),主动排除真花架子(摘要 bar 图),判断准。

## findings 处置(6 条全内联)
- **[major-M1]** 复原被低估为「取回2文件」→ §3.1 补第三件:`assembleGraph` 装配层(a7ef732^:knowledge-data.ts:336,477-522,fan-out 4 路读+usedCount 战绩投影)也被同 commit 删,一并取回+核实 listMaterialLinks/listProjects 客户端方法仍在。
- **[major-M2]** 移除 KnowledgeRelationsList 孤立「删边」(老 graph-view 无删边 UI)→ §3.2 图面必须补 edge-delete,才准撤详情弹窗删边职责。
- **[major-M3]** 「保存修订」定错文件(在 knowledge-interactive-region.tsx:254/441 非 detail-preview)→ §3.3 落点校正,T-260c 主战场=interactive-region.tsx。
- **[concern]** T-260d 飞轮「可选」违铁律④→ 剔出本 SPEC 另立 backlog,本 SPEC 为 on-demand 全 AI 完整 0→1。
- **[minor-m1]** 节点上限留软→ §4 给死阈值(>150 采样虚化+诚实提示)。
- **[minor-m2]** 移动端降级漏验收→ §6 补(老图有 stats 摘要降级)。
- **修订去留裁决**:reviewer 引宪法 §5.5「人只审/**改**/删」反对整删——「改」是许可的一等操作;整删=砍宪法允许的「人改」路径,反偏定位;修订 append-only 安全,改错别字用重跑蒸馏是 overkill。**采纳:保留但降权进次级入口**(反转 SPEC 原「倾向去」)。

## 复用抽查(reviewer 坐实)
graph-view a7ef732^ 506 行(含 AI 找关联+确认门+ECharts force)+ vm 172 行(buildKnowledgeGraphVm:96)· runner knowledge-relate-runner.ts:29-34 · route /api/knowledge/relate:17-19(显式不写库)· 采纳 graph-view:296 createdByType='ai' · 人建边 detail-preview.tsx:140/524(T-091 user)· 契约 knowledge.ts:93。**唯一孤立=删边**(M2)。
- 日期 2026-07-12
