// [T-381] 素材中心统一排序:按新旧(createdAt desc)。独立小模块(无 "server-only"),
// 服务端页面(assets-page deriveGallery)与客户端岛(assets-interactive-region 回收站/
// 测试 seam 回退)都要用 —— 直接从 assets-page 导会把 server-only 依赖链拖进 client bundle。
// ISO-8601 字符串可直接字典序比较;缺 createdAt 的旧 fixture/seam 行回退 updatedAt。
import type { AssetSummary } from "./assets-page";

export function sortAssetsByNewest(
  rows: ReadonlyArray<AssetSummary>,
): ReadonlyArray<AssetSummary> {
  return rows
    .slice()
    .sort((a, b) =>
      (b.createdAt ?? b.updatedAt).localeCompare(a.createdAt ?? a.updatedAt),
    );
}
