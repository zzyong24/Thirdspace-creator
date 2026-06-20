"use client";

/**
 * ProjectOverviewActions — the project header's mutating affordances (Task 8).
 *
 * A small Client island that turns the previously-static header controls into
 * real mutations against the mock backend. Mutations flow:
 *
 *   island -> client.* -> store mutation -> router.refresh()
 *
 * per the island-mode / URL-state-only architecture. The island owns no global
 * store: it reads its inputs from props (server-resolved) and, after a write,
 * asks the App Router to revalidate the server tree so the refreshed DTO flows
 * back through the page selectors.
 *
 *  - 进入下一步 advances `currentStage` by one adjacent step
 *    (`client.transitionProjectStage`); hidden at the terminal `review` stage.
 *  - 收藏 toggles the `starred` flag (`client.patchProject`).
 *  - 归档 archives the project (`client.archiveProject`).
 */

import * as React from "react";
import { Archive, Star, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { client } from "@/lib/contract-client";
import type { ProjectStageName } from "@/types/domain";

// The project pipeline order. The next stage is the adjacent forward step;
// `review` is terminal. Mirrors STAGE_ORDER in the transition handler.
const STAGE_ORDER: ReadonlyArray<ProjectStageName> = [
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
];

function nextStageOf(stage: ProjectStageName): ProjectStageName | null {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx === -1 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1] ?? null;
}

export interface ProjectOverviewActionsProps {
  readonly projectId: string;
  readonly currentStage: ProjectStageName;
  readonly starred: boolean;
}

export function ProjectOverviewActions({
  projectId,
  currentStage,
  starred,
}: ProjectOverviewActionsProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const nextStage = nextStageOf(currentStage);

  const run = React.useCallback(
    async (mutate: () => Promise<unknown>) => {
      if (pending) return;
      setPending(true);
      try {
        await mutate();
        router.refresh();
      } finally {
        setPending(false);
      }
    },
    [pending, router],
  );

  const onFavorite = React.useCallback(() => {
    void run(() =>
      client.patchProject({
        params: { projectId },
        query: undefined,
        body: { starred: !starred },
      }),
    );
  }, [projectId, run, starred]);

  const onArchive = React.useCallback(() => {
    void run(() =>
      client.archiveProject({
        params: { projectId },
        query: undefined,
        body: undefined,
      }),
    );
  }, [projectId, run]);

  const onNextStage = React.useCallback(() => {
    if (!nextStage) return;
    void run(() =>
      client.transitionProjectStage({
        params: { projectId, stage: nextStage },
        query: undefined,
        body: {},
      }),
    );
  }, [nextStage, projectId, run]);

  return (
    <div
      data-slot="project-overview-actions"
      className="flex flex-wrap items-center gap-2"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="收藏"
        aria-pressed={starred}
        disabled={pending}
        onClick={onFavorite}
      >
        <Star
          aria-hidden="true"
          className="size-4"
          fill={starred ? "currentColor" : "none"}
        />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="归档"
        disabled={pending}
        onClick={onArchive}
      >
        <Archive aria-hidden="true" className="size-4" />
      </Button>
      {nextStage ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={onNextStage}
        >
          <Wand2 aria-hidden="true" className="size-4" />
          进入下一步
        </Button>
      ) : null}
    </div>
  );
}

export default ProjectOverviewActions;
