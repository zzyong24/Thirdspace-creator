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
  const defaultProjectId = applyTargets[0]?.id ?? null;

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

  const visibleRecords =
    activeTab === "all"
      ? records
      : records.filter((record) => recordTabId(record) === activeTab);

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
                      {defaultProjectId !== null ? (
                        <button
                          type="button"
                          data-slot="record-apply"
                          disabled={pending}
                          onClick={() => applyLearning(learningId, defaultProjectId)}
                          className="rounded-control border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
                        >
                          应用经验
                        </button>
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

export interface QuickRecordActionsIslandProps {
  readonly actions: ReadonlyArray<QuickAction>;
}

export function QuickRecordActionsIsland({
  actions,
}: QuickRecordActionsIslandProps) {
  const { pending, run } = useLearningMutations();

  const createLearning = React.useCallback(
    (title: string) => {
      run(() =>
        client.createLearning({
          params: undefined,
          query: undefined,
          body: { title, insight: "" },
        }),
      );
    },
    [run],
  );

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
            onClick={() => createLearning(action.label)}
            className="flex items-center justify-between gap-3 rounded-card bg-surface-subtle px-3.5 py-2.5 text-left text-sm hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">{action.label}</span>
              <span className="text-xs text-muted-foreground">{action.hint}</span>
            </span>
            <span aria-hidden="true" className="text-muted-foreground">
              +
            </span>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}
