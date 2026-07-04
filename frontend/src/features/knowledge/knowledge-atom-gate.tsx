"use client";

/**
 * [T-094] 蒸馏批量确认门(共享组件)—— 从 knowledge-dump-zone 的内联确认门抽出:
 * 一批知识原子候选行卡(每条 checkbox 默认全选 + type 四原子下拉 + title 可编辑 +
 * sourceNote 可改)→ 人点「采纳选中 N 条」→ 逐条 contract knowledge.create(title/
 * knowledgeType/content=note/sourceNote)+ suggestedTags 挂 tag(best-effort)+
 * 可选「原文同时存档」(多存一条 type=reference,title=原文首行≤60 字,content=全文)。
 *
 * 消费方:
 *   - Copilot 蒸馏工具卡(features/copilot/chat-distill-card,T-094 主入口);
 *   - (倾倒场旧表单蒸馏流已退役 —— 入口深链改开 Copilot,见 knowledge-dump-zone。)
 *
 * 铁律②:AI 只产候选,人点「采纳」才物化;采纳失败内联错误保留候选(已成条目不回滚,
 * 诚实呈现)[gate-F2]。tag 挂载是增强,失败不阻断原子入库。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";

// 四原子(T-079a 契约)—— 蒸馏产的类型;reference 留给原文存档。
export type AtomType = "claim" | "evidence" | "quote" | "qa";

/** 蒸馏产的单个原子候选(工具结果 / 旧 distill 路由同形)。 */
export interface DistilledAtom {
  type: AtomType;
  title: string;
  note: string;
  sourceNote: string;
}

/** 确认门里的一行原子(候选 + 勾选态;type/title/sourceNote 可改)。 */
interface AtomRow extends DistilledAtom {
  selected: boolean;
}

// 四原子中文词表(确认门 type 下拉;同 §3 知识卡徽章语义)。
export const ATOM_TYPE_OPTIONS: ReadonlyArray<{ value: AtomType; label: string }> = [
  { value: "claim", label: "观点" },
  { value: "evidence", label: "证据" },
  { value: "quote", label: "金句" },
  { value: "qa", label: "观众问题" },
];

/** 原文存档标题:首个非空行截 60 字(SPEC §2:title=原文标题或首行)。 */
export function archiveTitleOf(raw: string): string {
  const firstLine =
    raw
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  return firstLine.slice(0, 60);
}

/**
 * 把 suggestedTags 挂到知识条目(taxonomy:listTags 找同名 → 缺的 createTag →
 * assignTags entityType=knowledge)。best-effort:标签是增强,失败不阻断入库。
 */
