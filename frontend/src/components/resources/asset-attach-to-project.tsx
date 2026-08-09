"use client";

/**
 * `AssetAttachToProject` — Plan D1 "附到项目" control in the asset detail panel.
 * This is the 用料链 (Bill-of-Materials) consumption from the LIBRARY side: pick
 * one of the user's projects and link the selected asset to it.
 *
 *   picker + button → onAttach(assetId, projectId)
 *     → client.createMaterialLink({ body: { projectId, entityType:"asset",
 *        entityId: assetId, role:"clip", stage:"production" } })
 *     → router.refresh()
 *
 * The picker is a local-state client control; the actual op + refresh live in the
 * Assets island (`onAttach`). On success it shows a brief affordance. When no
 * projects are available (or no handler), the control hides itself.
 */

import * as React from "react";

export interface AttachProjectOption {
  readonly id: string;
  readonly title: string;
}

export function AssetAttachToProject({
  assetId,
  projects,
  onAttach,
  pending = false,
}: {
  readonly assetId: string;
  readonly projects: ReadonlyArray<AttachProjectOption>;
  readonly onAttach?: (assetId: string, projectId: string) => void;
  readonly pending?: boolean;
}) {
  const [projectId, setProjectId] = React.useState<string>(
    projects[0]?.id ?? "",
  );
  const [attached, setAttached] = React.useState(false);

  // Reset the success affordance + default selection when the asset changes.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部选中素材切换时必须原子复位本地反馈与默认项目
    setAttached(false);
    setProjectId(projects[0]?.id ?? "");
  }, [assetId, projects]);

  if (!onAttach || projects.length === 0) return null;

  return (
    <div
      data-slot="asset-attach-to-project"
      data-asset-id={assetId}
      className="flex flex-col gap-1.5"
    >
      <label
        className="text-[11px] text-muted-foreground"
        htmlFor="asset-attach-project-select"
      >
        附到项目
      </label>
      <div className="flex items-center gap-1.5">
        <select
          id="asset-attach-project-select"
          data-slot="asset-attach-project-select"
          aria-label="选择项目"
          value={projectId}
          disabled={pending}
          onChange={(e) => {
            setProjectId(e.target.value);
            setAttached(false);
          }}
          className="h-7 min-w-0 flex-1 rounded-control border border-border bg-surface px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-slot="asset-attach-button"
          aria-label="附到项目"
          disabled={pending || projectId.length === 0}
          onClick={() => {
            if (projectId.length === 0) return;
            onAttach(assetId, projectId);
            setAttached(true);
          }}
          className="inline-flex h-7 shrink-0 items-center rounded-control bg-brand px-2.5 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
        >
          附到项目
        </button>
      </div>
      {attached ? (
        <p
          data-slot="asset-attach-success"
          role="status"
          className="text-[11px] text-success"
        >
          已加入用料链
        </p>
      ) : null}
    </div>
  );
}
