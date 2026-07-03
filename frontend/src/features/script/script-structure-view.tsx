"use client";

/**
 * 口播脚本「编辑 | 结构」双视图(T-070,用户反馈:「展示的时候起码要结构化一下,
 * 方便我们来看」)。
 *
 * 编辑视图 = 现有 TipTap(children 原样);结构视图 = 只读分段卡:
 * 段序号 + 段型徽章(钩子/开场/正文/转场/收尾/金句)+ 标题 + 正文 + 时间与字数。
 * 数据 = 当前版本 contentData.sections(AI 整稿/编辑器保存都产);无分段时诚实
 * 引导(让编导整稿起草会自动带分段),不硬拆。
 */

import * as React from "react";

import type { ScriptSectionView } from "@/types/view-models";

const TYPE_LABEL: Record<ScriptSectionView["type"], { label: string; cls: string }> = {
  hook: { label: "钩子", cls: "bg-brand-soft text-brand" },
  intro: { label: "开场", cls: "bg-surface-subtle text-muted-foreground" },
  body: { label: "正文", cls: "bg-surface-subtle text-muted-foreground" },
  transition: { label: "转场", cls: "bg-surface-subtle text-muted-foreground" },
  outro: { label: "收尾", cls: "bg-surface-subtle text-muted-foreground" },
  golden_quote: { label: "金句", cls: "bg-amber-100 text-amber-700" },
};

function seconds(v: number): string {
  const m = Math.floor(v / 60);
  const s = Math.round(v % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ScriptStructureToggle({
  sections,
  children,
}: {
  readonly sections: ReadonlyArray<ScriptSectionView>;
  readonly children: React.ReactNode;
}) {
  const [view, setView] = React.useState<"edit" | "structure">("edit");
  return (
    <div className="flex flex-col gap-2">
      <div
        data-slot="script-view-switch"
        className="flex items-center gap-1 self-end"
      >
        {(
          [
            { key: "edit", label: "编辑" },
            { key: "structure", label: "结构" },
          ] as const
        ).map((v) => (
          <button
            key={v.key}
            type="button"
            data-slot={`script-view-${v.key}`}
            data-active={view === v.key}
            onClick={() => setView(v.key)}
            className={
              "h-6 rounded-control px-2 text-xs transition-colors " +
              (view === v.key
                ? "bg-brand text-brand-foreground"
                : "border border-border text-muted-foreground hover:text-foreground")
            }
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "edit" ? (
        children
      ) : (
        <ScriptStructureView sections={sections} />
      )}
    </div>
  );
}

function ScriptStructureView({
  sections,
}: {
  readonly sections: ReadonlyArray<ScriptSectionView>;
}) {
  if (sections.length === 0) {
    return (
      <div
        data-slot="script-structure-empty"
        className="rounded-card border border-dashed border-border bg-surface-subtle/50 px-4 py-8 text-center text-sm text-muted-foreground"
      >
        脚本还没有结构化分段——在右侧让编导整稿起草会自动带分段,或在编辑视图用标题(H2/H3)分段后保存。
      </div>
    );
  }
  return (
    <ol data-slot="script-structure-view" className="flex flex-col gap-2">
      {sections.map((s, i) => {
        const t = TYPE_LABEL[s.type] ?? TYPE_LABEL.body;
        const time =
          s.startSeconds !== null && s.endSeconds !== null
            ? `${seconds(s.startSeconds)}–${seconds(s.endSeconds)}`
            : null;
        return (
          <li
            key={s.id}
            data-slot="script-structure-section"
            className={
              "rounded-card border bg-surface px-4 py-3 " +
              (s.emphasis ? "border-brand/50" : "border-border")
            }
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-semibold text-text-subtle">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${t.cls}`}
              >
                {t.label}
              </span>
              {s.heading ? (
                <span className="truncate text-[13px] font-semibold text-foreground">
                  {s.heading}
                </span>
              ) : null}
              <span className="ml-auto shrink-0 text-[11px] text-text-subtle">
                {time ? `${time} · ` : ""}
                {s.body.length} 字
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {s.body}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
