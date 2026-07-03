"use client";

/**
 * 对话内搜素材结果卡(T-057④,替代已退役的 GatherMaterialIsland)。
 *
 * material.gather 工具产的四类素材候选(钩子/案例/数据点/金句,带来源)渲成列表卡,
 * 逐条「存入弹药」= knowledge.create(sourceUrl 带来源链)+ materialLinks 挂当前项目
 * —— 与稿面「记一条」同链,人采纳落库(铁律②)。无项目上下文 → 只读 + 显式提示。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";

export interface ChatGatherItem {
  title: string;
  url: string;
  source: string;
  whyRelevant: string;
  category: string;
}

export function ChatGatherCard({
  items,
  projectId,
}: {
  items: ReadonlyArray<ChatGatherItem>;
  projectId: string | null;
}) {
  const router = useRouter();
  const [states, setStates] = React.useState<
    Record<number, "saving" | "saved" | "error">
  >({});

  const save = React.useCallback(
    async (index: number) => {
      const item = items[index];
      if (!item || !projectId) return;
      setStates((prev) => ({ ...prev, [index]: "saving" }));
      try {
        const created = (await client.createKnowledge({
          params: undefined,
          query: undefined,
          body: {
            title: item.title,
            knowledgeType: "reference",
            content: [item.whyRelevant, item.url && `来源:${item.url}`]
              .filter(Boolean)
              .join("\n"),
          },
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
        setStates((prev) => ({ ...prev, [index]: "saved" }));
        router.refresh();
      } catch {
        setStates((prev) => ({ ...prev, [index]: "error" }));
      }
    },
    [items, projectId, router],
  );

  if (items.length === 0) {
    return (
      <div
        data-slot="chat-gather-card"
        data-empty="true"
        className="mt-1 rounded-[10px] border border-dashed border-border px-3 py-2 text-[11px] text-text-subtle"
      >
        这轮没搜到可用素材 —— 换个关键词再试试。
      </div>
    );
  }

  return (
    <div
      data-slot="chat-gather-card"
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        搜到素材 · {items.length} 条 · 逐条存入弹药
      </span>
      <ol className="flex flex-col gap-1.5">
        {items.map((it, i) => {
          const s = states[i];
          return (
            <li
              key={`${i}-${it.title.slice(0, 8)}`}
              data-slot="chat-gather-item"
              className="flex flex-col gap-1 rounded-md border border-border/70 bg-surface-subtle/50 px-2.5 py-1.5"
            >
              <div className="flex items-start gap-2">
                <span className="shrink-0 rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {it.category}
                </span>
                <span className="min-w-0 flex-1 text-[13px] leading-snug text-foreground">
                  {it.title}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-text-subtle">
                {it.whyRelevant}
              </p>
              <div className="flex items-center justify-between gap-2">
                {it.url ? (
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-[10px] text-brand underline underline-offset-2"
                  >
                    {it.url}
                  </a>
                ) : (
                  <span />
                )}
                {projectId ? (
                  s === "saved" ? (
                    <span className="shrink-0 text-[10px] font-medium text-success">
                      已进弹药
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-slot="chat-gather-save"
                      disabled={s === "saving"}
                      onClick={() => void save(i)}
                      className="inline-flex h-6 shrink-0 items-center rounded-control border border-brand/40 px-2 text-[10px] font-medium text-brand hover:bg-brand-soft disabled:opacity-50"
                    >
                      {s === "saving" ? "存入中…" : s === "error" ? "重试" : "存入弹药"}
                    </button>
                  )
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {!projectId ? (
        <p className="text-[11px] text-text-subtle">
          未关联项目 —— 输入 @ 引用一个项目后可把素材存进它的弹药。
        </p>
      ) : null}
    </div>
  );
}
