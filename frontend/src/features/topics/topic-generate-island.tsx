"use client";

/**
 * `TopicGenerateBand` — the 选题中心大改 顶部「AI 选题会」带 (紫色 accent). Replaces the old
 * single-button island with the SPEC §Slice-2 band:
 *
 *  - 标题 + 副标题
 *  - 4 出题按钮, each fires `topic.generate` with a different 出题依据
 *    (inputData.basis ∈ positioning|comments|knowledge|trend) — the runner foregrounds
 *    that context slice. The whole start→poll→awaiting→采纳(confirm)→refresh loop lives
 *    here (mirrors AdoptCandidateCard's bus; one task at a time across the 4 buttons).
 *  - 右侧「当前依据」面板 — the real overview.basis counts (定位 / 评论信号 N / 知识卡 N /
 *    高表现 N), passed from the server read (topics.overview). Never fabricated: a basis
 *    with no backing data shows its real 0 / 未设定.
 *
 * Determinism (C-5): the basis panel comes from server props; the only nondeterminism is
 * the explicit AI task the user starts. On 采纳 → router.refresh() re-reads the pool.
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
  type LucideIcon,
} from "lucide-react";

import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import type { TopicsOverviewResource } from "@creatoros/backend/modules/candidate";

type Basis = "positioning" | "comments" | "knowledge" | "trend";
type Phase = "idle" | "running" | "review" | "done" | "error";

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
    {
      icon: Compass,
      label: "定位",
      value: basis.positioningLabel || "未设定",
    },
    {
      icon: MessageSquare,
      label: "评论信号",
      value: String(basis.commentSignals),
    },
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

export function TopicGenerateBand({
  basis,
}: {
  readonly basis: TopicsOverviewResource["basis"];
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [activeBasis, setActiveBasis] = React.useState<Basis | null>(null);
  const [items, setItems] = React.useState<TopicItem[]>([]);
  const [taskId, setTaskId] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const cancelledRef = React.useRef(false);
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  const pollUntilDone = React.useCallback(async (id: string) => {
    for (let i = 0; i < MAX_POLLS; i++) {
      if (cancelledRef.current) return;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      if (cancelledRef.current) return;
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
        setItems(last ? parseTopics(last.resultData) : []);
        setPhase("review");
        return;
      }
      if (status.status === "cancelled" || status.status === "failed") {
        setPhase("error");
        return;
      }
      // Defensive: a `succeeded` task is one already adopted — its candidates were
      // consumed, so there is nothing left to review. Stop polling instead of spinning
      // out the full window. (With in-flight-only idempotency a click always starts a
      // fresh run, so this is belt-and-suspenders against ever 无限转圈.)
      if (status.status === "succeeded") {
        setPhase("done");
        return;
      }
    }
    setPhase("error");
  }, []);

  const start = React.useCallback(
    async (b: Basis) => {
      if (phase === "running") return;
      setActiveBasis(b);
      setPhase("running");
      setItems([]);
      try {
        const task = (await client.createAITask({
          params: undefined,
          query: undefined,
          body: { taskType: "topic.generate", inputData: { basis: b } },
        })) as { id: string };
        setTaskId(task.id);
        await pollUntilDone(task.id);
      } catch {
        setPhase("error");
      }
    },
    [phase, pollUntilDone],
  );

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
    <section
      data-testid="topics-ai-band"
      className="rounded-card border border-brand/30 bg-gradient-to-br from-brand-soft/70 via-surface to-surface p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {/* 左：标题 + 副标题 + 4 按钮 */}
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

          <div
            data-testid="topics-generate-buttons"
            className="flex flex-wrap gap-2"
          >
            {BASIS_BUTTONS.map((b) => {
              const active = activeBasis === b.basis && phase === "running";
              return (
                <button
                  key={b.basis}
                  type="button"
                  data-basis={b.basis}
                  disabled={phase === "running"}
                  onClick={() => start(b.basis)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-xs font-medium transition-colors disabled:opacity-50",
                    active
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-brand/30 bg-surface text-foreground hover:border-brand hover:bg-brand-soft/60",
                  )}
                >
                  <b.icon className="size-4 text-brand" />
                  {b.label}
                </button>
              );
            })}
          </div>

          {/* 运行 / 审阅 / 完成 / 错误 状态. */}
          {phase === "running" ? (
            <div
              data-slot="band-running"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span className="size-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              {RUNNING_LABEL}
            </div>
          ) : null}

          {phase === "review" ? (
            <div data-slot="band-review" className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                AI 给出 {items.length} 条，审阅后采纳：
              </p>
              <ul className="flex flex-col gap-1.5">
                {items.map((t, i) => (
                  <li
                    key={i}
                    className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
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
                    </div>
                    {t.angle ? (
                      <span className="text-xs text-muted-foreground">
                        切入：{t.angle}
                      </span>
                    ) : null}
                    {t.reason ? (
                      <span className="text-[11px] text-text-subtle">
                        {t.reason}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-slot="band-confirm"
                  disabled={confirming || items.length === 0}
                  onClick={adopt}
                  className="inline-flex h-8 items-center rounded-control bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                >
                  采纳全部（{items.length}）入候选池
                </button>
                <button
                  type="button"
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
            <p data-slot="band-done" className="text-sm text-success">
              ✓ 已采纳 {items.length} 条进候选池。
            </p>
          ) : null}

          {phase === "error" ? (
            <div data-slot="band-error" className="flex items-center gap-2">
              <p className="text-sm text-destructive">
                AI 没成功（超时或出错）。
              </p>
              {activeBasis ? (
                <button
                  type="button"
                  onClick={() => start(activeBasis)}
                  className="inline-flex h-7 items-center rounded-control border border-border px-2.5 text-xs font-medium text-foreground hover:bg-surface-subtle"
                >
                  重试
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* 右：当前依据 面板 */}
        <BasisPanel basis={basis} />
      </div>
    </section>
  );
}
