"use client";

/**
 * 口播脚本「编辑 | 结构」双视图(T-070 首建只读;T-072 升级为**结构化编辑**——
 * 用户看图拍板的目标形态:每段左侧挂段型徽章,段内容就地可编辑)。
 *
 * 编辑视图 = 现有 TipTap(children 原样);结构视图 = 可编辑分段卡:
 *   段序号 + 段型徽章(可切换:钩子/开场/正文/转场/收尾/金句)+ 标题(inline input)
 *   + 正文(自适应高 textarea)+ 段操作(上移/下移/删除/在下方加段)。
 *
 * 保存:组装 sections → createArtifactVersion(contentText=段落拼接,
 * contentData.sections 全量;与 chat-script-draft-card 的写入 shape 对齐,**不写
 * contentData.html**——让读侧 loadScriptEditorData 从新 sections 重拼编辑器 HTML,
 * 避免结构改动被 stale html 盖掉)→ router.refresh()。TipTap 侧靠外层
 * key=versionCount 重挂吃新版本(T-055c 机制,双向一致)。
 *
 * 默认视图:有 sections → 结构(用户目标形态);无 sections → 编辑 + 结构侧空态
 * 引导(可「添加第一段」从零起结构稿)。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { client } from "@/lib/contract-client";
import { ensureScriptArtifact } from "./ensure-script-artifact";
import { plainTextFromSections } from "./script-editor-bridge";
import type { ScriptSectionView } from "@/types/view-models";

type SectionType = ScriptSectionView["type"];

// 段型词表(中文)+ 徽章配色。顺序即切换下拉的展示顺序。
const TYPE_LABEL: Record<SectionType, { label: string; cls: string }> = {
  hook: { label: "钩子", cls: "bg-brand-soft text-brand" },
  intro: { label: "开场", cls: "bg-surface-subtle text-muted-foreground" },
  body: { label: "正文", cls: "bg-surface-subtle text-muted-foreground" },
  transition: { label: "转场", cls: "bg-surface-subtle text-muted-foreground" },
  outro: { label: "收尾", cls: "bg-surface-subtle text-muted-foreground" },
  golden_quote: { label: "金句", cls: "bg-amber-100 text-amber-700" },
};

const TYPE_ORDER: ReadonlyArray<SectionType> = [
  "hook",
  "intro",
  "body",
  "transition",
  "outro",
  "golden_quote",
];

type SaveStatus = "saved" | "saving" | "dirty";

/** 结构编辑的本地段模型(可变副本;保存时组装回 sections shape)。 */
interface EditableSection {
  id: string;
  type: SectionType;
  heading: string;
  body: string;
  emphasis: boolean;
  startSeconds: number | null;
  endSeconds: number | null;
}

function toEditable(sections: ReadonlyArray<ScriptSectionView>): EditableSection[] {
  return sections.map((s) => ({
    id: s.id,
    type: s.type,
    heading: s.heading,
    body: s.body,
    emphasis: s.emphasis,
    startSeconds: s.startSeconds,
    endSeconds: s.endSeconds,
  }));
}

let newSectionCounter = 0;
function blankSection(): EditableSection {
  newSectionCounter += 1;
  return {
    id: `script-section-new-${newSectionCounter}`,
    type: "body",
    heading: "",
    body: "",
    emphasis: false,
    startSeconds: null,
    endSeconds: null,
  };
}

