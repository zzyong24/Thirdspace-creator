"use client";

/**
 * `ChatCandidateCard` —— 对话内 generative UI(SPEC §3.4)。AI 的 `topic.generate` 工具结果
 * (候选,非实体)通过 tool-result part 流回前端,渲成候选卡嵌进对话气泡,人采纳走现有 confirm
 * 门落候选池 —— AI 不直接写实体(铁律②)。
 *
 * [T-267①] 会话 scoped 到某条候选(selKind==="candidate",从候选池某条进入对话)时,采纳默认
 * 「更新当前选题」(candidates.patch rename + angle + contentRole 就地改),另给「另存为新」
 * (candidates.create)—— 治「在某选题对话里采纳却新建一条」。未 scoped(账号态)时逐条「采纳」=
 * candidates.create 新建(原行为)。
 *
 * [T-264] 逐条采纳太繁琐 → 加「批量入库」门(复用知识链 knowledge-atom-gate 范式):每条可勾选,
 * 底部「采纳选中 N 条」一次性 create 选中项,只 **一次 router.refresh**(而非逐条 N 次)。批量一律
 * 新建(update-current 语义只适用于单条)。
 *
 * 为什么不直接复用 AdoptCandidateCard:那个组件自带「createAITask→轮询」生命周期(它从零发起一个
 * AI 任务再等结果)。对话里候选**已在**工具结果里,无需再起任务 —— 直接渲 + 采纳即可,起任务反而会
 * 重复调 AI。所以这里复用的是同一条**确认门**(candidates.create/patch)+ 同一套候选形状。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { client } from "@/lib/contract-client";

export interface ChatTopicCandidate {
  title: string;
  angle: string;
  contentRole: string;
  /**
   * [T-149] AI 出题渠道(trend|benchmark|demand)。采纳时落成候选 source,保住来源统计的
   * provenance;缺省/旧工具结果无此字段 → 采纳侧兜 idea(向后兼容)。
   */
  source?: string;
  predictedScore: number | null;
  reason: string;
  /**
   * [T-066] 基于评论出题必须贴原始评论 —— 该选题依据的原始评论(逐字引用)。
   * 可选:旧工具结果/非评论依据没有此字段,渲染侧兜 []。
   */
  sourceComments?: readonly string[];
}

