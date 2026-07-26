"use client";

import * as React from "react";
import { FileText, Folder, FolderPlus, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { describeUserError } from "@/lib/ai-error-humanize";
import { cn } from "@/lib/utils";

export interface KnowledgeWorkspaceVm {
  readonly folders: ReadonlyArray<{
    readonly id: string;
    readonly parentId: string | null;
    readonly name: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }>;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly folderId: string | null;
    readonly assetId: string | null;
    readonly knowledgeType: string;
    readonly status: "active" | "archived" | "draft";
    readonly updatedAt: string;
  }>;
}

type NodeId = "all" | "recent" | "unfiled" | string;

function folderDepth(
  folder: KnowledgeWorkspaceVm["folders"][number],
  byId: ReadonlyMap<string, KnowledgeWorkspaceVm["folders"][number]>,
): number {
  let depth = 0;
  let parent = folder.parentId;
  const seen = new Set<string>();
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    depth += 1;
    parent = byId.get(parent)?.parentId ?? null;
  }
  return depth;
}

export function KnowledgeFileWorkspace({
  workspace,
}: {
  readonly workspace: KnowledgeWorkspaceVm;
}) {
  const router = useRouter();
  const [node, setNode] = React.useState<NodeId>("all");
  const [query, setQuery] = React.useState("");
  const [newFolderName, setNewFolderName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const byId = React.useMemo(
    () => new Map(workspace.folders.map((folder) => [folder.id, folder])),
    [workspace.folders],
  );
  const now = Date.now();
  const rows = workspace.items.filter((item) => {
    if (item.status === "archived") return false;
    if (
      query.trim() &&
      !item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    ) {
      return false;
    }
    if (node === "all") return true;
    if (node === "unfiled") return item.folderId === null;
    if (node === "recent") {
      const updated = Date.parse(item.updatedAt);
      return Number.isFinite(updated) && now - updated <= 7 * 24 * 60 * 60 * 1000;
    }
    return item.folderId === node;
  });

  async function createFolder(event: React.FormEvent) {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      await client.createKnowledgeFolder({
        params: undefined,
        query: undefined,
        body: {
          name,
          parentId:
            node !== "all" && node !== "recent" && node !== "unfiled"
              ? node
              : null,
        },
      });
      setNewFolderName("");
      router.refresh();
    } catch (reason) {
      setError(describeUserError(reason, "新建文件夹失败，请重试。"));
    } finally {
      setCreating(false);
    }
  }

  async function moveItem(knowledgeId: string, folderId: string | null) {
    setError(null);
    try {
      await client.moveKnowledge({
        params: { knowledgeId },
        query: undefined,
        body: { folderId },
      });
      router.refresh();
    } catch (reason) {
      setError(describeUserError(reason, "移动文件失败，请重试。"));
    }
  }

  const virtualNodes = [
    { id: "all", label: "全部", count: workspace.items.filter((i) => i.status !== "archived").length },
    {
      id: "recent",
      label: "最近",
      count: workspace.items.filter((item) => {
        const updated = Date.parse(item.updatedAt);
        return item.status !== "archived" && Number.isFinite(updated) && now - updated <= 7 * 24 * 60 * 60 * 1000;
      }).length,
    },
    { id: "unfiled", label: "未归档", count: workspace.items.filter((i) => i.status !== "archived" && i.folderId === null).length },
  ] as const;

  return (
    <section
      data-slot="knowledge-file-workspace"
      aria-label="知识文件工作区"
      className="overflow-hidden rounded-card border border-border bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">文件工作区</h2>
          <p className="text-xs text-text-subtle">文件夹是默认入口；下方仍保留全部、关系图和观点地图。</p>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-text-subtle" aria-hidden="true" />
          <input
            aria-label="搜索知识文件"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文件…"
            className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
      </div>
      <div className="grid min-h-72 grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-r border-border bg-surface-subtle/40 p-3">
          <nav aria-label="知识文件夹" className="space-y-1">
            {virtualNodes.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setNode(entry.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs",
                  node === entry.id ? "bg-brand-soft text-brand" : "text-foreground hover:bg-surface-subtle",
                )}
              >
                <span>{entry.label}</span><span className="text-text-subtle">{entry.count}</span>
              </button>
            ))}
            <div className="my-2 border-t border-border" />
            {workspace.folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => setNode(folder.id)}
                style={{ paddingLeft: `${8 + folderDepth(folder, byId) * 14}px` }}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-xs",
                  node === folder.id ? "bg-brand-soft text-brand" : "text-foreground hover:bg-surface-subtle",
                )}
              >
                <Folder className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{folder.name}</span>
              </button>
            ))}
          </nav>
          <form onSubmit={(event) => void createFolder(event)} className="mt-3 flex gap-1">
            <input
              aria-label="新文件夹名称"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder={typeof node === "string" && byId.has(node) ? "新建子文件夹" : "新建文件夹"}
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-xs outline-none"
            />
            <button
              type="submit"
              aria-label="创建文件夹"
              disabled={!newFolderName.trim() || creating}
              className="grid size-8 place-items-center rounded-md bg-brand text-brand-foreground disabled:opacity-50"
            >
              <FolderPlus className="size-4" aria-hidden="true" />
            </button>
          </form>
        </aside>
        <div className="p-3">
          {error ? <p role="alert" className="mb-2 text-xs text-destructive">{error}</p> : null}
          {rows.length === 0 ? (
            <div className="grid min-h-48 place-items-center text-center text-xs text-text-subtle">
              这里还没有文件。可从上方倾倒场导入 PDF、DOCX、Markdown。
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <FileText className="size-4 shrink-0 text-brand" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{item.title}</p>
                    <p className="text-[11px] text-text-subtle">
                      {item.assetId ? "已绑定原始文件" : item.knowledgeType} · {item.updatedAt.slice(0, 10)}
                    </p>
                  </div>
                  <select
                    aria-label={`移动 ${item.title}`}
                    value={item.folderId ?? ""}
                    onChange={(event) => void moveItem(item.id, event.target.value || null)}
                    className="h-8 rounded-md border border-border bg-surface px-2 text-xs"
                  >
                    <option value="">未归档</option>
                    {workspace.folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>{folder.name}</option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
