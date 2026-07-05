"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  GitBranch,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { client } from "@/lib/contract-client";
import { useDraftChatRequest } from "./draft-chat-request";
import type {
  ThesisColumn,
  ThesisSkeleton,
  ThesisSkeletonNode,
} from "@/features/script/script-editor-data";

// [T-127] 稿面「论点骨架」面板 —— 把埋在 Copilot(planning.thesis 生成 + 采纳成 thesis_tree
// artifact)、稿面看不到的论点显性化 + **可编辑**(用户拍板②:数据蓝图非重编辑器,加/删/重排分论点)。
// 创作流:选题卡 → 备料 CTA(搜素材/立论点)→ **论点骨架** → 脚本。用户「不知道要先立论点」根因 = 不可见。
//
// 可编辑保存 = 追加一个新 thesis_tree ArtifactVersion(与脚本编辑器同款 createArtifactVersion +
// router.refresh;writer↔reader 契约 contentData.nodes=[{column,title,summary}],见 planning-runner)。
// 空态 = 引导「立论点」(深链 planning.thesis 到右栏编导对话生成)。采纳/编辑后经
// CreativeContext.thesisBrief 自动喂进写脚本 facet(SEAM 已通),脚本有据可依。
// 「每分论点挂 1-2 素材」= 后续增量(需 node.materialRefs + 用料链 picker),本版聚焦论点 CRUD。

const COLUMN_ORDER: ReadonlyArray<ThesisColumn> = [
  "core",
  "support",
  "evidence",
  "counter",
];
const COLUMN_LABEL: Record<ThesisColumn, string> = {
  core: "核心论点",
  support: "支撑依据",
  evidence: "证据",
  counter: "反驳",
};
const COLUMN_ADD_LABEL: Record<ThesisColumn, string> = {
  core: "加核心论点",
  support: "加支撑",
  evidence: "加证据",
  counter: "加反驳",
};

const THESIS_PREFILL =
  "基于选题、我的定位和已搜到的素材,帮我立一棵论点树:核心论点 + 支撑/证据/反驳分支。";

// ── 纯逻辑(可单测)──────────────────────────────────────────────────────

// 可编辑节点(带稳定 local key 供 React 列表 + 编辑期定位;非落库字段)。
export interface EditNode {
  key: string;
  column: ThesisColumn;
  title: string;
  summary: string;
}

// 落库节点 → 可编辑草稿(稳定 key)。
export function toEditNodes(
  nodes: ReadonlyArray<ThesisSkeletonNode>,
): EditNode[] {
  return nodes.map((n, i) => ({
    key: `n${i}`,
    column: n.column,
    title: n.title,
    summary: n.summary,
  }));
}

// 同列相邻交换(reorder,dir=-1 上移 / +1 下移);跨列节点跳过,无同列邻居 → 原样返回。
export function reorderWithinColumn(
  nodes: ReadonlyArray<EditNode>,
  key: string,
  dir: -1 | 1,
): EditNode[] {
  const idx = nodes.findIndex((n) => n.key === key);
  if (idx < 0) return nodes.slice();
  const col = nodes[idx]!.column;
  let j = idx + dir;
  while (j >= 0 && j < nodes.length && nodes[j]!.column !== col) j += dir;
  if (j < 0 || j >= nodes.length) return nodes.slice();
  const copy = nodes.slice();
  const a = copy[idx]!;
  copy[idx] = copy[j]!;
  copy[j] = a;
  return copy;
}

// 序列化保存:剔空(title+summary 皆空)、trim、按列顺序稳定排 → contentData.nodes。
export function serializeNodes(
  nodes: ReadonlyArray<EditNode>,
): ThesisSkeletonNode[] {
  const cleaned = nodes
    .map((n) => ({
      column: n.column,
      title: n.title.trim(),
      summary: n.summary.trim(),
    }))
    .filter((n) => n.title || n.summary);
  return cleaned
    .slice()
    .sort(
      (a, b) => COLUMN_ORDER.indexOf(a.column) - COLUMN_ORDER.indexOf(b.column),
    );
}

// new-* 稳定 key(Math.random 在本运行时被禁,用自增计数器;仅本地 React key 用,不落库)。
let keySeq = 0;
function freshKey(): string {
  keySeq += 1;
  return `new-${keySeq}`;
}

