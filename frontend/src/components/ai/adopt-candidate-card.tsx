"use client";

/**
 * `AdoptCandidateCard` — the reusable candidate-confirm surface (机制③). EVERY AI node in
 * the pipeline renders through this one component: it owns the whole loop —
 *
 *   「start」→ client.createAITask({ taskType, inputData })
 *     → poll client.getTask(taskId): running → keep polling;
 *        awaiting_confirmation → client.listTaskResults → parseItems → review;
 *        cancelled/failed → error
 *     → review: renderItem per candidate + 「采纳」 client.confirmTask → router.refresh()
 *
 * Generic over the item type T so each node supplies only its taskType, inputData,
 * parseItems (resultData → T[]) and renderItem. This is "AI proposes → human reviews →
 * 采纳 materializes" made into one widget; new nodes never re-implement polling/state.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { SectionCard } from "@/components/project/section-card";
import { client } from "@/lib/contract-client";

type Phase = "idle" | "running" | "review" | "done" | "error";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 75; // ~5 min — multi-angle agent work (WebSearch) can run minutes.

export interface AdoptCandidateCardProps<T> {
  title: string;
  description: string;
  startLabel: string;
  runningLabel: string;
  taskType: string;
  inputData: Record<string, unknown>;
  parseItems: (resultData: Record<string, unknown>) => T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  adoptLabel: (n: number) => string;
  doneLabel: (n: number) => string;
}

export function AdoptCandidateCard<T>({
  title,
  description,
  startLabel,
  runningLabel,
  taskType,
  inputData,
  parseItems,
  renderItem,
  adoptLabel,
  doneLabel,
}: AdoptCandidateCardProps<T>) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [items, setItems] = React.useState<T[]>([]);
  const [taskId, setTaskId] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const cancelledRef = React.useRef(false);

  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  const start = React.useCallback(async () => {
    setPhase("running");
    setItems([]);
    try {
      const task = (await client.createAITask({
        params: undefined,
        query: undefined,
        body: { taskType, inputData },
      })) as { id: string };
      setTaskId(task.id);
      for (let i = 0; i < MAX_POLLS; i++) {
        if (cancelledRef.current) return;
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (cancelledRef.current) return;
        const status = (await client.getTask({
          params: { taskId: task.id },
          query: undefined,
          body: undefined,
        })) as { status: string };
        if (status.status === "awaiting_confirmation") {
          const results = (await client.listTaskResults({
            params: { taskId: task.id },
            query: undefined,
            body: undefined,
          })) as unknown as Array<{ resultData: Record<string, unknown> }>;
          const candidate = results[results.length - 1];
          const got = candidate ? parseItems(candidate.resultData) : [];
          setItems(got);
          setPhase("review");
          return;
        }
        if (status.status === "cancelled" || status.status === "failed") {
          setPhase("error");
          return;
        }
      }
      setPhase("error"); // budget exhausted
    } catch {
      setPhase("error");
    }
  }, [taskType, inputData, parseItems]);

  const adopt = React.useCallback(async () => {
    if (!taskId) return;
    setConfirming(true);
    try {
      await client.confirmTask({
        params: { taskId },
        query: undefined,
        body: undefined,
      });
      setPhase("done");
      router.refresh();
    } catch {
      setPhase("error");
    } finally {
      setConfirming(false);
    }
  }, [taskId, router]);

  return (
    <div data-slot="adopt-candidate-card" data-task-type={taskType}>
      <SectionCard title={title} description={description}>
        <div className="flex flex-col gap-3">
          {phase === "idle" || phase === "done" ? (
            <button
              type="button"
              data-slot="adopt-start"
              onClick={start}
              className="inline-flex h-8 w-fit items-center gap-1.5 rounded-control bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90"
            >
              ✦ {startLabel}
            </button>
          ) : null}

          {phase === "running" ? (
            <div
              data-slot="adopt-running"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span className="size-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              {runningLabel}
            </div>
          ) : null}

          {phase === "review" ? (
            <div data-slot="adopt-review" className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                AI 给出 {items.length} 条，审阅后采纳：
              </p>
              <ul className="flex flex-col gap-1.5" aria-label="AI 候选">
                {items.map((item, i) => (
                  <li key={i} data-slot="adopt-item">
                    {renderItem(item, i)}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-slot="adopt-confirm"
                  disabled={confirming || items.length === 0}
                  onClick={adopt}
                  className="inline-flex h-8 items-center rounded-control bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                >
                  {adoptLabel(items.length)}
                </button>
                <button
                  type="button"
                  data-slot="adopt-discard"
                  disabled={confirming}
                  onClick={() => {
                    setItems([]);
                    setPhase("idle");
                  }}
                  className="inline-flex h-8 items-center rounded-control border border-border px-3 text-xs font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
                >
                  丢弃
                </button>
              </div>
            </div>
          ) : null}

          {phase === "done" ? (
            <p data-slot="adopt-done" className="text-sm text-success">
              ✓ {doneLabel(items.length)}
            </p>
          ) : null}

          {phase === "error" ? (
            <div data-slot="adopt-error" className="flex flex-col gap-1.5">
              <p className="text-sm text-destructive">
                AI 没成功（超时或出错）。
              </p>
              <button
                type="button"
                onClick={start}
                className="inline-flex h-7 w-fit items-center rounded-control border border-border px-2.5 text-xs font-medium text-foreground hover:bg-surface-subtle"
              >
                重试
              </button>
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
