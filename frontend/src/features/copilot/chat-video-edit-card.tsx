"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { VideoRenderProps } from "@creatoros/contract";

import { client } from "@/lib/contract-client";
import { buildRenderInputs } from "@/features/production/production-flow";

export interface ChatVideoEditCandidate {
  projectId: string | null;
  outputId: string | null;
  expectedRevision: number | null;
  sourceRenderTaskId: string | null;
  instruction: string;
  summary: string[];
  decisions: Record<string, unknown> | null;
  renderProps: Record<string, unknown> | null;
  error: string | null;
}

export function ChatVideoEditCard({ candidate }: { candidate: ChatVideoEditCandidate }) {
  const router = useRouter();
  const [state, setState] = React.useState<"review" | "busy" | "done" | "error">(
    candidate.error ? "error" : "review",
  );
  const [message, setMessage] = React.useState(candidate.error ?? "");

  const confirm = React.useCallback(async () => {
    if (
      !candidate.projectId ||
      !candidate.outputId ||
      candidate.expectedRevision == null ||
      !candidate.decisions ||
      !candidate.renderProps
    ) return;
    setState("busy");
    try {
      const confirmedAt = new Date().toISOString();
      const saved = (await client.confirmProductionEditingPlan({
        params: { outputId: candidate.outputId },
        query: undefined,
        body: {
          expectedRevision: candidate.expectedRevision,
          plan: {
            sourceTaskId: null,
            sourceRenderTaskId: candidate.sourceRenderTaskId,
            confirmedAt,
            decisions: candidate.decisions,
            renderProps: candidate.renderProps,
          },
        },
      })) as unknown as { recordingConfig?: { videoEditingPlan?: { revision?: number } } };
      const revision = saved.recordingConfig?.videoEditingPlan?.revision;
      if (typeof revision !== "number") throw new Error("保存剪辑调整后未能回读版本");
      const props = candidate.renderProps as unknown as VideoRenderProps;
      const task = (await client.createExecutionTask({
        params: undefined,
        query: undefined,
        body: {
          projectId: candidate.projectId,
          spec: {
            taskType: "video.render",
            goal: `按意见重渲染：${candidate.instruction}`,
            inputs: buildRenderInputs(props),
            params: { props },
            constraints: { timeoutSec: null, network: "deny", maxOutputMB: 2048 },
          },
        },
      })) as unknown as { id: string };
      await client.confirmProductionEditingPlan({
        params: { outputId: candidate.outputId },
        query: undefined,
        body: {
          expectedRevision: revision,
          plan: {
            sourceTaskId: null,
            sourceRenderTaskId: task.id,
            confirmedAt,
            decisions: candidate.decisions,
            renderProps: candidate.renderProps,
          },
        },
      });
      setMessage(`已按意见创建重渲染任务 ${task.id}`);
      setState("done");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setState("error");
    }
  }, [candidate, router]);

  return (
    <section data-slot="chat-video-edit-card" className="rounded-control border border-border bg-surface p-3 text-sm">
      <p className="font-medium">剪辑调整候选</p>
      <p className="mt-1 text-xs text-muted-foreground">{candidate.instruction}</p>
      {candidate.summary.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          {candidate.summary.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
      {state === "error" ? <p className="mt-2 text-xs text-destructive">{message}</p> : null}
      {state === "done" ? <p className="mt-2 text-xs text-success">✓ {message}</p> : null}
      {state === "review" ? (
        <button type="button" onClick={() => void confirm()} className="mt-3 h-8 rounded-control bg-brand px-3 text-xs font-medium text-brand-foreground">
          确认调整并重渲染
        </button>
      ) : state === "busy" ? <p className="mt-2 text-xs text-muted-foreground">正在保存方案并创建重渲染任务…</p> : null}
    </section>
  );
}
