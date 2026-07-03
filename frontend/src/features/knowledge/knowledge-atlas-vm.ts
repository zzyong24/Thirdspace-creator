/**
 * 观点地图(Knowledge Atlas)VM 组装 —— 纯函数层(T-079c,SPEC
 * 2026-07-03-knowledge-asset-redesign §3)。
 *
 * 知识库默认视图从「时间流列表」换成「按 tag 主题聚类的分组卡墙」:
 *   - 每个 tag 一组;组头 = 主题名 + 组内「观点 N · 证据 M」计数(弹药足不足一眼可见);
 *   - 无 tag 的知识进「未归类」组,**固定排在卡墙底部、默认折叠可展开**[gate-F3];
 *   - 组内卡片默认排序:usedInPublished(用于已发布)优先 → usedCount desc → createdAt desc
 *     (「战绩 desc → 新近」);
 *   - **一条知识挂多个 tag 时只归首个 tag**(按 tag 传入顺序 = usageCount 排名),
 *     避免同一张卡在卡墙上重复出现(地图是「点兵」不是「索引」,重复卡会虚报弹药量;
 *     完整多标签视图走「全部」列表 + `?tag=` 过滤)。
 *
 * 本文件只做纯数据变换(无 IO / 无 React),供 knowledge-data 服务端装配调用,
 * 并被 knowledge-atlas.test.tsx 直接单测。
 */

// ---------------------------------------------------------------------------
// 输入形状(由 knowledge-data 从 knowledge.list + taxonomy.entityTags 装配)
// ---------------------------------------------------------------------------

/** 一条知识的地图源数据(knowledge.list 投影,T-079a 已带战绩字段)。 */
export interface AtlasSourceItem {
  readonly id: string;
  readonly title: string;
  readonly knowledgeType: string;
  /** 出处小字(T-079a source_note);无 → null。 */
  readonly sourceNote: string | null;
  /** 战绩:被用料链引用次数(materialLinks 反查,服务端派生)。 */
  readonly usedCount: number;
  /** 战绩:所挂项目存在 published publication。 */
  readonly usedInPublished: boolean;
  readonly createdAt: string;
}

/**
 * 一个 tag 的知识挂载(taxonomy.entityTags.listEntitiesForTag 读回)。
 * 传入顺序即分配优先级:多 tag 知识归数组里**最靠前**的 tag(调用方按
 * usageCount desc 排好再传)。
 */
