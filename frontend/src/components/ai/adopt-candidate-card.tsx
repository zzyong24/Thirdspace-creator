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
 *
 * P4 hydration (切页不丢): the AI task lives server-side, but `phase`/`items`/`taskId` are
 * component-local React state — navigating away and back would reset them to idle even
 * though a task is still running or sitting in awaiting_confirmation. So on mount we
 * reconcile against the server: client.listAITasks → filter to THIS node's
 * (taskType ∩ inputData.projectId) with status∈{queued,running,awaiting_confirmation},
 * pick the newest, and resume — awaiting_confirmation → fetch its results → review;
 * queued/running → re-enter the poll loop. Reuses the existing ai.tasks.list read op
 * (no new contract op needed). Because every island wraps this one component, all nodes
 * inherit hydration for free.
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
  // CollabField(COLLAB-02):保留原始 items(用于 patch)+ 人删掉的下标 —— 采纳前可逐条筛掉。
  const [rawItems, setRawItems] = React.useState<unknown[]>([]);
  const [removed, setRemoved] = React.useState<ReadonlySet<number>>(
    () => new Set(),
  );
  // 步骤日志(AISTD):runner 每步 recordStep,这里轮询拉出来实时显示 —— 不是干转圈。
  const [steps, setSteps] = React.useState<
    { stepNo: number; text: string; kind: string }[]
  >([]);
  const [taskId, setTaskId] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const cancelledRef = React.useRef(false);
  // Set once the user (or hydration) takes over the loop, so a late-resolving mount
  // hydration never clobbers a fresh task the user just started in this same mount.
  const claimedRef = React.useRef(false);

  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  // Fetch a task's results and enter review. Shared by the poll loop (on
  // awaiting_confirmation) and by hydration (when a task is ALREADY awaiting on mount).
  const enterReview = React.useCallback(
    async (id: string) => {
      const results = (await client.listTaskResults({
        params: { taskId: id },
        query: undefined,
        body: undefined,
      })) as unknown as Array<{ resultData: Record<string, unknown> }>;
      const candidate = results[results.length - 1];
      const got = candidate ? parseItems(candidate.resultData) : [];
      const raw =
        candidate && Array.isArray(candidate.resultData.items)
          ? (candidate.resultData.items as unknown[])
          : [];
      setItems(got);
      setRawItems(raw);
      setRemoved(new Set());
      setPhase("review");
    },
    [parseItems],
  );

  // The createAITask→poll loop, factored out so both 「start」 (fresh task) and
  // hydration (resuming a queued/running task found server-side) drive the same machine.
  const pollUntilDone = React.useCallback(
    async (id: string) => {
      for (let i = 0; i < MAX_POLLS; i++) {
        if (cancelledRef.current) return;
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (cancelledRef.current) return;
        // 拉实时步骤事件喂步骤日志(辅助信息,拉失败不影响主轮询)。
        try {
          const stepRows = (await client.listTaskSteps({
            params: { taskId: id },
            query: undefined,
            body: undefined,
          })) as unknown as Array<{
            stepNo: number;
            text: string;
            kind: string;
          }>;
          if (!cancelledRef.current && Array.isArray(stepRows))
            setSteps(stepRows);
        } catch {
          /* 步骤是辅助信息 */
        }
        const status = (await client.getTask({
          params: { taskId: id },
          query: undefined,
          body: undefined,
        })) as { status: string };
        if (status.status === "awaiting_confirmation") {
          await enterReview(id);
          return;
        }
        if (status.status === "cancelled" || status.status === "failed") {
          setPhase("error");
          return;
        }
      }
      setPhase("error"); // budget exhausted
    },
    [enterReview],
  );

  const start = React.useCallback(async () => {
    claimedRef.current = true; // user takes over → hydration must not clobber
    setPhase("running");
    setItems([]);
    setSteps([]);
    try {
      const task = (await client.createAITask({
        params: undefined,
        query: undefined,
        body: { taskType, inputData },
      })) as { id: string };
      setTaskId(task.id);
      await pollUntilDone(task.id);
    } catch {
      setPhase("error");
    }
  }, [taskType, inputData, pollUntilDone]);

  // P4 hydration (切页不丢): on mount, reconcile against the server so an in-flight task
  // survives navigating away and back. Only hydrates from idle (never clobbers a task the
  // user started in this same mount). Filters ai.tasks.list to THIS node — same taskType
  // AND same projectId (so two projects' 论点树 tasks don't cross-wire) — and to in-flight
  // statuses, then resumes the newest (the list is newest-requested first).
  const projectId =
    typeof inputData.projectId === "string" ? inputData.projectId : undefined;
  React.useEffect(() => {
    let abandoned = false;
    void (async () => {
      try {
        const tasks = (await client.listAITasks({
          params: undefined,
          query: { page: 1, pageSize: 100 },
          body: undefined,
        })) as unknown as Array<{
          id: string;
          taskType: string;
          projectId: string | null;
          status: string;
        }>;
        const match = tasks.find(
          (t) =>
            t.taskType === taskType &&
            (projectId === undefined || t.projectId === projectId) &&
            (t.status === "queued" ||
              t.status === "running" ||
              t.status === "awaiting_confirmation"),
        );
        if (abandoned || cancelledRef.current || claimedRef.current || !match)
          return;
        claimedRef.current = true; // hydration owns the loop now
        setTaskId(match.id);
        if (match.status === "awaiting_confirmation") {
          await enterReview(match.id);
        } else {
          setPhase("running");
          await pollUntilDone(match.id);
        }
      } catch {
        // Hydration is best-effort — a failed reconcile just leaves the card idle, which
        // is the pre-P4 behavior. The user can still 「start」 a fresh task.
      }
    })();
    return () => {
      abandoned = true;
    };
    // Mount-only reconcile: keyed by node identity (taskType ∩ projectId). The poll/review
    // callbacks are stable for a given parseItems; re-running on their identity churn would
    // double-hydrate, so they're intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskType, projectId]);

  // 原始 items 与解析后 items 一一对齐时,才允许逐条删(否则下标会错,退回整批采纳)。
  const canEdit = rawItems.length === items.length && items.length > 0;
  const keptCount = canEdit ? items.length - removed.size : items.length;

  const adopt = React.useCallback(async () => {
    if (!taskId) return;
    setConfirming(true);
    try {
      // CollabField:人删了候选 → 先 patch 替换成保留的(对齐 1:1 才安全),再 confirm 物化。
      if (canEdit && removed.size > 0) {
        const kept = rawItems.filter((_, i) => !removed.has(i));
        await client.patchTaskResultItems({
          params: { taskId },
          query: undefined,
          body: { items: kept },
        });
      }
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
  }, [taskId, router, canEdit, removed, rawItems]);

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
            <div data-slot="adopt-running" className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="size-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                {runningLabel}
              </div>
              {steps.length > 0 ? (
                <ol
                  data-slot="adopt-steps"
                  className="flex flex-col gap-1 rounded-card border border-brand/15 bg-surface/60 p-2.5"
                >
                  {steps.map((s) => (
                    <li
                      key={s.stepNo}
                      className="flex items-start gap-2 text-xs text-foreground"
                    >
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-medium text-brand">
                        {s.stepNo}
                      </span>
                      <span className="leading-snug text-text-subtle">
                        {s.kind === "tool_call" ? "调工具 · " : ""}
                        {s.text || "（思考中…）"}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}

          {phase === "review" ? (
            <div data-slot="adopt-review" className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                AI 给出 {keptCount} 条，审阅后采纳{canEdit ? "（可逐条删）" : ""}：
              </p>
              <ul className="flex flex-col gap-1.5" aria-label="AI 候选">
                {items.map((item, i) =>
                  removed.has(i) ? null : (
                    <li
                      key={i}
                      data-slot="adopt-item"
                      className={canEdit ? "flex items-start gap-1.5" : undefined}
                    >
                      <div className="min-w-0 flex-1">{renderItem(item, i)}</div>
                      {canEdit ? (
                        // CollabField:逐条删掉不要的 AI 候选(采纳前 patch 落库)。
                        <button
                          type="button"
                          data-slot="adopt-item-remove"
                          aria-label="删除这条"
                          disabled={confirming}
                          onClick={() =>
                            setRemoved((s) => new Set(s).add(i))
                          }
                          className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-control border border-border text-xs text-muted-foreground hover:border-destructive hover:text-destructive disabled:opacity-50"
                        >
                          ×
                        </button>
                      ) : null}
                    </li>
                  ),
                )}
              </ul>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-slot="adopt-confirm"
                  disabled={confirming || keptCount === 0}
                  onClick={adopt}
                  className="inline-flex h-8 items-center rounded-control bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                >
                  {adoptLabel(keptCount)}
                </button>
                <button
                  type="button"
                  data-slot="adopt-discard"
                  disabled={confirming}
                  onClick={() => {
                    setItems([]);
                    setRawItems([]);
                    setRemoved(new Set());
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
              ✓ {doneLabel(keptCount)}
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
