/**
 * 知识条目类型 → 用户语言。界面任何地方都不直接显示 quote/evidence/claim 等英文枚举
 * （月明录屏 2026-11-10，知识库资料列表类型列）。未知类型统一显示「资料」。
 */
export const KNOWLEDGE_TYPE_LABELS: Readonly<Record<string, string>> = {
  reference: "参考资料",
  note: "笔记",
  claim: "观点",
  evidence: "证据",
  quote: "金句",
  qa: "观众问题",
  inspiration: "灵感",
  snippet: "片段",
  transcript: "逐字稿",
};

export function knowledgeTypeLabelZh(type: string | null | undefined): string {
  return (type && KNOWLEDGE_TYPE_LABELS[type]) || "资料";
}
