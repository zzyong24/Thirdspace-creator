"use client";

/**
 * 知识倾倒场(T-062c SPEC §4)—— /knowledge 录入重做,复用稿面弹药区(ammo-dump-zone)的
 * 「倒进去自动归类」交互骨架,但对象是**文本知识**而非文件素材:
 *
 *   粘贴文本/URL、拖入 .md/.txt(FileReader 读文本)→ 点「归类」→ POST /api/knowledge/classify
 *   (knowledge.classify AI 节点,capability 走 model-config)→ **确认门卡片**(AI 判的
 *   type/title/tags/summary,type/title 可改)→ 点「存入知识库」→ contract knowledge.create
 *   → router.refresh。
 *
 * 铁律与 [gate-F2]:
 *   - AI 只产候选,人点「存入知识库」才物化(确认门);
 *   - 分类失败 → **内联错误提示**(非 toast 即逝),原始输入保留供修改重试,或走「手动补录」
 *     (自己填 title/type 直接存),绝不静默兜底;
 *   - 旧「新建知识」独立表单退役,手动补录是倾倒场内的次入口(最小字段 title+正文)。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";

import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";

type KnowledgeType = "note" | "reference" | "inspiration" | "snippet" | "transcript";

interface Classification {
  knowledgeType: KnowledgeType;
  title: string;
  tags: string[];
  summary: string;
}

// 类型下拉选项 —— 5 枚举同 contract knowledge.create 的 body(中文名同筛选 chip)。
const TYPE_OPTIONS: ReadonlyArray<{ value: KnowledgeType; label: string }> = [
  { value: "note", label: "笔记" },
  { value: "reference", label: "参考" },
  { value: "inspiration", label: "灵感" },
  { value: "snippet", label: "片段" },
  { value: "transcript", label: "记录" },
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

const inputCls =
  "rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const buttonCls =
  "inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";

export function KnowledgeDumpZone() {
  const router = useRouter();
  const [content, setContent] = React.useState("");
  const [dragActive, setDragActive] = React.useState(false);
  const [busy, setBusy] = React.useState<"idle" | "classifying" | "saving">("idle");
  // 内联错误(分类/保存失败都落这;非 toast 即逝,原始输入保留 [gate-F2])。
  const [error, setError] = React.useState<string | null>(null);
  // 确认门卡片:AI 判的归类候选(type/title 可改)。null = 未归类。
  const [card, setCard] = React.useState<Classification | null>(null);
  // 手动补录次入口(最小字段 title + 正文;正文复用倾倒场输入框)。
  const [manualOpen, setManualOpen] = React.useState(false);
  const [manualTitle, setManualTitle] = React.useState("");
  const [manualType, setManualType] = React.useState<KnowledgeType>("note");

  const reset = React.useCallback(() => {
    setContent("");
    setCard(null);
    setError(null);
    setManualOpen(false);
    setManualTitle("");
    setManualType("note");
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

  // 「归类」→ POST /api/knowledge/classify → 确认门卡片。失败内联展示,输入保留。
  const handleClassify = React.useCallback(async () => {
    const text = content.trim();
    if (!text || busy !== "idle") return;
    setBusy("classifying");
    setError(null);
    try {
      const res = await fetch("/api/knowledge/classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const json = (await res.json().catch(() => null)) as
        | { classification?: Classification; error?: string }
        | null;
      if (!res.ok || !json?.classification) {
        throw new Error(json?.error || `归类失败(HTTP ${res.status})`);
      }
      setCard(json.classification);
    } catch (err) {
      setError(err instanceof Error ? err.message : "归类失败,请重试或手动补录。");
    } finally {
      setBusy("idle");
    }
  }, [content, busy]);

  // 确认门「存入知识库」→ knowledge.create(人采纳才物化)→ refresh。
  const handleSave = React.useCallback(async () => {
    if (!card || busy !== "idle") return;
    const title = card.title.trim();
    if (!title) return;
    setBusy("saving");
    setError(null);
    try {
      await client.createKnowledge({
        params: undefined,
        query: undefined,
        body: { title, knowledgeType: card.knowledgeType, content: content.trim() },
      });
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "存入知识库失败,请重试。");
    } finally {
      setBusy("idle");
    }
  }, [card, busy, content, reset, router]);

  // 手动补录(分类失败/不想走 AI 的兜底次入口):title + type + 正文直接存。
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
        把笔记、金句、逐字稿、参考链接整段倒进来 —— AI 自动归类,确认后进知识库
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

      {/* 内联错误(非 toast):分类/保存失败都落这,输入保留供重试或手动补录 [gate-F2]。 */}
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
          data-slot="knowledge-classify"
          disabled={busy !== "idle" || content.trim().length === 0}
          onClick={() => void handleClassify()}
          className={cn(buttonCls, "bg-brand text-brand-foreground hover:bg-brand/90")}
        >
          {busy === "classifying" ? "归类中…" : "归类"}
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

      {/* 确认门卡片:AI 判的归类候选,type/title 可改;人点「存入知识库」才落库。 */}
      {card ? (
        <div
          data-slot="knowledge-classify-card"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2.5"
        >
          <p className="text-[11px] text-muted-foreground">
            AI 归类结果(类型/标题可改,确认后存入知识库)
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="knowledge-classify-type">
              类型
            </label>
            <select
              id="knowledge-classify-type"
              data-slot="knowledge-classify-type"
              value={card.knowledgeType}
              onChange={(e) =>
                setCard({ ...card, knowledgeType: e.target.value as KnowledgeType })
              }
              className="h-8 rounded-md border border-border bg-surface px-2 text-[13px] text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="knowledge-classify-title">
              标题
            </label>
            <input
              id="knowledge-classify-title"
              data-slot="knowledge-classify-title"
              type="text"
              value={card.title}
              onChange={(e) => setCard({ ...card, title: e.target.value })}
              className={cn(inputCls, "h-8 min-w-0 flex-1 py-0")}
            />
          </div>
          {card.summary ? (
            <p
              data-slot="knowledge-classify-summary"
              className="text-[12px] text-muted-foreground"
            >
              {card.summary}
            </p>
          ) : null}
          {card.tags.length > 0 ? (
            <div data-slot="knowledge-classify-tags" className="flex flex-wrap gap-1">
              {card.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-slot="knowledge-classify-save"
              disabled={busy !== "idle" || card.title.trim().length === 0}
              onClick={() => void handleSave()}
              className={cn(buttonCls, "bg-brand text-brand-foreground hover:bg-brand/90")}
            >
              {busy === "saving" ? "存入中…" : "存入知识库"}
            </button>
            <button
              type="button"
              data-slot="knowledge-classify-cancel"
              disabled={busy !== "idle"}
              onClick={() => setCard(null)}
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
            onChange={(e) => setManualType(e.target.value as KnowledgeType)}
            className="h-8 rounded-md border border-border bg-surface px-2 text-[13px] text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {TYPE_OPTIONS.map((opt) => (
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
