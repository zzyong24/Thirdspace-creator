"use client";

/**
 * ProjectRowMenu — the per-row「⋯」kebab actions on the Projects list
 * (GAP-PRJ-1).
 *
 * A small Client island that turns the previously-decorative kebab button
 * into real affordances. Mutations flow the canonical island path:
 *
 *   island -> client.* -> store mutation -> router.refresh()
 *
 *  - 打开 navigates to the project's current workspace (same target as the
 *    row's inline 打开 link), via `next/link`.
 *  - 归档 archives the project (`client.archiveProject`, op id
 *    `projects.archive`) under a `useTransition` pending guard, then
 *    `router.refresh()` so the archived row drops off the list and the
 *    「已归档」tab count moves with the real data.
 *
 * Sibling reference: `features/project-overview/project-actions.tsx` uses the
 * same `client.archiveProject({ params: { projectId }, ... })` shape.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, FolderOpen } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { client } from "@/lib/contract-client";

export interface ProjectRowMenuProps {
  readonly projectId: string;
  readonly projectTitle: string;
  /** Workspace href for the 打开 action (same target as the inline link). */
  readonly openHref: string;
}

export function ProjectRowMenu({
  projectId,
  projectTitle,
  openHref,
}: ProjectRowMenuProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const onArchive = React.useCallback(() => {
    if (pending) return;
    startTransition(async () => {
      await client.archiveProject({
        params: { projectId },
        query: undefined,
        body: undefined,
      });
      // Revalidate the server tree so the archived row leaves the list and
      // the 已归档 tab count reflects the real distribution.
      router.refresh();
    });
  }, [pending, projectId, router]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-slot="project-row-action"
          aria-label={`${projectTitle} 的更多操作`}
          disabled={pending}
          className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span aria-hidden="true">⋯</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9rem]">
        <DropdownMenuItem asChild>
          <Link href={openHref} data-slot="project-row-open">
            <FolderOpen aria-hidden="true" className="size-4" />
            打开
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-slot="project-row-archive"
          variant="destructive"
          disabled={pending}
          onSelect={(event) => {
            // Keep the menu's selection from closing before the transition
            // starts; we drive the refresh ourselves.
            event.preventDefault();
            onArchive();
          }}
        >
          <Archive aria-hidden="true" className="size-4" />
          {pending ? "归档中…" : "归档"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ProjectRowMenu;
