"use client";

/**
 * `StatusTabsBar` is the canonical status filter strip used by the Projects
 * page (SPEC §2). The component owns the visual + a11y state for the
 * active status filter.
 *
 * The page spec locks the tab order to 全部 / 进行中 / 待办中 / 已暂停 /
 * 已完成 / 已归档. The page supplies the counts; the component renders the
 * labels exactly as defined by the spec.
 *
 * The component is intentionally thin: it does NOT own routing. Page-level
 * callers wire the active state to their own router (search params). This
 * component only manages visual + a11y state.
 */

import * as React from "react";

export interface StatusTabsBarTab {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export interface StatusTabsBarProps {
  readonly tabs: ReadonlyArray<StatusTabsBarTab>;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
}

export function StatusTabsBar({
  tabs,
  value,
  defaultValue,
  onValueChange,
}: StatusTabsBarProps) {
  const [internalValue, setInternalValue] = React.useState<string>(
    defaultValue ?? tabs[0]?.id ?? "",
  );
  const active = value ?? internalValue;

  const handleSelect = React.useCallback(
    (id: string) => {
      if (value === undefined) {
        setInternalValue(id);
      }
      onValueChange?.(id);
    },
    [onValueChange, value],
  );

  return (
    <div
      data-slot="status-tabs"
      aria-label="项目状态筛选"
      className="w-full"
    >
      <div
        role="tablist"
        aria-label="项目状态筛选"
        className="flex w-full items-center gap-2 overflow-x-auto"
        data-slot="status-tabs-list"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-slot="status-tab"
              data-tab-id={tab.id}
              data-tab-label={tab.label}
              onClick={() => handleSelect(tab.id)}
              className={
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 " +
                (isActive
                  ? "bg-brand-soft font-medium text-brand"
                  : "bg-surface-subtle text-muted-foreground hover:text-foreground")
              }
            >
              <span>{tab.label}</span>
              <span
                data-testid="status-tab-count"
                className="tabular-nums text-xs"
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}