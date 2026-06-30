"use client";

/**
 * `TopicGenerateBand` — 选题中心顶部「AI 选题会」带(紫色 accent)。
 *
 * 设计(2026-06 弹窗化重构):band 自身**永远固定高度**,只承载触发面 —— 标题 + 4 出题按钮
 * (basis ∈ positioning|comments|knowledge|trend)+「当前依据」面板 + 一个「上次待审阅 · 查看」入口。
 * 真正的「运行步骤日志 + 候选审阅 + 采纳/丢弃」全部移进居中弹窗 `TopicReviewDialog`,弹窗内部
 * 自己滚动 —— 这样候选再多也不会把固定高度的三栏工作台挤出视口(之前内联铺候选导致整页拖不动)。
 *
 * 跨刷新缓存:候选本就永久存 ai_task_results。SSR 通过 `ai.tasks.pending_topic_review` 读到
 * 「最近一条待审阅的 topic.generate 任务」传进 `pendingReview`;刷新/重进页面后,band 仍显示
 * 「上次生成 N 条待审阅」,点开直接 `listTaskResults(taskId)` 重读候选 —— 采纳前绝不重复调 AI。
 *
 * Determinism:basis 面板与 pendingReview 都来自 server props;唯一非确定来源是用户显式发起的 AI 任务。
 * 采纳/丢弃 → router.refresh() 重读池子与待审阅状态。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Target,
  MessageSquare,
  BookOpen,
  Flame,
  Compass,
  Sparkles,
  Inbox,
  type LucideIcon,
} from "lucide-react";

import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TopicsOverviewResource } from "@creatoros/backend/modules/candidate";

type Basis = "positioning" | "comments" | "knowledge" | "trend";
type Phase = "loading" | "running" | "review" | "error";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 75; // ~5 min — multi-angle agent work (WebSearch) can run minutes.

interface BasisButton {
  readonly basis: Basis;
  readonly label: string;
  readonly icon: LucideIcon;
}

const BASIS_BUTTONS: readonly BasisButton[] = [
  { basis: "positioning", label: "基于定位出题", icon: Target },
  { basis: "comments", label: "基于评论问题", icon: MessageSquare },
  { basis: "knowledge", label: "基于知识库出题", icon: BookOpen },
  { basis: "trend", label: "基于热点出题", icon: Flame },
];

const BASIS_LABEL: Record<string, string> = {
  positioning: "基于定位",
  comments: "基于评论问题",
  knowledge: "基于知识库",
  trend: "基于热点",
};

interface TopicItem {
  title: string;
  angle: string;
  contentRole: string;
  predictedScore: number | null;
  reason: string;
}

const ROLE_LABEL: Record<string, string> = {
  traffic: "引流",
  trust: "信任",
  conversion: "转化",
};

/** 缓存指针:SSR 读到的「最近待审阅选题任务」,或本次生成完成后的本地态。 */
export interface PendingTopicReview {
  taskId: string;
  basis: string;
  count: number;
}

function parseTopics(resultData: Record<string, unknown>): TopicItem[] {
  const items = Array.isArray(resultData.items) ? resultData.items : [];
  return items
    .map((raw): TopicItem | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title : "";
      if (!title) return null;
      return {
        title,
        angle: typeof o.angle === "string" ? o.angle : "",
        contentRole: typeof o.contentRole === "string" ? o.contentRole : "",
        predictedScore:
          typeof o.predictedScore === "number" ? o.predictedScore : null,
        reason: typeof o.reason === "string" ? o.reason : "",
      };
    })
    .filter((t): t is TopicItem => t !== null);
}

const RUNNING_LABEL =
  "选题 agent 正在看热点/对标并按定位打分（可能要一两分钟）…";

