"use client";

// @项目引用下拉(T-039b)—— 在 ChatBox 输入框上方弹出的项目补全列表。纯展示 + 键盘/点击回调,
// active @query 检测 / 过滤 / 应用替换的逻辑在 project-mention.ts(纯函数,已单测)。
//
// 诚实空态:项目列表为空(该用户还没建项目)→ 提示「先建项目」,不摆假行(与 copilot 其它
// feed 的诚实空态一致)。加载中 → 「加载中…」。有匹配 → 列表;有查询但无匹配 → 「无匹配项目」。

import * as React from "react";
import { FolderOpen } from "lucide-react";
import type { ProjectOption } from "./project-mention";

export interface ProjectMentionMenuProps {
  /** 当前要展示的项目候选(已按 @query 过滤 + 截断)。 */
  readonly options: readonly ProjectOption[];
  /** 高亮项下标(键盘上下导航)。 */
  readonly activeIndex: number;
  /** 项目列表是否还在加载(懒加载首帧)。 */
  readonly loading: boolean;
  /** 用户当前输入的 @query(用于「无匹配」文案 + 区分「空库」vs「查无」)。 */
  readonly query: string;
  /** 库里是否**一个项目都没有**(诚实引导先建项目)。 */
  readonly empty: boolean;
  /** 选中某项目(点击 / 回车)。 */
  readonly onPick: (project: ProjectOption) => void;
  /** 鼠标移入某行 → 同步高亮(与键盘导航统一)。 */
  readonly onHover: (index: number) => void;
}

export function ProjectMentionMenu({
  options,
  activeIndex,
  loading,
  query,
  empty,
  onPick,
  onHover,
}: ProjectMentionMenuProps) {
  return (
    <div
      data-slot="project-mention-menu"
      role="listbox"
      aria-label="引用项目"
      className="absolute bottom-full left-0 z-30 mb-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
    >
      {loading ? (
        <p
          data-slot="project-mention-loading"
          className="px-2 py-2 text-[11px] text-muted-foreground"
        >
          加载中…
        </p>
      ) : empty ? (
        // 诚实:该用户还没有任何项目 → 引导先建,不摆假行。
        <p
          data-slot="project-mention-empty"
          className="px-2 py-2 text-[11px] text-muted-foreground"
        >
          你还没有项目。先在「项目」里新建一个，再用 @ 引用它。
        </p>
      ) : options.length === 0 ? (
        <p
          data-slot="project-mention-nomatch"
          className="px-2 py-2 text-[11px] text-muted-foreground"
        >
          没有匹配「{query}」的项目。
        </p>
      ) : (
        options.map((opt, idx) => (
          <button
            key={opt.id}
            type="button"
            role="option"
            aria-selected={idx === activeIndex}
            data-slot="project-mention-option"
            data-project-id={opt.id}
            data-active={idx === activeIndex ? "true" : undefined}
            // onMouseDown(而非 onClick):抢在 textarea blur 前触发,避免下拉先因失焦卸载导致点击丢失。
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(opt);
            }}
            onMouseEnter={() => onHover(idx)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-muted focus:outline-none data-[active=true]:bg-brand-soft"
          >
            <FolderOpen
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate text-[11px] font-medium text-foreground">
              {opt.title}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
