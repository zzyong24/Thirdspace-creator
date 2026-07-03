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
  // [T-085] 状态感知:已归档行(「已归档」tab)不再放出必 409 的归档动作,
  // 换禁用态「已归档」。缺省按 active 渲染(兼容旧挂载点)。
  readonly projectStatus?: string;
}

export function ProjectRowMenu({
  projectId,
  projectTitle,
  openHref,
  projectStatus = "active",
}: ProjectRowMenuProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  // [T-085] 归档失败(如并发下已归档 → 409)不再是 unhandled rejection,
  // 内联展示在菜单里(禁浏览器 alert)。
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const archived = projectStatus === "archived";

  const onArchive = React.useCallback(() => {
    if (pending) return;
    setArchiveError(null);
    startTransition(async () => {
      try {
        await client.archiveProject({
          params: { projectId },
          query: undefined,
          body: undefined,
        });
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        setArchiveError(
          raw.includes("409") || /archived/i.test(raw)
            ? "该项目已归档，无需重复归档。"
            : "归档失败，请稍后重试。",
        );
      }
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
        {archived ? (
          // [T-085] 已归档行 → 禁用态,不再放出必 409 的归档动作(契约无 unarchive op)。
          <DropdownMenuItem data-slot="project-row-archive" disabled>
            <Archive aria-hidden="true" className="size-4" />
            已归档
          </DropdownMenuItem>
        ) : (
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
        )}
        {archiveError ? (
          <p
            data-slot="project-row-archive-error"
            role="alert"
            className="max-w-[14rem] px-2 py-1.5 text-[11px] leading-snug text-destructive"
          >
            {archiveError}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ProjectRowMenu;
