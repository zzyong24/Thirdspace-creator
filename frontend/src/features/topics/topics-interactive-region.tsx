"use client";

/**
 * `topics-interactive-region.tsx` — Client islands for the 选题候选池 page (七步③ ·
 * SPEC §5.5).
 *
 * needs-backend controls, each → its mapped contract op then `router.refresh()`:
 *  - `CreateCandidateForm` (新增候选) → `client.createCandidate` (source fixed 'idea';
 *    AI-sourced candidates arrive via the AI confirm flow, NOT this form — C-3).
 *  - `CandidateCard` 晋升为 Project → `client.promoteCandidate` → on success navigate
 *    to the new `/projects/:id`; 丢弃 → `client.patchCandidate { status:'dropped' }`.
 *  - `CandidateSortControl` (按 预测变现 / 定位契合 / 需求热度 排序) → re-issues
 *    `candidates.list` with the new `sort` via a URL search-param navigation.
 *
 * Determinism (C-5): every visible value comes from props; no Date.now / Math.random
 * / fetch in render. The mutation seam mirrors the monetization/positioning islands.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { CandidateResource } from "@/server/modules/candidate";

export type CandidateSortKey =
  | "predictedScore"
  | "positioningFit"
  | "demandCount";

const SORT_LABELS: Record<CandidateSortKey, string> = {
  predictedScore: "预测变现",
  positioningFit: "定位契合",
  demandCount: "需求热度",
};

// Shared island mutation seam: a `pending` guard blocks concurrent writes; on success
// it runs `after` (defaults to router.refresh) so the server re-reads persisted rows.
function useMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    (mutate: () => Promise<unknown>, after?: (result: unknown) => void) => {
      if (pending) return;
      setPending(true);
      void (async () => {
        try {
          const result = await mutate();
          if (after) after(result);
          else router.refresh();
        } finally {
          setPending(false);
        }
      })();
    },
    [pending, router],
  );
  return { pending, run, router };
}

export function CreateCandidateForm() {
  const { pending, run } = useMutation();
  const [title, setTitle] = React.useState("");
  const [angle, setAngle] = React.useState("");

  const valid = title.trim().length > 0;

  function submit() {
    if (!valid) return;
    run(() =>
      client.createCandidate({
        params: undefined,
        query: undefined,
        // source is fixed 'idea' (manual entry only, C-3).
        body: { title: title.trim(), angle: angle.trim(), source: "idea" },
      }),
    );
  }

  return (
    <form
      data-testid="create-candidate-form"
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        aria-label="选题标题"
        placeholder="选题标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="max-w-[14rem]"
      />
      <Input
        aria-label="切入角度"
        placeholder="切入角度（可空）"
        value={angle}
        onChange={(e) => setAngle(e.target.value)}
        className="max-w-[14rem]"
      />
      <Button type="submit" disabled={pending || !valid} className="self-start">
        新增候选
      </Button>
    </form>
  );
}

export function CandidateSortControl({ sort }: { readonly sort: CandidateSortKey }) {
  const { router } = useMutation();

  function onChange(next: string) {
    if (next === sort) return;
    // Re-issue candidates.list with the new sort by navigating the search param;
    // the server component re-reads the sorted pool. No mutation op.
    router.push(`/topics?sort=${next}`);
  }

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      排序
      <select
        aria-label="候选排序"
        data-testid="candidate-sort-control"
        value={sort}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
      >
        {(Object.keys(SORT_LABELS) as CandidateSortKey[]).map((k) => (
          <option key={k} value={k}>
            {SORT_LABELS[k]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CandidateCard({
  candidate,
  sourceLabel,
}: {
  readonly candidate: CandidateResource;
  readonly sourceLabel: string;
}) {
  const { pending, run, router } = useMutation();

  function promote() {
    run(
      () =>
        client.promoteCandidate({
          params: { candidateId: candidate.id },
          query: undefined,
          body: {},
        }),
      (result) => {
        const projectId = (result as { projectId?: string } | null)?.projectId;
        if (projectId) router.push(`/projects/${projectId}`);
        else router.refresh();
      },
    );
  }

  function drop() {
    run(() =>
      client.patchCandidate({
        params: { candidateId: candidate.id },
        query: undefined,
        body: { status: "dropped" },
      }),
    );
  }

  return (
    <li
      data-testid="candidate-card"
      data-candidate-id={candidate.id}
      data-source={candidate.source}
      data-status={candidate.status}
      className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-foreground">
            {candidate.title}
          </span>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {sourceLabel}
          </Badge>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || candidate.status === "promoted"}
            onClick={promote}
          >
            晋升为 Project
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending || candidate.status === "dropped"}
            onClick={drop}
          >
            丢弃
          </Button>
        </span>
      </div>
      {candidate.angle ? (
        <p className="text-xs text-muted-foreground">{candidate.angle}</p>
      ) : null}
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span data-testid="candidate-predicted-score">
          预测变现 {candidate.predictedScore ?? "—"}
        </span>
        <span data-testid="candidate-positioning-fit">
          定位契合 {candidate.positioningFit ?? "—"}
        </span>
        <span data-testid="candidate-demand-count">
          需求热度 {candidate.demandCount}
        </span>
      </div>
    </li>
  );
}
