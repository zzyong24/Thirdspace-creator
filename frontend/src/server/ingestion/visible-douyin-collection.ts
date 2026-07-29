import type { MetricRecord } from "@creatoros/backend/modules/ingestion";
import {
  matchDetailsToPublications,
  visibilityFromDetailStatus,
  type DouyinWorkDetail,
  type PublicationCatalogEntry,
} from "./douyin-work-detail";

export interface VisibleDouyinCollectionCounts {
  observed: number;
  visible: number;
  hidden: number;
  unknown: number;
  unmatchedDetails: number;
}

export interface VisibleDouyinCollectionDecision {
  visibleRecords: MetricRecord[];
  hiddenExternalIds: string[];
  counts: VisibleDouyinCollectionCounts;
}

/**
 * T-595 可见性闸门的纯决策层。
 *
 * 原始指标和创作者中心明细都只在内存里相遇。只有唯一匹配且状态明确为公开的记录可以
 * 继续入库；明确隐藏只产生清理指令；未匹配、多义或未知状态均 fail-closed。
 */
export function decideVisibleDouyinCollection(input: {
  records: readonly MetricRecord[];
  details: readonly DouyinWorkDetail[];
  catalog: readonly PublicationCatalogEntry[];
}): VisibleDouyinCollectionDecision {
  const matches = matchDetailsToPublications(input.details, input.catalog);
  const visibilityByExternalId = new Map<
    string,
    "visible" | "hidden" | "unknown"
  >();
  let unmatchedDetails = 0;

  for (const match of matches) {
    if (!match.publicationId) {
      unmatchedDetails += 1;
      continue;
    }
    const visibility = visibilityFromDetailStatus(match.detail.status);
    const previous = visibilityByExternalId.get(match.publicationId);
    // 同一个作品被多个明细行给出冲突状态时也不能猜，统一降为 unknown。
    visibilityByExternalId.set(
      match.publicationId,
      previous && previous !== visibility ? "unknown" : visibility,
    );
  }

  const visibleRecords: MetricRecord[] = [];
  const hiddenExternalIds = new Set<string>();
  let unknown = 0;

  for (const record of input.records) {
    const visibility = visibilityByExternalId.get(record.externalId) ?? "unknown";
    if (visibility === "visible") {
      visibleRecords.push(record);
    } else if (visibility === "hidden") {
      hiddenExternalIds.add(record.externalId);
    } else {
      unknown += 1;
    }
  }

  // 明细可能仍包含本轮主页指标列表没有返回的存量作品；只要它能唯一锚定且明确隐藏，
  // 仍应产生清理指令，使存量不再卡死。公开但没有指标 record 时不凭空造一条。
  for (const [externalId, visibility] of visibilityByExternalId) {
    if (visibility === "hidden") hiddenExternalIds.add(externalId);
  }

  return {
    visibleRecords,
    hiddenExternalIds: [...hiddenExternalIds],
    counts: {
      observed: input.records.length,
      visible: visibleRecords.length,
      hidden: hiddenExternalIds.size,
      unknown,
      unmatchedDetails,
    },
  };
}
