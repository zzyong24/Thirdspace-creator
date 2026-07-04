"use client";

/**
 * `ChatEnrichCard` —— 对话内 generative UI，渲染 `topic.enrich` 工具结果(把一条已有选题
 * 补全成的**完整选题卡**:观众 / 痛点 / 核心冲突 / 钩子 / 结构 / 形式 / 素材依据 / 风险 / 立项建议
 * + 受众痛感·素材充足·制作难度三项指标)。
 *
 * [T-117] 修复:此前 `topic.enrich` 返回 `{ kind: "topic.card", card }` 在 `ai-copilot-content`
 * 的 tool-result dispatch 里**没有渲染分支**(只处理了 topic.generate 的 `topic.candidates`)→
 * 富卡被静默丢弃,模型退化成把选题卡当文本吐出来 + 谎称「已渲成候选卡」。本组件补上渲染 + 采纳门。
 *
 * 采纳走 **candidates.patch**(不是 create):enrich 是「补全一条**已存在**的候选选题」,把富卡
 * 写到该候选上(`candidates.patch` 契约收 card,与 `candidateCard` resource 同形)。铁律②:AI 只
 * 产候选,人点「采纳」才落库。无 candidateId(未选中某条候选)时诚实禁用 + 提示,绝不假装能采纳。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { client } from "@/lib/contract-client";

/** `topic.enrich` 工具结果里的富选题卡(与 contract `candidateCard` 同形)。 */
export interface ChatEnrichCardData {
  oneLiner: string;
  targetAudience: string;
  audiencePain: string;
  coreConflict: string;
  hook: string;
  contentStructure: readonly string[];
  format: string;
  materialBasis: string;
  riskNote: string;
  proposal: string;
  audiencePainScore: number | null;
  materialScore: number | null;
  productionDifficulty: "low" | "mid" | "high" | null;
}

type AdoptState = "idle" | "adopting" | "adopted" | "error";

const DIFFICULTY_LABEL: Record<"low" | "mid" | "high", string> = {
  low: "制作难度 低",
  mid: "制作难度 中",
  high: "制作难度 高",
};

export function ChatEnrichCard({
  card,
  candidateId,
}: {
  readonly card: ChatEnrichCardData | null;
  /** 被补全的候选选题 id(来自对话 selection.kind === "candidate");null = 未选中某条 → 采纳禁用。 */
  readonly candidateId: string | null;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<AdoptState>("idle");

  const adopt = React.useCallback(async () => {
    if (!card || !candidateId) return;
    setState("adopting");
    try {
      // 现有 confirm 门:人确认 → candidates.patch 把富卡写到该已有候选上(AI 不直接写)。
      // body 是扁平 card 字段(与 topics 页 patchCandidate 同款)。
      await client.patchCandidate({
        params: { candidateId },
        query: undefined,
        // 富卡字段嵌在 `card` 下(patchCandidate body 形状:{ title?, angle?, …, card? })。
        body: {
          card: {
            oneLiner: card.oneLiner,
            targetAudience: card.targetAudience,
            audiencePain: card.audiencePain,
            coreConflict: card.coreConflict,
            hook: card.hook,
            contentStructure: [...card.contentStructure],
            format: card.format,
            materialBasis: card.materialBasis,
            riskNote: card.riskNote,
            proposal: card.proposal,
            audiencePainScore: card.audiencePainScore,
            materialScore: card.materialScore,
            productionDifficulty: card.productionDifficulty,
          },
        },
      });
      setState("adopted");
      router.refresh();
    } catch {
      setState("error");
    }
  }, [card, candidateId, router]);

  if (!card) return null;

  const rows: ReadonlyArray<readonly [string, string]> = [
    ["目标观众", card.targetAudience],
    ["观众痛点", card.audiencePain],
    ["核心冲突", card.coreConflict],
    ["开头钩子", card.hook],
    ["适合形式", card.format],
    ["素材依据", card.materialBasis],
    ["风险点", card.riskNote],
    ["立项建议", card.proposal],
  ];

  const scoreChips: ReadonlyArray<string> = [
    card.audiencePainScore !== null ? `受众痛感 ${card.audiencePainScore}` : "",
    card.materialScore !== null ? `素材充足 ${card.materialScore}` : "",
    card.productionDifficulty
      ? DIFFICULTY_LABEL[card.productionDifficulty]
      : "",
  ].filter(Boolean);

  return (
    <div
      data-slot="chat-enrich-card"
      className="mt-1.5 flex flex-col gap-1.5 rounded-lg border border-brand/20 bg-surface/70 p-2"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        AI 补全选题卡 · 采纳进候选池
      </span>
      <div className="flex flex-col gap-1.5 rounded-control border border-border bg-surface px-2.5 py-2">
        {card.oneLiner ? (
          <p className="text-[13px] font-medium leading-snug text-foreground">
            {card.oneLiner}
          </p>
        ) : null}

        <dl className="flex flex-col gap-1">
          {rows
            .filter(([, v]) => v.trim().length > 0)
            .map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className="text-[10px] font-medium text-text-subtle">
                  {label}
                </dt>
                <dd className="text-[12px] leading-snug text-muted-foreground">
                  {value}
                </dd>
              </div>
            ))}
        </dl>

        {card.contentStructure.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-text-subtle">
              推荐结构
            </span>
            <ol className="flex flex-col gap-0.5">
              {card.contentStructure.map((step, i) => (
                <li
                  key={i}
                  data-slot="chat-enrich-structure-step"
                  className="text-[12px] leading-snug text-muted-foreground"
                >
                  {i + 1}. {step}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {scoreChips.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {scoreChips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand"
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2 border-t border-border/60 pt-1.5">
          {state === "adopted" ? (
            <span
              data-slot="chat-enrich-adopted"
              className="text-[10px] font-medium text-success"
            >
              ✓ 已补全进候选池
            </span>
          ) : candidateId ? (
            <button
              type="button"
              data-slot="chat-enrich-adopt"
              disabled={state === "adopting"}
              onClick={adopt}
              className="inline-flex h-6 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {state === "adopting" ? "采纳中…" : "采纳"}
            </button>
          ) : (
            // 诚实降级:没有绑定某条候选(未从某条选题进入补全)→ 不假装能采纳。
            <span
              data-slot="chat-enrich-no-target"
              className="text-[10px] text-text-subtle"
            >
              先在候选池选中一条选题、从它进入补全,才能把这张卡采纳回去。
            </span>
          )}
          {state === "error" ? (
            <span className="text-[10px] text-destructive">采纳失败,重试</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
