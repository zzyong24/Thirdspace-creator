"use client";

/**
 * 稿面弹药区「记一条」(T-055g,SPEC §8.1)。
 *
 * 知识库从只读变弹药库:在稿面就地记一条(标题+正文+类型,knowledge.create 既有 op),
 * 创建后立刻 materialLinks.create 挂当前项目 —— 刷新即出现在弹药抽屉(同一数据源)。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { PenLine } from "lucide-react";

import { client } from "@/lib/contract-client";

const NOTE_TYPES = [
  { value: "note", label: "笔记" },
  { value: "inspiration", label: "灵感" },
  { value: "reference", label: "参考" },
  { value: "snippet", label: "金句" },
] as const;

export function AmmoNoteForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [knowledgeType, setKnowledgeType] =
    React.useState<(typeof NOTE_TYPES)[number]["value"]>("note");
  const [state, setState] = React.useState<"idle" | "saving" | "error">(
    "idle",
  );

  const save = React.useCallback(async () => {
    const t = title.trim();
    if (!t || state === "saving") return;
    setState("saving");
    try {
      const created = (await client.createKnowledge({
        params: undefined,
        query: undefined,
        body: { title: t, knowledgeType, content: content.trim() },
      })) as unknown as { id: string };
      await client.createMaterialLink({
        params: undefined,
        query: undefined,
        body: {
          projectId,
          entityType: "knowledge",
          entityId: created.id,
          role: "reference",
          stage: "script",
        },
      });
      setTitle("");
      setContent("");
      setState("idle");
      setOpen(false);
      router.refresh();
    } catch {
      setState("error");
    }
  }, [title, content, knowledgeType, projectId, router, state]);

  if (!open) {
    return (
      <button
        type="button"
        data-slot="ammo-note-open"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-control border border-dashed border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
      >
        <PenLine className="size-3" aria-hidden="true" />
        记一条
      </button>
    );
  }

  return (
    <div
      data-slot="ammo-note-form"
      className="mb-2 flex flex-col gap-1.5 rounded-card border border-border bg-surface px-3 py-2.5"
    >
      <div className="flex items-center gap-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="标题(如「评论区高频问题:xx」)"
          aria-label="创作素材标题"
          data-slot="ammo-note-title"
          className="h-7 min-w-0 flex-1 rounded-control border border-border bg-transparent px-2 text-xs text-foreground placeholder:text-text-subtle focus:outline-none focus:ring-1 focus:ring-ring/40"
        />
        <select
          value={knowledgeType}
          onChange={(e) =>
            setKnowledgeType(e.target.value as typeof knowledgeType)
          }
          aria-label="类型"
          data-slot="ammo-note-type"
          className="h-7 shrink-0 rounded-control border border-border bg-transparent px-1.5 text-[11px] text-muted-foreground focus:outline-none"
        >
          {NOTE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={2}
        placeholder="正文(可空)"
        aria-label="创作素材正文"
        data-slot="ammo-note-content"
        className="w-full resize-none rounded-control border border-border bg-transparent px-2 py-1.5 text-xs text-foreground placeholder:text-text-subtle focus:outline-none focus:ring-1 focus:ring-ring/40"
      />
      <div className="flex items-center justify-end gap-1.5">
        {state === "error" ? (
          <span className="mr-auto text-[11px] text-destructive">
            保存失败,重试
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-7 rounded-control px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          取消
        </button>
        <button
          type="button"
          data-slot="ammo-note-save"
          disabled={!title.trim() || state === "saving"}
          onClick={() => void save()}
          className="h-7 rounded-control bg-brand px-3 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
        >
          {state === "saving" ? "保存中…" : "保存到项目"}
        </button>
      </div>
    </div>
  );
}
