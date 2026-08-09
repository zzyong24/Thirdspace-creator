"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  GitBranch,
  Paperclip,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { client } from "@/lib/contract-client";
import { useDraftChatRequest } from "./draft-chat-request";
import type {
  ThesisColumn,
  ThesisMaterialRef,
  ThesisSkeleton,
  ThesisSkeletonNode,
} from "@/features/script/script-editor-data";

// 稿面用料链(弹药)可挂载素材(draft-workbench VM ammo 投影)—— 挂到分论点用。
export interface AvailableMaterial {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
}

// [T-127] 稿面「论点骨架」面板 —— 把埋在 Copilot(planning.thesis 生成 + 采纳成 thesis_tree
// artifact)、稿面看不到的论点显性化 + **可编辑**(用户拍板②:数据蓝图非重编辑器,加/删/重排分论点)。
// 创作流:选题卡 → 备料 CTA(搜素材/立论点)→ **论点骨架** → 脚本。用户「不知道要先立论点」根因 = 不可见。
//
// 可编辑保存 = 追加一个新 thesis_tree ArtifactVersion(与脚本编辑器同款 createArtifactVersion +
// router.refresh;writer↔reader 契约 contentData.nodes=[{column,title,summary}],见 planning-runner)。
// 空态 = 引导「先梳理观点」(深链 planning.thesis 到右栏编导对话生成)。只有用户明确
// 采用的当前版本才经 CreativeContext.thesisBrief 进入生成式写稿；完整逐字稿永不读取。
// 人工挂/卸资料只记录论点依据，不把 thesis_tree 恢复为制作/B-roll 素材来源。

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
  "这次内容需要先梳理复杂观点。请基于当前项目的选题、定位、Brief 和已有资料，生成一份可选论点骨架：核心论点 + 支撑依据 + 证据 + 反驳。先给候选，等我明确采纳后再用于写稿。";

// ── 纯逻辑(可单测)──────────────────────────────────────────────────────

// 可编辑节点(带稳定 local key 供 React 列表 + 编辑期定位;key 非落库字段)。
export interface EditNode {
  key: string;
  column: ThesisColumn;
  title: string;
  summary: string;
  materialRefs: ThesisMaterialRef[];
}

// 落库节点 → 可编辑草稿(稳定 key)。[T-387a] source 透传(AI 预挂标记不因编辑往返丢失)。
export function toEditNodes(
  nodes: ReadonlyArray<ThesisSkeletonNode>,
): EditNode[] {
  return nodes.map((n, i) => ({
    key: `n${i}`,
    column: n.column,
    title: n.title,
    summary: n.summary,
    materialRefs: n.materialRefs.map((r) => ({
      id: r.id,
      title: r.title,
      ...(r.source === "ai" ? { source: "ai" as const } : {}),
    })),
  }));
}

// 给某分论点挂一条素材(去重:同 id 不重复挂)。
export function mountMaterial(
  nodes: ReadonlyArray<EditNode>,
  key: string,
  ref: ThesisMaterialRef,
): EditNode[] {
  return nodes.map((n) =>
    n.key === key && !n.materialRefs.some((r) => r.id === ref.id)
      ? { ...n, materialRefs: [...n.materialRefs, ref] }
      : n,
  );
}

