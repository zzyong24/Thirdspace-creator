"use client";

/**
 * 知识库工作台 Tabs 外壳(T-113 · IA 收敛 SPEC §B)。
 *
 * `/knowledge` 收敛为单一入口后,顶部加两页签:
 *  - Tab「知识库」(默认)= 既有 `KnowledgePage`(传 knowledgeVM);
 *  - Tab「经验沉淀」= 既有 `ExperiencePage`(传 experienceVM + applyTargets)。
 *
 * 两个 Page 组件内部逻辑、数据源 op(knowledge.* / learnings.* /
 * calibration.suggestions.*)、交互全部不动 —— 本壳只负责页签切换 + URL 承载。
 *
 * `KnowledgePage` 是 async Server Component,不能在 client 壳里直接渲染 →
 * 由 server 端(`/knowledge/page.tsx`)预先 resolve 成 ReactNode 后作 slot
 * 传入;`ExperiencePage` 是同步组件,同样以 slot 形式传入,保持外壳纯 UI。
 *
 * [gate-F3] Tab 状态用 URL query `?tab=knowledge|experience` 承载(可深链、
 * 刷新保持、SSR 友好):server 端从 `searchParams.tab` 解出 `defaultTab`;
 * client 端切页签时 `router.replace` 写回 `?tab=`。受控 `value` 由本地 state
 * 承载(切页签不触发 server 重渲染、不丢岛内部 state),URL 作深链/刷新的
 * 单一真值来源。
 */

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type KnowledgeWorkspaceTab = "knowledge" | "experience";

export interface KnowledgeWorkspaceTabsProps {
  /** 知识库 Tab body —— server 端预渲染的 `<KnowledgePage />`。 */
  readonly knowledgeSlot: React.ReactNode;
  /** 经验沉淀 Tab body —— server 端预渲染的 `<ExperiencePage />`。 */
  readonly experienceSlot: React.ReactNode;
  /** server 端从 `?tab=` 解出的默认页签(缺省 knowledge)。 */
  readonly defaultTab?: KnowledgeWorkspaceTab;
}

function normalizeTab(value: string | null | undefined): KnowledgeWorkspaceTab {
  return value === "experience" ? "experience" : "knowledge";
}

export function KnowledgeWorkspaceTabs({
  knowledgeSlot,
  experienceSlot,
  defaultTab = "knowledge",
}: KnowledgeWorkspaceTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = React.useState<KnowledgeWorkspaceTab>(
    normalizeTab(defaultTab),
  );

  const handleTabChange = React.useCallback(
    (next: string) => {
      const nextTab = normalizeTab(next);
      setTab(nextTab);
      // ?tab=knowledge|experience 深链承载:knowledge 是默认 → 省略 query
      // 保持 URL 干净;experience 显式写 query。用 replace 不污染历史栈。
      const base = pathname ?? "/knowledge";
      const href = nextTab === "experience" ? `${base}?tab=experience` : base;
      router.replace(href, { scroll: false });
    },
    [pathname, router],
  );

  return (
    <Tabs
      value={tab}
      onValueChange={handleTabChange}
      data-slot="knowledge-workspace-tabs"
      className="flex h-full min-h-0 flex-col gap-4"
    >
      <TabsList aria-label="知识库工作台" className="shrink-0">
        <TabsTrigger value="knowledge" data-tab-id="knowledge">
          知识库
        </TabsTrigger>
        <TabsTrigger value="experience" data-tab-id="experience">
          经验沉淀
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="knowledge"
        data-slot="knowledge-workspace-tab-knowledge"
        className="min-h-0"
      >
        {knowledgeSlot}
      </TabsContent>
      <TabsContent
        value="experience"
        data-slot="knowledge-workspace-tab-experience"
        className="flex min-h-0 flex-col"
      >
        {experienceSlot}
      </TabsContent>
    </Tabs>
  );
}