export interface AtlasTagAssignment {
  readonly name: string;
  readonly itemIds: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// 输出 VM(组件 knowledge-atlas.tsx 渲染用)
// ---------------------------------------------------------------------------

/** 卡片 type 徽章视觉档(观点 brand/证据 blue/金句 amber/问题 green/参考 gray)。 */
export type AtlasTypeTone = "neutral" | "brand" | "success" | "warning" | "info";

export interface AtlasCardVm {
  readonly id: string;
  readonly title: string;
  readonly knowledgeType: string;
  /** type 中文徽章文案(观点/证据/金句/问题/参考;旧类型沿用笔记/片段/记录/灵感)。 */
  readonly typeLabel: string;
  readonly typeTone: AtlasTypeTone;
  readonly sourceNote: string | null;
  readonly usedCount: number;
  readonly usedInPublished: boolean;
  readonly createdAt: string;
}

export interface AtlasGroupVm {
  /** 稳定 key(tag 名;未归类组固定 "__unsorted__")。 */
  readonly key: string;
  /** 组头主题名。 */
  readonly name: string;
  /** 组内观点(claim)条数 —— 组头「观点 N · 证据 M」。 */
  readonly claimCount: number;
  /** 组内证据(evidence)条数。 */
  readonly evidenceCount: number;
  readonly cards: ReadonlyArray<AtlasCardVm>;
}

export interface KnowledgeAtlasVm {
  /** 有主题(tag)的分组,已按战绩排好序。 */
  readonly groups: ReadonlyArray<AtlasGroupVm>;
  /** 未归类组(无 tag 的知识)。固定渲在底部、默认折叠[gate-F3];空 → null。 */
  readonly unsorted: AtlasGroupVm | null;
}

/** 未归类组的稳定 key(组件/测试共用)。 */
export const UNSORTED_GROUP_KEY = "__unsorted__";

// ---------------------------------------------------------------------------
// type → 中文徽章(四原子 + 旧类型兼容;未知类型原样显示、灰档)
// ---------------------------------------------------------------------------

const TYPE_META: Record<string, { label: string; tone: AtlasTypeTone }> = {
  // 四原子(SPEC §0):创作用途特化类型。
  claim: { label: "观点", tone: "brand" },
  evidence: { label: "证据", tone: "info" },
  quote: { label: "金句", tone: "warning" },
  qa: { label: "问题", tone: "success" },
  // 出处存档 + 旧类型(枚举 additive 保留,gate-F3 零删除)。
  reference: { label: "参考", tone: "neutral" },
  note: { label: "笔记", tone: "neutral" },
  snippet: { label: "片段", tone: "neutral" },
  transcript: { label: "记录", tone: "neutral" },
  inspiration: { label: "灵感", tone: "neutral" },
};

export function atlasTypeMeta(knowledgeType: string): {
  label: string;
  tone: AtlasTypeTone;
} {
  return TYPE_META[knowledgeType] ?? { label: knowledgeType, tone: "neutral" };
}

// ---------------------------------------------------------------------------
// 组装
// ---------------------------------------------------------------------------

/**
 * 组内卡片排序:usedInPublished desc → usedCount desc → createdAt desc。
 * 「用于已发布」是最硬的战绩(内容真上线了),优先于纯引用次数;同战绩看新近。
 */
function compareCards(a: AtlasCardVm, b: AtlasCardVm): number {
  if (a.usedInPublished !== b.usedInPublished) {
    return a.usedInPublished ? -1 : 1;
  }
  if (a.usedCount !== b.usedCount) return b.usedCount - a.usedCount;
  return b.createdAt.localeCompare(a.createdAt);
}

function toCard(item: AtlasSourceItem): AtlasCardVm {
  const meta = atlasTypeMeta(item.knowledgeType);
  return {
    id: item.id,
    title: item.title,
    knowledgeType: item.knowledgeType,
    typeLabel: meta.label,
    typeTone: meta.tone,
    sourceNote: item.sourceNote,
    usedCount: item.usedCount,
    usedInPublished: item.usedInPublished,
    createdAt: item.createdAt,
  };
}

function toGroup(key: string, name: string, cards: AtlasCardVm[]): AtlasGroupVm {
  const sorted = cards.slice().sort(compareCards);
  return {
    key,
    name,
    claimCount: sorted.filter((c) => c.knowledgeType === "claim").length,
    evidenceCount: sorted.filter((c) => c.knowledgeType === "evidence").length,
    cards: sorted,
  };
}

/**
 * 主题组之间的排序(未归类组不参与 —— 它固定在底部[gate-F3]):
 * 有「用于已发布」战绩的组优先 → 组内 usedCount 总和 desc → 卡数 desc → 组名。
 * 让「弹药最实、被验证过」的主题浮到卡墙最上面。
 */
function compareGroups(a: AtlasGroupVm, b: AtlasGroupVm): number {
  const aPub = a.cards.some((c) => c.usedInPublished) ? 1 : 0;
  const bPub = b.cards.some((c) => c.usedInPublished) ? 1 : 0;
  if (aPub !== bPub) return bPub - aPub;
  const aUsed = a.cards.reduce((acc, c) => acc + c.usedCount, 0);
  const bUsed = b.cards.reduce((acc, c) => acc + c.usedCount, 0);
  if (aUsed !== bUsed) return bUsed - aUsed;
  if (a.cards.length !== b.cards.length) return b.cards.length - a.cards.length;
  return a.name.localeCompare(b.name, "zh-Hans-CN");
}

/**
 * 观点地图 VM 组装(纯函数):
 *   - `tagAssignments` 顺序即优先级(调用方按 usageCount desc 传入);多 tag 知识
 *     只归首个命中的 tag(见文件头注释,防重复卡);
 *   - 空 itemIds / 无命中知识的 tag 不出组(空组没有信息量);
 *   - 无 tag 的知识全部落「未归类」组(cards 为空 → unsorted = null)。
 */
export function buildKnowledgeAtlas(
  items: ReadonlyArray<AtlasSourceItem>,
  tagAssignments: ReadonlyArray<AtlasTagAssignment>,
): KnowledgeAtlasVm {
  // itemId → 首个命中 tag 名(先到先得 = usageCount 排名靠前的 tag 赢)。
  const firstTagOf = new Map<string, string>();
  for (const tag of tagAssignments) {
    for (const itemId of tag.itemIds) {
      if (!firstTagOf.has(itemId)) firstTagOf.set(itemId, tag.name);
    }
  }

  const byTag = new Map<string, AtlasCardVm[]>();
  const unsortedCards: AtlasCardVm[] = [];
  for (const item of items) {
    const tagName = firstTagOf.get(item.id);
    const card = toCard(item);
    if (tagName === undefined) {
      unsortedCards.push(card);
      continue;
    }
    const bucket = byTag.get(tagName);
    if (bucket) bucket.push(card);
    else byTag.set(tagName, [card]);
  }

  const groups = Array.from(byTag.entries())
    .map(([name, cards]) => toGroup(name, name, cards))
    .sort(compareGroups);

  return {
    groups,
    unsorted:
      unsortedCards.length > 0
        ? toGroup(UNSORTED_GROUP_KEY, "未归类", unsortedCards)
        : null,
  };
}
