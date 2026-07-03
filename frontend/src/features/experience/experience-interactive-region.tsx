"use client";

/**
 * `/experience` 经验裁决台 client 岛(T-062a · SPEC §2.1/§2.3/§2.4)。
 *
 * 页面壳保持 Server Component(experience-page.tsx);这里承载全部交互:
 *
 *   - `AdjudicationQueue`(左栏)—— candidate 裁决队列:
 *       采纳 / 不采 → `learnings.evaluate`;inline 编辑 title+insight →
 *       `learnings.patch` → router.refresh()。
 *   - `ValidatedLibrary`(右栏)—— validated 按 learningType 分组折叠:
 *       「回流校准」→ 展开内联表单(绝不弹窗)→
 *       `learnings.calibrationSuggestions.create` → 成功后卡上显
 *       「已回流 · 待校准中心采纳」徽章(client state + 服务端 pending 集合双源);
 *       「应用到项目」→ `learnings.applications.create`(§2.2 复用既有 op);
 *       底部 discarded 折叠区带「翻案」→ evaluate 回 candidate。
 *   - `ExperienceCaptureLink` —— 旧 RightRail「快速记录」表单退役,改为 Copilot
 *       深链(T-060① 范式:只预填不发送)。
 *
 * 确定性:岛内无 Date.now / Math.random / fetch,唯一异步是 typed client 过
 * dispatch 路由;每个 mutation 后 router.refresh() 让服务端读侧回流。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";
import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import type { LearningTypeKey, LearningVm } from "./experience-data";

// ---------------------------------------------------------------------------
// learningType → 中文徽章(8 类,SPEC §2.1)
// ---------------------------------------------------------------------------

export const LEARNING_TYPE_LABELS: Record<LearningTypeKey, string> = {
  strategy: "选题策略",
  hook: "钩子",
  structure: "结构",
  failure: "失败教训",
  process: "流程",
  editing: "剪辑",
  conversion_pattern: "转化模式",
  offer_insight: "变现洞察",
};

/** 分组展示顺序(固定,避免 Object.keys 顺序不确定)。 */
const LEARNING_TYPE_ORDER: ReadonlyArray<LearningTypeKey> = [
  "strategy",
  "hook",
  "structure",
  "failure",
  "process",
  "editing",
  "conversion_pattern",
  "offer_insight",
];

/** 应用目标项目(来自 projects.list,route 传入)。 */
export interface ApplyTarget {
  readonly id: string;
  readonly title: string;
}

// ---------------------------------------------------------------------------
// 共用小件
// ---------------------------------------------------------------------------

function useLearningMutations() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const run = React.useCallback(
    (mutate: () => Promise<unknown>) => {
      startTransition(async () => {
        await mutate();
        router.refresh();
      });
    },
    [router],
  );
  return { pending, run };
}

function TypeBadge({ type }: { type: LearningTypeKey }) {
  return (
    <span
      data-slot="learning-type-badge"
      data-learning-type={type}
      className="shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand"
    >
      {LEARNING_TYPE_LABELS[type]}
    </span>
  );
}

