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
import { listForegroundActivities } from "@/lib/foreground-activity";
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

function versionLabel(version: ScriptViewModel["versions"][number]): string {
  return `v${version.versionNumber ?? version.label.match(/v(\d+)/)?.[1] ?? "?"}`;
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
  // B6：恢复成功需要明确反馈；refresh 后当前指针变化时下拉回到新当前版本，提示保留。
  const [restoredLabel, setRestoredLabel] = React.useState<string | null>(null);
  const [seenCurrentId, setSeenCurrentId] = React.useState(currentVersionId);
  if (seenCurrentId !== currentVersionId) {
    setSeenCurrentId(currentVersionId);
    setSelectedId(current?.id ?? "");
  }
  const [pending, startTransition] = React.useTransition();
  const selected =
    orderedVersions.find((version) => version.id === selectedId) ?? current;
  const canRestore = Boolean(
    selected && currentVersionId && selected.id !== currentVersionId,
  );

  const restore = React.useCallback(() => {
    if (!selected || !canRestore) return;
    setError(null);
    setRestoredLabel(null);
    // 稿面还有未保存/保存中的修改时，失焦自动保存会在恢复后再追加一版旧稿，把恢复盖掉。
    if (listForegroundActivities().some((label) => /(脚本|分镜脚本).*(未保存的修改|正在保存)/.test(label))) {
      setError("稿面还有未保存的修改，请先保存（或撤销修改）再恢复旧版本。");
      return;
    }
    const label = versionLabel(selected);
    startTransition(async () => {
      try {
        await client.restoreArtifact({
          params: { artifactId },
          query: undefined,
          body: { versionId: selected.id },
        });
        setRestoredLabel(label);
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
            {versionLabel(version)}
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
          data-slot="script-version-preview-summary"
          title={selected.previewText ?? ""}
          className="max-w-[280px] truncate text-[11px] text-muted-foreground"
        >
          {selected.summary || "该版本暂无摘要"}
        </span>
      ) : null}
      {selected && selected.id !== currentVersionId ? (
        <section
          role="region"
          aria-label={`${versionLabel(selected)} 正文预览`}
          data-slot="script-version-preview"
          className="absolute right-0 top-8 z-20 w-[360px] max-w-[80vw] rounded-lg border border-border bg-surface p-3 text-left shadow-lg"
        >
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">
            {versionLabel(selected)} · 预览中，尚未恢复；点「恢复此版本」后编辑器才会换成这一版
          </p>
          <p className="max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-5 text-foreground">
            {selected.previewText || "该版本没有可预览的正文"}
          </p>
        </section>
      ) : null}
      {restoredLabel ? (
        <span role="status" className="text-[11px] font-medium text-brand">
          已恢复到 {restoredLabel}
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
