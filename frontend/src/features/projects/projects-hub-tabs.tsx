/**
 * 作品页 tab 定义([T-063a] IA 收敛底座 · 北极星 SPEC §1)。
 *
 * /projects 从「项目列表单页」升级为作品全生命周期漏斗:
 *   候选 candidates(原 /topics 核心区)→ 进行中 active(原项目列表)→
 *   已发布 published(原 /publishing 核心区)→ 排期 schedule(原 /calendar 核心区)。
 *
 * tab 切换 = Link ?tab=(server 重渲,见 QueryTabs);数据装配在 route page
 * 按激活 tab 分支,只读当前 tab 的数据。深度融合在 T-063c 逐片做,本片只立骨架。
 */

import * as React from "react";

import { QueryTabs, type QueryTabDef } from "@/components/navigation/query-tabs";

export type ProjectsHubTab = "candidates" | "active" | "published" | "schedule";

export const PROJECTS_HUB_TABS: ReadonlyArray<QueryTabDef & { id: ProjectsHubTab }> = [
  { id: "candidates", label: "候选" },
  { id: "active", label: "进行中" },
  { id: "published", label: "已发布" },
  { id: "schedule", label: "排期" },
];

/** searchParams.tab → 合法 tab id;缺省/非法回「进行中」(现有项目列表,不回退)。 */
export function normalizeProjectsHubTab(raw: string | undefined): ProjectsHubTab {
  return PROJECTS_HUB_TABS.some((t) => t.id === raw)
    ? (raw as ProjectsHubTab)
    : "active";
}

export function ProjectsHubTabBar({ active }: { readonly active: ProjectsHubTab }) {
  return (
    <QueryTabs
      basePath="/projects"
      tabs={PROJECTS_HUB_TABS}
      active={active}
      className="w-fit"
    />
  );
}