/** 证据行:来源(复盘/手录)· 置信度 · 被 N 个项目应用(真值,0 显 0)。 */
function EvidenceRow({ learning }: { learning: LearningVm }) {
  return (
    <div
      data-slot="learning-evidence"
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground"
    >
      <span data-slot="learning-source">
        {learning.reviewId !== null ? "来自复盘" : "手录"}
      </span>
      <span aria-hidden="true">·</span>
      <span className="font-mono tabular-nums">
        置信度 {learning.confidenceScore}
      </span>
      <span aria-hidden="true">·</span>
      <span data-slot="learning-reuse-count" className="font-mono tabular-nums">
        被 {learning.reuseCount} 个项目应用
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 记一条经验 —— Copilot 深链(旧快速记录表单退役,§2.4)
// ---------------------------------------------------------------------------

export function ExperienceCaptureLink() {
  return (
    <Link
      data-slot="experience-capture-link"
      href={copilotDeepLink("experience", undefined, undefined, "记一条经验:")}
      className="shrink-0 rounded-control bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground hover:bg-brand/90"
    >
      记一条经验
    </Link>
  );
}

// ---------------------------------------------------------------------------
// 左栏:裁决队列(candidate)
// ---------------------------------------------------------------------------

export interface AdjudicationQueueProps {
  readonly candidates: ReadonlyArray<LearningVm>;
}

export function AdjudicationQueue({ candidates }: AdjudicationQueueProps) {
  const { pending, run } = useLearningMutations();
  const router = useRouter();
  // 当前展开 inline 编辑的 learningId(一次编辑一张卡)。
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const evaluate = React.useCallback(
    (learningId: string, validationStatus: "validated" | "discarded") => {
      run(() =>
        client.evaluateLearning({
          params: { learningId },
          query: undefined,
          body: { validationStatus },
        }),
      );
    },
    [run],
  );

  return (
    <section
      data-slot="learning-queue"
      aria-label="裁决队列"
      className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1"
    >
      {candidates.length === 0 ? (
        <p
          data-slot="learning-queue-empty"
          className="rounded-card bg-surface-subtle px-4 py-6 text-center text-sm text-muted-foreground"
        >
          暂无待裁决经验——复盘后 AI 会把发现排进来
        </p>
      ) : null}
      {candidates.map((learning) => (
        <CandidateCard
          key={learning.id}
          learning={learning}
          pending={pending}
          editing={editingId === learning.id}
          onToggleEdit={() =>
            setEditingId((prev) => (prev === learning.id ? null : learning.id))
          }
          onEvaluate={evaluate}
          onSaved={() => {
            setEditingId(null);
            router.refresh();
          }}
        />
      ))}
    </section>
  );
}

function CandidateCard({
  learning,
  pending,
  editing,
  onToggleEdit,
  onEvaluate,
  onSaved,
}: {
  learning: LearningVm;
  pending: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  onEvaluate: (learningId: string, status: "validated" | "discarded") => void;
  onSaved: () => void;
}) {
  return (
    <article
      data-slot="candidate-card"
      data-learning-id={learning.id}
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TypeBadge type={learning.learningType} />
          <h3 className="min-w-0 truncate text-sm font-medium text-foreground">
            {learning.title}
          </h3>
        </div>
      </div>
      {/* insight 全文(裁决要看全貌,不截断)。 */}
      <p
        data-slot="learning-insight"
        className="whitespace-pre-wrap text-sm text-muted-foreground"
      >
        {learning.insight}
      </p>
      <EvidenceRow learning={learning} />

      {editing ? (
        <CandidateEditForm learning={learning} pending={pending} onSaved={onSaved} />
      ) : null}

      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          data-slot="learning-edit"
          disabled={pending}
          aria-expanded={editing}
          onClick={onToggleEdit}
          className="rounded-control border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
        >
          {editing ? "收起编辑" : "编辑"}
        </button>
        <button
          type="button"
          data-slot="learning-discard"
          disabled={pending}
          onClick={() => onEvaluate(learning.id, "discarded")}
          className="rounded-control border border-border bg-surface px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-surface-subtle disabled:opacity-50"
        >
          不采
        </button>
        <button
          type="button"
          data-slot="learning-adopt"
          disabled={pending}
          onClick={() => onEvaluate(learning.id, "validated")}
          className="rounded-control bg-brand px-2 py-1 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
        >
          采纳
        </button>
      </div>
    </article>
  );
}

/** inline 编辑 title+insight(受控输入)→ learnings.patch → 收起 + refresh。 */
function CandidateEditForm({
  learning,
  pending,
  onSaved,
}: {
  learning: LearningVm;
  pending: boolean;
  onSaved: () => void;
}) {
  const [title, setTitle] = React.useState(learning.title);
  const [insight, setInsight] = React.useState(learning.insight);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(false);
  const canSave = title.trim() !== "" && !saving && !pending;

  const save = React.useCallback(() => {
    if (!canSave) return;
    setSaving(true);
    setError(false);
    void (async () => {
      try {
        await client.patchLearning({
          params: { learningId: learning.id },
          query: undefined,
          body: { title: title.trim(), insight },
        });
        onSaved();
      } catch {
        // 诚实错误态:保留输入供重试,不静默吞。
        setError(true);
      } finally {
        setSaving(false);
      }
    })();
  }, [canSave, insight, learning.id, onSaved, title]);

  return (
    <div
      data-slot="learning-edit-form"
      className="flex flex-col gap-2 rounded-card border border-border bg-surface-subtle p-2.5"
    >
      <input
        data-slot="learning-edit-title"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="经验标题（必填）"
        className="rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
      />
      <textarea
        data-slot="learning-edit-insight"
        value={insight}
        onChange={(e) => setInsight(e.target.value)}
        rows={3}
        placeholder="洞察正文"
        className="rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
      />
      {error ? (
        <p data-slot="learning-edit-error" className="text-xs text-danger">
          保存失败，请重试。
        </p>
      ) : null}
      <div className="flex items-center justify-end">
        <button
          type="button"
          data-slot="learning-edit-save"
          disabled={!canSave}
          onClick={save}
          className="rounded-control bg-brand px-2.5 py-1 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
        >
          保存修改
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 右栏:已验证库(validated 分组折叠)+ discarded 折叠区
// ---------------------------------------------------------------------------

export interface ValidatedLibraryProps {
  readonly validated: ReadonlyArray<LearningVm>;
  readonly discarded: ReadonlyArray<LearningVm>;
  /** 已有 pending 回流建议的 learningId(服务端读侧,徽章跨刷新持久)。 */
  readonly reflowedLearningIds: ReadonlyArray<string>;
  /** 「应用到项目」目标(projects.list);空 ⇒ 隐藏应用控件。 */
  readonly applyTargets: ReadonlyArray<ApplyTarget>;
}

export function ValidatedLibrary({
  validated,
  discarded,
  reflowedLearningIds,
  applyTargets,
}: ValidatedLibraryProps) {
  const { pending, run } = useLearningMutations();
  // 本次会话内新回流成功的 learningId(client state 即时徽章,SPEC §2.3)。
  const [sessionReflowed, setSessionReflowed] = React.useState<
    ReadonlySet<string>
  >(new Set());
  const serverReflowed = React.useMemo(
    () => new Set(reflowedLearningIds),
    [reflowedLearningIds],
  );

  const groups = React.useMemo(() => {
    const byType = new Map<LearningTypeKey, LearningVm[]>();
    for (const learning of validated) {
      const bucket = byType.get(learning.learningType) ?? [];
      bucket.push(learning);
      byType.set(learning.learningType, bucket);
    }
    return LEARNING_TYPE_ORDER.filter((type) => byType.has(type)).map(
      (type) => ({ type, items: byType.get(type)! }),
    );
  }, [validated]);

  const reopen = React.useCallback(
    (learningId: string) => {
      run(() =>
        client.evaluateLearning({
          params: { learningId },
          query: undefined,
          body: { validationStatus: "candidate" },
        }),
      );
    },
    [run],
  );

  return (
    <section
      data-slot="validated-library"
      aria-label="已验证经验库"
      className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1"
    >
      {validated.length === 0 ? (
        <p
          data-slot="validated-empty"
          className="rounded-card bg-surface-subtle px-4 py-6 text-center text-sm text-muted-foreground"
        >
          暂无已验证经验——在左侧裁决队列采纳后会沉淀到这里
        </p>
      ) : null}

      {groups.map((group) => (
        <details
          key={group.type}
          data-slot="validated-group"
          data-learning-type={group.type}
          open
          className="rounded-card border border-border bg-surface"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-foreground">
            <span>{LEARNING_TYPE_LABELS[group.type]}</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {group.items.length} 条
            </span>
          </summary>
          <div className="flex flex-col gap-2 px-3 pb-3">
            {group.items.map((learning) => (
              <ValidatedCard
                key={learning.id}
                learning={learning}
                pending={pending}
                reflowed={
                  serverReflowed.has(learning.id) ||
                  sessionReflowed.has(learning.id)
                }
                applyTargets={applyTargets}
                onApplied={run}
                onReflowed={(id) =>
                  setSessionReflowed((prev) => new Set(prev).add(id))
                }
              />
            ))}
          </div>
        </details>
      ))}

      {/* 底部折叠区:discarded 带「翻案」(evaluate 回 candidate)。 */}
      <details
        data-slot="discarded-section"
        className="rounded-card border border-border/60 bg-surface-subtle"
      >
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-muted-foreground">
          <span>已不采（{discarded.length}）</span>
        </summary>
        <div className="flex flex-col gap-1.5 px-3 pb-3">
          {discarded.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">暂无不采记录</p>
          ) : null}
          {discarded.map((learning) => (
            <div
              key={learning.id}
              data-slot="discarded-row"
              data-learning-id={learning.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <TypeBadge type={learning.learningType} />
                <span className="truncate text-muted-foreground line-through">
                  {learning.title}
                </span>
              </div>
              <button
                type="button"
                data-slot="learning-reopen"
                disabled={pending}
                onClick={() => reopen(learning.id)}
                className="shrink-0 rounded-control border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
              >
                翻案
              </button>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function ValidatedCard({
  learning,
  pending,
  reflowed,
  applyTargets,
  onApplied,
  onReflowed,
}: {
  learning: LearningVm;
  pending: boolean;
  reflowed: boolean;
  applyTargets: ReadonlyArray<ApplyTarget>;
  onApplied: (mutate: () => Promise<unknown>) => void;
  onReflowed: (learningId: string) => void;
}) {
  const [formOpen, setFormOpen] = React.useState(false);

  return (
    <article
      data-slot="validated-card"
      data-learning-id={learning.id}
      className="flex flex-col gap-2 rounded-card bg-surface-subtle p-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="min-w-0 text-sm font-medium text-foreground">
          {learning.title}
        </h4>
        {reflowed ? (
          <span
            data-slot="learning-reflow-badge"
            className="shrink-0 rounded-md bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success"
          >
            已回流 · 待校准中心采纳
          </span>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
        {learning.insight}
      </p>
      <EvidenceRow learning={learning} />
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {applyTargets.length > 0 ? (
          <ApplyControl
            learningId={learning.id}
            targets={applyTargets}
            pending={pending}
            onApply={onApplied}
          />
        ) : null}
        {!reflowed ? (
          <button
            type="button"
            data-slot="learning-reflow"
            disabled={pending}
            aria-expanded={formOpen}
            onClick={() => setFormOpen((prev) => !prev)}
            title="把这条经验变成约束未来评分的维度建议，到校准中心采纳"
            className="rounded-control border border-brand/40 bg-brand/5 px-2 py-1 text-xs font-medium text-brand hover:bg-brand/10 disabled:opacity-50"
          >
            回流校准
          </button>
        ) : null}
      </div>
      {formOpen && !reflowed ? (
        <ReflowForm
          learningId={learning.id}
          onDone={() => {
            setFormOpen(false);
            onReflowed(learning.id);
          }}
        />
      ) : null}
    </article>
  );
}

/**
 * 回流校准内联表单(SPEC §2.3,绝不弹窗):dimensionLabel / weight 可改,留空则
 * 省略字段 → 服务端按 learningType 默认;成功 → 卡上「已回流」徽章。
 */
function ReflowForm({
  learningId,
  onDone,
}: {
  learningId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [dimensionLabel, setDimensionLabel] = React.useState("");
  const [weight, setWeight] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = React.useCallback(() => {
    if (submitting) return;
    const parsedWeight = weight.trim() === "" ? undefined : Number(weight);
    if (parsedWeight !== undefined && Number.isNaN(parsedWeight)) {
      setError("权重必须是数字");
      return;
    }
    setSubmitting(true);
    setError(null);
    void (async () => {
      try {
        await client.suggestCalibrationRule({
          params: { learningId },
          query: undefined,
          body: {
            // 留空 ⇒ 不传字段,服务端按 learningType 给默认维度。
            ...(dimensionLabel.trim() !== ""
              ? { dimensionLabel: dimensionLabel.trim() }
              : {}),
            ...(parsedWeight !== undefined ? { weight: parsedWeight } : {}),
          },
        });
        onDone();
        router.refresh();
      } catch {
        // 无 Rubric 等 → ConflictError:诚实内联提示,不静默。
        setError("回流失败：需要先在校准中心建立评分标准（Rubric）。");
      } finally {
        setSubmitting(false);
      }
    })();
  }, [dimensionLabel, learningId, onDone, router, submitting, weight]);

  return (
    <div
      data-slot="learning-reflow-form"
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-2.5"
    >
      <input
        data-slot="learning-reflow-label"
        type="text"
        value={dimensionLabel}
        onChange={(e) => setDimensionLabel(e.target.value)}
        placeholder="维度名（留空按经验类型默认）"
        className="rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
      />
      <input
        data-slot="learning-reflow-weight"
        type="number"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder="权重（留空按默认）"
        step="0.05"
        className="rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
      />
      {error !== null ? (
        <p data-slot="learning-reflow-error" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end">
        <button
          type="button"
          data-slot="learning-reflow-submit"
          disabled={submitting}
          onClick={submit}
          className="rounded-control bg-brand px-2.5 py-1 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
        >
          提交回流
        </button>
      </div>
    </div>
  );
}

// [T-049 B17 沿革] 应用到项目:必须显式选目标项目再应用(禁止默认灌第一个项目)。
function ApplyControl({
  learningId,
  targets,
  pending,
  onApply,
}: {
  learningId: string;
  targets: ReadonlyArray<ApplyTarget>;
  pending: boolean;
  onApply: (mutate: () => Promise<unknown>) => void;
}) {
  const [projectId, setProjectId] = React.useState("");
  return (
    <span className="inline-flex items-center gap-1">
      <select
        data-slot="learning-apply-target"
        value={projectId}
        disabled={pending}
        onChange={(e) => setProjectId(e.target.value)}
        className="max-w-32 rounded-control border border-border bg-surface px-1.5 py-1 text-xs text-foreground disabled:opacity-50"
      >
        <option value="">选项目…</option>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        data-slot="learning-apply"
        disabled={pending || projectId === ""}
        onClick={() =>
          onApply(() =>
            client.createLearningApplication({
              params: { learningId },
              query: undefined,
              body: { projectId, applicationNote: "" },
            }),
          )
        }
        className="rounded-control border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
      >
        应用
      </button>
    </span>
  );
}
