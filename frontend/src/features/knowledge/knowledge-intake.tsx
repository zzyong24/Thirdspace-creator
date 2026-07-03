"use client";

/**
 * 知识归类内核([T-063d] 从 knowledge-dump-zone 抽出)—— 知识倾倒场
 * (knowledge-dump-zone,/knowledge 独立页)与库页统一倾倒场
 * (features/library/library-dump-zone)共用的知识流内核,不重写、只收口:
 *
 *   - `classifyKnowledgeText`:POST /api/knowledge/classify(knowledge.classify
 *     AI 节点,capability 走 model-config)→ Classification 候选,失败抛 Error;
 *   - `createKnowledgeEntry`:contract knowledge.create(人点确认才物化);
 *   - `KnowledgeClassifyCard`:确认门卡片(type/title 可改),data-slot 原样保留
 *     (knowledge-classify-*),受控组件由宿主管 busy/error;
 *   - `KnowledgeManualForm`:手动补录次入口(title+type,正文由宿主输入框供给);
 *   - `readTextFile` / `TEXT_FILE_RE`:.md/.txt 拖入读文本。
 *
 * 铁律不变:AI 只产候选,确认门后才写库;失败内联错误、输入保留 [gate-F2]。
 */

import * as React from "react";

import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";

export type KnowledgeType =
  | "note"
  | "reference"
  | "inspiration"
  | "snippet"
  | "transcript";

export interface Classification {
  knowledgeType: KnowledgeType;
  title: string;
  tags: string[];
  summary: string;
}

// 类型下拉选项 —— 5 枚举同 contract knowledge.create 的 body(中文名同筛选 chip)。
export const TYPE_OPTIONS: ReadonlyArray<{ value: KnowledgeType; label: string }> = [
  { value: "note", label: "笔记" },
  { value: "reference", label: "参考" },
  { value: "inspiration", label: "灵感" },
  { value: "snippet", label: "片段" },
  { value: "transcript", label: "记录" },
];

// 可读入的文本文件后缀(T-062c SPEC §4:拖入 .md/.txt)。
export const TEXT_FILE_RE = /\.(md|txt|markdown)$/i;

/** FileReader 读文本文件(Promise 包装;单测 jsdom 原生支持)。 */
export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("读文件失败"));
    reader.readAsText(file);
  });
}

export const knowledgeInputCls =
  "rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
export const knowledgeButtonCls =
  "inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";

/** 「归类」内核:POST /api/knowledge/classify → 候选;失败抛 Error(宿主内联展示)。 */
export async function classifyKnowledgeText(
  content: string,
): Promise<Classification> {
  const res = await fetch("/api/knowledge/classify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const json = (await res.json().catch(() => null)) as
    | { classification?: Classification; error?: string }
    | null;
  if (!res.ok || !json?.classification) {
    throw new Error(json?.error || `归类失败(HTTP ${res.status})`);
  }
  return json.classification;
}

/** 落库内核:contract knowledge.create(确认门后调用)。 */
export async function createKnowledgeEntry(
  title: string,
  knowledgeType: KnowledgeType,
  content: string,
): Promise<void> {
  await client.createKnowledge({
    params: undefined,
    query: undefined,
    body: { title, knowledgeType, content },
  });
}

// ---------------------------------------------------------------------------
// 确认门卡片:AI 判的归类候选,type/title 可改;人点「存入知识库」才落库。
// ---------------------------------------------------------------------------

export function KnowledgeClassifyCard({
  card,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  readonly card: Classification;
  /** true = 保存中(禁交互)。 */
  readonly busy: boolean;
  readonly onChange: (next: Classification) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <div
      data-slot="knowledge-classify-card"
      className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2.5"
    >
      <p className="text-[11px] text-muted-foreground">
        AI 归类结果(类型/标题可改,确认后存入知识库)
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="knowledge-classify-type">
          类型
        </label>
        <select
          id="knowledge-classify-type"
          data-slot="knowledge-classify-type"
          value={card.knowledgeType}
          onChange={(e) =>
            onChange({ ...card, knowledgeType: e.target.value as KnowledgeType })
          }
          className="h-8 rounded-md border border-border bg-surface px-2 text-[13px] text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="knowledge-classify-title">
          标题
        </label>
        <input
          id="knowledge-classify-title"
          data-slot="knowledge-classify-title"
          type="text"
          value={card.title}
          onChange={(e) => onChange({ ...card, title: e.target.value })}
          className={cn(knowledgeInputCls, "h-8 min-w-0 flex-1 py-0")}
        />
      </div>
      {card.summary ? (
        <p
          data-slot="knowledge-classify-summary"
          className="text-[12px] text-muted-foreground"
        >
          {card.summary}
        </p>
      ) : null}
      {card.tags.length > 0 ? (
        <div data-slot="knowledge-classify-tags" className="flex flex-wrap gap-1">
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-slot="knowledge-classify-save"
          disabled={busy || card.title.trim().length === 0}
          onClick={onSave}
          className={cn(
            knowledgeButtonCls,
            "bg-brand text-brand-foreground hover:bg-brand/90",
          )}
        >
          {busy ? "存入中…" : "存入知识库"}
        </button>
        <button
          type="button"
          data-slot="knowledge-classify-cancel"
          disabled={busy}
          onClick={onCancel}
          className={cn(
            knowledgeButtonCls,
            "border border-border bg-surface text-foreground hover:bg-surface-subtle",
          )}
        >
          返回修改
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 手动补录次入口(旧「新建知识」表单退役至此):最小字段 title + type,
// 正文由宿主的倾倒场输入框供给。
// ---------------------------------------------------------------------------

export function KnowledgeManualForm({
  busy,
  onSave,
}: {
  /** true = 保存中(禁提交)。 */
  readonly busy: boolean;
  /** 提交回调(title 已 trim 非空);写库/错误/复位由宿主管。 */
  readonly onSave: (title: string, knowledgeType: KnowledgeType) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<KnowledgeType>("note");
  return (
    <form
      data-slot="knowledge-manual-form"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = title.trim();
        if (!trimmed || busy) return;
        onSave(trimmed, type);
      }}
      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2.5"
    >
      <label className="sr-only" htmlFor="knowledge-manual-title">
        标题
      </label>
      <input
        id="knowledge-manual-title"
        data-slot="knowledge-manual-title"
        type="text"
        placeholder="标题(正文用上面的输入框)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={cn(knowledgeInputCls, "h-8 min-w-0 flex-1 py-0")}
      />
      <label className="sr-only" htmlFor="knowledge-manual-type">
        类型
      </label>
      <select
        id="knowledge-manual-type"
        data-slot="knowledge-manual-type"
        value={type}
        onChange={(e) => setType(e.target.value as KnowledgeType)}
        className="h-8 rounded-md border border-border bg-surface px-2 text-[13px] text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        data-slot="knowledge-manual-save"
        disabled={busy || title.trim().length === 0}
        className={cn(
          knowledgeButtonCls,
          "bg-brand text-brand-foreground hover:bg-brand/90",
        )}
      >
        直接存入
      </button>
    </form>
  );
}
