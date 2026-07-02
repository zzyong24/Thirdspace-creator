"use client";

/**
 * [T-051 2a] 资料收集区 —— 类型 tab 真筛选(client)。
 *
 * 旧实现是 server 静态渲染:PageTabs 有本地高亮但资料列表不跟着筛(死 tab)。
 * 现在选中 tab → 按 source 字段(资料/文章/视频…)过滤行;「全部」显示全量。
 * 空筛选结果显示诚实空文案,不留空白区。
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import { PageTabs } from "@/components/navigation/page-tabs";
import type { ResearchSourceRow, ResearchViewModel } from "@/types/view-models";

export function ResearchCollectionSection({
  tabs,
  sources,
}: {
  tabs: ResearchViewModel["sourceTabs"];
  sources: ReadonlyArray<ResearchSourceRow>;
}) {
  const [active, setActive] = React.useState<string>(tabs[0]?.id ?? "all");
  const activeLabel = tabs.find((t) => t.id === active)?.label ?? "";
  // 「全部」tab(按惯例第一个)不筛;其余按行的 source 标签(=tab label)过滤。
  const isAll = active === (tabs[0]?.id ?? "all");
  const visible = isAll
    ? sources
    : sources.filter((s) => s.source === activeLabel);

  return (
    <div data-slot="research-collection-section">
      <SectionCard
        title="资料收集"
        description="已收集的文章、视频、报告与播客"
      >
        <div data-slot="page-tabs">
          <PageTabs
            tabs={tabs}
            value={active}
            onValueChange={setActive}
            ariaLabel="资料类型"
          />
        </div>
        <ul
          data-slot="research-source-list"
          className="mt-3 flex flex-col gap-2"
          aria-label="资料列表"
        >
          {visible.length === 0 ? (
            <li
              data-slot="research-source-empty"
              className="rounded-card border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
            >
              {isAll ? "暂无收集的资料" : `暂无「${activeLabel}」类资料`}
            </li>
          ) : (
            visible.map((source) => (
              <li
                key={source.id}
                data-slot="research-source-row"
                className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {source.title}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {source.source}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {source.tags.map((tag) => (
                    <TagChip key={tag} label={tag} tone="neutral" size="sm" />
                  ))}
                </div>
              </li>
            ))
          )}
        </ul>
      </SectionCard>
    </div>
  );
}
