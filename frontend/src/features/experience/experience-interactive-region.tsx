"use client";

/**
 * `/experience` client islands (Module 14 Step 5).
 *
 * The Experience Center page stays a Server Component; these islands own the wired
 * affordances roadmap §4 calls for, preserving the server-rendered `data-slot`s so
 * `experience-page.test.tsx` selectors hold:
 *
 *   - `ExperienceInteractiveRegion` (main column) — the 7 category tabs (client-side
 *     filter ONLY, no network on switch) + the records table with per-record 应用经验
 *     / 验证 / 废弃 controls;
 *   - `QuickRecordActionsIsland` (right rail) — the 快速记录 quick-record buttons.
 *
 * Wiring:
 *   - 快速记录       → client.createLearning({ title, insight:"" });
 *   - 应用经验        → client.createLearningApplication({ params:{learningId}, body });
 *   - 验证 / 废弃     → client.evaluateLearning({ body:{ validationStatus } }).
 *
 * Every mutation flows island → client.* → router.refresh(). Determinism: the real
 * id/clock/status live in the server/service layer (injected RepoDeps); the islands
 * carry NO Date.now / Math.random / fetch — the only async is the typed client over
 * the dispatch route.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import { client } from "@/lib/contract-client";
import type {
  ApplyTarget,
  ExperienceRecord,
  ExperienceTabDescriptor,
  QuickAction,
} from "./experience-page";

// Map a record onto a tab id: prefer the explicit `tabId` from the DTO; else derive
// from the display `category` label via the fixed lookup (plan open-question #1).
const CATEGORY_TO_TAB: Record<string, string> = {
  选题策划: "topic",
  脚本结构: "script",
  拍摄执行: "shoot",
  后期剪辑: "edit",
  互动运营: "engage",
  复盘沉淀: "review",
};

function recordTabId(record: ExperienceRecord): string {
  return record.tabId ?? CATEGORY_TO_TAB[record.category] ?? "all";
}

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

// ---------------------------------------------------------------------------
// Main column: tabs (client-side filter) + records table (apply / evaluate)
// ---------------------------------------------------------------------------

export interface ExperienceInteractiveRegionProps {
  readonly tabs: ReadonlyArray<ExperienceTabDescriptor>;
  readonly records: ReadonlyArray<ExperienceRecord>;
  /** Owned projects the apply control targets (from projects.list). Empty ⇒ hidden. */
  readonly applyTargets: ReadonlyArray<ApplyTarget>;
}

