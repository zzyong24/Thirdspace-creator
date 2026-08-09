"use client";

/**
 * [T-730] 对话内可选论点骨架结果卡。
 *
 * planning.thesis 工具 dispatch 了一个既有 planning.thesis ai_task(不直接生成 —— 论点树生成重、
 * 分钟级不能阻塞对话回合),把 taskId 交给本卡。本卡据 taskId **轮询** task/candidate(与
 * ChatGenerateCard 同款循环):
 *   running/queued → 进行中;
 *   awaiting_confirmation → 拉 candidate 渲论点树(核心论点 + 支撑/证据/反驳)+「采纳并用于写稿」
 *     (client.confirmTask → artifact_version 分支 append 进项目 thesis_tree 当前版本 →
 *      稿面「论点骨架」面板 router.refresh 读回,铁律②人点才落);
 *   cancelled/failed → 失败 → 卡内诚实提示按当前托管文本模型重试。
 *
 * dispatch 本身失败 / 无项目上下文(error 非 null)→ 直接渲错误态(诚实提示去项目稿面立论点)。
 * 论点树生成吃波1接地(brief 硬锚 + 素材可溯 + anti-fabrication),不凭空编数字。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 90; // ~6 分钟 —— 论点树生成可达分钟级(弱模型更慢)

type Phase = "running" | "review" | "done" | "error";

// 论点树列(与 thesis-skeleton-panel / planning-runner 的 writer↔reader 契约一致)。
type ThesisColumn = "core" | "support" | "evidence" | "counter";

const COLUMN_ORDER: ReadonlyArray<ThesisColumn> = [
  "core",
  "support",
  "evidence",
  "counter",
];
const COLUMN_LABEL: Record<ThesisColumn, string> = {
  core: "核心论点",
  support: "支撑依据",
  evidence: "证据",
  counter: "反驳",
};

interface ThesisNode {
  column: ThesisColumn;
  title: string;
  summary: string;
}

// candidate.resultData(planning-runner recordCandidate 写的形状:{ body, summary, nodes,
// contentData:{nodes} })→ 收窄出 nodes(优先 resultData.nodes,兜 contentData.nodes)。
function parseNodes(resultData: Record<string, unknown>): ThesisNode[] {
  const raw = Array.isArray(resultData.nodes)
    ? resultData.nodes
    : resultData.contentData &&
        typeof resultData.contentData === "object" &&
        Array.isArray((resultData.contentData as Record<string, unknown>).nodes)
      ? ((resultData.contentData as Record<string, unknown>).nodes as unknown[])
      : [];
  const isColumn = (c: unknown): c is ThesisColumn =>
    c === "core" || c === "support" || c === "evidence" || c === "counter";
  return raw
    .map((r): ThesisNode | null => {
      const o = (r ?? {}) as Record<string, unknown>;
      if (!isColumn(o.column)) return null;
      const title = typeof o.title === "string" ? o.title : "";
      const summary = typeof o.summary === "string" ? o.summary : "";
      if (!title && !summary) return null;
      return { column: o.column, title, summary };
    })
    .filter((n): n is ThesisNode => n !== null);
}

export function ChatThesisCard({
  taskId,
  error,
  pollIntervalMs = POLL_INTERVAL_MS,
}: {
  taskId: string | null;
  /** dispatch 阶段的错误(无项目上下文/端口未接入等);非 null 时直接渲错误态。 */
  error: string | null;
  /** 轮询间隔(测试注 0 免等实时;默认 4s)。 */
  pollIntervalMs?: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>(
    error || !taskId ? "error" : "running",
  );
  const [nodes, setNodes] = React.useState<ThesisNode[]>([]);
  const [confirming, setConfirming] = React.useState(false);

  // 轮询 task/candidate(仿 ChatGenerateCard,从已 dispatch 的 taskId 起)。取消只靠本效应闭包内
  // 的 abandoned(effect cleanup 置真)—— **不用 mount-unmount ref**:React StrictMode(dev 默认开)
  // 的 mount→unmount→mount 双调里,unmount 会把这类 ref 置真、remount 不重置 → 轮询恒被 bail 卡死。
  React.useEffect(() => {
    if (!taskId || error) return;
    let abandoned = false;
    void (async () => {
      for (let i = 0; i < MAX_POLLS; i++) {
        if (abandoned) return;
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        if (abandoned) return;
        let status: string;
        try {
          const t = (await client.getTask({
            params: { taskId },
            query: undefined,
            body: undefined,
          })) as { status: string };
          status = t.status;
        } catch {
          continue; // 单次拉取失败不终止(下轮再试)
        }
        if (status === "awaiting_confirmation") {
          try {
            const results = (await client.listTaskResults({
              params: { taskId },
              query: undefined,
              body: undefined,
            })) as unknown as Array<{ resultData: Record<string, unknown> }>;
            const last = results[results.length - 1];
            const got = last ? parseNodes(last.resultData) : [];
            if (abandoned) return;
            if (got.length > 0) {
              setNodes(got);
              setPhase("review");
            } else {
              setPhase("error");
            }
          } catch {
            if (!abandoned) setPhase("error");
          }
          return;
        }
        if (status === "cancelled" || status === "failed") {
          if (!abandoned) setPhase("error");
          return;
        }
      }
      if (!abandoned) setPhase("error"); // 轮询预算耗尽
    })();
    return () => {
      abandoned = true;
    };
    // taskId 稳定;错误态不轮询。
  }, [taskId, error, pollIntervalMs]);

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
      router.refresh(); // 稿面「论点骨架」面板读回新 thesis_tree 版本
    } catch {
      setPhase("error");
    } finally {
      setConfirming(false);
    }
  }, [taskId, router]);

  return (
    <div
      data-slot="chat-thesis-card"
      data-phase={phase}
      className="mt-1 flex w-full max-w-[460px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        可选论点骨架 · 确认采用后才影响生成式写稿
      </span>

      {phase === "running" ? (
        <div
          data-slot="chat-thesis-running"
          className="flex items-center gap-2 text-[12px] text-muted-foreground"
        >
          <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          正在用当前托管文本模型梳理核心论点、支撑、证据与反驳…
        </div>
      ) : null}

      {phase === "review" && nodes.length > 0 ? (
        <div data-slot="chat-thesis-review" className="flex flex-col gap-2">
          {COLUMN_ORDER.map((col) => {
            const colNodes = nodes.filter((n) => n.column === col);
            if (colNodes.length === 0) return null;
            const isCore = col === "core";
            return (
              <div
                key={col}
                data-slot="chat-thesis-column"
                data-column={col}
                className="flex flex-col gap-1"
              >
                <span
                  className={`text-[11px] font-medium uppercase tracking-wide ${
                    isCore ? "text-brand" : "text-text-subtle"
                  }`}
                >
                  {COLUMN_LABEL[col]}
                </span>
                <ul className="flex flex-col gap-1">
                  {colNodes.map((n, i) => (
                    <li
                      key={`${col}-${i}`}
                      data-slot="chat-thesis-node"
                      className={`flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5 ${
                        isCore
                          ? "border-brand/40 bg-brand-soft"
                          : "border-border bg-surface-subtle"
                      }`}
                    >
                      {n.title ? (
                        <span className="text-[12.5px] font-medium text-foreground">
                          {n.title}
                        </span>
                      ) : null}
                      {n.summary ? (
                        <span className="text-xs leading-relaxed text-muted-foreground">
                          {n.summary}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <button
            type="button"
            data-slot="chat-thesis-adopt"
            disabled={confirming}
            onClick={() => void adopt()}
            className="inline-flex h-7 w-fit items-center rounded-control bg-brand px-3 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {confirming ? "采纳中…" : "采纳并用于写稿"}
          </button>
        </div>
      ) : null}

      {phase === "done" ? (
        <p data-slot="chat-thesis-done" className="text-[12px] text-success">
          ✓ 已采纳并用于生成式写稿；完整逐字稿仍按原文优先，不会被论点骨架改写。
        </p>
      ) : null}

      {phase === "error" ? (
        <div data-slot="chat-thesis-error" className="flex flex-col gap-1">
          <p className="text-[12px] leading-relaxed text-destructive">
            {error
              ? error
              : "没能梳理出论点骨架。当前托管文本模型（MiniMax）可能暂时不可用、任务被重启中断，或本次生成失败；可以直接重试，也可以跳过论点骨架继续写稿。"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
