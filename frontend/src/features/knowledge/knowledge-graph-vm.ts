/**
 * 知识图谱 GraphVm(T-091 SPEC §1.1)—— server 侧一次装配成全真值 VM,前端只渲不拼:
 *   - 节点 = knowledge 全类型(active;四原子 + reference/transcript 等旧类型一视同仁,
 *     旧类型是出处存档,在图上是 quote/evidence 的邻居)+ project 战绩锚(materialLinks
 *     指向的项目,标题即项目名);
 *   - 边 = knowledge_relations 语义边(relation)+ materialLinks 引用边(usage,
 *     knowledge → project,带 stage/role 溯源);
 *   - stats = 图上方诚实计数条(节点/边/孤立)。
 * 纯函数构建(buildKnowledgeGraphVm),单测覆盖;无一编造 —— 没有边就诚实稀疏。
 */

export interface GraphNodeVm {
  readonly id: string;
  readonly kind: "knowledge" | "project";
  /** kind='knowledge' 时的类型(claim/evidence/quote/qa/reference/…)。 */
  readonly knowledgeType?: string;
  readonly title: string;
  /** 战绩投影(kind='knowledge'):被引用次数;越大节点越大。 */
  readonly usedCount?: number;
  /** 战绩投影:所挂项目有已发布 publication(节点加描边)。 */
  readonly usedInPublished?: boolean;
}

export interface GraphEdgeVm {
  readonly source: string;
  readonly target: string;
  readonly kind: "relation" | "usage";
  /** relation 边:relationType/strength/建边者(边 tooltip 溯源)。 */
  readonly relationType?: string;
  readonly strength?: number;
  readonly createdByType?: string;
  /** usage 边:被哪个项目在什么阶段以什么角色引用 + 时间。 */
  readonly stage?: string;
  readonly role?: string;
  readonly projectTitle?: string;
  readonly createdAt?: string;
}

export interface GraphStatsVm {
  readonly knowledgeNodes: number;
  readonly projectNodes: number;
  readonly relationEdges: number;
  readonly usageEdges: number;
  readonly isolatedCount: number;
}

export interface KnowledgeGraphVm {
  readonly nodes: ReadonlyArray<GraphNodeVm>;
  readonly edges: ReadonlyArray<GraphEdgeVm>;
  readonly stats: GraphStatsVm;
}

// ---------------------------------------------------------------------------
// 构建输入(装配层从契约 op 读回的最小投影)
// ---------------------------------------------------------------------------

export interface GraphSourceItem {
  readonly id: string;
  readonly title: string;
  readonly knowledgeType: string;
  readonly status: string;
  readonly usedCount?: number;
  readonly usedInPublished?: boolean;
}

export interface GraphSourceRelation {
  readonly sourceKnowledgeId: string;
  readonly targetKnowledgeId: string;
  readonly relationType: string;
  readonly strength: number;
  readonly createdByType: string;
}

export interface GraphSourceMaterialLink {
  readonly projectId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly role: string;
  readonly stage: string;
  readonly createdAt: string;
}

export interface GraphSourceProject {
  readonly id: string;
  readonly title: string;
}

/**
 * 纯函数装配 GraphVm:
 *   - knowledge 节点只收 active(archived 不进图);
 *   - relation 边两端必须都在图上(指向 archived/未知的边丢弃,不画悬空边);
 *   - usage 边只收 entityType='knowledge' 且 knowledge 在图上的 links;project 节点
 *     由被引用的 projectId 派生(项目标题缺失时以 id 兜底显示,诚实不编名);
 *   - isolatedCount = 无任何边(relation/usage)的 knowledge 节点数。
 */
export function buildKnowledgeGraphVm(
  items: ReadonlyArray<GraphSourceItem>,
  relations: ReadonlyArray<GraphSourceRelation>,
  links: ReadonlyArray<GraphSourceMaterialLink>,
  projects: ReadonlyArray<GraphSourceProject>,
): KnowledgeGraphVm {
  const active = items.filter((i) => i.status === "active");
  const knowledgeIds = new Set(active.map((i) => i.id));

  const nodes: GraphNodeVm[] = active.map((i) => ({
    id: i.id,
    kind: "knowledge" as const,
    knowledgeType: i.knowledgeType,
    title: i.title,
    usedCount: i.usedCount ?? 0,
    usedInPublished: i.usedInPublished ?? false,
  }));

  // relation 边:两端都在图上才画(诚实,不画悬空边)。
  const relationEdges: GraphEdgeVm[] = relations
    .filter(
      (r) =>
        knowledgeIds.has(r.sourceKnowledgeId) &&
        knowledgeIds.has(r.targetKnowledgeId),
    )
    .map((r) => ({
      source: r.sourceKnowledgeId,
      target: r.targetKnowledgeId,
      kind: "relation" as const,
      relationType: r.relationType,
      strength: r.strength,
      createdByType: r.createdByType,
    }));

  // usage 边 + project 节点(由被引用的 projectId 派生)。
  const titleByProject = new Map(projects.map((p) => [p.id, p.title]));
  const usedProjects = new Map<string, string>();
  const usageEdges: GraphEdgeVm[] = [];
  for (const link of links) {
    if (link.entityType !== "knowledge") continue;
    if (!knowledgeIds.has(link.entityId)) continue;
    const projectTitle = titleByProject.get(link.projectId) ?? link.projectId;
    usedProjects.set(link.projectId, projectTitle);
    usageEdges.push({
      source: link.entityId,
      target: `project:${link.projectId}`,
      kind: "usage" as const,
      stage: link.stage,
      role: link.role,
      projectTitle,
      createdAt: link.createdAt,
    });
  }
  for (const [projectId, title] of usedProjects) {
    nodes.push({ id: `project:${projectId}`, kind: "project" as const, title });
  }

  // 孤立 knowledge 节点(无任何边)。
  const connected = new Set<string>();
  for (const e of [...relationEdges, ...usageEdges]) {
    connected.add(e.source);
    connected.add(e.target);
  }
  const isolatedCount = active.filter((i) => !connected.has(i.id)).length;

  return {
    nodes,
    edges: [...relationEdges, ...usageEdges],
    stats: {
      knowledgeNodes: active.length,
      projectNodes: usedProjects.size,
      relationEdges: relationEdges.length,
      usageEdges: usageEdges.length,
      isolatedCount,
    },
  };
}
