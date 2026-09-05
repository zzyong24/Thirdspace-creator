import type { MaterialMatchOutput } from "@creatoros/ai-worker";
import type { CreativeContext } from "./creative-context";

// 共享素材候选归一；执行生命周期已统一交给 Worker。
export interface MaterialMatchItem {
  assetId: string;
  role: string; // broll|clip|cover (normalized at confirm)
  reason: string;
}

// 把 CreativeContext + 主题映射成 material.match 模板的 facets(占位化原 buildMatchPrompt 的上下文块)。
// library(可用素材库)是必需 facet,沿用原 prompt 的兜底文案(素材库为空时的提示)。
export function matchFacets(
  context: CreativeContext,
  topic: string,
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位）",
    topic: topic || "（未提供主题——按定位通用匹配）",
    library: context.assetsBrief
      ? context.assetsBrief
      : "（素材库为空——没有可用素材）",
  };
}

// Normalize the schema-validated matches array into asset matches (T-025:结构化后拿的是已解析
// 对象,归一逻辑原样保留 —— trim、滤掉缺 assetId 的项,真实ID范围另由后台适配器校验)。
export function normalizeMatches(
  matches: MaterialMatchOutput["matches"],
): MaterialMatchItem[] {
  return (matches ?? [])
    .map((o): MaterialMatchItem | null => {
      const assetId = (o.assetId ?? "").trim();
      if (!assetId) return null;
      return {
        assetId,
        role: o.role ?? "",
        reason: o.reason ?? "",
      };
    })
    .filter((m): m is MaterialMatchItem => m !== null);
}
