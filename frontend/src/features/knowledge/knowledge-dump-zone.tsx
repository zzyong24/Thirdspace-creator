"use client";

/**
 * 知识倾倒场(T-062c 骨架 → T-079b 蒸馏管线升级)—— /knowledge 录入内核:
 *
 *   粘贴文本/URL、拖入 .md/.txt(FileReader 读文本)→ 点「蒸馏」→ POST /api/knowledge/distill
 *   (knowledge.distill AI 节点,capability 走 model-config)→ **蒸馏批量确认门**:一批知识
 *   原子行卡(每条 checkbox 默认全选 + type 四原子下拉 + title 可编辑 + sourceNote 可改)→
 *   点「采纳选中 N 条」→ 逐条 contract knowledge.create(title/knowledgeType/content=note/
 *   sourceNote)+ suggestedTags 挂 tag(taxonomy assignTags,best-effort)→ router.refresh。
 *
 * T-079b 变更(SPEC §2):
 *   - 知识流「归类单卡」退役,由蒸馏批量确认门全面替代(classify 模板/runner/路由保留供他用);
 *   - 「原文同时存档」checkbox 默认勾选 → 采纳时多存一条 type=reference(title=原文首行
 *     ≤60 字,content=全文),出处存档不丢;
 *   - 手动补录 type 下拉换四原子 + reference。
 *
 * 铁律与 [gate-F2]:
 *   - AI 只产候选,人点「采纳选中 N 条」才物化(确认门);
 *   - 蒸馏失败 → **内联错误提示**(非 toast 即逝),原始输入保留供修改重试,或走「手动补录」
 *     (自己填 title/type 直接存),绝不静默兜底;
 *   - tag 挂载是增强:失败不阻断原子入库(与弹药区 assignTagsBestEffort 同款取舍)。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";

import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";

// 四原子(T-079a 契约新增)—— 录入侧主动产的类型;reference 保留给原文存档/外部参考。
type AtomType = "claim" | "evidence" | "quote" | "qa";
type ManualType = AtomType | "reference";

/** 蒸馏路由返回的单个原子(/api/knowledge/distill)。 */
interface DistilledAtom {
  type: AtomType;
  title: string;
  note: string;
  sourceNote: string;
}

/** 确认门里的一行原子(候选 + 勾选态;type/title/sourceNote 可改)。 */
interface AtomRow extends DistilledAtom {
  selected: boolean;
}

// 四原子中文词表(确认门 type 下拉;同 §3 知识卡徽章语义)。
const ATOM_TYPE_OPTIONS: ReadonlyArray<{ value: AtomType; label: string }> = [
  { value: "claim", label: "观点" },
  { value: "evidence", label: "证据" },
  { value: "quote", label: "金句" },
  { value: "qa", label: "观众问题" },
];

// 手动补录 type 下拉 = 四原子 + reference(参考/存档)。旧五枚举录入侧退役(存量兼容仍在契约)。
const MANUAL_TYPE_OPTIONS: ReadonlyArray<{ value: ManualType; label: string }> = [
  ...ATOM_TYPE_OPTIONS,
  { value: "reference", label: "参考" },
];

// 可读入的文本文件后缀(SPEC §4:拖入 .md/.txt)。
const TEXT_FILE_RE = /\.(md|txt|markdown)$/i;

/** FileReader 读文本文件(Promise 包装;单测 jsdom 原生支持)。 */
function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("读文件失败"));
    reader.readAsText(file);
  });
}

/** 原文存档标题:首个非空行截 60 字(SPEC §2:title=原文标题或首行)。 */
export function archiveTitleOf(raw: string): string {
  const firstLine =
    raw
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  return firstLine.slice(0, 60);
}

/**
 * 把 suggestedTags 挂到知识条目(现有 taxonomy 路径:listTags 找同名 → 缺的 createTag →
 * assignTags entityType=knowledge)。与弹药区 assignTagsBestEffort 同款 best-effort 取舍:
 * 标签是增强,失败不阻断入库(原子已物化,tag 丢了可后补)。
 */