export async function assignKnowledgeTagsBestEffort(
  knowledgeId: string,
  tagNames: readonly string[],
): Promise<void> {
  if (tagNames.length === 0) return;
  try {
    const listed = (await client.listTags({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string; name: string }>;
    const byName = new Map(
      (Array.isArray(listed) ? listed : []).map((t) => [t.name, t.id]),
    );
    const tagIds: string[] = [];
    for (const name of tagNames) {
      const hit = byName.get(name);
      if (hit) {
        tagIds.push(hit);
        continue;
      }
      const created = (await client.createTag({
        params: undefined,
        query: undefined,
        body: { name, kind: "knowledge-topic" },
      })) as unknown as { id: string };
      tagIds.push(created.id);
    }
    await client.assignTags({
      params: undefined,
      query: undefined,
      body: { entityType: "knowledge", entityId: knowledgeId, tagIds },
    });
  } catch {
    /* 标签是增强,失败不阻断入库 */
  }
}

const inputCls =
  "rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const buttonCls =
  "inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";
const selectCls =
  "h-8 rounded-md border border-border bg-surface px-2 text-[13px] text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export interface KnowledgeAtomGateProps {
  /** 蒸馏产的原子候选(初值;门内可勾选/改 type/title/sourceNote)。 */
  atoms: ReadonlyArray<DistilledAtom>;
  /** AI 建议的主题词(采纳时随原子挂 tag,best-effort)。 */
  suggestedTags: ReadonlyArray<string>;
  /** 送蒸原文 —— 「原文同时存档」reference 条目(默认勾选)的数据源;空串则不渲该项。 */
  originalText: string;
  /** 采纳成功回调(可选;卡片消费方用它收尾)。 */
  onAdopted?: (count: number) => void;
}

export function KnowledgeAtomGate({
  atoms,
  suggestedTags,
  originalText,
  onAdopted,
}: KnowledgeAtomGateProps) {
  const router = useRouter();
  const [rows, setRows] = React.useState<AtomRow[]>(() =>
    // 默认全选(SPEC §2:人只做减法与微调)。
    atoms.map((a) => ({ ...a, selected: true })),
  );
  const [archiveOriginal, setArchiveOriginal] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  // 内联错误(非 toast 即逝)[gate-F2];成功后 adoptedCount 渲收尾态(候选不再可改)。
  const [error, setError] = React.useState<string | null>(null);
  const [adoptedCount, setAdoptedCount] = React.useState<number | null>(null);

  /** 就地改一行原子(勾选/type/title/sourceNote)。 */
  const patchRow = React.useCallback((index: number, patch: Partial<AtomRow>) => {
    setRows((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }, []);

  const selectedCount = rows.filter(
    (a) => a.selected && a.title.trim().length > 0,
  ).length;

  // 「采纳选中 N 条」→ 逐条 knowledge.create + tags 挂载(+ 可选原文 reference 存档)。
  const handleAdopt = React.useCallback(async () => {
    if (busy || adoptedCount !== null) return;
    const picked = rows.filter((a) => a.selected && a.title.trim().length > 0);
    if (picked.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const fullText = originalText.trim();
      for (const atom of picked) {
        const created = (await client.createKnowledge({
          params: undefined,
          query: undefined,
          body: {
            title: atom.title.trim(),
            knowledgeType: atom.type,
            // 原子本体在 title;note 是评注/上下文,落 content(可空)。
            content: atom.note.trim(),
            ...(atom.sourceNote.trim()
              ? { sourceNote: atom.sourceNote.trim() }
              : {}),
          },
        })) as unknown as { id: string };
        // AI 馆长(轻):suggestedTags 即主题挂载(best-effort,失败不阻断)。
        await assignKnowledgeTagsBestEffort(created.id, [...suggestedTags]);
      }
      // 「原文同时存档」:多存一条 reference(title=首行≤60 字,content=全文),出处不丢。
      if (archiveOriginal && fullText) {
        await client.createKnowledge({
          params: undefined,
          query: undefined,
          body: {
            title: archiveTitleOf(fullText) || "原文存档",
            knowledgeType: "reference",
            content: fullText,
          },
        });
      }
      setAdoptedCount(picked.length);
      onAdopted?.(picked.length);
      router.refresh();
    } catch (err) {
      // 失败内联保留候选(已成条目不回滚 —— 诚实呈现,refresh 后可见已入库的部分)。
      setError(err instanceof Error ? err.message : "采纳入库失败,请重试。");
    } finally {
      setBusy(false);
    }
  }, [
    rows,
    busy,
    adoptedCount,
    originalText,
    suggestedTags,
    archiveOriginal,
    onAdopted,
    router,
  ]);

  if (adoptedCount !== null) {
    return (
      <p
        data-slot="knowledge-atom-gate-done"
        className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-success"
      >
        已采纳 {adoptedCount} 条进知识库
        {archiveOriginal && originalText.trim() ? "(原文已同时存档)" : ""}。
      </p>
    );
  }

  return (
    <div
      data-slot="knowledge-distill-batch"
      className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2.5"
    >
      <p className="text-[11px] text-muted-foreground">
        蒸馏出 {rows.length} 个知识原子(勾选要留的,类型/标题/出处可改;采纳后进知识库)
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((atom, index) => (
          <li
            key={index}
            data-slot="knowledge-atom-row"
            className="flex flex-col gap-1.5 rounded-md border border-border/70 bg-surface-subtle/40 p-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                data-slot="knowledge-atom-select"
                aria-label={`采纳第 ${index + 1} 条`}
                checked={atom.selected}
                onChange={(e) => patchRow(index, { selected: e.target.checked })}
                className="size-4 accent-brand"
              />
              <label className="sr-only" htmlFor={`knowledge-atom-type-${index}`}>
                类型
              </label>
              <select
                id={`knowledge-atom-type-${index}`}
                data-slot="knowledge-atom-type"
                value={atom.type}
                onChange={(e) => patchRow(index, { type: e.target.value as AtomType })}
                className={selectCls}
              >
                {ATOM_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor={`knowledge-atom-title-${index}`}>
                标题
              </label>
              <input
                id={`knowledge-atom-title-${index}`}
                data-slot="knowledge-atom-title"
                type="text"
                value={atom.title}
                onChange={(e) => patchRow(index, { title: e.target.value })}
                className={cn(inputCls, "h-8 min-w-0 flex-1 py-0")}
              />
            </div>
            {atom.note ? (
              <p
                data-slot="knowledge-atom-note"
                className="pl-6 text-[12px] text-muted-foreground"
              >
                {atom.note}
              </p>
            ) : null}
            <div className="flex items-center gap-2 pl-6">
              <label
                className="shrink-0 text-[11px] text-muted-foreground"
                htmlFor={`knowledge-atom-source-${index}`}
              >
                出处
              </label>
              <input
                id={`knowledge-atom-source-${index}`}
                data-slot="knowledge-atom-source"
                type="text"
                placeholder="出处/可信度(可空)"
                value={atom.sourceNote}
                onChange={(e) => patchRow(index, { sourceNote: e.target.value })}
                className={cn(inputCls, "h-7 min-w-0 flex-1 py-0 text-[12px]")}
              />
            </div>
          </li>
        ))}
      </ul>
      {suggestedTags.length > 0 ? (
        <div data-slot="knowledge-distill-tags" className="flex flex-wrap gap-1">
          {suggestedTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {originalText.trim() ? (
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <input
            type="checkbox"
            data-slot="knowledge-distill-archive"
            checked={archiveOriginal}
            onChange={(e) => setArchiveOriginal(e.target.checked)}
            className="size-4 accent-brand"
          />
          原文同时存档(存一条「参考」,标题取首行)
        </label>
      ) : null}
      {/* 内联错误(非 toast):采纳失败落这,候选保留供重试 [gate-F2]。 */}
      {error ? (
        <p
          data-slot="knowledge-atom-gate-error"
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[12px] text-destructive"
        >
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-slot="knowledge-distill-adopt"
          disabled={busy || selectedCount === 0}
          onClick={() => void handleAdopt()}
          className={cn(buttonCls, "bg-brand text-brand-foreground hover:bg-brand/90")}
        >
          {busy ? "入库中…" : `采纳选中 ${selectedCount} 条`}
        </button>
      </div>
    </div>
  );
}
