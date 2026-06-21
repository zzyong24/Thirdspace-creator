/**
 * `ConversionColumn` (七步⑦ · SPEC §4.7「转化/线索提升为一等指标列」) — the read-only
 * 转化/线索 column rendered ALONGSIDE播放量 on the Publishing Center
 * `PublicationPerformanceRow` and the Dashboard `SummaryMetrics`.
 *
 * The source of truth is Analytics: these counts come from the §4.6 conversion
 * `MetricValue`s (lead / inquiry / conversion), which Monetization fed via the Step-3
 * fan-out. This component reads them from its `view model` prop and issues NO
 * Monetization (or any) network call — it is purely presentational (SPEC §4.7: 5b is
 * read-only; no new mutation op here).
 *
 * Gating (OQ3 / plan 5b): until Analytics ships the §4.6 conversion `metric_key`
 * write, the counts arrive as 0 and the column renders the decorative "—" placeholder
 * (`decorative` true) so the surface is wired but honest about the absent data. The
 * moment Analytics seeds the keys, the same prop carries real counts — no FE change.
 *
 * Determinism (C-5): every value comes from props; no Date.now / Math.random / fetch.
 */
import * as React from "react";

import { Badge } from "@/components/ui/badge";

export interface ConversionColumnData {
  readonly leadCount: number;
  readonly inquiryCount: number;
  readonly conversionCount: number;
  /** True until the Analytics §4.6 conversion keys are seeded (OQ3) — render "—". */
  readonly decorative: boolean;
}

export function ConversionColumn({
  data,
}: {
  readonly data: ConversionColumnData;
}) {
  if (data.decorative) {
    return (
      <span
        data-testid="conversion-column"
        data-decorative="true"
        className="text-xs text-muted-foreground"
        title="转化数据待 Analytics §4.6 指标接入"
      >
        转化 —
      </span>
    );
  }
  return (
    <span
      data-testid="conversion-column"
      data-decorative="false"
      className="flex items-center gap-1.5 text-xs"
    >
      <Badge variant="secondary" className="text-[10px]">
        线索 {data.leadCount}
      </Badge>
      <Badge variant="secondary" className="text-[10px]">
        咨询 {data.inquiryCount}
      </Badge>
      <Badge variant="secondary" className="text-[10px]">
        成交 {data.conversionCount}
      </Badge>
    </span>
  );
}