// ── 组件 ────────────────────────────────────────────────────────────────

export function ThesisSkeletonPanel({
  thesis,
}: {
  thesis: ThesisSkeleton | null;
}) {
  const { openChat } = useDraftChatRequest();
  const router = useRouter();
  const buildThesis = React.useCallback(() => {
    openChat({
      functionKey: "planning.thesis",
      prefill: THESIS_PREFILL,
      autoSend: true,
    });
  }, [openChat]);

  const hasThesis = thesis != null && thesis.nodes.length > 0;

  const [draft, setDraft] = React.useState<EditNode[]>(() =>
    hasThesis ? toEditNodes(thesis!.nodes) : [],
  );
  const [saveStatus, setSaveStatus] = React.useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // 服务端真值签名:保存后 router.refresh 回流(thesis prop 变)/ 首次 → 重置草稿到服务端真值。
  const serverSig = thesis ? JSON.stringify(thesis.nodes) : "";
  React.useEffect(() => {
    setDraft(thesis ? toEditNodes(thesis.nodes) : []);
    setSaveStatus("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSig]);

  // dirty:草稿序列化 ≠ 服务端真值(同一 serialize 管线归一,避免排序/空白误判 dirty)。
  const baseline = React.useMemo(
    () =>
      thesis ? JSON.stringify(serializeNodes(toEditNodes(thesis.nodes))) : "[]",
    [thesis],
  );
  const currentSer = React.useMemo(
    () => JSON.stringify(serializeNodes(draft)),
    [draft],
  );
  const dirty = thesis != null && currentSer !== baseline;

  const editNode = React.useCallback(
    (key: string, field: "title" | "summary", value: string) => {
      setDraft((d) =>
        d.map((n) => (n.key === key ? { ...n, [field]: value } : n)),
      );
    },
    [],
  );
  const deleteNode = React.useCallback((key: string) => {
    setDraft((d) => d.filter((n) => n.key !== key));
  }, []);
  const addNode = React.useCallback((column: ThesisColumn) => {
    setDraft((d) => [...d, { key: freshKey(), column, title: "", summary: "" }]);
  }, []);
  const move = React.useCallback((key: string, dir: -1 | 1) => {
    setDraft((d) => reorderWithinColumn(d, key, dir));
  }, []);

  const save = React.useCallback(async () => {
    if (!thesis) return;
    setSaveStatus("saving");
    try {
      await client.createArtifactVersion({
        params: { artifactId: thesis.artifactId },
        query: undefined,
        body: {
          contentText: "",
          contentData: { nodes: serializeNodes(draft) },
          changeSummary: "编辑论点骨架",
        },
      });
      setSaveStatus("saved");
      router.refresh();
    } catch {
      setSaveStatus("error");
    }
  }, [thesis, draft, router]);

  const reset = React.useCallback(() => {
    setDraft(thesis ? toEditNodes(thesis.nodes) : []);
    setSaveStatus("idle");
  }, [thesis]);

  return (
    <section
      data-slot="thesis-skeleton-panel"
      data-has-thesis={hasThesis ? "true" : "false"}
      aria-label="论点骨架"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
            <GitBranch className="size-4 text-brand" aria-hidden="true" />
            论点骨架
          </h2>
          <p className="text-xs text-text-subtle">
            写脚本前先立论点:核心论点 + 支撑/证据/反驳 —— 采纳后自动作为写脚本的依据,可直接加/删/重排。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 gap-1.5 text-xs"
          onClick={buildThesis}
        >
          <Sparkles className="size-3.5" />
          {hasThesis ? "重新立论点" : "立论点"}
        </Button>
      </div>

      {hasThesis ? (
        <div data-slot="thesis-skeleton-body" className="flex flex-col gap-3">
          {COLUMN_ORDER.map((col) => (
            <ThesisColumnEditor
              key={col}
              column={col}
              nodes={draft.filter((n) => n.column === col)}
              onEdit={editNode}
              onDelete={deleteNode}
              onAdd={addNode}
              onMove={move}
            />
          ))}

          {/* 保存栏:dirty 才可存;状态诚实(存中/已存/失败)。 */}
          <div
            data-slot="thesis-save-bar"
            className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5"
          >
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={!dirty || saveStatus === "saving"}
              onClick={save}
            >
              {saveStatus === "saving" ? "保存中…" : "保存论点骨架"}
            </Button>
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={reset}
              >
                重置
              </Button>
            ) : null}
            <span
              data-slot="thesis-save-status"
              className={cn(
                "text-[11px]",
                saveStatus === "error" ? "text-destructive" : "text-text-subtle",
              )}
            >
              {saveStatus === "saved" && !dirty
                ? "已保存"
                : saveStatus === "error"
                  ? "保存失败,请重试"
                  : dirty
                    ? "有未保存的改动"
                    : "改动会追加为新版本,写脚本时作为依据"}
            </span>
          </div>
        </div>
      ) : (
        <div
          data-slot="thesis-skeleton-empty"
          className="rounded-md border border-dashed border-border bg-surface-subtle px-3 py-4 text-center"
        >
          <p className="text-xs text-muted-foreground">
            还没立论点。先搜素材、再基于素材立论点 —— 核心论点 + 支撑/证据/反驳会显示在这里,可直接编辑,写脚本时自动作为依据。
          </p>
        </div>
      )}
    </section>
  );
}

// 单列编辑区(标签 + 该列可编辑节点 + 添加)。核心论点高亮。
function ThesisColumnEditor({
  column,
  nodes,
  onEdit,
  onDelete,
  onAdd,
  onMove,
}: {
  column: ThesisColumn;
  nodes: EditNode[];
  onEdit: (key: string, field: "title" | "summary", value: string) => void;
  onDelete: (key: string) => void;
  onAdd: (column: ThesisColumn) => void;
  onMove: (key: string, dir: -1 | 1) => void;
}) {
  const isCore = column === "core";
  return (
    <div
      data-slot="thesis-column"
      data-column={column}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[11px] font-medium uppercase tracking-wide",
            isCore ? "text-brand" : "text-text-subtle",
          )}
        >
          {COLUMN_LABEL[column]}
        </span>
        <button
          type="button"
          data-slot="thesis-add"
          data-column={column}
          aria-label={COLUMN_ADD_LABEL[column]}
          onClick={() => onAdd(column)}
          className="flex items-center gap-0.5 rounded px-1 text-[11px] text-muted-foreground transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-3" aria-hidden="true" />
          {COLUMN_ADD_LABEL[column]}
        </button>
      </div>
      {nodes.length === 0 ? (
        <p className="px-0.5 text-[11px] text-text-subtle">（暂无,点右上「{COLUMN_ADD_LABEL[column]}」添加）</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {nodes.map((n, i) => (
            <li
              key={n.key}
              data-slot="thesis-node"
              className={cn(
                "flex flex-col gap-1 rounded-md border px-2.5 py-2",
                isCore
                  ? "border-brand/40 bg-brand-soft"
                  : "border-border bg-surface-subtle",
              )}
            >
              <div className="flex items-center gap-1.5">
                <input
                  data-slot="thesis-node-title"
                  aria-label={`${COLUMN_LABEL[column]}标题`}
                  value={n.title}
                  onChange={(e) => onEdit(n.key, "title", e.target.value)}
                  placeholder="一句话论点"
                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[12.5px] font-medium text-foreground placeholder:text-text-subtle focus-visible:border-border focus-visible:bg-surface focus-visible:outline-none"
                />
                <div className="flex shrink-0 items-center gap-0.5">
                  <IconBtn
                    label="上移"
                    disabled={i === 0}
                    onClick={() => onMove(n.key, -1)}
                  >
                    <ChevronUp className="size-3.5" aria-hidden="true" />
                  </IconBtn>
                  <IconBtn
                    label="下移"
                    disabled={i === nodes.length - 1}
                    onClick={() => onMove(n.key, 1)}
                  >
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                  </IconBtn>
                  <IconBtn label="删除" onClick={() => onDelete(n.key)} danger>
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </IconBtn>
                </div>
              </div>
              <textarea
                data-slot="thesis-node-summary"
                aria-label={`${COLUMN_LABEL[column]}说明`}
                value={n.summary}
                onChange={(e) => onEdit(n.key, "summary", e.target.value)}
                placeholder="补充说明 / 依据(可选)"
                rows={2}
                className="w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-xs leading-relaxed text-muted-foreground placeholder:text-text-subtle focus-visible:border-border focus-visible:bg-surface focus-visible:outline-none"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
