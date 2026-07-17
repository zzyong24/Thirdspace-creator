"use client";

/**
 * 对话内素材列表卡(T-055c,SPEC §5.1)。
 *
 * context.materials 工具搜到的素材(真数据,只读)渲成列表卡;有项目上下文时每条可
 * 「加入弹药」= createMaterialLink(projectId ⇄ asset)—— 落的是既有 material_links
 * 实体(稿面弹药抽屉 / 制作工作台同一数据源),不新造轮子。
 * 无项目上下文 → 只读列表 + 显式提示(不静默禁用)。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";

export interface ChatMaterialItem {
  id: string;
  title: string;
  kind: string;
}

export function ChatMaterialListCard({
  items,
  projectId,
  query,
}: {
  items: ReadonlyArray<ChatMaterialItem>;
  projectId: string | null;
  // [T-380] 本次生效的搜索词(空串/缺省 = 列全量)。空态据此区分「带词没搜到(仅标题匹配,
  // 素材可能存在)」vs「库真的是空的」,不再误导性地一律说去倒素材。
  query?: string;
}) {
  const router = useRouter();
  // 逐条关联态:idle | linking | linked | error。
  const [states, setStates] = React.useState<
    Record<string, "linking" | "linked" | "error">
  >({});

  const link = React.useCallback(
    async (assetId: string) => {
      if (!projectId) return;
      setStates((prev) => ({ ...prev, [assetId]: "linking" }));
      try {
        await client.createMaterialLink({
          params: undefined,
          query: undefined,
          body: {
            projectId,
            entityType: "asset",
            entityId: assetId,
            role: "reference",
            stage: "script",
          },
        });
        setStates((prev) => ({ ...prev, [assetId]: "linked" }));
        router.refresh();
      } catch {
        setStates((prev) => ({ ...prev, [assetId]: "error" }));
      }
    },
    [projectId, router],
  );

  if (items.length === 0) {
    const q = (query ?? "").trim();
    return (
      <div
        data-slot="chat-material-card"
        data-empty="true"
        className="mt-1 rounded-[10px] border border-dashed border-border px-3 py-2 text-[11px] text-text-subtle"
      >
        {q
          ? `没搜到匹配「${q}」的素材(仅按标题搜)—— 素材可能存在但标题不含此词。`
          : "素材库里还没有素材 —— 去制作工作台倒一些进来。"}
      </div>
    );
  }

  return (
    <div
      data-slot="chat-material-card"
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        素材库命中 · {items.length} 件
      </span>
      <ol className="flex flex-col gap-1">
        {items.map((m) => {
          const s = states[m.id];
          return (
            <li
              key={m.id}
              data-slot="chat-material-item"
              className="flex items-center gap-2 rounded-md px-1.5 py-1"
            >
              <span className="shrink-0 rounded-md bg-surface-subtle px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {m.kind}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                {m.title}
              </span>
              {projectId ? (
                s === "linked" ? (
                  <span className="shrink-0 text-[10px] font-medium text-success">
                    已进弹药
                  </span>
                ) : (
                  <button
                    type="button"
                    data-slot="chat-material-link"
                    disabled={s === "linking"}
                    onClick={() => void link(m.id)}
                    className="inline-flex h-6 shrink-0 items-center rounded-control border border-brand/40 px-2 text-[10px] font-medium text-brand hover:bg-brand-soft disabled:opacity-50"
                  >
                    {s === "linking" ? "关联中…" : s === "error" ? "重试" : "加入弹药"}
                  </button>
                )
              ) : null}
            </li>
          );
        })}
      </ol>
      {!projectId ? (
        <p className="text-[11px] text-text-subtle">
          未关联项目 —— 输入 @ 引用一个项目后可把素材加进它的弹药。
        </p>
      ) : null}
    </div>
  );
}
