"use client";

/**
 * `ContentCalendarView` — the 内容日历 / 发布节奏 render (七步⑦ · §7.2). A client component
 * so it can host the mutating islands (add slot / entry row / cadence editor) and the
 * read-only attainment badge. Entries render by their REAL `status` enum
 * (planned/published/missed) — no client-invented state (C-2).
 *
 * Determinism (C-5): everything renders from the server-fed viewModel props; no
 * Date.now / Math.random / fetch in render or selectors.
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import type { ContentCalendarViewModel } from "./content-calendar-page";
import {
  AddSlotForm,
  EntryRow,
  CadenceEditor,
  AttainmentBadge,
} from "./content-calendar-interactive-region";

export function ContentCalendarView({
  viewModel,
}: {
  readonly viewModel: ContentCalendarViewModel;
}) {
  const { accountId, entries, cadence, attainment } = viewModel;

  if (!accountId) {
    return (
      <div
        data-slot="content-calendar"
        data-testid="content-calendar"
        className="flex flex-col gap-section-gap"
      >
        <SectionCard title="内容日历">
          <p
            data-testid="calendar-empty-state"
            className="py-2 text-sm text-muted-foreground"
          >
            还没有账号。先到「账号管理」新增一个矩阵号，再规划发布节奏。
          </p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div
      data-slot="content-calendar"
      data-testid="content-calendar"
      data-account-id={accountId}
      className="flex flex-col gap-section-gap"
    >
      <SectionCard title="发布节奏">
        <div className="flex flex-col gap-3 py-2">
          <CadenceEditor accountId={accountId} cadence={cadence} />
          {attainment ? <AttainmentBadge attainment={attainment} /> : null}
        </div>
      </SectionCard>

      <SectionCard title="新增计划">
        <div className="py-2">
          <AddSlotForm accountId={accountId} />
        </div>
      </SectionCard>

      <SectionCard title="内容日历">
        <ul
          data-testid="calendar-entry-list"
          className="flex flex-col gap-2 py-2"
        >
          {entries.length === 0 ? (
            <li
              data-testid="calendar-entry-empty"
              className="text-sm text-muted-foreground"
            >
              这个窗口还没有排期。新增一个计划，安排这周该发什么。
            </li>
          ) : (
            entries.map((e) => <EntryRow key={e.id} entry={e} />)
          )}
        </ul>
      </SectionCard>
    </div>
  );
}
