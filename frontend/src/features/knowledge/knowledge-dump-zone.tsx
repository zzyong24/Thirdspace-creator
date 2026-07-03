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
 *
 * [T-063d] 归类/落库/确认卡/手动补录内核抽到 ./knowledge-intake.tsx,与库页统一倾倒场
 * (features/library/library-dump-zone)共用;本组件只剩 /knowledge 独立页的壳与状态编排。
 * 库页(/library?tab=knowledge)内嵌形态下本组件不渲染(统一倾倒场接管,避免双倾倒场)。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  type Classification,
  type KnowledgeType,
  KnowledgeClassifyCard,
  KnowledgeManualForm,
  TEXT_FILE_RE,
  classifyKnowledgeText,
  createKnowledgeEntry,
  knowledgeButtonCls,
  knowledgeInputCls,
  readTextFile,
} from "./knowledge-intake";

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

  const reset = React.useCallback(() => {
    setContent("");
    setCard(null);
    setError(null);
    setManualOpen(false);
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
      setCard(await classifyKnowledgeText(text));
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
      await createKnowledgeEntry(title, card.knowledgeType, content.trim());
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
    async (title: string, knowledgeType: KnowledgeType) => {
      if (busy !== "idle") return;
      setBusy("saving");
      setError(null);
      try {
        await createKnowledgeEntry(title, knowledgeType, content.trim());
        reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "存入知识库失败,请重试。");
      } finally {
        setBusy("idle");
      }
    },
    [busy, content, reset, router],
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
          knowledgeInputCls,
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
          className={cn(
            knowledgeButtonCls,
            "bg-brand text-brand-foreground hover:bg-brand/90",
          )}
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
            knowledgeButtonCls,
            "border border-border bg-surface text-foreground hover:bg-surface-subtle",
          )}
        >
          手动补录
        </button>
      </div>

      {/* 确认门卡片:AI 判的归类候选,type/title 可改;人点「存入知识库」才落库。 */}
      {card ? (
        <KnowledgeClassifyCard
          card={card}
          busy={busy === "saving"}
          onChange={setCard}
          onSave={() => void handleSave()}
          onCancel={() => setCard(null)}
        />
      ) : null}

      {/* 手动补录次入口(旧「新建知识」表单退役至此):最小字段 title + type,正文用倾倒场输入。 */}
      {manualOpen ? (
        <KnowledgeManualForm
          busy={busy !== "idle"}
          onSave={(title, knowledgeType) => void handleManualSave(title, knowledgeType)}
        />
      ) : null}
    </section>
  );
}
