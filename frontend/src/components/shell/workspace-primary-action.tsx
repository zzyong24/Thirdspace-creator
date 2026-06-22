"use client";

/**
 * WorkspacePrimaryAction — the project-workspace header's primary affordance
 * (Plan A6).
 *
 * Previously the workspace header's "进入下一步:<next stage>" button was a plain
 * `<Link>` that only changed the URL without persisting the stage transition,
 * so a project's recorded `currentStage` desynced from the route the user was
 * looking at. This island unifies that behavior with the Project Overview page:
 * the advancing action now PERSISTS the transition through the same contract op
 * (`projects.stage.transition` / `client.transitionProjectStage`, advancing
 * `current → next`) and only then navigates to the next stage route and asks the
 * App Router to revalidate the server tree.
 *
 *   island -> client.transitionProjectStage -> store mutation
 *          -> router.push(next route) -> router.refresh()
 *
 * Non-advancing / terminal-stage actions (e.g. "完成制作", "查看数据",
 * "导出报告") have no forward stage and stay navigation-free buttons, matching
 * the prior visual behavior. We never invent a transition past the last stage.
 */

import * as React from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { client } from "@/lib/contract-client";
import type { ProjectStageName } from "@/types/domain";

// The project pipeline order. The next stage is the adjacent forward step;
// `review` is terminal. Mirrors STAGE_ORDER in ProjectOverviewActions and the
// transition handler.
const STAGE_ORDER: ReadonlyArray<ProjectStageName> = [
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
];

function nextStageOf(stage: string): ProjectStageName | null {
  const idx = STAGE_ORDER.indexOf(stage as ProjectStageName);
  if (idx === -1 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1] ?? null;
}

export interface WorkspacePrimaryActionProps {
  readonly label: string;
  /**
   * The route-level project id (the `/projects/<routeProjectId>/<stage>` path
   * segment), used both for the transition op param and the navigation target.
   */
  readonly routeProjectId: string;
  readonly currentStage: string;
  /**
   * Whether this label represents a forward "进入下一步" advance. When false the
   * action is terminal/non-advancing and behaves as a plain button (no
   * transition, no navigation), preserving prior behavior.
   */
  readonly advances: boolean;
}

export function WorkspacePrimaryAction({
  label,
  routeProjectId,
  currentStage,
  advances,
}: WorkspacePrimaryActionProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const nextStage = advances ? nextStageOf(currentStage) : null;
  const canAdvance = advances && nextStage !== null && routeProjectId !== "";

  const onAdvance = React.useCallback(() => {
    if (pending || !canAdvance || !nextStage) return;
    setPending(true);
    void (async () => {
      try {
        // Persist the transition (current → next) through the SAME op the
        // overview page uses — but it is BEST-EFFORT navigation: advancing is
        // only legal from a pending/in_progress stage. On a COMPLETED project
        // (every stage already done) the machine rejects re-advancing a
        // completed stage, and that's fine — the user is just browsing forward,
        // so we navigate regardless of whether the transition mutated anything.
        try {
          await client.transitionProjectStage({
            params: { projectId: routeProjectId, stage: nextStage },
            query: undefined,
            body: {},
          });
        } catch {
          // Already-completed / terminal stage → no mutation, navigate anyway.
        }
        router.push(`/projects/${routeProjectId}/${nextStage}`);
        router.refresh();
      } finally {
        setPending(false);
      }
    })();
  }, [canAdvance, nextStage, pending, routeProjectId, router]);

  if (!canAdvance) {
    // Terminal / non-advancing stage: keep the plain button behavior.
    return (
      <Button type="button" size="lg" disabled={pending}>
        {label} →
      </Button>
    );
  }

  return (
    <Button type="button" size="lg" disabled={pending} onClick={onAdvance}>
      {label} →
    </Button>
  );
}

export default WorkspacePrimaryAction;