// ── 当前依据 面板 ──────────────────────────────────────────────────────────────────
function BasisPanel({ basis }: { readonly basis: TopicsOverviewResource["basis"] }) {
  const rows: Array<{ icon: LucideIcon; label: string; value: string }> = [
    { icon: Compass, label: "定位", value: basis.positioningLabel || "未设定" },
    { icon: MessageSquare, label: "评论信号", value: String(basis.commentSignals) },
    { icon: BookOpen, label: "知识卡", value: String(basis.knowledgeCards) },
    { icon: Flame, label: "高表现", value: String(basis.highPerformers) },
  ];
  return (
    <div
      data-testid="topics-basis-panel"
      className="flex w-full shrink-0 flex-col gap-2 rounded-card border border-brand/20 bg-surface/70 p-3 lg:w-[300px]"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-brand">
        当前依据
      </span>
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-xs">
            <r.icon className="size-3.5 shrink-0 text-brand" />
            <span className="text-text-subtle">{r.label}</span>
            <span className="ml-auto max-w-[170px] truncate font-medium text-foreground">
              {r.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 候选卡(弹窗内复用) ───────────────────────────────────────────────────────────
function CandidateRow({
  t,
  onRemove,
}: {
  readonly t: TopicItem;
  readonly onRemove?: () => void;
}) {
  return (
    <li className="flex flex-col gap-1 rounded-control border border-border bg-surface px-3 py-2.5 text-sm">
      <div className="flex items-start gap-2">
        <span className="flex-1 font-medium leading-snug text-foreground">
          {t.title}
        </span>
        {t.predictedScore !== null ? (
          <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
            爆款潜力 {t.predictedScore}
          </span>
        ) : null}
        {ROLE_LABEL[t.contentRole] ? (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {ROLE_LABEL[t.contentRole]}
          </span>
        ) : null}
        {onRemove ? (
          // CollabField:采纳前逐条删掉不要的候选。
          <button
            type="button"
            aria-label="删除这条候选"
            onClick={onRemove}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-control border border-border text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
          >
            ×
          </button>
        ) : null}
      </div>
      {t.angle ? (
        <span className="text-xs text-muted-foreground">切入：{t.angle}</span>
      ) : null}
      {t.reason ? (
        <span className="text-[11px] text-text-subtle">{t.reason}</span>
      ) : null}
    </li>
  );
}

export function TopicGenerateBand({
  basis,
  pendingReview = null,
}: {
  readonly basis: TopicsOverviewResource["basis"];
  readonly pendingReview?: PendingTopicReview | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("running");
  const [activeBasis, setActiveBasis] = React.useState<Basis | null>(null);
  const [items, setItems] = React.useState<TopicItem[]>([]);
  // CollabField(COLLAB-02):原始 items(用于 patch)+ 人删掉的下标 —— 采纳前可逐条筛。
  const [rawItems, setRawItems] = React.useState<unknown[]>([]);
  const [removed, setRemoved] = React.useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [steps, setSteps] = React.useState<
    { stepNo: number; text: string; kind: string }[]
  >([]);
  const [taskId, setTaskId] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  // 待审阅指针:初值取 SSR(跨刷新);本次生成完成或采纳/丢弃后本地更新。
  const [pending, setPending] = React.useState<PendingTopicReview | null>(
    pendingReview,
  );
  const cancelledRef = React.useRef(false);
  React.useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const dialogBasisLabel =
    (activeBasis && BASIS_LABEL[activeBasis]) ||
    (pending && BASIS_LABEL[pending.basis]) ||
    "";

  const pollUntilDone = React.useCallback(async (id: string) => {
    for (let i = 0; i < MAX_POLLS; i++) {
      if (cancelledRef.current) return;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      if (cancelledRef.current) return;
      // 拉实时步骤事件 —— 喂弹窗里的「窗口步骤日志」(第1步读人设…第N步生成)。
      try {
        const stepRows = (await client.listTaskSteps({
          params: { taskId: id },
          query: undefined,
          body: undefined,
        })) as unknown as Array<{ stepNo: number; text: string; kind: string }>;
        if (!cancelledRef.current && Array.isArray(stepRows)) setSteps(stepRows);
      } catch {
        /* 步骤是辅助信息,拉失败不影响主轮询 */
      }
      const status = (await client.getTask({
        params: { taskId: id },
        query: undefined,
        body: undefined,
      })) as { status: string };
      if (status.status === "awaiting_confirmation") {
        const results = (await client.listTaskResults({
          params: { taskId: id },
          query: undefined,
          body: undefined,
        })) as unknown as Array<{ resultData: Record<string, unknown> }>;
        const last = results[results.length - 1];
        const parsed = last ? parseTopics(last.resultData) : [];
        const raw =
          last && Array.isArray(last.resultData.items)
            ? (last.resultData.items as unknown[])
            : [];
        if (cancelledRef.current) return;
        setItems(parsed);
        setRawItems(raw);
        setRemoved(new Set());
        setPhase("review");
        return;
      }
      if (status.status === "cancelled" || status.status === "failed") {
        if (!cancelledRef.current) setPhase("error");
        return;
      }
      // succeeded = 已被采纳消费,无候选可审 —— 收尾不空转。
      if (status.status === "succeeded") {
        if (!cancelledRef.current) {
          setItems([]);
          setOpen(false);
        }
        return;
      }
    }
    if (!cancelledRef.current) setPhase("error");
  }, []);

  // 发起新一轮生成 → 开弹窗 + 轮询(真调 AI)。
  const start = React.useCallback(
    async (b: Basis) => {
      if (phase === "running" && open) return;
      setActiveBasis(b);
      setItems([]);
      setSteps([]);
      setPhase("running");
      setOpen(true);
      try {
        const task = (await client.createAITask({
          params: undefined,
          query: undefined,
          body: { taskType: "topic.generate", inputData: { basis: b } },
        })) as { id: string };
        if (cancelledRef.current) return;
        setTaskId(task.id);
        await pollUntilDone(task.id);
      } catch {
        if (!cancelledRef.current) setPhase("error");
      }
    },
    [phase, open, pollUntilDone],
  );

  // 打开「上次待审阅」缓存 → 重读已存候选,绝不重新生成。
  const openPending = React.useCallback(async () => {
    if (!pending) return;
    setActiveBasis(null);
    setTaskId(pending.taskId);
    setItems([]);
    setSteps([]);
    setPhase("loading");
    setOpen(true);
    try {
      const results = (await client.listTaskResults({
        params: { taskId: pending.taskId },
        query: undefined,
        body: undefined,
      })) as unknown as Array<{ resultData: Record<string, unknown> }>;
      const last = results[results.length - 1];
      if (cancelledRef.current) return;
      setItems(last ? parseTopics(last.resultData) : []);
      setRawItems(
        last && Array.isArray(last.resultData.items)
          ? (last.resultData.items as unknown[])
          : [],
      );
      setRemoved(new Set());
      setPhase("review");
    } catch {
      if (!cancelledRef.current) setPhase("error");
    }
  }, [pending]);

  // CollabField:原始 items 与解析后的 items 1:1 对齐时才允许逐条删(否则下标对不上,禁编辑)。
  const canEdit = rawItems.length === items.length && items.length > 0;
  const keptCount = canEdit ? items.length - removed.size : items.length;

  const adopt = React.useCallback(async () => {
    if (!taskId) return;
    setConfirming(true);
    try {
      // 删过候选 → 先把保留项 patch 回最新结果,再 confirm 物化(只入留下的)。
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
      setPending(null);
      setOpen(false);
      router.refresh();
    } catch {
      setPhase("error");
    } finally {
      setConfirming(false);
    }
  }, [taskId, router, canEdit, removed, rawItems]);

  // 丢弃 = 取消该任务(进 cancelled 终态),待审阅入口随之消失。
  const discard = React.useCallback(async () => {
    setConfirming(true);
    try {
      if (taskId) {
        await client.cancelTask({
          params: { taskId },
          query: undefined,
          body: undefined,
        });
      }
      setPending(null);
      setOpen(false);
      router.refresh();
    } catch {
      setOpen(false);
    } finally {
      setConfirming(false);
    }
  }, [taskId, router]);

  const generating = phase === "running" && open;

  return (
    <section
      data-testid="topics-ai-band"
      className="rounded-card border border-brand/30 bg-gradient-to-br from-brand-soft/70 via-surface to-surface p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {/* 左：标题 + 副标题 + 4 按钮 + 待审阅入口 */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <span className="flex size-7 items-center justify-center rounded-control bg-brand text-brand-foreground">
                <Sparkles className="size-4" />
              </span>
              AI 选题会
            </h2>
            <p className="text-sm text-muted-foreground">
              选一个出题依据，AI 按你的定位 + 真实信号给出打分选题，审阅后采纳进候选池。
            </p>
          </div>

          <div data-testid="topics-generate-buttons" className="flex flex-wrap gap-2">
            {BASIS_BUTTONS.map((b) => (
              <button
                key={b.basis}
                type="button"
                data-basis={b.basis}
                disabled={generating}
                onClick={() => start(b.basis)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-xs font-medium transition-colors disabled:opacity-50",
                  generating && activeBasis === b.basis
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-brand/30 bg-surface text-foreground hover:border-brand hover:bg-brand-soft/60",
                )}
              >
                <b.icon className="size-4 text-brand" />
                {b.label}
              </button>
            ))}
          </div>

          {/* 运行中:band 上只放一行极简提示(详情在弹窗),不长高。 */}
          {generating ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              正在生成 · 步骤进度见弹窗
            </div>
          ) : null}

          {/* 待审阅入口(跨刷新缓存):有未采纳候选时显示,点开重读、免重生成。 */}
          {!generating && pending && pending.count > 0 ? (
            <button
              type="button"
              data-testid="topics-pending-review"
              onClick={openPending}
              className="inline-flex w-fit items-center gap-2 rounded-control border border-brand/40 bg-brand-soft/50 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand-soft"
            >
              <Inbox className="size-3.5" />
              上次生成 {pending.count} 条选题待审阅 · 查看
            </button>
          ) : null}
        </div>

        {/* 右：当前依据 面板 */}
        <BasisPanel basis={basis} />
      </div>

      {/* 居中弹窗:运行步骤日志 + 候选审阅 + 采纳/丢弃,内部独立滚动 */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          // 关闭时不清 taskId/items —— 留作本会话缓存,「查看」可秒开。
          if (!confirming) setOpen(v);
        }}
      >
        <DialogContent
          data-testid="topics-review-dialog"
          className="flex max-h-[80vh] flex-col gap-0 p-0 sm:max-w-2xl"
        >
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand" />
              AI 选题会{dialogBasisLabel ? ` · ${dialogBasisLabel}` : ""}
            </DialogTitle>
            <DialogDescription>
              {phase === "running"
                ? RUNNING_LABEL
                : phase === "review"
                  ? `AI 给出 ${items.length} 条,审阅后采纳进候选池。`
                  : phase === "loading"
                    ? "正在读取上次生成的候选…"
                    : "AI 没成功（超时或出错）。"}
            </DialogDescription>
          </DialogHeader>

          {/* 弹窗 body：唯一的滚动区 */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {phase === "running" || phase === "loading" ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  {phase === "loading" ? "读取候选…" : "agent 运行中…"}
                </div>
                {steps.length > 0 ? (
                  <ol className="flex flex-col gap-1.5 rounded-card border border-brand/15 bg-surface/60 p-3">
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
              items.length > 0 ? (
                <ul
                  data-testid="topics-review-list"
                  className="flex flex-col gap-2"
                >
                  {items.map((t, i) =>
                    removed.has(i) ? null : (
                      <CandidateRow
                        key={i}
                        t={t}
                        onRemove={
                          canEdit
                            ? () => setRemoved((s) => new Set(s).add(i))
                            : undefined
                        }
                      />
                    ),
                  )}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  这次没有可审阅的候选。
                </p>
              )
            ) : null}

            {phase === "error" ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-destructive">
                  AI 没成功（超时或出错）。候选未生成或读取失败。
                </p>
                {activeBasis ? (
                  <button
                    type="button"
                    onClick={() => start(activeBasis)}
                    className="inline-flex h-8 items-center rounded-control border border-border px-3 text-xs font-medium text-foreground hover:bg-surface-subtle"
                  >
                    重试
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {phase === "review" && items.length > 0 ? (
            <DialogFooter className="border-t">
              <button
                type="button"
                disabled={confirming}
                onClick={discard}
                className="inline-flex h-9 items-center rounded-control border border-border px-3 text-xs font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
              >
                丢弃
              </button>
              <button
                type="button"
                data-slot="band-confirm"
                disabled={confirming || keptCount === 0}
                onClick={adopt}
                className="inline-flex h-9 items-center rounded-control bg-brand px-4 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
              >
                {confirming ? "采纳中…" : `采纳（${keptCount}）入候选池`}
              </button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
