"use client";

/**
 * 知识倾倒场(T-062c 骨架 → T-079b 蒸馏管线 → T-094 蒸馏入口 Copilot 化)—— /knowledge 录入内核。
 *
 * T-094 变更(用户裁决:蒸馏走 Copilot 对话,不用传统输入框):
 *   - 「蒸馏」入口改为**深链打开 Copilot**(?copilot=open&surface=knowledge-distill&
 *     scope=surface:knowledge-distill,T-096 预留的隔离桶):对话里粘原文 → knowledge.distill
 *     工具 → 蒸馏批量确认门卡(共享 KnowledgeAtomGate)勾选采纳。输入区已有内容且不长时,
 *     深链 prefill 直接带上原文(打开即回车可蒸);太长则带引导话术,用户在对话里粘。
 *   - 旧表单蒸馏流(POST /api/knowledge/distill + 内联确认门)**移除** —— 确认门已抽成共享
 *     组件(knowledge-atom-gate)由对话卡完整复用,倾倒场不再养第二条重复管线;
 *     /api/knowledge/distill 路由保留(错误已人话化)。
 *   - 「手动补录」保留为**降级路径**(不想走 AI / AI 不可用时:title + type + 正文直接存)。
 *
 * 铁律:AI 只产候选,人在确认门采纳才物化(现在这道门在对话卡上);错误内联、不静默 [gate-F2]。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Inbox, Sparkles } from "lucide-react";

import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";
import { KNOWLEDGE_DISTILL_SCOPE } from "@/features/copilot/chat-scope";
import { type AtomType } from "./knowledge-atom-gate";

// 兼容既有 import 面:确认门与两个纯函数已抽到 knowledge-atom-gate(T-094),原路径再导出。
export { archiveTitleOf, assignKnowledgeTagsBestEffort } from "./knowledge-atom-gate";

// 手动补录 type 下拉 = 四原子 + reference(参考/存档)。旧五枚举录入侧退役(存量兼容仍在契约)。
type ManualType = AtomType | "reference";
const MANUAL_TYPE_OPTIONS: ReadonlyArray<{ value: ManualType; label: string }> = [
  { value: "claim", label: "观点" },
  { value: "evidence", label: "证据" },
  { value: "quote", label: "金句" },
  { value: "qa", label: "观众问题" },
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

// [T-094] 深链 prefill 能带的原文上限(URL 承载;超限改带引导话术,用户在对话里粘全文)。
export const DISTILL_PREFILL_MAX_CHARS = 1500;

/** 蒸馏对话的引导话术(输入区为空/原文过长时的 prefill)。 */
export const DISTILL_GUIDE_PREFILL =
  "我有一段材料要蒸馏进知识库,下面整段粘给你,请提炼成知识原子:";

/**
 * [T-094] 构造蒸馏 Copilot 深链(纯函数,可单测):
 *   - 输入区有内容且 ≤1500 字 → prefill 直接带原文(打开即回车可蒸);
 *   - 为空或过长 → prefill 带引导话术(用户在对话里粘全文)。
 * scope 显式钉死 surface:knowledge-distill(T-096 预留隔离桶,蒸馏历史与其它入口互不可见)。
 */
export function distillCopilotHref(content: string): string {
  const text = content.trim();
  const prefill =
    text && text.length <= DISTILL_PREFILL_MAX_CHARS ? text : DISTILL_GUIDE_PREFILL;
  return copilotDeepLink(
    "knowledge-distill",
    undefined,
    undefined,
    prefill,
    KNOWLEDGE_DISTILL_SCOPE,
  );
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
  const [busy, setBusy] = React.useState<"idle" | "saving">("idle");
  // 内联错误(手动补录/读文件失败落这;非 toast 即逝,原始输入保留 [gate-F2])。
  const [error, setError] = React.useState<string | null>(null);
  // 手动补录降级入口(最小字段 title + 正文;正文复用倾倒场输入框)。
  const [manualOpen, setManualOpen] = React.useState(false);
  const [manualTitle, setManualTitle] = React.useState("");
  const [manualType, setManualType] = React.useState<ManualType>("claim");

  const reset = React.useCallback(() => {
    setContent("");
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

  // [T-094] 「AI 蒸馏」→ 深链打开 Copilot(knowledge-distill 隔离桶):原文短则 prefill 带上,
  // 长则带引导话术在对话里粘。query-only href 用 router.push 就地开浮层(不跳页,bug #3 语义)。
  const handleDistill = React.useCallback(() => {
    router.push(distillCopilotHref(content));
  }, [router, content]);

  // 手动补录(不想走 AI / AI 不可用的降级路径):title + type + 正文直接存。
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
        把笔记、金句、逐字稿整段交给 AI 蒸馏成知识原子 —— 点「AI 蒸馏」在对话里粘原文,采纳后进知识库
      </div>
      <textarea
        data-slot="knowledge-dump-input"
        aria-label="倒入文本、URL,或拖入 .md/.txt 文件"
        placeholder="粘贴文本 / URL,或把 .md / .txt 文件拖进来…(点「AI 蒸馏」带着它开聊,或走「手动补录」直接存)"
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

      {/* 内联错误(非 toast):读文件/手动补录失败落这,输入保留供重试 [gate-F2]。 */}
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
          disabled={busy !== "idle"}
          onClick={handleDistill}
          className={cn(buttonCls, "gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90")}
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          AI 蒸馏(打开对话)
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

      {/* 手动补录降级入口:最小字段 title + type,正文用倾倒场输入。 */}
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
