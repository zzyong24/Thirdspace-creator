"use client";

/**
 * `GatherMaterialIsland` — the first real AI affordance in the app (机制③④). It turns the
 * Research stage's "搜集素材" from a read-only board into an agent action:
 *
 *   「帮我搜素材」→ client.createAITask({ taskType:"research.gather_material",
 *                  inputData:{ projectId, topic, angle } })
 *     → background: a real Claude agent does WebSearch judged against the creator's
 *       positioning, records a `material_list` CANDIDATE (awaiting_confirmation)
 *     → poll client.listTaskResults until the candidate lands
 *     → render the 采纳 surface (each material = title/source/why_relevant/url)
 *     → 「采纳」 client.confirmTask → each material becomes a KnowledgeItem → router.refresh()
 *
 * This is the candidate-confirm bus made visible: AI proposes, the human reviews a diff,
 * 采纳 materializes. The same shape will back every later AI node (脚本/多平台/复盘).
 *
 * Polling note: there is no ai.tasks.get op yet, so we poll listTaskResults (empty while
 * running → populated on candidate). A bounded retry budget surfaces a 失败 state instead
 * of spinning forever (the agent cancels the task on its own errors).
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { SectionCard } from "@/components/project/section-card";
import { client } from "@/lib/contract-client";

interface MaterialItem {
  title: string;
  url: string;
  source: string;
  why_relevant: string;
}

type Phase = "idle" | "running" | "review" | "done" | "error";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 60; // ~4 min — the agent's multi-angle WebSearch can run minutes.

export function GatherMaterialIsland({
  projectId,
  topic,
  angle,
}: {
  projectId: string;
  topic: string;
  angle?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [items, setItems] = React.useState<MaterialItem[]>([]);
  const [taskId, setTaskId] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const start = React.useCallback(async () => {
    setPhase("running");
    setItems([]);
    try {
      const task = (await client.createAITask({
        params: undefined,
        query: undefined,
        body: {
          taskType: "research.gather_material",
          inputData: { projectId, topic, angle: angle ?? "" },
        },
      })) as { id: string };
      setTaskId(task.id);
      // Poll for the candidate.
      for (let i = 0; i < MAX_POLLS; i++) {
        if (cancelledRef.current) return;
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (cancelledRef.current) return;
        const results = (await client.listTaskResults({
          params: { taskId: task.id },
          query: undefined,
          body: undefined,
        })) as unknown as Array<{
          resultType: string;
          resultData: { items?: unknown };
        }>;
        const candidate = results[results.length - 1];
        if (candidate?.resultType === "material_list") {
          const got = Array.isArray(candidate.resultData.items)
            ? (candidate.resultData.items as MaterialItem[])
            : [];
          if (got.length > 0) {
            setItems(got);
            setPhase("review");
            return;
          }
        }
      }
      setPhase("error"); // budget exhausted (still running or agent cancelled)
    } catch {
      setPhase("error");
    }
  }, [projectId, topic, angle]);

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
      router.refresh(); // the new KnowledgeItems now read from SQL
    } catch {
      setPhase("error");
    } finally {
      setConfirming(false);
    }
  }, [taskId, router]);

  return (
    <div data-slot="gather-material-card">
      <SectionCard
        title="AI 搜集素材"
        description="让 agent 按你的定位联网找相关素材"
      >
        <div className="flex flex-col gap-3">
          {phase === "idle" || phase === "done" ? (
            <button
              type="button"
              data-slot="gather-material-start"
              onClick={start}
              className="inline-flex h-8 w-fit items-center gap-1.5 rounded-control bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90"
            >
              ✦ 帮我搜素材
            </button>
          ) : null}

          {phase === "running" ? (
            <div
              data-slot="gather-material-running"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span className="size-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              agent 正在按你的定位联网搜集（可能要一两分钟）…
            </div>
          ) : null}

          {phase === "review" ? (
            <div
              data-slot="gather-material-review"
              className="flex flex-col gap-2"
            >
              <p className="text-xs text-muted-foreground">
                找到 {items.length} 条素材，审阅后采纳进知识库：
              </p>
              <ul className="flex flex-col gap-1.5" aria-label="候选素材">
                {items.map((m, i) => (
                  <li
                    key={`${m.url}-${i}`}
                    data-slot="gather-material-item"
                    className="flex flex-col gap-0.5 rounded-control border border-border bg-surface px-2.5 py-2 text-sm"
                  >
                    <span className="font-medium leading-snug text-foreground">
                      {m.title}
                    </span>
                    {m.why_relevant ? (
                      <span className="text-xs text-muted-foreground">
                        {m.why_relevant}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-2 text-[11px] text-text-subtle">
                      {m.source ? <span>{m.source}</span> : null}
                      {m.url ? (
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-brand hover:underline"
                        >
                          原文
                        </a>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-slot="gather-material-adopt"
                  disabled={confirming}
                  onClick={adopt}
                  className="inline-flex h-8 items-center rounded-control bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                >
                  采纳全部（{items.length}）入知识库
                </button>
                <button
                  type="button"
                  data-slot="gather-material-discard"
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
            <p
              data-slot="gather-material-done"
              className="text-sm text-success"
            >
              ✓ 已采纳 {items.length} 条进知识库。
            </p>
          ) : null}

          {phase === "error" ? (
            <div
              data-slot="gather-material-error"
              className="flex flex-col gap-1.5"
            >
              <p className="text-sm text-destructive">
                搜集没成功（agent 超时或出错）。
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
