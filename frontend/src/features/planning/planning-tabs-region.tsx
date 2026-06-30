"use client";

/**
 * `PlanningTabsRegion` — the client-side tabbed region for the Planning
 * workspace (T-018, SPEC §3.3).
 *
 * WHY THIS EXISTS (the bug it fixes): the previous Planning page rendered a
 * `PageTabs` strip (a bare Radix `TabsList`/`TabsTrigger` with NO
 * `TabsContent`) and then laid every section out FLAT underneath it, outside
 * any tab panel. Clicking a tab moved the active underline but the content
 * never changed — the tabs were a decorative strip. Worse, two of the five
 * locked tabs (受众洞察 / 差异化亮点) had no rendered region at all, so they
 * were pure empty shells.
 *
 * THE FIX + 瘦身 (SPEC §3.3 「保留内容合同+论点树;证据地图/受众洞察/差异化
 * 亮点无真数据源 → 降级或并入,别留纯空壳 Tab」):
 *  - Tabs are now REAL Radix tab panels (`TabsContent`) so the content area
 *    actually switches when a tab is clicked, and the active panel is the
 *    only one shown.
 *  - Slimmed from five shells to TWO tabs that each have a real data producer
 *    + feed the script (SEAM-01/02): 内容合同 and 论点树.
 *      · 内容合同 = 受众/价值/节奏/CTA (the script's audience+value+pacing+CTA
 *        contract). 受众洞察 / 差异化亮点 are absorbed here — 受众定位 IS the
 *        受众洞察 slot, 价值主张 IS the 差异化 slot — instead of standing as
 *        empty shells.
 *      · 论点树 = 核心论点 + 论点树 (核心/支撑/证据/反驳), the script's
 *        argument skeleton. 证据地图 (no real producer; empty for real
 *        projects) is absorbed into this panel's side rail as the evidence
 *        backing the argument, alongside 关键素材.
 *
 * The write-side islands (planning.contract / planning.thesis / planning.outline
 * AI nodes) are passed in as `children` slots so they keep producing the
 * artifacts that feed the script — the slimming only re-homes the DISPLAY, it
 * does not drop any artifact producer.
 *
 * This component owns ONLY the active-tab visual + a11y state. It is `value`-less
 * (uncontrolled via `defaultValue`) so it needs no router wiring; the panels are
 * server-rendered nodes handed down as props.
 */

import * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface PlanningTabDescriptor {
  readonly id: string;
  readonly label: string;
}

export interface PlanningTabsRegionProps {
  /** The (slimmed) tab descriptors, in spec order. */
  readonly tabs: ReadonlyArray<PlanningTabDescriptor>;
  /** Panel body for the 内容合同 tab (id `content-contract`). */
  readonly contractPanel: React.ReactNode;
  /** Panel body for the 论点树 tab (id `thesis-tree`). */
  readonly thesisPanel: React.ReactNode;
}

export function PlanningTabsRegion({
  tabs,
  contractPanel,
  thesisPanel,
}: PlanningTabsRegionProps) {
  const panelById: Record<string, React.ReactNode> = {
    "content-contract": contractPanel,
    "thesis-tree": thesisPanel,
  };
  const defaultValue = tabs[0]?.id;
  return (
    <Tabs
      defaultValue={defaultValue}
      className="w-full gap-section-gap"
      data-slot="planning-tabs-region"
    >
      <div data-slot="planning-tabs">
        <div data-slot="page-tabs">
          <TabsList variant="line" aria-label="策划阶段子页签">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} data-tab-id={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>
      {tabs.map((tab) => (
        // `forceMount` keeps both panels in the DOM (the inactive one carries
        // Radix's `hidden` attribute + data-state="inactive") so the write-side
        // islands never unmount/lose state when the creator switches tabs, and
        // so layout assertions can locate sections by selector. Only the active
        // panel is visible / in the a11y tree.
        <TabsContent
          key={tab.id}
          value={tab.id}
          data-tab-panel-id={tab.id}
          forceMount
          className={cn(
            "mt-0 outline-none data-[state=inactive]:hidden",
          )}
        >
          {panelById[tab.id] ?? null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