export function ExperienceInteractiveRegion({
  tabs,
  records,
  applyTargets,
}: ExperienceInteractiveRegionProps) {
  const { pending, run } = useLearningMutations();
  const [activeTab, setActiveTab] = React.useState("all");

  const applyLearning = React.useCallback(
    (learningId: string, projectId: string) => {
      run(() =>
        client.createLearningApplication({
          params: { learningId },
          query: undefined,
          body: { projectId, applicationNote: "" },
        }),
      );
    },
    [run],
  );

  const evaluateLearning = React.useCallback(
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

  // 复盘飞轮回流 轨B (Learning→校准): promote this 复盘结论 into a CalibrationRuleSuggestion the
  // 校准中心 can 采纳 (→ a rubric维度 bump). The reflow lands on the 校准 page, so we surface a
  // per-row「已回流」/「回流失败」hint here rather than navigating away. A learning with no
  // rubric (or no calibration seam) gets an honest ConflictError → the hint shows the reason.
  const [reflowState, setReflowState] = React.useState<
    Record<string, "ok" | "err">
  >({});
  const router = useRouter();
  const suggestCalibrationRule = React.useCallback(
    (learningId: string) => {
      void (async () => {
        try {
          await client.suggestCalibrationRule({
            params: { learningId },
            query: undefined,
            body: {},
          });
          setReflowState((prev) => ({ ...prev, [learningId]: "ok" }));
          router.refresh();
        } catch {
          setReflowState((prev) => ({ ...prev, [learningId]: "err" }));
        }
      })();
    },
    [router],
  );

  const visibleRecords =
    activeTab === "all"
      ? records
      : records.filter((record) => recordTabId(record) === activeTab);

  // Honest empty-state copy keyed off the active tab's label (七步 stage name).
  // The 后期剪辑 (`edit`) tab buckets learnings tagged with the `editing` learningType
  // (GAP-EXP-edit) — when none exist the empty row says so instead of a silent blank table.
  const activeLabel =
    tabs.find((tab) => tab.id === activeTab)?.label ?? "该分类";
  const emptyCopy =
    activeTab === "all"
      ? "暂无经验记录"
      : `暂无「${activeLabel}」阶段经验`;

  return (
    <div data-slot="experience-interactive-region" className="flex flex-col gap-4">
      <div
        data-slot="experience-interactive-tabs"
        role="tablist"
        aria-label="经验分类筛选"
        className="flex flex-wrap gap-1.5 border-b border-border pb-2"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-slot="experience-tab"
            data-tab-id={tab.id}
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-control px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-brand text-brand-foreground"
                : "bg-surface-subtle text-muted-foreground hover:bg-surface"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <SectionCard title="最近经验记录" description="按更新时间倒序">
        <table
          data-slot="recent-records-table"
          aria-label="最近经验记录"
          className="w-full text-sm"
        >
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="pb-2 pt-1 text-left font-medium">标题</th>
              <th className="pb-2 pt-1 text-left font-medium">分类</th>
              <th className="pb-2 pt-1 text-right font-medium">更新</th>
              <th className="pb-2 pt-1 text-right font-medium">复用次数</th>
              <th className="pb-2 pt-1 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRecords.length === 0 ? (
              <tr data-slot="recent-records-empty">
                <td
                  colSpan={5}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  {emptyCopy}
                </td>
              </tr>
            ) : null}
            {visibleRecords.map((row) => {
              const learningId = row.learningId ?? row.id;
              const isCandidate =
                row.validationStatus === undefined ||
                row.validationStatus === "candidate";
              return (
                <tr
                  key={row.id}
                  data-slot="recent-record-row"
                  data-record-id={row.id}
                  data-tab-id={recordTabId(row)}
                  className="border-b border-border/60 last:border-b-0"
                >
                  <td className="py-2 text-foreground">{row.title}</td>
                  <td className="py-2">
                    <TagChip label={row.category} tone="neutral" size="sm" />
                  </td>
                  <td className="py-2 text-right font-mono text-xs text-muted-foreground">
                    {row.updatedAt}
                  </td>
                  <td className="py-2 text-right font-mono text-xs text-foreground tabular-nums">
                    {row.reuseCount}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      {applyTargets.length > 0 ? (
                        <ApplyControl
                          learningId={learningId}
                          targets={applyTargets}
                          pending={pending}
                          onApply={applyLearning}
                        />
                      ) : null}
                      {isCandidate ? (
                        <>
                          <button
                            type="button"
                            data-slot="record-validate"
                            disabled={pending}
                            onClick={() => evaluateLearning(learningId, "validated")}
                            className="rounded-control bg-brand px-2 py-1 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                          >
                            验证
                          </button>
                          <button
                            type="button"
                            data-slot="record-discard"
                            disabled={pending}
                            onClick={() => evaluateLearning(learningId, "discarded")}
                            className="rounded-control border border-border bg-surface px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-surface-subtle disabled:opacity-50"
                          >
                            废弃
                          </button>
                        </>
                      ) : null}
                      {/* 复盘飞轮回流 轨B：把这条复盘结论显式回流成校准评分维度建议。 */}
                      {reflowState[learningId] === "ok" ? (
                        <span
                          data-slot="record-reflow-ok"
                          className="rounded-control bg-success/10 px-2 py-1 text-xs font-medium text-success"
                        >
                          已回流到校准
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-slot="record-reflow-calibration"
                          disabled={pending}
                          onClick={() => suggestCalibrationRule(learningId)}
                          title="把这条复盘结论变成约束未来评分的维度建议，到校准中心采纳"
                          className="rounded-control border border-brand/40 bg-brand/5 px-2 py-1 text-xs font-medium text-brand hover:bg-brand/10 disabled:opacity-50"
                        >
                          回流到校准
                        </button>
                      )}
                      {reflowState[learningId] === "err" ? (
                        <span
                          data-slot="record-reflow-err"
                          className="text-xs text-muted-foreground"
                          title="回流需要一个评分标准（Rubric）。先到校准中心确认有 Rubric。"
                        >
                          需先有 Rubric
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right rail: 快速记录 quick-record buttons → learnings.create
// ---------------------------------------------------------------------------

// [T-049 B17] 行内「应用经验」的项目选择器 —— 旧实现恒应用到 applyTargets[0]
// (实测=演示项目),复用计数持续灌进假实体。现在由用户显式选目标项目再应用。
function ApplyControl({
  learningId,
  targets,
  pending,
  onApply,
}: {
  learningId: string;
  targets: ReadonlyArray<ApplyTarget>;
  pending: boolean;
  onApply: (learningId: string, projectId: string) => void;
}) {
  const [projectId, setProjectId] = React.useState<string>("");
  return (
    <span className="inline-flex items-center gap-1">
      <select
        data-slot="record-apply-target"
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
        data-slot="record-apply"
        disabled={pending || projectId === ""}
        onClick={() => onApply(learningId, projectId)}
        className="rounded-control border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
      >
        应用
      </button>
    </span>
  );
}

const LEARNING_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "strategy", label: "选题策划" },
  { value: "hook", label: "开头钩子" },
  { value: "structure", label: "结构节奏" },
  { value: "failure", label: "失败案例" },
  { value: "process", label: "流程方法" },
  { value: "editing", label: "后期剪辑" },
  { value: "conversion_pattern", label: "转化模式" },
  { value: "offer_insight", label: "产品洞察" },
];

export interface QuickRecordActionsIslandProps {
  readonly actions: ReadonlyArray<QuickAction>;
  /** [T-049 B17] 「从项目导入」的项目候选(与主列应用经验同源)。 */
  readonly applyTargets?: ReadonlyArray<ApplyTarget>;
}

// [T-049 B17] 快速记录改富录入:旧实现一键把按钮文案当标题落库(insight 空、类型
// 恒 strategy),真库已被 6 条空记录污染。现在点按钮 = 展开表单(标题/洞察必填、
// 类型可选;「从项目导入」必选来源项目,创建后自动建应用关联),空字段禁提交。
export function QuickRecordActionsIsland({
  actions,
  applyTargets = [],
}: QuickRecordActionsIslandProps) {
  const { pending, run } = useLearningMutations();
  const [activeAction, setActiveAction] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("");
  const [insight, setInsight] = React.useState("");
  const [learningType, setLearningType] = React.useState("strategy");
  const [sourceProjectId, setSourceProjectId] = React.useState("");

  const openForm = React.useCallback((actionId: string) => {
    setActiveAction(actionId);
    setTitle("");
    setInsight("");
    setLearningType(actionId === "qa-failure" ? "failure" : "strategy");
    setSourceProjectId("");
  }, []);

  const isImport = activeAction === "qa-import";
  const canSubmit =
    title.trim() !== "" &&
    insight.trim() !== "" &&
    (!isImport || sourceProjectId !== "") &&
    !pending;

  const submit = React.useCallback(() => {
    if (!canSubmit) return;
    const trimmedTitle = title.trim();
    const trimmedInsight = insight.trim();
    const projectId = isImport ? sourceProjectId : "";
    run(async () => {
      const created = (await client.createLearning({
        params: undefined,
        query: undefined,
        body: {
          title: trimmedTitle,
          insight: trimmedInsight,
          learningType: learningType as
            | "strategy"
            | "hook"
            | "structure"
            | "failure"
            | "process"
            | "editing"
            | "conversion_pattern"
            | "offer_insight",
        },
      })) as { id: string };
      // 从项目导入 = 创建后立刻建立与来源项目的应用关联(经验↔项目可追溯)。
      if (projectId && created?.id) {
        await client.createLearningApplication({
          params: { learningId: created.id },
          query: undefined,
          body: { projectId, applicationNote: "从项目导入" },
        });
      }
    });
    setActiveAction(null);
  }, [canSubmit, insight, isImport, learningType, run, sourceProjectId, title]);

  return (
    <SectionCard title="快速记录" description="把这次的复盘沉淀下来">
      <div
        data-slot="quick-record-actions"
        aria-label="快速记录操作"
        className="flex flex-col gap-2"
      >
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            data-slot="quick-record-action"
            data-action-id={action.id}
            disabled={pending}
            aria-expanded={activeAction === action.id}
            onClick={() =>
              activeAction === action.id
                ? setActiveAction(null)
                : openForm(action.id)
            }
            className="flex items-center justify-between gap-3 rounded-card bg-surface-subtle px-3.5 py-2.5 text-left text-sm hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">{action.label}</span>
              <span className="text-xs text-muted-foreground">{action.hint}</span>
            </span>
            <span aria-hidden="true" className="text-muted-foreground">
              {activeAction === action.id ? "−" : "+"}
            </span>
          </button>
        ))}

        {activeAction !== null ? (
          <div
            data-slot="quick-record-form"
            className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3"
          >
            {isImport ? (
              <select
                data-slot="quick-record-project"
                value={sourceProjectId}
                onChange={(e) => setSourceProjectId(e.target.value)}
                className="rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
              >
                <option value="">选择来源项目…</option>
                {applyTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              data-slot="quick-record-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="经验标题（必填）"
              className="rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <textarea
              data-slot="quick-record-insight"
              value={insight}
              onChange={(e) => setInsight(e.target.value)}
              placeholder="这次学到了什么？（必填）"
              rows={3}
              className="rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <select
              data-slot="quick-record-type"
              value={learningType}
              onChange={(e) => setLearningType(e.target.value)}
              className="rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
            >
              {LEARNING_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                data-slot="quick-record-cancel"
                onClick={() => setActiveAction(null)}
                className="rounded-control px-2.5 py-1 text-xs text-muted-foreground hover:bg-surface-subtle"
              >
                取消
              </button>
              <button
                type="button"
                data-slot="quick-record-submit"
                disabled={!canSubmit}
                onClick={submit}
                className="rounded-control bg-brand px-2.5 py-1 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
              >
                保存经验
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
