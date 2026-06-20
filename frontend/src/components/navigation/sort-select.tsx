"use client";

/**
 * `SortSelect` is the shared sort control (SPEC §7, "导航与筛选"). It uses a
 * real radio group with `fieldset`/`legend` semantics so the current sort is
 * announced to assistive tech, and surfaces the active option label. Callers
 * supply the available `options`; routing/persistence is left to callers.
 */

import * as React from "react";

import { cn } from "@/lib/utils";

export interface SortOption {
  readonly id: string;
  readonly label: string;
}

export interface SortSelectProps {
  readonly options: ReadonlyArray<SortOption>;
  readonly defaultSort?: string;
  readonly value?: string;
  readonly onSortChange?: (id: string) => void;
  readonly name?: string;
  readonly ariaLabel?: string;
  readonly className?: string;
}

export function SortSelect({
  options,
  defaultSort,
  value,
  onSortChange,
  name = "sort",
  ariaLabel = "排序",
  className,
}: SortSelectProps) {
  const [internalSort, setInternalSort] = React.useState<string>(
    defaultSort ?? options[0]?.id ?? "",
  );
  const sort = value ?? internalSort;
  const currentSortLabel =
    options.find((option) => option.id === sort)?.label ?? options[0]?.label ?? "";

  const select = (id: string) => {
    if (value === undefined) setInternalSort(id);
    onSortChange?.(id);
  };

  return (
    <div
      data-slot="sort-control"
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "flex h-10 min-w-32 items-center justify-between gap-2 whitespace-nowrap rounded-control border border-border bg-surface px-4 text-sm",
        className,
      )}
    >
      <fieldset className="flex items-center gap-1 border-0 p-0">
        <legend className="sr-only">排序方式</legend>
        {options.map((option) => (
          <label
            key={option.id}
            className={cn(
              "sr-only cursor-pointer items-center gap-1 rounded-full px-2 text-xs transition-colors",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={sort === option.id}
              onChange={() => select(option.id)}
              className="sr-only"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      <span className="text-foreground">{currentSortLabel}</span>
      <span aria-hidden="true" className="text-muted-foreground">▾</span>
    </div>
  );
}
