"use client";

/**
 * `PositioningFitBadge` — the 「定位契合度」 Badge (SPEC §3.4 / plan Task 5.6-5.7),
 * a shared client island injected into New-Project / Research / Planning / Review
 * surfaces. On load it calls `client.evaluateGate({ body: { subjectType:"project",
 * subjectId } })` and renders the returned `positioningFit` 0–100, with `reasons[]`
 * in the title tooltip.
 *
 * Advisory, NOT blocking (SPEC §3.3): a low fit renders a muted/灰 tone but never
 * disables or blocks the surface. Determinism (C-5): the score is produced by the
 * deterministic backend scorer — the FE render has no Date.now / Math.random; the
 * only `fetch`-equivalent is the contract op call (the data source), kept out of
 * selectors/fixtures.
 *
 * A `viewModel?` seam lets tests inject a fixed score without the network.
 */

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import type { PositioningGateResultResource } from "@creatoros/backend/modules/positioning";

export interface PositioningFitBadgeProps {
  readonly projectId: string;
  /** Below this threshold the Badge is 标灰/降权 (advisory, never blocking). */
  readonly threshold?: number;
  /** Test seam — skip the network and render this score directly. */
  readonly viewModel?: PositioningGateResultResource;
}

export function PositioningFitBadge({
  projectId,
  threshold = 60,
  viewModel,
}: PositioningFitBadgeProps) {
  const [result, setResult] =
    React.useState<PositioningGateResultResource | null>(viewModel ?? null);

  React.useEffect(() => {
    if (viewModel) return; // injected — no read
    let active = true;
    void (async () => {
      try {
        const res = (await client.evaluateGate({
          params: undefined,
          query: undefined,
          body: { subjectType: "project", subjectId: projectId },
        })) as PositioningGateResultResource;
        if (active) setResult(res);
      } catch {
        // Advisory only — a gate read failure must not break the host surface.
        if (active) setResult(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId, viewModel]);

  if (!result) {
    return (
      <Badge
        data-testid="positioning-fit-badge"
        data-state="loading"
        variant="outline"
        className="text-[11px] text-muted-foreground"
      >
        定位契合度 —
      </Badge>
    );
  }

  const below = result.positioningFit < threshold;
  return (
    <Badge
      role="status"
      data-testid="positioning-fit-badge"
      data-fit={result.positioningFit}
      data-below-threshold={below ? "true" : "false"}
      variant="outline"
      title={result.reasons.join(" · ")}
      className={cn(
        "text-[11px] font-medium",
        below
          ? "bg-surface-subtle text-muted-foreground"
          : "bg-success-soft text-success",
      )}
    >
      定位契合度 {result.positioningFit}
    </Badge>
  );
}
