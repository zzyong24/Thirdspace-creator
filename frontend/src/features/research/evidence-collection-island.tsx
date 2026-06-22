"use client";

/**
 * `EvidenceCollectionIsland` — Client island for the Research workspace's 证据收藏
 * card (Module 06 F2b). Extracted from the server-only `EvidenceCollectionCard`.
 * Each evidence row is a KnowledgeItem; the 关联证据 (Link) control creates a
 * source→target KnowledgeRelation:
 *
 *   island → client.createKnowledgeRelation({
 *              params:{ knowledgeId: sourceId },
 *              body:{ targetKnowledgeId, relationType:'supports' } })
 *          → router.refresh()
 *
 * "unlink" has NO contract op in this module's surface (no
 * knowledge.relations.delete), so the 取消关联 button is rendered DISABLED with a
 * title explaining it — a known gap, NOT a fabricated op.
 *
 * The island keeps the existing `data-slot`s (`evidence-list`, `evidence-row`) so
 * `research-workspace-page.test.tsx` selectors hold. Determinism: no
 * Date.now/Math.random/fetch — the real relation id/clock live in the service.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { SectionCard } from "@/components/project/section-card";
import { client } from "@/lib/contract-client";
import type { ResearchViewModel } from "@/types/view-models";

export function EvidenceCollectionIsland({
  items,
}: {
  items: ResearchViewModel["evidence"];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const onLink = React.useCallback(
    (sourceId: string, targetKnowledgeId: string) => {
      if (pending) return;
      startTransition(async () => {
        await client.createKnowledgeRelation({
          params: { knowledgeId: sourceId },
          query: undefined,
          body: { targetKnowledgeId, relationType: "supports" },
        });
        router.refresh();
      });
    },
    [pending, router],
  );

  return (
    <div data-slot="evidence-collection-card">
      <SectionCard title="证据收藏" description="已关联到论点的证据">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无证据。</p>
        ) : (
          <ul
            data-slot="evidence-list"
            className="flex flex-col gap-1.5"
            aria-label="证据列表"
          >
            {items.map((item) => (
              <li
                key={item.id}
                data-slot="evidence-row"
                data-knowledge-id={item.knowledgeId}
                className="flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 py-2"
              >
                <span
                  className="size-1.5 shrink-0 rounded-full bg-brand"
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{item.type}</span>
                </div>
                <button
                  type="button"
                  data-slot="evidence-link-button"
                  disabled={pending}
                  onClick={() => onLink(item.knowledgeId, item.targetKnowledgeId)}
                  className="shrink-0 text-xs font-medium text-brand hover:underline disabled:opacity-50"
                >
                  关联证据
                </button>
                {/* unlink has no contract op (no knowledge.relations.delete) →
                    rendered disabled with an explanatory title; known gap. */}
                <button
                  type="button"
                  data-slot="evidence-unlink-button"
                  disabled
                  title="暂不支持取消关联"
                  className="shrink-0 cursor-not-allowed text-xs font-medium text-muted-foreground opacity-50"
                >
                  取消关联
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
