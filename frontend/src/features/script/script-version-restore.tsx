"use client";

/**
 * `ScriptVersionRestore` — a per-version 恢复 control in the 版本记录 strip (Plan:
 * 脚本编辑器做真, deliverable 4). Clicking restores the artifact to that past version
 * via the Artifacts module's immutable-version restore (moves the current pointer to
 * that existing snapshot without creating another version), then router.refresh()
 * re-reads so the editor + strip reflect it.
 *
 * Rendered only when an artifactId is present (real, persisted script). Determinism:
 * no Date.now/Math.random; restoring does not mint an id or timestamp.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import type { ScriptViewModel } from "@/types/view-models";

function readableTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间未知"
    : new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

/**
 * T-716：稿面的一等版本入口。选择旧版只做预览；用户再次确认后把 currentVersionId
 * 指向该既有不可变快照，不新增重复版本。原 ScriptVersionRestore 保留给旧版本记录条复用。
 */
export function ScriptVersionMenu({
  artifactId,
  currentVersionId,
  versions,
}: {
  artifactId: string;
  currentVersionId: string | null;
  versions: ScriptViewModel["versions"];
}) {
  const router = useRouter();
  const orderedVersions = React.useMemo(
    () =>
      versions.slice().sort((a, b) => {
        const byVersion = (b.versionNumber ?? 0) - (a.versionNumber ?? 0);
        return byVersion || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
      }),
    [versions],
  );
  const current =
    orderedVersions.find((version) => version.id === currentVersionId) ??
    orderedVersions[0];
  const [selectedId, setSelectedId] = React.useState(current?.id ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const selected =
    orderedVersions.find((version) => version.id === selectedId) ?? current;
  const canRestore = Boolean(
    selected && currentVersionId && selected.id !== currentVersionId,
  );

  const restore = React.useCallback(() => {
    if (!selected || !canRestore) return;
    setError(null);
    startTransition(async () => {
      try {
        await client.restoreArtifact({
          params: { artifactId },
          query: undefined,
          body: { versionId: selected.id },
        });
        router.refresh();
      } catch {
        setError("恢复失败，当前稿件没有被修改，请稍后重试。");
      }
    });
  }, [artifactId, canRestore, router, selected]);

  if (versions.length === 0) return null;

  return (
    <div data-slot="script-version-menu" className="relative flex items-center gap-2">
      <label htmlFor="script-version-select" className="sr-only">
        选择口播稿版本
      </label>
      <select
        id="script-version-select"
        data-slot="script-version-select"
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
        className="h-7 max-w-[210px] rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-ring/30"
      >
        {orderedVersions.map((version) => (
          <option key={version.id} value={version.id}>
            v{version.versionNumber ?? version.label.match(/v(\d+)/)?.[1] ?? "?"}
            {version.id === currentVersionId ? "（当前）" : ""} · {readableTime(version.createdAt)}
          </option>
        ))}
      </select>
      {canRestore ? (
        <button
          type="button"
          data-slot="script-version-restore-selected"
          disabled={pending}
          onClick={restore}
          className="h-7 rounded-md border border-brand/30 bg-brand-soft px-2.5 text-xs font-medium text-brand hover:bg-brand/10 disabled:opacity-50"
        >
          {pending ? "恢复中…" : "恢复此版本"}
        </button>
      ) : null}
      {selected && selected.id !== currentVersionId ? (
        <span
          data-slot="script-version-preview"
          title={selected.previewText ?? ""}
          className="max-w-[280px] truncate text-[11px] text-muted-foreground"
        >
          {selected.summary || selected.previewText || "该版本暂无摘要"}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-[11px] text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

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
