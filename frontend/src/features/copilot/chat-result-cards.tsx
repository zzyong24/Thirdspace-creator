"use client";

/**
 * ChatBox slice 2 的对话内 generative UI(SPEC §3.4)—— calibration.diagnose / review.analyze /
 * positioning.generate 三个工具的结果(候选,非实体)经 tool-result part 流回前端,这里把它们
 * 各渲成对应候选卡嵌进对话气泡:
 *   - 维度评分类(calibration.diagnosis)→ 维度评分表(读 calibration 中栏评分表范式),**只读展示**
 *     (对话里的诊断不直接铸预测;真·按用户 rubric 的盲预测走工作台「开始预测」那条任务链)。
 *   - 候选类(review.learnings / positioning.suggestion)→ 复用「逐条/整条采纳」交互,走现有直采门:
 *       · 经验 → client.createLearning(沉淀回喂选题,机制⑤飞轮);
 *       · 定位 → client.upsertProfile + createStatement(写入定位母版 + 追加 AI 版本)。
 *     与 ChatCandidateCard 同理:候选已在工具结果里,无需再起 AI 任务 —— 直接渲 + 采纳走确认门。
 *
 * 铁律②:AI 只产候选,人确认才物化。所有「采纳」按钮按下才调 create;不自动落库。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { client } from "@/lib/contract-client";

type AdoptState = "idle" | "adopting" | "adopted" | "error";

// ── 维度评分诊断卡(calibration.diagnosis)—— 只读展示 ──────────────────────────────────
export interface ChatDiagnosisDimension {
  key: string;
  score: number;
  reason: string;
  suggestion: string;
}
export interface ChatDiagnosis {
  dimensions: ChatDiagnosisDimension[];
  verdict: string;
  mainIssues: string[];
  priorityFixes: string[];
}

export function ChatDiagnosisCard({
  diagnosis,
}: {
  readonly diagnosis: ChatDiagnosis | null;
}) {
  if (!diagnosis || diagnosis.dimensions.length === 0) return null;
  return (
    <div
      data-slot="chat-diagnosis-card"
      className="mt-1.5 flex flex-col gap-1.5 rounded-lg border border-brand/20 bg-surface/70 p-2"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        AI 编导诊断 · 逐维度盲评
      </span>
      <ul className="flex flex-col gap-1" aria-label="维度评分">
        {diagnosis.dimensions.map((d, i) => (
          <li
            key={`${d.key}-${i}`}
            data-slot="chat-diagnosis-dim"
            className="flex flex-col gap-0.5 rounded-control border border-border bg-surface px-2.5 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground">
                {d.key}
              </span>
              <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">
                {d.score} / 5
              </span>
            </div>
            {d.reason ? (
              <span className="text-[11px] text-text-subtle">{d.reason}</span>
            ) : null}
            {d.suggestion ? (
              <span className="text-[11px] text-muted-foreground">
                建议：{d.suggestion}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {diagnosis.verdict ? (
        <p className="text-[13px] font-medium text-foreground">
          综合判断：{diagnosis.verdict}
        </p>
      ) : null}
      {diagnosis.priorityFixes.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          优先修改：{diagnosis.priorityFixes.join("；")}
        </p>
      ) : null}
      <p className="text-[9.5px] text-text-subtle">
        对话诊断为通用维度盲评；要按你的变现 rubric 铸盲预测,去校准中心「开始预测」。
      </p>
    </div>
  );
}

// ── 经验卡(review.learnings)—— 逐条采纳 → createLearning ──────────────────────────────
export interface ChatLearningItem {
  title: string;
  insight: string;
}

export function ChatLearningsCard({
  items,
}: {
  readonly items: readonly ChatLearningItem[];
}) {
  const router = useRouter();
  const [state, setState] = React.useState<ReadonlyMap<number, AdoptState>>(
    () => new Map(),
  );
  const setAt = React.useCallback(
    (i: number, s: AdoptState) =>
      setState((prev) => new Map(prev).set(i, s)),
    [],
  );
  const adopt = React.useCallback(
    async (i: number, l: ChatLearningItem) => {
      setAt(i, "adopting");
      try {
        await client.createLearning({
          params: undefined,
          query: undefined,
          body: { title: l.title, insight: l.insight },
        });
        setAt(i, "adopted");
        router.refresh();
      } catch {
        setAt(i, "error");
      }
    },
    [router, setAt],
  );

  if (items.length === 0) return null;
  return (
    <div
      data-slot="chat-learnings-card"
      className="mt-1.5 flex flex-col gap-1.5 rounded-lg border border-brand/20 bg-surface/70 p-2"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        AI 复盘经验 · 逐条沉淀(回喂选题)
      </span>
      <ul className="flex flex-col gap-1.5" aria-label="复盘经验候选">
        {items.map((l, i) => {
          const s = state.get(i) ?? "idle";
          return (
            <li
              key={i}
              data-slot="chat-learning-item"
              className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-1.5"
            >
              <span className="text-[13px] font-medium leading-snug text-foreground">
                {l.title}
              </span>
              {l.insight ? (
                <span className="text-[11px] text-text-subtle">{l.insight}</span>
              ) : null}
              <div className="flex items-center gap-2">
                {s === "adopted" ? (
                  <span
                    data-slot="chat-learning-adopted"
                    className="text-[10px] font-medium text-success"
                  >
                    ✓ 已沉淀
                  </span>
                ) : (
                  <button
                    type="button"
                    data-slot="chat-learning-adopt"
                    disabled={s === "adopting"}
                    onClick={() => adopt(i, l)}
                    className="inline-flex h-6 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                  >
                    {s === "adopting" ? "沉淀中…" : "采纳"}
                  </button>
                )}
                {s === "error" ? (
                  <span className="text-[10px] text-destructive">失败,重试</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── 定位卡(positioning.suggestion)—— 整条采纳 → upsertProfile + createStatement ─────────
export interface ChatPositioningSuggestion {
  persona: string;
  field: string;
  audience: string;
  differentiation: string;
  capabilities: string[];
  oneLiner: string;
  keywords: string[];
}

// keywords 须正好 3 个(createStatement 不变量)。截断/补空,与 positioning-runner 的 clamp 同义。
function clampKeywords(raw: readonly string[]): [string, string, string] {
  const out = raw.slice(0, 3);
  while (out.length < 3) out.push("");
  return [out[0]!, out[1]!, out[2]!];
}

export function ChatPositioningCard({
  suggestion,
}: {
  readonly suggestion: ChatPositioningSuggestion | null;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<AdoptState>("idle");

  const adopt = React.useCallback(async () => {
    if (!suggestion) return;
    setState("adopting");
    try {
      // 写入定位母版(5 facet)。
      await client.upsertProfile({
        params: undefined,
        query: undefined,
        body: {
          persona: suggestion.persona,
          field: suggestion.field,
          audience: suggestion.audience,
          differentiation: suggestion.differentiation,
          capabilities: suggestion.capabilities,
        },
      });
      // 追加一条定位陈述版本(oneLiner + 3 关键词)—— 仅在 oneLiner 非空时(createStatement 要求)。
      if (suggestion.oneLiner.trim()) {
        await client.createStatement({
          params: undefined,
          query: undefined,
          body: {
            oneLiner: suggestion.oneLiner,
            keywords: clampKeywords(suggestion.keywords),
            productAnchorIds: [],
          },
        });
      }
      setState("adopted");
      router.refresh();
    } catch {
      setState("error");
    }
  }, [router, suggestion]);

  if (!suggestion || (!suggestion.oneLiner && !suggestion.persona)) return null;

  const facets: ReadonlyArray<readonly [string, string]> = [
    ["人设", suggestion.persona],
    ["领域", suggestion.field],
    ["人群", suggestion.audience],
    ["差异化", suggestion.differentiation],
  ];

  return (
    <div
      data-slot="chat-positioning-card"
      className="mt-1.5 flex flex-col gap-1.5 rounded-lg border border-brand/20 bg-surface/70 p-2"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        AI 定位提案 · 采纳写入定位母版
      </span>
      <div className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-2">
        {suggestion.oneLiner ? (
          <p className="text-[13px] font-medium leading-snug text-foreground">
            {suggestion.oneLiner}
          </p>
        ) : null}
        <dl className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
          {facets
            .filter(([, v]) => v.length > 0)
            .map(([label, value]) => (
              <div key={label} className="flex gap-1 text-[10px]">
                <dt className="shrink-0 text-text-subtle">{label}</dt>
                <dd className="text-muted-foreground">{value}</dd>
              </div>
            ))}
        </dl>
        {suggestion.keywords.filter(Boolean).length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {suggestion.keywords.filter(Boolean).map((kw) => (
              <span
                key={kw}
                className="rounded-full bg-secondary px-1.5 py-0.5 text-[9.5px] text-secondary-foreground"
              >
                {kw}
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          {state === "adopted" ? (
            <span
              data-slot="chat-positioning-adopted"
              className="text-[10px] font-medium text-success"
            >
              ✓ 已写入当前定位
            </span>
          ) : (
            <button
              type="button"
              data-slot="chat-positioning-adopt"
              disabled={state === "adopting"}
              onClick={adopt}
              className="inline-flex h-6 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {state === "adopting" ? "采纳中…" : "采纳为当前定位"}
            </button>
          )}
          {state === "error" ? (
            <span className="text-[10px] text-destructive">采纳失败,重试</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
