"use client";

/**
 * `ScriptVersionRestore` — a per-version 恢复 control in the 版本记录 strip (Plan:
 * 脚本编辑器做真, deliverable 4). Clicking restores the artifact to that past version
 * via the Artifacts module's append-only restore (clones the target to a NEW current
 * version), then router.refresh() re-reads so the editor + strip reflect it.
 *
 * Rendered only when an artifactId is present (real, persisted script). Determinism:
 * no Date.now/Math.random; the new version's id/clock live in the service layer.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";

export function ScriptVersionRestore({
  artifactId,
  versionId,
}: {
  artifactId: string;
  versionId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const onRestore = React.useCallback(() => {
    startTransition(async () => {
      try {
        await client.restoreArtifact({
          params: { artifactId },
          query: undefined,
          body: { versionId },
        });
        router.refresh();
      } catch {
        // Best-effort; the strip stays as-is on failure.
      }
    });
  }, [artifactId, versionId, router]);

  return (
    <button
      type="button"
      data-slot="version-history-restore"
      data-version-id={versionId}
      disabled={pending}
      onClick={onRestore}
      className="inline-flex h-6 w-fit items-center rounded-md border border-border bg-surface px-2 text-[11px] font-medium text-brand hover:bg-surface-subtle disabled:opacity-50"
    >
      恢复
    </button>
  );
}
