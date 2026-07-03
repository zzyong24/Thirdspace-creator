/**
 * QueryTabs — `?tab=` 驱动的页面级 tab 切换条([T-063a] IA 收敛底座)。
 *
 * Server Component:tab 切换 = <Link href="?tab=x">(整页 server 重渲),
 * 不做 client tab —— 这样各 tab 的 server 数据装配只在对应 tab 激活时读
 * (route page 按 searchParams.tab 分支),避免一页拉四页数据。
 *
 * 纯展示,无状态、无 Date.now / Math.random / 网络。active 由 route 从
 * searchParams 解析后传入。
 */

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface QueryTabDef {
  readonly id: string;
  readonly label: string;
}

export interface QueryTabsProps {
  /** 归属路由(如 "/projects"),href 拼为 `${basePath}?tab=${id}`。 */
  readonly basePath: string;
  readonly tabs: ReadonlyArray<QueryTabDef>;
  /** 当前激活 tab id(route 已归一化)。 */
  readonly active: string;
  readonly className?: string;
}

export function QueryTabs({ basePath, tabs, active, className }: QueryTabsProps) {
  return (
    <nav
      data-slot="query-tabs"
      data-testid="query-tabs"
      aria-label="页面视图切换"
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-card border border-border bg-surface p-1",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={`${basePath}?tab=${tab.id}`}
            data-slot="query-tab"
            data-tab-id={tab.id}
            data-active={isActive ? "true" : "false"}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-8 items-center rounded-control px-3 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-brand-soft font-medium text-brand"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
