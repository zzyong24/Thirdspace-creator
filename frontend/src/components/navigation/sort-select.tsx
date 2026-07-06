"use client";

/**
 * `SortSelect` is the shared sort control (SPEC §7, "导航与筛选"). It uses a
 * real radio group with `fieldset`/`legend` semantics so the current sort is
 * announced to assistive tech, and surfaces the active option label. Callers
 * supply the available `options`; routing/persistence is left to callers.
 *
 * [T-153] 修「点不了」bug:旧版把所有 radio label 都 `sr-only`(纯装饰),视觉上只有
 *   一个「当前项 + ▾」的假下拉——点击毫无反应。改成真正可点击的下拉:trigger 按钮
 *   toggle 一个浮层菜单,菜单项点击 → 选中 + 收起。radio 组保留(a11y + 测试锚),
 *   菜单项 onClick 复用同一 `select`,键盘可达(Esc 收起、点外部收起)。
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
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const sort = value ?? internalSort;
  const currentSortLabel =
    options.find((option) => option.id === sort)?.label ??
    options[0]?.label ??
    "";

  const select = (id: string) => {
    if (value === undefined) setInternalSort(id);
    onSortChange?.(id);
    setOpen(false);
  };

  // 点面板外部 / 按 Esc → 收起下拉。
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      data-slot="sort-control"
      role="group"
      aria-label={ariaLabel}
      className={cn("relative", className)}
    >
      {/* 真 trigger:点击 toggle 菜单(旧版这里没有交互 = 用户报「点不了」的根因)。 */}
      <button
        type="button"
        data-slot="sort-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 min-w-32 items-center justify-between gap-2 whitespace-nowrap rounded-control border border-border bg-surface px-4 text-sm transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="text-muted-foreground">排序</span>
        <span className="text-foreground">{currentSortLabel}</span>
        <span
          aria-hidden="true"
          className={cn(
            "text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        >
          ▾
        </span>
      </button>

      {/* a11y radio 组:保留 fieldset/legend 语义(读屏播报 + 测试锚 input[type=radio])。
          菜单展开时可见可点;收起时藏起(仍在 DOM,radio checked 反映当前排序)。 */}
      <fieldset
        data-slot="sort-listbox"
        className={cn(
          "absolute right-0 z-20 mt-1 flex min-w-40 flex-col gap-0.5 rounded-control border border-border bg-surface p-1 shadow-md",
          open ? "flex" : "hidden",
        )}
      >
        <legend className="sr-only">排序方式</legend>
        {options.map((option) => {
          const active = sort === option.id;
          return (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-brand-soft text-brand"
                  : "text-foreground hover:bg-surface-subtle",
              )}
            >
              <span>{option.label}</span>
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={active}
                onChange={() => select(option.id)}
                className="sr-only"
              />
              {active ? (
                <span aria-hidden="true" className="text-brand">
                  ✓
                </span>
              ) : null}
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