// [T-149] AI 出题渠道 → 候选 source 归一:只放行 trend|benchmark|demand(真 AI 渠道),
// 其余(空/未知/'idea'/'positioning'/'knowledge' 等模型自由输出)一律兜底 idea —— candidateSource
// 枚举只有 trend/benchmark/demand/idea,没有「定位」「知识库」桶(与后端 confirmTask 同款收窄)。
function normalizeSource(
  source: string | undefined,
): "trend" | "benchmark" | "demand" | "idea" {
  return source === "trend" || source === "benchmark" || source === "demand"
    ? source
    : "idea";
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

// 逐条采纳态:idle | adopting | adopted(新建) | updated(更新当前) | error。
type ItemState = "idle" | "adopting" | "adopted" | "updated" | "error";

/** 已落库(新建/更新)—— 退出批量池、渲收尾态。 */
function isDone(s: ItemState | undefined): boolean {
  return s === "adopted" || s === "updated";
}

export function ChatCandidateCard({
  candidates,
  selKind = null,
  selId = null,
}: {
  readonly candidates: readonly ChatTopicCandidate[];
  /** [T-267①] 当前会话选中态(ai-copilot-content 透传)——scoped 到某候选时采纳默认「更新当前」。 */
  readonly selKind?: string | null;
  readonly selId?: string | null;
}) {
  const router = useRouter();
  // [T-267①] 会话 scoped 到某条候选 → 采纳默认「更新当前选题」(patch);否则「新建」(create)。
  const scopedCandidateId = selKind === "candidate" ? (selId ?? null) : null;

  const [state, setState] = React.useState<ReadonlyMap<number, ItemState>>(
    () => new Map(),
  );
  // [T-264] 批量勾选态(默认全选;逐条采纳过的自动退出批量池)。
  const [selected, setSelected] = React.useState<ReadonlyMap<number, boolean>>(
    () => new Map(candidates.map((_, i) => [i, true])),
  );
  const [batchBusy, setBatchBusy] = React.useState(false);
  const [batchError, setBatchError] = React.useState(false);

  const setAt = React.useCallback(
    (i: number, s: ItemState) =>
      setState((prev) => {
        const next = new Map(prev);
        next.set(i, s);
        return next;
      }),
    [],
  );

  const toggleSelected = React.useCallback(
    (i: number, v: boolean) =>
      setSelected((prev) => {
        const next = new Map(prev);
        next.set(i, v);
        return next;
      }),
    [],
  );

  // candidates.create 落候选池的 body(人确认门,AI 不直接写)。[T-149] source 透传 AI 出题真实
  // 渠道(trend|benchmark|demand),不硬编码 idea —— 否则 AI 出的题被算进「手动灵感」统计。
  const createBodyOf = React.useCallback(
    (c: ChatTopicCandidate) => ({
      title: c.title,
      angle: c.angle,
      source: normalizeSource(c.source),
      ...(normalizeRole(c.contentRole)
        ? { contentRole: normalizeRole(c.contentRole) }
        : {}),
    }),
    [],
  );

  // 单条「采纳=新建」(未 scoped,或 scoped 下点「另存为新」)。
  const adoptAsNew = React.useCallback(
    async (i: number, c: ChatTopicCandidate) => {
      setAt(i, "adopting");
      try {
        await client.createCandidate({
          params: undefined,
          query: undefined,
          body: createBodyOf(c),
        });
        setAt(i, "adopted");
        toggleSelected(i, false);
        router.refresh();
      } catch {
        setAt(i, "error");
      }
    },
    [router, setAt, toggleSelected, createBodyOf],
  );

  // [T-267①] 单条「更新当前选题」(scoped 才可用):就地把标题/切入/内容角色改到会话绑定的那条候选。
  const updateCurrent = React.useCallback(
    async (i: number, c: ChatTopicCandidate) => {
      if (!scopedCandidateId) return;
      setAt(i, "adopting");
      try {
        await client.patchCandidate({
          params: { candidateId: scopedCandidateId },
          query: undefined,
          body: {
            title: c.title,
            angle: c.angle,
            ...(normalizeRole(c.contentRole)
              ? { contentRole: normalizeRole(c.contentRole) }
              : {}),
          },
        });
        setAt(i, "updated");
        toggleSelected(i, false);
        router.refresh();
      } catch {
        setAt(i, "error");
      }
    },
    [scopedCandidateId, router, setAt, toggleSelected],
  );

  // [T-264] 批量:采纳选中且未落库的条 —— 逐条 create,只 **一次 refresh**(非 N 次)。批量一律新建。
  const batchIndices = candidates
    .map((_, i) => i)
    .filter((i) => (selected.get(i) ?? false) && !isDone(state.get(i)));
  const batchAdopt = React.useCallback(async () => {
    if (batchBusy || batchIndices.length === 0) return;
    setBatchBusy(true);
    setBatchError(false);
    let anyOk = false;
    try {
      for (const i of batchIndices) {
        try {
          await client.createCandidate({
            params: undefined,
            query: undefined,
            body: createBodyOf(candidates[i]!),
          });
          setAt(i, "adopted");
          toggleSelected(i, false);
          anyOk = true;
        } catch {
          setAt(i, "error"); // 单条失败不阻断整批(已成的不回滚,诚实呈现)。
        }
      }
    } finally {
      setBatchBusy(false);
      if (anyOk) router.refresh(); // 一次刷新(非逐条 N 次)。
      // 全失败 → 提示批量出错(逐条 error 已渲)。
      setBatchError(!anyOk && batchIndices.length > 0);
    }
  }, [
    batchBusy,
    batchIndices,
    candidates,
    createBodyOf,
    router,
    setAt,
    toggleSelected,
  ]);

  if (candidates.length === 0) return null;

  return (
    <div
      data-slot="chat-candidate-card"
      className="mt-1.5 min-w-0 [overflow-wrap:anywhere] flex flex-col gap-1.5 rounded-lg border border-brand/20 bg-surface/70 p-2"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        {scopedCandidateId
          ? "AI 选题候选 · 更新当前选题 / 另存为新"
          : "AI 选题候选 · 采纳进候选池"}
      </span>
      <ul className="flex flex-col gap-1.5" aria-label="对话内选题候选">
        {candidates.map((c, i) => {
          const s = state.get(i) ?? "idle";
          const done = isDone(s);
          return (
            <li
              key={i}
              data-slot="chat-candidate-item"
              className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-1.5"
            >
              <div className="flex flex-wrap items-start gap-2">
                {/* [T-264] 批量勾选(落库后隐藏)。 */}
                {!done ? (
                  <input
                    type="checkbox"
                    data-slot="chat-candidate-select"
                    aria-label={`选中第 ${i + 1} 条`}
                    checked={selected.get(i) ?? false}
                    disabled={s === "adopting" || batchBusy}
                    onChange={(e) => toggleSelected(i, e.target.checked)}
                    className="mt-0.5 size-3.5 shrink-0 accent-brand"
                  />
                ) : null}
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
              <div className="flex flex-wrap items-center gap-2">
                {s === "adopted" ? (
                  <span
                    data-slot="chat-candidate-adopted"
                    className="text-[10px] font-medium text-success"
                  >
                    ✓ 已入候选池
                  </span>
                ) : s === "updated" ? (
                  <span
                    data-slot="chat-candidate-updated"
                    className="text-[10px] font-medium text-success"
                  >
                    ✓ 已更新当前选题
                  </span>
                ) : scopedCandidateId ? (
                  // [T-267①] scoped 到某候选 → 默认「更新当前」(patch 就地改),另给「另存为新」(create)。
                  <>
                    <button
                      type="button"
                      data-slot="chat-candidate-update-current"
                      disabled={s === "adopting"}
                      onClick={() => updateCurrent(i, c)}
                      className="inline-flex h-6 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                    >
                      {s === "adopting" ? "更新中…" : "更新当前"}
                    </button>
                    <button
                      type="button"
                      data-slot="chat-candidate-adopt"
                      disabled={s === "adopting"}
                      onClick={() => adoptAsNew(i, c)}
                      className="inline-flex h-6 items-center rounded-control border border-brand/40 px-2 text-[10px] font-medium text-brand hover:bg-brand-soft disabled:opacity-50"
                    >
                      另存为新
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    data-slot="chat-candidate-adopt"
                    disabled={s === "adopting"}
                    onClick={() => adoptAsNew(i, c)}
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
      {/* [T-264] 批量入库门(≥2 条时显)——「采纳选中 N 条」一次 create + 一次 refresh(非逐条 N 次)。
          scoped 下批量一律新建(update-current 语义只适用单条),故文案「另存为新」。 */}
      {candidates.length > 1 ? (
        <div
          data-slot="chat-candidate-batch"
          className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-1.5"
        >
          <button
            type="button"
            data-slot="chat-candidate-batch-adopt"
            disabled={batchBusy || batchIndices.length === 0}
            onClick={() => void batchAdopt()}
            className="inline-flex h-6 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {batchBusy
              ? "批量入库中…"
              : scopedCandidateId
                ? `另存选中 ${batchIndices.length} 条为新`
                : `采纳选中 ${batchIndices.length} 条`}
          </button>
          {batchError ? (
            <span className="text-[10px] text-destructive">
              批量采纳失败，重试
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
