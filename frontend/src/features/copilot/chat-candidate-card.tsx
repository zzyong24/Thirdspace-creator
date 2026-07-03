"use client";

/**
 * `ChatCandidateCard` —— 对话内 generative UI(SPEC §3.4)。AI 的 `topic.generate` 工具结果
 * (候选,非实体)通过 tool-result part 流回前端,这里把它渲成候选卡嵌进对话气泡,人**逐条采纳**
 * 走现有 confirm 门(`candidates.create`,source=idea 的人确认入口)落候选池 —— AI 不直接写实体
 * (铁律②)。复用 CollabField 的「逐条删」交互范式;采纳是逐条物化(每条一次 createCandidate)。
 *
 * 为什么不直接复用 AdoptCandidateCard:那个组件自带「createAITask→轮询」生命周期(它从零发起一个
 * AI 任务再等结果)。对话里候选**已在**工具结果里,无需再起任务 —— 直接渲 + 采纳即可,起任务反而会
 * 重复调 AI。所以这里复用的是同一条**确认门**(candidates.create)+ 同一套候选形状,而非那段轮询。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { client } from "@/lib/contract-client";

export interface ChatTopicCandidate {
  title: string;
  angle: string;
  contentRole: string;
  predictedScore: number | null;
  reason: string;
  /**
   * [T-066] 基于评论出题必须贴原始评论 —— 该选题依据的原始评论(逐字引用)。
   * 可选:旧工具结果/非评论依据没有此字段,渲染侧兜 []。
   */
  sourceComments?: readonly string[];
}

const ROLE_LABEL: Record<string, string> = {
  traffic: "引流",
  trust: "信任",
  conversion: "转化",
};

// contentRole 归一化:工具结果可能给空串/未知值;只把 traffic/trust/conversion 透给
// createCandidate(contentRole 是可选枚举),其余传 undefined(让 backend 用缺省)。
function normalizeRole(
  role: string,
): "traffic" | "trust" | "conversion" | undefined {
  return role === "traffic" || role === "trust" || role === "conversion"
    ? role
    : undefined;
}

export function ChatCandidateCard({
  candidates,
}: {
  readonly candidates: readonly ChatTopicCandidate[];
}) {
  const router = useRouter();
  // 逐条采纳态:idle | adopting | adopted | error(按下标)。
  const [state, setState] = React.useState<
    ReadonlyMap<number, "idle" | "adopting" | "adopted" | "error">
  >(() => new Map());

  const setAt = React.useCallback(
    (i: number, s: "idle" | "adopting" | "adopted" | "error") =>
      setState((prev) => {
        const next = new Map(prev);
        next.set(i, s);
        return next;
      }),
    [],
  );

  const adopt = React.useCallback(
    async (i: number, c: ChatTopicCandidate) => {
      setAt(i, "adopting");
      try {
        // 现有 confirm 门:人确认 → candidates.create(source=idea)落候选池。AI 不直接写。
        await client.createCandidate({
          params: undefined,
          query: undefined,
          body: {
            title: c.title,
            angle: c.angle,
            source: "idea",
            ...(normalizeRole(c.contentRole)
              ? { contentRole: normalizeRole(c.contentRole) }
              : {}),
          },
        });
        setAt(i, "adopted");
        router.refresh();
      } catch {
        setAt(i, "error");
      }
    },
    [router, setAt],
  );

  if (candidates.length === 0) return null;

  return (
    <div
      data-slot="chat-candidate-card"
      className="mt-1.5 flex flex-col gap-1.5 rounded-lg border border-brand/20 bg-surface/70 p-2"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        AI 选题候选 · 逐条采纳进候选池
      </span>
      <ul className="flex flex-col gap-1.5" aria-label="对话内选题候选">
        {candidates.map((c, i) => {
          const s = state.get(i) ?? "idle";
          return (
            <li
              key={i}
              data-slot="chat-candidate-item"
              className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-1.5"
            >
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-foreground">
                  {c.title}
                </span>
                {c.predictedScore !== null ? (
                  <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">
                    潜力 {c.predictedScore}
                  </span>
                ) : null}
                {ROLE_LABEL[c.contentRole] ? (
                  <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {ROLE_LABEL[c.contentRole]}
                  </span>
                ) : null}
              </div>
              {c.angle ? (
                <span className="text-[13px] text-muted-foreground">
                  切入：{c.angle}
                </span>
              ) : null}
              {c.reason ? (
                <span className="text-[11px] text-text-subtle">{c.reason}</span>
              ) : null}
              {/* [T-066] 依据评论折叠区:基于评论出题时逐字贴原始评论(用户宪法:推荐选题
                  必须把原始评论贴出来)。注:candidates.create 契约不收 card,采纳时评论
                  引用不落库,只在对话卡上展示。 */}
              {(c.sourceComments?.length ?? 0) > 0 ? (
                <details
                  data-slot="topic-source-comments"
                  className="rounded-control border border-border/70 bg-surface-subtle/60 px-2 py-1"
                >
                  <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground">
                    依据评论（{c.sourceComments!.length} 条原文）
                  </summary>
                  <ul className="mt-1 flex flex-col gap-1">
                    {c.sourceComments!.map((sc, j) => (
                      <li
                        key={j}
                        data-slot="topic-source-comment-item"
                        className="border-l-2 border-brand/40 pl-2 text-[11px] italic leading-snug text-text-subtle"
                      >
                        “{sc}”
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <div className="flex items-center gap-2">
                {s === "adopted" ? (
                  <span
                    data-slot="chat-candidate-adopted"
                    className="text-[10px] font-medium text-success"
                  >
                    ✓ 已入候选池
                  </span>
                ) : (
                  <button
                    type="button"
                    data-slot="chat-candidate-adopt"
                    disabled={s === "adopting"}
                    onClick={() => adopt(i, c)}
                    className="inline-flex h-6 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                  >
                    {s === "adopting" ? "采纳中…" : "采纳"}
                  </button>
                )}
                {s === "error" ? (
                  <span className="text-[10px] text-destructive">
                    采纳失败，重试
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
