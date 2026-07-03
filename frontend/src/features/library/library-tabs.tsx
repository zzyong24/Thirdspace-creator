/**
 * 库页 tab 定义([T-063a] IA 收敛底座 · 北极星 SPEC §1「库」)。
 *
 * /library = 素材 + 知识 + 经验 三 tab 的统一资产面(回答「攒下了什么」):
 *   assets(原 /assets)· knowledge(原 /knowledge)· experience(原 /experience)。
 *
 * 三者同为「资产」,同一倾倒场心智;本片只立骨架(内嵌现有三页核心区,删壳不删肉),
 * 统一倾倒场/跨类搜索在 T-063d 深度融合。tab 切换 = Link ?tab=(server 重渲)。
 */

import * as React from "react";

import { QueryTabs, type QueryTabDef } from "@/components/navigation/query-tabs";

export type LibraryTab = "assets" | "knowledge" | "experience";

export const LIBRARY_TABS: ReadonlyArray<QueryTabDef & { id: LibraryTab }> = [
  { id: "assets", label: "素材" },
  { id: "knowledge", label: "知识" },
  { id: "experience", label: "经验" },
];

/** searchParams.tab → 合法 tab id;缺省/非法回「素材」。 */
export function normalizeLibraryTab(raw: string | undefined): LibraryTab {
  return LIBRARY_TABS.some((t) => t.id === raw) ? (raw as LibraryTab) : "assets";
}

export function LibraryTabBar({ active }: { readonly active: LibraryTab }) {
  return (
    <QueryTabs
      basePath="/library"
      tabs={LIBRARY_TABS}
      active={active}
      className="w-fit"
    />
  );
}
