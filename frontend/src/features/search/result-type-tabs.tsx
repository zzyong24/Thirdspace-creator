"use client";

/**
 * `ResultTypeTabs` — 四个结果类型 tab(项目 / 知识 / 素材 / 视频)的 client 岛。
 *
 * [T-051 2d] 由「本地 state + DOM hidden 戏法」改为 URL 驱动的真分面:
 *
 *  - 点击 tab → `router.push(/search?q=…&type=<id>)`。route 把 `?type=` 传给
 *    `pages.search.get`(server 真窄化,不是前端把已渲染的组藏起来);
 *  - 点击已激活的 tab / 「显示全部」→ 去掉 `?type=`,回到全部结果;
 *  - 当前高亮来自 URL(route 解析后经 `activeType` prop 传入,server 真值),
 *    刷新 / 分享链接 / 前进后退都保持一致 —— 没有丢失于本地 state 的假激活。
 *
 * tab 上的计数是后端的全量分面计数(不受 per-type top-N 截断),所以窄化到
 * 某一类时,其它 tab 的徽标仍显示各自的真实命中数,切换不致盲飞。
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export interface ResultTypeTabsTab {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export interface ResultTypeTabsProps {
  readonly tabs: ReadonlyArray<ResultTypeTabsTab>;
  readonly totalCount: number;
  /** 当前激活的类型分面(来自 URL ?type=,由 route 白名单校验后传入)。 */
  readonly activeType?: string;
}

export function ResultTypeTabs({
  tabs,
  totalCount,
  activeType,
}: ResultTypeTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 统一的导航函数:保留现有 ?q= 等参数,只增删 ?type=。push(非 replace)
  // 让分面切换进浏览器历史,后退可回到「全部」视图。
  const navigateToType = React.useCallback(
    (type: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (type) {
        params.set("type", type);
      } else {
        params.delete("type");
      }
      const qs = params.toString();
      router.push(qs ? `/search?${qs}` : "/search", { scroll: false });
    },
    [router, searchParams],
  );

  const handleClick = React.useCallback(
    (tabId: string) => {
      // 再点已激活的 tab = 清除窄化,回到全部结果。
      navigateToType(tabId === activeType ? null : tabId);
    },
    [navigateToType, activeType],
  );

  return (
    <div
      data-slot="result-type-tabs-block"
      data-active-type={activeType ?? "all"}
      className="-mt-1 flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* §290 结果类型 tab —— URL 驱动的真分面(?type= 由 server 消费)。 */}
        <nav
          data-slot="result-type-tabs"
          aria-label="搜索结果类型"
          className="flex flex-wrap items-center gap-1.5"
        >
          {tabs.map((tab) => {
            const pressed = activeType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-slot="result-type-tab"
                data-tab-id={tab.id}
                data-pressed={pressed ? "true" : "false"}
                aria-selected={pressed}
                onClick={() => handleClick(tab.id)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-subtle data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
              >
                <span>{tab.label}</span>
                <span
                  data-slot="result-type-tab-count"
                  className="font-mono text-[10px] text-muted-foreground data-[pressed=true]:text-brand/70"
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </nav>
        <span
          data-slot="result-type-sort"
          className="text-[11px] text-muted-foreground"
        >
          按相关性排序
        </span>
      </div>
      <div
        data-slot="result-type-meta"
        className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"
      >
        <span data-slot="result-type-count">
          {activeType ? (
            <>
              已筛选「
              <span className="text-foreground">
                {tabs.find((t) => t.id === activeType)?.label ?? activeType}
              </span>
              」 ·{" "}
              <button
                type="button"
                data-slot="result-type-clear"
                onClick={() => navigateToType(null)}
                className="font-medium text-brand hover:underline"
              >
                显示全部
              </button>
            </>
          ) : (
            <>
              找到 <span className="font-mono text-foreground">{totalCount}</span> 个结果
            </>
          )}
        </span>
      </div>
    </div>
  );
}