// 从某分论点卸一条素材。
export function unmountMaterial(
  nodes: ReadonlyArray<EditNode>,
  key: string,
  materialId: string,
): EditNode[] {
  return nodes.map((n) =>
    n.key === key
      ? { ...n, materialRefs: n.materialRefs.filter((r) => r.id !== materialId) }
      : n,
  );
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
      // [T-387a] source 透传落库(AI 预挂标记保存后仍在;人挂条目不带字段)。
      materialRefs: n.materialRefs.map((r) => ({
        id: r.id,
        title: r.title,
        ...(r.source === "ai" ? { source: "ai" as const } : {}),
      })),
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
  ammo = [],
}: {
  thesis: ThesisSkeleton | null;
  // 稿面用料链可挂素材(vm.ammo 投影);空 → 挂素材入口提示先去弹药区加素材。
  ammo?: ReadonlyArray<AvailableMaterial>;
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

  const skipToScript = React.useCallback(() => {
    const script = document.getElementById("script");
    if (!script) return;
    script.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!script.hasAttribute("tabindex")) script.tabIndex = -1;
    script.focus({ preventScroll: true });
  }, []);

  const hasThesis = thesis != null && thesis.nodes.length > 0;
  const isAdopted = thesis?.scriptBasisStatus === "adopted";

  const [draft, setDraft] = React.useState<EditNode[]>(() =>
    hasThesis ? toEditNodes(thesis!.nodes) : [],
  );
  const [saveStatus, setSaveStatus] = React.useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [basisStatus, setBasisStatus] = React.useState<
    "idle" | "saving" | "error"
  >("idle");

  // 服务端真值签名:保存后 router.refresh 回流(thesis prop 变)/ 首次 → 重置草稿到服务端真值。
  const serverSig = thesis
    ? JSON.stringify([thesis.versionId, thesis.scriptBasisStatus, thesis.nodes])
    : "";
  React.useEffect(() => {
    setDraft(thesis ? toEditNodes(thesis.nodes) : []);
    setSaveStatus("idle");
    setBasisStatus("idle");
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

  React.useEffect(() => {
    if (!dirty) return;
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, [dirty]);

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
    setDraft((d) => [
      ...d,
      { key: freshKey(), column, title: "", summary: "", materialRefs: [] },
    ]);
  }, []);
  const move = React.useCallback((key: string, dir: -1 | 1) => {
    setDraft((d) => reorderWithinColumn(d, key, dir));
  }, []);
  const mount = React.useCallback((key: string, ref: ThesisMaterialRef) => {
    setDraft((d) => mountMaterial(d, key, ref));
  }, []);
  const unmount = React.useCallback((key: string, materialId: string) => {
    setDraft((d) => unmountMaterial(d, key, materialId));
  }, []);

  const save = React.useCallback(async () => {
    if (!thesis) return;
    setSaveStatus("saving");
    try {
      await client.createArtifactVersion({
        params: { artifactId: thesis.artifactId },
        query: undefined,
        body: {
          expectedCurrentVersionId: thesis.versionId,
          contentText: "",
          contentData: {
            nodes: serializeNodes(draft),
            scriptBasis: { status: isAdopted ? "adopted" : "inactive" },
          },
          changeSummary: "编辑论点骨架",
        },
      });
      setSaveStatus("saved");
      router.refresh();
    } catch {
      setSaveStatus("error");
    }
  }, [thesis, draft, isAdopted, router]);

  const setScriptBasis = React.useCallback(
    async (status: "adopted" | "inactive") => {
      if (!thesis || dirty) return;
      setBasisStatus("saving");
      try {
        await client.createArtifactVersion({
          params: { artifactId: thesis.artifactId },
          query: undefined,
          body: {
            expectedCurrentVersionId: thesis.versionId,
            contentText: "",
            contentData: { nodes: serializeNodes(draft), scriptBasis: { status } },
            changeSummary:
              status === "adopted" ? "采用论点作为写稿依据" : "停止使用论点写稿",
          },
        });
        router.refresh();
      } catch {
        setBasisStatus("error");
      }
    },
    [thesis, dirty, draft, router],
  );

  const reset = React.useCallback(() => {
    setDraft(thesis ? toEditNodes(thesis.nodes) : []);
    setSaveStatus("idle");
  }, [thesis]);

  return (
    <section
      data-slot="thesis-skeleton-panel"
      data-has-thesis={hasThesis ? "true" : "false"}
      aria-label="论点骨架（可选）"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
            <GitBranch className="size-4 text-brand" aria-hidden="true" />
            论点骨架（可选）
          </h2>
          <p className="text-xs text-text-subtle">
            适合知识讲解、观点评论、测评对比、较长内容，或需要证据与反驳时先理清观点。
          </p>
          <p className="text-xs text-text-subtle">
            已有完整逐字稿、简单通知、短口播、纯记录或只想快速成稿时，可以直接跳过。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={buildThesis}
          >
            <Sparkles className="size-3.5" />
            {hasThesis ? "重新梳理观点" : "先梳理观点"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={skipToScript}
          >
            跳过，直接写稿
          </Button>
        </div>
      </div>

      {hasThesis ? (
        <div data-slot="thesis-skeleton-body" className="flex flex-col gap-3">
          <div
            data-slot="thesis-script-basis-status"
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2",
              isAdopted
                ? "border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-400/30 dark:bg-emerald-400/10"
                : "border-border bg-surface-subtle",
            )}
          >
            <div>
              <p className="text-xs font-medium text-foreground">
                {isAdopted ? "本次写稿采用" : "尚未用于写稿"}
              </p>
              <p className="text-[11px] text-text-subtle">
                {isAdopted
                  ? "生成式写稿会读取当前版本；完整逐字稿导入仍保持原文优先。"
                  : "查看和编辑不会影响稿面，只有你明确采用后才会进入生成式写稿。"}
              </p>
            </div>
            <Button
              type="button"
              variant={isAdopted ? "outline" : "default"}
              size="sm"
              className="h-7 text-xs"
              disabled={dirty || basisStatus === "saving"}
              onClick={() => void setScriptBasis(isAdopted ? "inactive" : "adopted")}
            >
              {basisStatus === "saving"
                ? "处理中…"
                : isAdopted
                  ? "停止用于写稿"
                  : "采用并用于写稿"}
            </Button>
            {dirty ? (
              <p className="w-full text-[11px] text-amber-700 dark:text-amber-400">
                请先保存或重置当前编辑，再切换是否用于写稿。
              </p>
            ) : basisStatus === "error" ? (
              <p className="w-full text-[11px] text-destructive">
                采用状态保存失败，当前状态未改变，请重试。
              </p>
            ) : null}
          </div>
          {COLUMN_ORDER.map((col) => (
            <ThesisColumnEditor
              key={col}
              column={col}
              nodes={draft.filter((n) => n.column === col)}
              ammo={ammo}
              onEdit={editNode}
              onDelete={deleteNode}
              onAdd={addNode}
              onMove={move}
              onMount={mount}
              onUnmount={unmount}
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
                  ? "保存失败；尚未保存，刷新或离开会丢失，请重试"
                  : dirty
                    ? "尚未保存，刷新或离开会丢失"
                    : isAdopted
                      ? "改动会追加为新版本，并保持本次写稿采用"
                      : "改动会追加为新版本，不会自动用于写稿"}
            </span>
          </div>
        </div>
      ) : (
        <div
          data-slot="thesis-skeleton-empty"
          className="rounded-md border border-dashed border-border bg-surface-subtle px-3 py-4 text-center"
        >
          <p className="text-xs text-muted-foreground">
            还没有论点骨架。需要复杂论证时可先梳理核心论点、支撑依据、证据和反驳；不需要时直接写稿即可。
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
  ammo,
  onEdit,
  onDelete,
  onAdd,
  onMove,
  onMount,
  onUnmount,
}: {
  column: ThesisColumn;
  nodes: EditNode[];
  ammo: ReadonlyArray<AvailableMaterial>;
  onEdit: (key: string, field: "title" | "summary", value: string) => void;
  onDelete: (key: string) => void;
  onAdd: (column: ThesisColumn) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onMount: (key: string, ref: ThesisMaterialRef) => void;
  onUnmount: (key: string, materialId: string) => void;
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
            <ThesisNodeRow
              key={n.key}
              node={n}
              column={column}
              isCore={isCore}
              first={i === 0}
              last={i === nodes.length - 1}
              ammo={ammo}
              onEdit={onEdit}
              onDelete={onDelete}
              onMove={onMove}
              onMount={onMount}
              onUnmount={onUnmount}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// 单个分论点行:标题/说明可编 + 上移/下移/删 + 挂载素材(chips + 内联 picker)。
function ThesisNodeRow({
  node,
  column,
  isCore,
  first,
  last,
  ammo,
  onEdit,
  onDelete,
  onMove,
  onMount,
  onUnmount,
}: {
  node: EditNode;
  column: ThesisColumn;
  isCore: boolean;
  first: boolean;
  last: boolean;
  ammo: ReadonlyArray<AvailableMaterial>;
  onEdit: (key: string, field: "title" | "summary", value: string) => void;
  onDelete: (key: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onMount: (key: string, ref: ThesisMaterialRef) => void;
  onUnmount: (key: string, materialId: string) => void;
}) {
  const [picking, setPicking] = React.useState(false);
  // 未挂载的可选素材(已挂的不重复列)。
  const available = ammo.filter(
    (a) => !node.materialRefs.some((r) => r.id === a.id),
  );
  return (
    <li
      data-slot="thesis-node"
      className={cn(
        "flex flex-col gap-1 rounded-md border px-2.5 py-2",
        isCore ? "border-brand/40 bg-brand-soft" : "border-border bg-surface-subtle",
      )}
    >
      <div className="flex items-center gap-1.5">
        <input
          data-slot="thesis-node-title"
          aria-label={`${COLUMN_LABEL[column]}标题`}
          value={node.title}
          onChange={(e) => onEdit(node.key, "title", e.target.value)}
          placeholder="一句话论点"
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[12.5px] font-medium text-foreground placeholder:text-text-subtle focus-visible:border-border focus-visible:bg-surface focus-visible:outline-none"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <IconBtn label="上移" disabled={first} onClick={() => onMove(node.key, -1)}>
            <ChevronUp className="size-3.5" aria-hidden="true" />
          </IconBtn>
          <IconBtn label="下移" disabled={last} onClick={() => onMove(node.key, 1)}>
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </IconBtn>
          <IconBtn label="删除" onClick={() => onDelete(node.key)} danger>
            <Trash2 className="size-3.5" aria-hidden="true" />
          </IconBtn>
        </div>
      </div>
      <textarea
        data-slot="thesis-node-summary"
        aria-label={`${COLUMN_LABEL[column]}说明`}
        value={node.summary}
        onChange={(e) => onEdit(node.key, "summary", e.target.value)}
        placeholder="补充说明 / 依据(可选)"
        rows={2}
        className="w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-xs leading-relaxed text-muted-foreground placeholder:text-text-subtle focus-visible:border-border focus-visible:bg-surface focus-visible:outline-none"
      />
      {/* [T-387a] 证据/支撑节点无挂载素材 → 「缺素材」徽标 + 引导文案(指向稿面已有的
          「搜素材/上传素材」入口 CreationFlowCtas,不新做弹窗;诚实缺 = 引导人补)。 */}
      {(column === "support" || column === "evidence") &&
      node.materialRefs.length === 0 ? (
        <p
          data-slot="thesis-missing-material"
          className="flex flex-wrap items-center gap-1.5 text-[11px] text-text-subtle"
        >
          <span className="inline-flex items-center rounded-full border border-amber-300/60 bg-amber-50 px-1.5 py-px font-medium text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400">
            缺素材
          </span>
          用上方「联网找资料」或「上传 / 管理素材」补一条支撑素材，再回来挂载。
        </p>
      ) : null}
      {/* 挂载的素材 chips(× 卸载)+ 挂素材入口。 */}
      <div data-slot="thesis-node-materials" className="flex flex-wrap items-center gap-1">
        {node.materialRefs.map((r) => (
          <span
            key={r.id}
            data-slot="thesis-material-chip"
            data-material-source={r.source === "ai" ? "ai" : "human"}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground"
          >
            <Paperclip className="size-3 shrink-0" aria-hidden="true" />
            {/* [T-387a] AI 预挂条目渲「AI」小标(人可用现有 × 移除、再手挂替换)。 */}
            {r.source === "ai" ? (
              <span
                data-slot="thesis-material-ai-badge"
                className="shrink-0 rounded bg-brand-soft px-1 text-[10px] font-medium leading-tight text-brand"
              >
                AI
              </span>
            ) : null}
            <span className="truncate">{r.title || r.id}</span>
            <button
              type="button"
              aria-label={`卸载素材 ${r.title || r.id}`}
              onClick={() => onUnmount(node.key, r.id)}
              className="shrink-0 rounded text-text-subtle hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <button
          type="button"
          data-slot="thesis-mount-toggle"
          aria-label="挂素材"
          aria-expanded={picking}
          onClick={() => setPicking((v) => !v)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Paperclip className="size-3" aria-hidden="true" />
          挂素材
        </button>
      </div>
      {picking ? (
        <div
          data-slot="thesis-material-picker"
          className="mt-0.5 flex flex-col gap-0.5 rounded-md border border-border bg-surface p-1"
        >
          {ammo.length === 0 ? (
            <p className="px-1 py-0.5 text-[11px] text-text-subtle">
              还没有可挂的素材——先到上方「创作素材」上传文件，或联网找资料。
            </p>
          ) : available.length === 0 ? (
            <p className="px-1 py-0.5 text-[11px] text-text-subtle">
              可用素材都挂上了。
            </p>
          ) : (
            available.map((a) => (
              <button
                key={a.id}
                type="button"
                data-slot="thesis-material-option"
                onClick={() => {
                  onMount(node.key, { id: a.id, title: a.title });
                  setPicking(false);
                }}
                className="flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Paperclip className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{a.title}</span>
                <span className="ml-auto shrink-0 text-[10px] text-text-subtle">
                  {a.kind === "asset" ? "素材" : "知识"}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </li>
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
