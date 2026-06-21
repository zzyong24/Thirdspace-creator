"use client";

/**
 * `ResearchNotesIsland` — Client island for the Research workspace's 研究笔记
 * card (Module 06 F2a). Extracted from the server-only `ResearchNotesCard` so the
 * notes can be edited. A research note is a KnowledgeItem (`knowledgeType:'note'`)
 * referenced by the project; "add/edit notes" maps to revising that item:
 *
 *   island → client.createKnowledgeRevision({ params:{ knowledgeId }, body:{ content } })
 *          → router.refresh()
 *
 * The island keeps the existing `data-slot`s (`research-notes-list`,
 * `research-note-row`) so `research-workspace-page.test.tsx` selectors hold.
 *
 * Determinism: no Date.now/Math.random/fetch — the real revision id/clock live in
 * the server/service layer (injected RepoDeps).
 *
 * No `knowledge.notes.delete` op exists in this module's surface — "delete" is a
 * known gap (the only writes are append-only revisions); we expose add + edit.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { SectionCard } from "@/components/project/section-card";
import { client } from "@/lib/contract-client";
import type { ResearchViewModel } from "@/types/view-models";

export function ResearchNotesIsland({
  notes,
}: {
  notes: ResearchViewModel["notes"];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [showAdd, setShowAdd] = React.useState(false);
  const [addContent, setAddContent] = React.useState("");
  // 添加笔记 targets the first note's KnowledgeItem (the project's primary note);
  // if there are no notes the control is hidden (nothing to revise).
  const addTargetKnowledgeId = notes[0]?.knowledgeId ?? null;

  const submitRevision = React.useCallback(
    (knowledgeId: string, content: string, onDone: () => void) => {
      const trimmed = content.trim();
      if (trimmed.length === 0) return;
      startTransition(async () => {
        await client.createKnowledgeRevision({
          params: { knowledgeId },
          query: undefined,
          body: { content: trimmed },
        });
        onDone();
        router.refresh();
      });
    },
    [router],
  );

  return (
    <div data-slot="research-notes-card">
      <SectionCard title="研究笔记" description={`${notes.length} 条待整理笔记`}>
        <div className="flex flex-col gap-2">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无研究笔记。</p>
          ) : (
            <ul
              data-slot="research-notes-list"
              className="flex flex-col gap-1.5"
              aria-label="研究笔记"
            >
              {notes.map((note, index) => (
                <li
                  key={note.id}
                  data-slot="research-note-row"
                  data-knowledge-id={note.knowledgeId}
                  className="flex flex-col gap-1.5 rounded-control border border-border bg-surface px-2.5 py-2 text-sm text-foreground"
                >
                  <div className="flex gap-2">
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 leading-relaxed">{note.content}</span>
                    <button
                      type="button"
                      data-slot="research-note-edit"
                      disabled={pending}
                      onClick={() => {
                        setEditingId(note.id);
                        setDraft(note.content);
                      }}
                      className="shrink-0 text-xs font-medium text-brand hover:underline disabled:opacity-50"
                    >
                      编辑
                    </button>
                  </div>
                  {editingId === note.id ? (
                    <form
                      data-slot="research-note-edit-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        submitRevision(note.knowledgeId, draft, () => {
                          setEditingId(null);
                          setDraft("");
                        });
                      }}
                      className="flex flex-col gap-1.5"
                    >
                      <textarea
                        data-slot="research-note-edit-content"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        rows={2}
                        className="rounded-control border border-border bg-surface px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      />
                      <button
                        type="submit"
                        data-slot="research-note-edit-submit"
                        disabled={pending || draft.trim().length === 0}
                        className="inline-flex h-7 w-fit items-center rounded-control bg-brand px-2.5 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                      >
                        保存
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {addTargetKnowledgeId !== null ? (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                data-slot="research-notes-add-button"
                disabled={pending}
                onClick={() => setShowAdd((prev) => !prev)}
                className="inline-flex h-7 w-fit items-center rounded-control border border-border bg-surface px-2.5 text-xs font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
              >
                添加笔记
              </button>
              {showAdd ? (
                <form
                  data-slot="research-notes-add-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitRevision(addTargetKnowledgeId, addContent, () => {
                      setAddContent("");
                      setShowAdd(false);
                    });
                  }}
                  className="flex flex-col gap-1.5"
                >
                  <textarea
                    data-slot="research-notes-add-content"
                    placeholder="记录一条研究笔记"
                    value={addContent}
                    onChange={(event) => setAddContent(event.target.value)}
                    rows={2}
                    className="rounded-control border border-border bg-surface px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <button
                    type="submit"
                    data-slot="research-notes-add-submit"
                    disabled={pending || addContent.trim().length === 0}
                    className="inline-flex h-7 w-fit items-center rounded-control bg-brand px-2.5 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                  >
                    保存
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