function seconds(v: number): string {
  const m = Math.floor(v / 60);
  const s = Math.round(v % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ScriptStructureToggle({
  sections,
  artifactId = null,
  projectId = null,
  children,
}: {
  readonly sections: ReadonlyArray<ScriptSectionView>;
  /**
   * 分镜脚本 artifact id(结构编辑保存目标)。null + 有 projectId → 保存时
   * ensureScriptArtifact getOrCreate(与 TipTap 保存路径同,T-053 断点①);
   * 都缺省(结构测试)→ 保存只走本地态。
   */
  readonly artifactId?: string | null;
  readonly projectId?: string | null;
  readonly children: React.ReactNode;
}) {
  // T-072:有结构化分段 → 默认进结构编辑(用户目标形态);没有 → 默认自由文本编辑。
  const [view, setView] = React.useState<"edit" | "structure">(
    sections.length > 0 ? "structure" : "edit",
  );
  return (
    <div className="flex flex-col gap-2">
      <div
        data-slot="script-view-switch"
        className="flex items-center gap-1 self-end"
      >
        {(
          [
            { key: "edit", label: "编辑" },
            { key: "structure", label: "结构" },
          ] as const
        ).map((v) => (
          <button
            key={v.key}
            type="button"
            data-slot={`script-view-${v.key}`}
            data-active={view === v.key}
            onClick={() => setView(v.key)}
            className={
              "h-6 rounded-control px-2 text-xs transition-colors " +
              (view === v.key
                ? "bg-brand text-brand-foreground"
                : "border border-border text-muted-foreground hover:text-foreground")
            }
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "edit" ? (
        children
      ) : (
        <ScriptStructureEditor
          sections={sections}
          artifactId={artifactId}
          projectId={projectId}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 结构编辑器(T-072):可编辑分段卡 + 保存产新 ArtifactVersion
// ---------------------------------------------------------------------------

function ScriptStructureEditor({
  sections,
  artifactId,
  projectId,
}: {
  readonly sections: ReadonlyArray<ScriptSectionView>;
  readonly artifactId: string | null;
  readonly projectId: string | null;
}) {
  const router = useRouter();
  const [local, setLocal] = React.useState<EditableSection[]>(() =>
    toEditable(sections),
  );
  const [status, setStatus] = React.useState<SaveStatus>("saved");
  const statusRef = React.useRef<SaveStatus>("saved");
  statusRef.current = status;

  // 外部 sections 变化(保存 refresh 回流 / 对话整稿写入 / 版本回滚)→ 未在编辑
  // (status=saved)时重灌本地态;编辑中(dirty/saving)不覆盖在途改动。
  const propsKey = JSON.stringify(sections);
  const appliedKeyRef = React.useRef(propsKey);
  React.useEffect(() => {
    if (appliedKeyRef.current === propsKey) return;
    appliedKeyRef.current = propsKey;
    if (statusRef.current !== "saved") return;
    setLocal(toEditable(sections));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsKey]);

  const markDirty = React.useCallback(() => setStatus("dirty"), []);

  const updateSection = React.useCallback(
    (index: number, patch: Partial<EditableSection>) => {
      setLocal((prev) =>
        prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      );
      markDirty();
    },
    [markDirty],
  );

  const moveSection = React.useCallback(
    (index: number, delta: -1 | 1) => {
      setLocal((prev) => {
        const target = index + delta;
        if (target < 0 || target >= prev.length) return prev;
        const next = prev.slice();
        const [item] = next.splice(index, 1);
        next.splice(target, 0, item!);
        return next;
      });
      markDirty();
    },
    [markDirty],
  );

  const removeSection = React.useCallback(
    (index: number) => {
      setLocal((prev) => prev.filter((_, i) => i !== index));
      markDirty();
    },
    [markDirty],
  );

  const insertBelow = React.useCallback(
    (index: number) => {
      setLocal((prev) => {
        const next = prev.slice();
        next.splice(index + 1, 0, blankSection());
        return next;
      });
      markDirty();
    },
    [markDirty],
  );

  const appendFirst = React.useCallback(() => {
    setLocal([{ ...blankSection(), type: "hook" }]);
    markDirty();
  }, [markDirty]);

  // 空段(标题正文都空)不落库;全空 → 禁保存(清空脚本走版本回滚,不产空版本)。
  const nonEmpty = local.filter(
    (s) => s.heading.trim().length > 0 || s.body.trim().length > 0,
  );

  const handleSave = React.useCallback(async () => {
    if (!artifactId && !projectId) {
      // fixture-only 渲染(结构测试):不打契约,仅本地翻「已保存」。
      setStatus("saved");
      return;
    }
    if (nonEmpty.length === 0) return;
    setStatus("saving");
    try {
      // 真项目还没有脚本 artifact → 首存 getOrCreate(与 TipTap 保存同路径)。
      let targetId = artifactId;
      if (!targetId && projectId) {
        const ensured = await ensureScriptArtifact(projectId, null);
        targetId = ensured.artifactId as string;
      }
      if (!targetId) throw new Error("no script artifact target");
      const payloadSections = nonEmpty.map((s, i) => ({
        id: s.id || `script-section-${i}`,
        type: s.type,
        heading: s.heading,
        body: s.body,
        // 金句段型语义上即强调;其余保留原 emphasis(TipTap 整段加粗的往返)。
        emphasis: s.type === "golden_quote" ? true : s.emphasis,
        startSeconds: s.startSeconds,
        endSeconds: s.endSeconds,
      }));
      await client.createArtifactVersion({
        params: { artifactId: targetId },
        query: undefined,
        body: {
          // 不写 contentData.html:读侧会从新 sections 重拼编辑器 HTML,
          // 避免结构改动被旧富文本真值盖掉(双向一致的关键)。
          contentText: plainTextFromSections(
            payloadSections as unknown as ReadonlyArray<ScriptSectionView>,
          ),
          contentData: { sections: payloadSections },
          changeSummary: "结构编辑",
        },
      });
      setStatus("saved");
      router.refresh();
    } catch {
      // 失败保留 dirty,用户可重试。
      setStatus("dirty");
    }
  }, [artifactId, projectId, nonEmpty, router]);

  if (local.length === 0) {
    return (
      <div
        data-slot="script-structure-empty"
        className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface-subtle/50 px-4 py-8 text-center text-sm text-muted-foreground"
      >
        <p>
          脚本还没有结构化分段——在右侧让编导整稿起草会自动带分段,或在编辑视图用标题(H2/H3)分段后保存。
        </p>
        <button
          type="button"
          data-slot="script-structure-add-first"
          onClick={appendFirst}
          className="inline-flex h-7 items-center gap-1 rounded-control border border-border bg-surface px-2.5 text-xs text-foreground transition-colors hover:bg-muted"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          从钩子开始加第一段
        </button>
      </div>
    );
  }

  return (
    <div data-slot="script-structure-editor" className="flex flex-col gap-2">
      <ol data-slot="script-structure-view" className="flex flex-col gap-2">
        {local.map((s, i) => (
          <SectionCard
            key={s.id}
            section={s}
            index={i}
            total={local.length}
            onUpdate={updateSection}
            onMove={moveSection}
            onRemove={removeSection}
            onInsertBelow={insertBelow}
          />
        ))}
      </ol>
      {/* 保存条:状态 + 保存(与 TipTap 状态栏同一套词表/语义)。 */}
      <div
        data-slot="script-structure-savebar"
        className="flex items-center gap-3 px-0.5 text-xs text-muted-foreground"
      >
        <span
          data-slot="structure-save-status"
          data-save-status={status}
          className={
            status === "saved"
              ? "text-success"
              : status === "saving"
                ? "text-warning"
                : "text-danger"
          }
        >
          {status === "saved"
            ? "已保存"
            : status === "saving"
              ? "保存中…"
              : "有未保存的修改"}
        </span>
        {nonEmpty.length === 0 ? (
          <span className="text-text-subtle">至少留一段有内容的段落才能保存</span>
        ) : null}
        <button
          type="button"
          data-slot="structure-save-button"
          onClick={() => void handleSave()}
          disabled={status !== "dirty" || nonEmpty.length === 0}
          className="ml-auto inline-flex h-7 items-center rounded-md border border-transparent bg-brand px-2.5 text-xs font-medium text-brand-foreground transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          保存
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 单段卡:徽章(select 换段型)+ 标题 input + 正文 textarea + 段操作
// ---------------------------------------------------------------------------

function SectionCard({
  section,
  index,
  total,
  onUpdate,
  onMove,
  onRemove,
  onInsertBelow,
}: {
  readonly section: EditableSection;
  readonly index: number;
  readonly total: number;
  readonly onUpdate: (index: number, patch: Partial<EditableSection>) => void;
  readonly onMove: (index: number, delta: -1 | 1) => void;
  readonly onRemove: (index: number) => void;
  readonly onInsertBelow: (index: number) => void;
}) {
  const t = TYPE_LABEL[section.type] ?? TYPE_LABEL.body;
  const time =
    section.startSeconds !== null && section.endSeconds !== null
      ? `${seconds(section.startSeconds)}–${seconds(section.endSeconds)}`
      : null;
  const emphasized = section.emphasis || section.type === "golden_quote";
  return (
    <li
      data-slot="script-structure-section"
      data-section-type={section.type}
      className={
        "group rounded-card border bg-surface px-4 py-3 " +
        (emphasized ? "border-brand/50" : "border-border")
      }
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-semibold text-text-subtle">
          {String(index + 1).padStart(2, "0")}
        </span>
        {/* 段型徽章 = 原生 select 蒙皮:点徽章直接换段型(概念图的内联徽章形态)。 */}
        <select
          data-slot="script-section-type"
          aria-label={`第 ${index + 1} 段段型`}
          value={section.type}
          onChange={(e) =>
            onUpdate(index, { type: e.target.value as SectionType })
          }
          className={`h-[22px] cursor-pointer appearance-none rounded-full border-0 px-2 pr-2 text-center text-[11px] font-medium outline-none ${t.cls}`}
        >
          {TYPE_ORDER.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABEL[type].label}
            </option>
          ))}
        </select>
        <input
          type="text"
          data-slot="script-section-heading"
          aria-label={`第 ${index + 1} 段标题`}
          value={section.heading}
          placeholder="段标题(选填)"
          onChange={(e) => onUpdate(index, { heading: e.target.value })}
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-text-subtle"
        />
        <span className="ml-auto shrink-0 text-[11px] text-text-subtle">
          {time ? `${time} · ` : ""}
          {section.body.length} 字
        </span>
        {/* 段操作:上移/下移/删除/在下方加段(hover 常显策略交给 opacity,键盘可达)。 */}
        <span className="flex shrink-0 items-center gap-0.5 opacity-40 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <SectionOpButton
            id="section-move-up"
            label="上移"
            icon={ArrowUp}
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
          />
          <SectionOpButton
            id="section-move-down"
            label="下移"
            icon={ArrowDown}
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
          />
          <SectionOpButton
            id="section-remove"
            label="删除本段"
            icon={Trash2}
            onClick={() => onRemove(index)}
          />
          <SectionOpButton
            id="section-insert-below"
            label="在下方加段"
            icon={Plus}
            onClick={() => onInsertBelow(index)}
          />
        </span>
      </div>
      <AutoGrowTextarea
        value={section.body}
        emphasized={emphasized}
        ariaLabel={`第 ${index + 1} 段正文`}
        onChange={(value) => onUpdate(index, { body: value })}
      />
    </li>
  );
}

function SectionOpButton({
  id,
  label,
  icon: Icon,
  disabled = false,
  onClick,
}: {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-slot="script-section-op"
      data-op-id={id}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </button>
  );
}

/** 正文 textarea:随内容自适应高(scrollHeight 回写),金句/强调段加粗渲染。 */
function AutoGrowTextarea({
  value,
  emphasized,
  ariaLabel,
  onChange,
}: {
  readonly value: string;
  readonly emphasized: boolean;
  readonly ariaLabel: string;
  readonly onChange: (value: string) => void;
}) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      data-slot="script-section-body"
      aria-label={ariaLabel}
      value={value}
      rows={2}
      placeholder="这一段说什么…"
      onChange={(e) => onChange(e.target.value)}
      className={
        "w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-text-subtle " +
        (emphasized ? "font-semibold" : "")
      }
    />
  );
}