export async function assignKnowledgeTagsBestEffort(
  knowledgeId: string,
  tagNames: readonly string[],
): Promise<void> {
  if (tagNames.length === 0) return;
  try {
    const listed = (await client.listTags({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string; name: string }>;
    const byName = new Map(
      (Array.isArray(listed) ? listed : []).map((t) => [t.name, t.id]),
    );
    const tagIds: string[] = [];
    for (const name of tagNames) {
      const hit = byName.get(name);
      if (hit) {
        tagIds.push(hit);
        continue;
      }
      const created = (await client.createTag({
        params: undefined,
        query: undefined,
        body: { name, kind: "knowledge-topic" },
      })) as unknown as { id: string };
      tagIds.push(created.id);
    }
    await client.assignTags({
      params: undefined,
      query: undefined,
      body: { entityType: "knowledge", entityId: knowledgeId, tagIds },
    });
  } catch {
    /* 标签是增强,失败不阻断入库 */
  }
}

const inputCls =
  "rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const buttonCls =
  "inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";
const selectCls =
  "h-8 rounded-md border border-border bg-surface px-2 text-[13px] text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export function KnowledgeDumpZone() {
  const router = useRouter();
  const [content, setContent] = React.useState("");
  const [dragActive, setDragActive] = React.useState(false);
  const [busy, setBusy] = React.useState<"idle" | "distilling" | "saving">("idle");
  // 内联错误(蒸馏/采纳失败都落这;非 toast 即逝,原始输入保留 [gate-F2])。
  const [error, setError] = React.useState<string | null>(null);
  // 蒸馏批量确认门:AI 产的原子候选行(勾选/type/title/sourceNote 可改)。null = 未蒸馏。
  const [atoms, setAtoms] = React.useState<AtomRow[] | null>(null);
  const [suggestedTags, setSuggestedTags] = React.useState<string[]>([]);
  // 「原文同时存档」开关(默认勾选)→ 采纳时多存一条 type=reference 的全文存档。
  const [archiveOriginal, setArchiveOriginal] = React.useState(true);
  // 手动补录次入口(最小字段 title + 正文;正文复用倾倒场输入框)。
  const [manualOpen, setManualOpen] = React.useState(false);
  const [manualTitle, setManualTitle] = React.useState("");
  const [manualType, setManualType] = React.useState<ManualType>("claim");

  const reset = React.useCallback(() => {
    setContent("");
    setAtoms(null);
    setSuggestedTags([]);
    setArchiveOriginal(true);
    setError(null);
    setManualOpen(false);
    setManualTitle("");
    setManualType("claim");
  }, []);

  // 拖入 .md/.txt → 读文本追加进输入区(非文本文件内联提示,不静默吞)。
  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLTextAreaElement>) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0) return; // 纯文本拖拽走原生行为
      event.preventDefault();
      setDragActive(false);
      void (async () => {
        const readable = files.filter((f) => TEXT_FILE_RE.test(f.name));
        if (readable.length === 0) {
          setError("只支持拖入 .md / .txt 文本文件;其他素材请去项目弹药区上传。");
          return;
        }
        try {
          const texts = await Promise.all(readable.map(readTextFile));
          setContent((prev) =>
            [prev.trim(), ...texts.map((t) => t.trim())].filter(Boolean).join("\n\n"),
          );
          setError(null);
        } catch {
          setError("读取文件失败,请重试或直接粘贴文本。");
        }
      })();
    },
    [],
  );

  // 「蒸馏」→ POST /api/knowledge/distill → 批量确认门。失败内联展示,输入保留 [gate-F2]。
  const handleDistill = React.useCallback(async () => {
    const text = content.trim();
    if (!text || busy !== "idle") return;
    setBusy("distilling");
    setError(null);
    try {
      const res = await fetch("/api/knowledge/distill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const json = (await res.json().catch(() => null)) as
        | { atoms?: DistilledAtom[]; suggestedTags?: string[]; error?: string }
        | null;
      if (!res.ok || !Array.isArray(json?.atoms) || json.atoms.length === 0) {
        throw new Error(json?.error || `蒸馏失败(HTTP ${res.status})`);
      }
      // 默认全选(SPEC §2:每条 checkbox 默认勾上,人只做减法与微调)。
      setAtoms(json.atoms.map((a) => ({ ...a, selected: true })));
      setSuggestedTags(Array.isArray(json.suggestedTags) ? json.suggestedTags : []);
      setArchiveOriginal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "蒸馏失败,请重试或手动补录。");
    } finally {
      setBusy("idle");
    }
  }, [content, busy]);

  /** 就地改一行原子(勾选/type/title/sourceNote)。 */
  const patchAtom = React.useCallback((index: number, patch: Partial<AtomRow>) => {
    setAtoms((prev) =>
      prev ? prev.map((a, i) => (i === index ? { ...a, ...patch } : a)) : prev,
    );
  }, []);

  const selectedCount = (atoms ?? []).filter(
    (a) => a.selected && a.title.trim().length > 0,
  ).length;

  // 确认门「采纳选中 N 条」→ 逐条 knowledge.create + tags 挂载(+ 可选原文 reference 存档)。
  const handleAdopt = React.useCallback(async () => {
    if (!atoms || busy !== "idle") return;
    const picked = atoms.filter((a) => a.selected && a.title.trim().length > 0);
    if (picked.length === 0) return;
    setBusy("saving");
    setError(null);
    try {
      const fullText = content.trim();
      for (const atom of picked) {
        const created = (await client.createKnowledge({
          params: undefined,
          query: undefined,
          body: {
            title: atom.title.trim(),
            knowledgeType: atom.type,
            // 原子本体在 title;note 是评注/上下文,落 content(可空)。
            content: atom.note.trim(),
            ...(atom.sourceNote.trim()
              ? { sourceNote: atom.sourceNote.trim() }
              : {}),
          },
        })) as unknown as { id: string };
        // AI 馆长(轻):suggestedTags 即主题挂载(best-effort,失败不阻断)。
        await assignKnowledgeTagsBestEffort(created.id, suggestedTags);
      }
      // 「原文同时存档」:多存一条 reference(title=首行≤60 字,content=全文),出处不丢。
      if (archiveOriginal && fullText) {
        await client.createKnowledge({
          params: undefined,
          query: undefined,
          body: {
            title: archiveTitleOf(fullText) || "原文存档",
            knowledgeType: "reference",
            content: fullText,
          },
        });
      }
      reset();
      router.refresh();
    } catch (err) {
      // 失败内联保留输入(已成条目不回滚 —— 诚实呈现,refresh 后可见已入库的部分)。
      setError(err instanceof Error ? err.message : "采纳入库失败,请重试。");
    } finally {
      setBusy("idle");
    }
  }, [atoms, busy, content, suggestedTags, archiveOriginal, reset, router]);

  // 手动补录(蒸馏失败/不想走 AI 的兜底次入口):title + type + 正文直接存。
  const handleManualSave = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const title = manualTitle.trim();
      if (!title || busy !== "idle") return;
      setBusy("saving");
      setError(null);
      try {
        await client.createKnowledge({
          params: undefined,
          query: undefined,
          body: { title, knowledgeType: manualType, content: content.trim() },
        });
        reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "存入知识库失败,请重试。");
      } finally {
        setBusy("idle");
      }
    },
    [manualTitle, manualType, busy, content, reset, router],
  );

  return (
    <section
      data-slot="knowledge-dump-zone"
      aria-label="知识倾倒场"
      className="flex flex-col gap-2 rounded-card border border-dashed border-border bg-surface-subtle/50 p-3"
    >
      <div className="flex items-center gap-2 text-xs text-text-subtle">
        <Inbox className="size-4 shrink-0" aria-hidden="true" />
        把笔记、金句、逐字稿、参考链接整段倒进来 —— AI 蒸馏成知识原子,采纳后进知识库
      </div>
      <textarea
        data-slot="knowledge-dump-input"
        aria-label="倒入文本、URL,或拖入 .md/.txt 文件"
        placeholder="粘贴文本 / URL,或把 .md / .txt 文件拖进来…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onDragOver={(e) => {
          if ((e.dataTransfer?.types ?? []).includes("Files")) {
            e.preventDefault();
            setDragActive(true);
          }
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        rows={4}
        data-drag-active={dragActive ? "true" : "false"}
        className={cn(
          inputCls,
          "min-h-24 resize-y",
          dragActive && "border-brand bg-brand-soft/30",
        )}
      />

      {/* 内联错误(非 toast):蒸馏/采纳失败都落这,输入保留供重试或手动补录 [gate-F2]。 */}
      {error ? (
        <p
          data-slot="knowledge-dump-error"
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[12px] text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-slot="knowledge-distill"
          disabled={busy !== "idle" || content.trim().length === 0}
          onClick={() => void handleDistill()}
          className={cn(buttonCls, "bg-brand text-brand-foreground hover:bg-brand/90")}
        >
          {busy === "distilling" ? "蒸馏中…" : "蒸馏"}
        </button>
        <button
          type="button"
          data-slot="knowledge-manual-entry"
          aria-expanded={manualOpen}
          disabled={busy !== "idle"}
          onClick={() => setManualOpen((prev) => !prev)}
          className={cn(
            buttonCls,
            "border border-border bg-surface text-foreground hover:bg-surface-subtle",
          )}
        >
          手动补录
        </button>
      </div>

      {/* 蒸馏批量确认门:原子候选行卡,勾选/type/title/sourceNote 可改;人点「采纳」才落库。 */}
      {atoms ? (
        <div
          data-slot="knowledge-distill-batch"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2.5"
        >
          <p className="text-[11px] text-muted-foreground">
            蒸馏出 {atoms.length} 个知识原子(勾选要留的,类型/标题/出处可改;采纳后进知识库)
          </p>
          <ul className="flex flex-col gap-2">
            {atoms.map((atom, index) => (
              <li
                key={index}
                data-slot="knowledge-atom-row"
                className="flex flex-col gap-1.5 rounded-md border border-border/70 bg-surface-subtle/40 p-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    data-slot="knowledge-atom-select"
                    aria-label={`采纳第 ${index + 1} 条`}
                    checked={atom.selected}
                    onChange={(e) => patchAtom(index, { selected: e.target.checked })}
                    className="size-4 accent-brand"
                  />
                  <label className="sr-only" htmlFor={`knowledge-atom-type-${index}`}>
                    类型
                  </label>
                  <select
                    id={`knowledge-atom-type-${index}`}
                    data-slot="knowledge-atom-type"
                    value={atom.type}
                    onChange={(e) =>
                      patchAtom(index, { type: e.target.value as AtomType })
                    }
                    className={selectCls}
                  >
                    {ATOM_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor={`knowledge-atom-title-${index}`}>
                    标题
                  </label>
                  <input
                    id={`knowledge-atom-title-${index}`}
                    data-slot="knowledge-atom-title"
                    type="text"
                    value={atom.title}
                    onChange={(e) => patchAtom(index, { title: e.target.value })}
                    className={cn(inputCls, "h-8 min-w-0 flex-1 py-0")}
                  />
                </div>
                {atom.note ? (
                  <p
                    data-slot="knowledge-atom-note"
                    className="pl-6 text-[12px] text-muted-foreground"
                  >
                    {atom.note}
                  </p>
                ) : null}
                <div className="flex items-center gap-2 pl-6">
                  <label
                    className="shrink-0 text-[11px] text-muted-foreground"
                    htmlFor={`knowledge-atom-source-${index}`}
                  >
                    出处
                  </label>
                  <input
                    id={`knowledge-atom-source-${index}`}
                    data-slot="knowledge-atom-source"
                    type="text"
                    placeholder="出处/可信度(可空)"
                    value={atom.sourceNote}
                    onChange={(e) => patchAtom(index, { sourceNote: e.target.value })}
                    className={cn(inputCls, "h-7 min-w-0 flex-1 py-0 text-[12px]")}
                  />
                </div>
              </li>
            ))}
          </ul>
          {suggestedTags.length > 0 ? (
            <div data-slot="knowledge-distill-tags" className="flex flex-wrap gap-1">
              {suggestedTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              data-slot="knowledge-distill-archive"
              checked={archiveOriginal}
              onChange={(e) => setArchiveOriginal(e.target.checked)}
              className="size-4 accent-brand"
            />
            原文同时存档(存一条「参考」,标题取首行)
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-slot="knowledge-distill-adopt"
              disabled={busy !== "idle" || selectedCount === 0}
              onClick={() => void handleAdopt()}
              className={cn(buttonCls, "bg-brand text-brand-foreground hover:bg-brand/90")}
            >
              {busy === "saving" ? "入库中…" : `采纳选中 ${selectedCount} 条`}
            </button>
            <button
              type="button"
              data-slot="knowledge-distill-cancel"
              disabled={busy !== "idle"}
              onClick={() => setAtoms(null)}
              className={cn(
                buttonCls,
                "border border-border bg-surface text-foreground hover:bg-surface-subtle",
              )}
            >
              返回修改
            </button>
          </div>
        </div>
      ) : null}

      {/* 手动补录次入口(旧「新建知识」表单退役至此):最小字段 title + type,正文用倾倒场输入。 */}
      {manualOpen ? (
        <form
          data-slot="knowledge-manual-form"
          onSubmit={(e) => void handleManualSave(e)}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2.5"
        >
          <label className="sr-only" htmlFor="knowledge-manual-title">
            标题
          </label>
          <input
            id="knowledge-manual-title"
            data-slot="knowledge-manual-title"
            type="text"
            placeholder="标题(正文用上面的输入框)"
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            className={cn(inputCls, "h-8 min-w-0 flex-1 py-0")}
          />
          <label className="sr-only" htmlFor="knowledge-manual-type">
            类型
          </label>
          <select
            id="knowledge-manual-type"
            data-slot="knowledge-manual-type"
            value={manualType}
            onChange={(e) => setManualType(e.target.value as ManualType)}
            className={selectCls}
          >
            {MANUAL_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            data-slot="knowledge-manual-save"
            disabled={busy !== "idle" || manualTitle.trim().length === 0}
            className={cn(buttonCls, "bg-brand text-brand-foreground hover:bg-brand/90")}
          >
            直接存入
          </button>
        </form>
      ) : null}
    </section>
  );
}
