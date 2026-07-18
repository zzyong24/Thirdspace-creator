"use client";

/**
 * 经验裁决交互组件(T-062a → T-118a/c)。
 *
 * [T-118c] 经验独立模块退役后,本文件**只保留复盘页 + 知识库复用的部分**:
 *
 *   - `AdjudicationQueue` —— candidate 裁决队列(采纳 / 不采 → `learnings.evaluate`;
 *       inline 编辑 title+insight → `learnings.patch` → router.refresh())。
 *       **T-118a 已迁进复盘页**(`/projects/<id>/review`)的「本期经验」区。
 *   - `ExperienceCaptureLink` —— 「记一条经验」Copilot 深链入口(只预填不发送)。
 *       **T-118b 并入知识库页头**(经验 Tab / 经验页退役后的唯一记经验入口)。
 *
 * 已删(T-118c 退役清算):`ValidatedLibrary`(已验证库 UI)—— 已验证经验改由
 * 知识库读层投影为**只读经验行**(见 `knowledge-data.ts` fetchValidatedLearnings),
 * 不再在此裁决/回流(裁决是复盘的活,知识库只读展示)。
 *
 * 确定性:岛内无 Date.now / Math.random / fetch,唯一异步是 typed client 过
 * dispatch 路由;每个 mutation 后 router.refresh() 让服务端读侧回流。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";
import { client } from "@/lib/contract-client";
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
  edit_delta: "改稿偏好",
};

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
          还没有待确认的经验。做过复盘后,AI 会把发现整理到这里等你确认。
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
