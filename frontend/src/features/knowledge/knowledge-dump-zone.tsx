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
import {
  TaskObservationNotice,
  useTaskObservation,
} from "@/components/ai/task-observation";
import { openCopilotLocally } from "@/lib/copilot-navigation";
import { useRouter } from "next/navigation";
import {
  CircleCheck,
  CircleX,
  FileUp,
  Inbox,
  LoaderCircle,
  Sparkles,
} from "lucide-react";

import { describeUserError } from "@/lib/ai-error-humanize";
import { createAiTaskAttemptId } from "@/lib/ai-task-attempt";
import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";
import { KNOWLEDGE_DISTILL_SCOPE } from "@/features/copilot/chat-scope";
import { ExperienceCaptureLink } from "@/features/experience/experience-interactive-region";
import { type AtomType } from "./knowledge-atom-gate";

// 兼容既有 import 面:确认门与两个纯函数已抽到 knowledge-atom-gate(T-094),原路径再导出。
export {
  archiveTitleOf,
  assignKnowledgeTagsBestEffort,
} from "./knowledge-atom-gate";

// 手动补录 type 下拉 = 四原子 + reference(参考/存档)。旧五枚举录入侧退役(存量兼容仍在契约)。
type ManualType = AtomType | "reference";
const MANUAL_TYPE_OPTIONS: ReadonlyArray<{ value: ManualType; label: string }> =
  [
    { value: "claim", label: "观点" },
    { value: "evidence", label: "证据" },
    { value: "quote", label: "金句" },
    { value: "qa", label: "观众问题" },
    { value: "reference", label: "参考" },
  ];

// 文本文件可本地直读；其他文档复用现有上传 + 正文提取链。
const TEXT_FILE_RE = /\.(md|txt|markdown)$/i;
const SUPPORTED_DOCUMENT_RE = /\.(pdf|docx|md|markdown|txt)$/i;
const DOCUMENT_EXTRACT_POLL_MS = 500;
const DOCUMENT_EXTRACT_MAX_POLLS = 240;

interface ImportFailure {
  readonly fileName: string;
  readonly message: string;
}

interface ImportDialogState {
  readonly files: ReadonlyArray<File>;
  readonly phase: "confirm" | "running" | "done";
  readonly completed: number;
  readonly succeeded: number;
  readonly failures: ReadonlyArray<ImportFailure>;
  readonly currentFileName: string | null;
}

/** FileReader 读文本文件(Promise 包装;单测 jsdom 原生支持)。 */
function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("读文件失败"));
    reader.readAsText(file);
  });
}

async function waitForExtractedText(
  assetId: string,
  taskId: string,
  pause: () => Promise<boolean>,
  isAlive: () => boolean,
  reader: typeof client = client,
): Promise<string | null> {
  for (let attempt = 0; ; attempt += 1) {
    if (!isAlive()) return null;
    if (
      attempt > 0 &&
      attempt % DOCUMENT_EXTRACT_MAX_POLLS === 0 &&
      !(await pause())
    )
      return null;
    const asset = (await reader.getAsset({
      params: { assetId },
      query: undefined,
      body: undefined,
    })) as unknown as {
      extractStatus?: string | null;
      extractedText?: string | null;
    };
    if (!isAlive()) return null;
    const text = asset.extractedText?.trim() ?? "";
    if (asset.extractStatus === "done" && text.length > 0) return text;
    if (asset.extractStatus === "unsupported") {
      throw new Error(
        "暂不支持解析这个文件格式；原文件已保存在素材库，未加入知识库。",
      );
    }
    if (asset.extractStatus === "failed") {
      throw new Error(
        "没有读到可用正文（可能是扫描件、加密或损坏文件）；原文件已保存在素材库，未加入知识库。",
      );
    }

    const task = (await reader.getTask({
      params: { taskId },
      query: undefined,
      body: undefined,
    })) as unknown as {
      status?: string;
      errorMessage?: string | null;
    };
    if (!isAlive()) return null;
    if (task.status === "failed" || task.status === "cancelled") {
      throw new Error(
        task.errorMessage?.trim() ||
          "正文解析没有完成；原文件已保存在素材库，未加入知识库。",
      );
    }
    await new Promise((resolve) =>
      window.setTimeout(resolve, DOCUMENT_EXTRACT_POLL_MS),
    );
  }
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
    text && text.length <= DISTILL_PREFILL_MAX_CHARS
      ? text
      : DISTILL_GUIDE_PREFILL;
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

export function KnowledgeDumpZone({
  importOnly = false,
  folderId = null,
  onSaved,
  onBusyChange,
  contractClient = client,
  disabled = false,
}: {
  contractClient?: typeof client;
  disabled?: boolean;
  importOnly?: boolean;
  folderId?: string | null;
  onSaved?: (id?: string) => void;
  onBusyChange?: (busy: boolean) => boolean | void;
} = {}) {
  const api = contractClient;
  const router = useRouter();
  const observation = useTaskObservation();
  const aliveRef = React.useRef(true);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const [content, setContent] = React.useState("");
  const [dragActive, setDragActive] = React.useState(false);
  const [busy, setBusy] = React.useState<"idle" | "saving" | "uploading">(
    "idle",
  );
  // 内联错误(手动补录/读文件失败落这;非 toast 即逝,原始输入保留 [gate-F2])。
  const importLock = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  // 手动补录降级入口(最小字段 title + 正文;正文复用倾倒场输入框)。
  const [manualOpen, setManualOpen] = React.useState(false);
  const [manualTitle, setManualTitle] = React.useState("");
  const [manualType, setManualType] = React.useState<ManualType>("claim");
  const [importDialog, setImportDialog] =
    React.useState<ImportDialogState | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const queueDocumentFiles = React.useCallback(
    (files: ReadonlyArray<File>) => {
      if (disabled || busy !== "idle") return;
      const supported = files.filter((file) =>
        SUPPORTED_DOCUMENT_RE.test(file.name),
      );
      const rejected = files.filter(
        (file) => !SUPPORTED_DOCUMENT_RE.test(file.name),
      );
      setDragActive(false);
      if (supported.length === 0) {
        setError("可导入 PDF、DOCX、Markdown 或 TXT 文件。");
        return;
      }
      setError(
        rejected.length > 0
          ? `已选中 ${supported.length} 个可导入文件；${rejected.length} 个不支持的文件已跳过。`
          : null,
      );
      setImportDialog({
        files: supported,
        phase: "confirm",
        completed: 0,
        succeeded: 0,
        failures: [],
        currentFileName: null,
      });
    },
    [disabled, busy],
  );

  const reset = React.useCallback(() => {
    setContent("");
    setError(null);
    setManualOpen(false);
    setManualTitle("");
    setManualType("claim");
  }, []);

  // [T-094] 「AI 蒸馏」→ 深链打开 Copilot(knowledge-distill 隔离桶):原文短则 prefill 带上,
  // 长则带引导话术在对话里粘。query-only href 使用本地历史就地开浮层(不跳页,bug #3 语义)。
  const handleDistill = React.useCallback(() => {
    const href = distillCopilotHref(content);
    if (!openCopilotLocally(href)) router.push(href);
  }, [router, content]);

  // 手动补录(不想走 AI / AI 不可用的降级路径):title + type + 正文直接存。
  const handleManualSave = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const title = manualTitle.trim();
      if (!title || disabled || busy !== "idle") return;
      setBusy("saving");
      setError(null);
      try {
        await api.createKnowledge({
          params: undefined,
          query: undefined,
          body: {
            title,
            knowledgeType: manualType,
            content,
            ...(folderId ? { folderId } : {}),
          },
        });
        if (!aliveRef.current) return;
        reset();
        onSaved?.();
        router.refresh();
      } catch (err) {
        if (!aliveRef.current) return;
        setError(describeUserError(err, "存入知识库失败，请重试。"));
      } finally {
        if (aliveRef.current) setBusy("idle");
      }
    },
    [
      manualTitle,
      manualType,
      busy,
      content,
      reset,
      router,
      folderId,
      onSaved,
      disabled,
      api,
    ],
  );

  const handleDocumentFiles = React.useCallback(
    async (files: ReadonlyArray<File>) => {
      if (
        files.length === 0 ||
        disabled ||
        busy !== "idle" ||
        importLock.current
      )
        return;
      if (onBusyChange?.(true) === false) return;
      importLock.current = true;
      setBusy("uploading");
      setError(null);
      let succeeded = 0;
      const failures: ImportFailure[] = [];
      setImportDialog({
        files,
        phase: "running",
        completed: 0,
        succeeded: 0,
        failures: [],
        currentFileName: files[0]?.name ?? null,
      });
      for (const [index, file] of files.entries()) {
        if (!aliveRef.current) return;
        setImportDialog((current) =>
          current
            ? {
                ...current,
                currentFileName: file.name,
                completed: index,
                succeeded,
                failures: [...failures],
              }
            : current,
        );
        try {
          if (file.size > 20 * 1024 * 1024) {
            throw new Error(`「${file.name}」超过 20MB 上限，请拆分后再传。`);
          }
          const mimeType = file.type || "application/octet-stream";
          const upload = (await api.createUpload({
            params: undefined,
            query: undefined,
            body: {
              assetType: "document",
              mimeType,
              fileSize: Math.max(1, file.size),
              fileName: file.name,
            },
          })) as unknown as {
            uploadId: string;
            assetId: string;
            uploadUrl: string;
          };
          if (!upload.uploadUrl.startsWith("mock://")) {
            const put = await fetch(upload.uploadUrl, {
              method: "PUT",
              headers: { "content-type": mimeType },
              body: file,
            });
            if (!put.ok)
              throw new Error(`上传「${file.name}」失败(${put.status})。`);
          }
          const asset = (await api.completeUpload({
            params: { uploadId: upload.uploadId },
            query: undefined,
            body: { name: file.name },
          })) as unknown as { id: string };
          const assetId = asset.id || upload.assetId;
          let extractedContent: string;
          if (TEXT_FILE_RE.test(file.name)) {
            extractedContent = await readTextFile(file);
            if (!extractedContent.trim()) {
              throw new Error(
                `「${file.name}」没有可导入的正文；原文件已保存在素材库，未加入知识库。`,
              );
            }
          } else {
            const task = (await api.createAITask({
              params: undefined,
              query: undefined,
              body: {
                taskType: "material.extract",
                attemptId: createAiTaskAttemptId(),
                inputData: { assetId, fileName: file.name },
              },
            })) as unknown as { id: string };
            const text = await waitForExtractedText(
              assetId,
              task.id,
              observation.pause,
              () => aliveRef.current,
              api,
            );
            if (text === null) return;
            extractedContent = text;
          }
          if (!aliveRef.current) return;
          await api.createKnowledge({
            params: undefined,
            query: undefined,
            body: {
              title: file.name,
              knowledgeType: "reference",
              content: extractedContent,
              sourceType: "import",
              sourceMetadata: { fileName: file.name, mimeType },
              assetId,
              folderId,
            },
          });
          succeeded += 1;
        } catch (reason) {
          if (!aliveRef.current) return;
          const safeImportMessage =
            reason instanceof Error &&
            (reason.message.includes("未加入知识库") ||
              reason.message.includes("超过 20MB"))
              ? reason.message
              : describeUserError(reason, "导入失败，请重试。");
          failures.push({
            fileName: file.name,
            message: safeImportMessage,
          });
        }
        if (!aliveRef.current) return;
        setImportDialog((current) =>
          current
            ? {
                ...current,
                completed: index + 1,
                succeeded,
                failures: [...failures],
                currentFileName:
                  index + 1 < files.length ? files[index + 1]!.name : null,
              }
            : current,
        );
      }
      if (succeeded > 0) {
        onSaved?.();
        router.refresh();
      }
      setImportDialog({
        files,
        phase: "done",
        completed: files.length,
        succeeded,
        failures,
        currentFileName: null,
      });
      importLock.current = false;
      onBusyChange?.(false);
      setBusy("idle");
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [
      busy,
      router,
      observation.pause,
      folderId,
      onSaved,
      onBusyChange,
      disabled,
      api,
    ],
  );

  // 拖放即开始上传；与按钮导入共用 handleDocumentFiles，但省去一次确认点击。
  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0) return; // 纯文本拖拽走原生行为
      event.preventDefault();
      setDragActive(false);
      const supported = files.filter((file) =>
        SUPPORTED_DOCUMENT_RE.test(file.name),
      );
      const rejectedCount = files.length - supported.length;
      if (supported.length === 0) {
        setError("可导入 PDF、DOCX、Markdown 或 TXT 文件。");
        return;
      }
      if (rejectedCount > 0) {
        setError(`${rejectedCount} 个不支持的文件已跳过。`);
      }
      void handleDocumentFiles(supported);
    },
    [handleDocumentFiles],
  );

  return (
    <>
      <section
        data-slot="knowledge-dump-zone"
        aria-label="知识倾倒场"
        onDragOver={(event) => {
          if ((event.dataTransfer?.types ?? []).includes("Files")) {
            event.preventDefault();
            setDragActive(true);
          }
        }}
        onDragLeave={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setDragActive(false);
          }
        }}
        onDrop={handleDrop}
        data-drag-active={dragActive ? "true" : "false"}
        className={cn(
          "relative flex flex-col gap-2 rounded-card border border-dashed bg-surface-subtle/50 p-3 transition-colors",
          dragActive ? "border-brand bg-brand-soft/30" : "border-border",
        )}
      >
        {!importOnly && (
          <>
            <div className="flex items-center gap-2 text-xs text-text-subtle">
              <Inbox className="size-4 shrink-0" aria-hidden="true" />
              把笔记、金句、逐字稿整段交给 AI 蒸馏成知识原子 —— 点「AI
              蒸馏」在对话里粘原文,采纳后进知识库
            </div>
            <textarea
              data-slot="knowledge-dump-input"
              aria-label="粘贴文本或 URL，也可拖入 PDF、DOCX、Markdown 或 TXT 文件"
              placeholder="粘贴文本 / URL，或把 PDF、DOCX、Markdown、TXT 文件拖进这个框…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className={cn(
                inputCls,
                "min-h-24 resize-y",
                dragActive && "border-brand bg-brand-soft/30",
              )}
            />
          </>
        )}
        {dragActive ? (
          <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-brand bg-surface/95 text-sm font-medium text-brand shadow-sm">
            松开即可上传并读取文件内容
          </div>
        ) : null}

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
          <input
            ref={fileInputRef}
            disabled={disabled || busy !== "idle"}
            type="file"
            multiple
            data-slot="knowledge-file-input"
            accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
            className="sr-only"
            aria-label="导入 PDF、DOCX 或 Markdown"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length === 0) return;
              queueDocumentFiles(files);
            }}
          />
          <button
            type="button"
            data-slot="knowledge-file-import"
            disabled={disabled || busy !== "idle"}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              buttonCls,
              "gap-1.5 border border-border bg-surface text-foreground hover:bg-surface-subtle",
            )}
          >
            <FileUp className="size-3.5" aria-hidden="true" />
            {busy === "uploading" ? "正在导入…" : "导入 PDF / DOCX / Markdown"}
          </button>
          {!importOnly && (
            <>
              <button
                type="button"
                data-slot="knowledge-distill"
                disabled={disabled || busy !== "idle"}
                onClick={handleDistill}
                className={cn(
                  buttonCls,
                  "gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90",
                )}
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                AI 蒸馏(打开对话)
              </button>
              <button
                type="button"
                data-slot="knowledge-manual-entry"
                aria-expanded={manualOpen}
                disabled={disabled || busy !== "idle"}
                onClick={() => setManualOpen((prev) => !prev)}
                className={cn(
                  buttonCls,
                  "border border-border bg-surface text-foreground hover:bg-surface-subtle",
                )}
              >
                手动补录
              </button>
              <ExperienceCaptureLink />
            </>
          )}
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
              disabled={
                disabled || busy !== "idle" || manualTitle.trim().length === 0
              }
              className={cn(
                buttonCls,
                "bg-brand text-brand-foreground hover:bg-brand/90",
              )}
            >
              直接存入
            </button>
          </form>
        ) : null}
      </section>
      {importDialog ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-[2px]"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="knowledge-import-title"
            data-slot={
              importDialog.phase === "confirm"
                ? "knowledge-import-confirm-dialog"
                : importDialog.phase === "done"
                  ? "knowledge-import-result-dialog"
                  : "knowledge-import-progress-dialog"
            }
            className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
          >
            <div className="border-b border-border px-5 py-4">
              <h2
                id="knowledge-import-title"
                className="text-base font-semibold text-foreground"
              >
                {importDialog.phase === "confirm"
                  ? `确认导入 ${importDialog.files.length} 个文件`
                  : importDialog.phase === "running"
                    ? "正在读取文件正文"
                    : "知识库导入完成"}
              </h2>
              <p className="mt-1 text-xs leading-5 text-text-subtle">
                {importDialog.phase === "confirm"
                  ? "系统会先保存原文件，再读取正文；只有正文读取成功的文件才会加入知识库。"
                  : importDialog.phase === "running"
                    ? `已处理 ${importDialog.completed}/${importDialog.files.length}，请保持应用打开。`
                    : `成功 ${importDialog.succeeded} 个，失败 ${importDialog.failures.length} 个。`}
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto px-5 py-4">
              <TaskObservationNotice {...observation} />
              {importDialog.phase === "confirm" ? (
                <ul className="space-y-2">
                  {importDialog.files.map((file) => (
                    <li
                      key={`${file.name}:${file.size}`}
                      className="flex items-center justify-between gap-3 rounded-md bg-surface-subtle px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-foreground">
                        {file.name}
                      </span>
                      <span className="shrink-0 text-xs text-text-subtle">
                        {Math.max(1, Math.ceil(file.size / 1024))} KB
                      </span>
                    </li>
                  ))}
                </ul>
              ) : importDialog.phase === "running" ? (
                observation.paused ? (
                  <p className="text-sm text-muted-foreground">
                    原文件已保存；「{importDialog.currentFileName}
                    」的正文解析尚未返回最终结果。
                  </p>
                ) : (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-3 rounded-md bg-brand-soft/50 px-3 py-3 text-sm text-foreground"
                  >
                    <LoaderCircle
                      className="size-5 shrink-0 animate-spin text-brand"
                      aria-hidden="true"
                    />
                    <span className="truncate">
                      {importDialog.currentFileName
                        ? `正在处理「${importDialog.currentFileName}」`
                        : "正在收尾…"}
                    </span>
                  </div>
                )
              ) : (
                <div className="space-y-3" aria-live="polite">
                  <div className="flex items-center gap-2 text-sm text-success">
                    <CircleCheck className="size-4" aria-hidden="true" />
                    成功 {importDialog.succeeded} 个
                  </div>
                  {importDialog.failures.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <CircleX className="size-4" aria-hidden="true" />
                        失败 {importDialog.failures.length} 个
                      </div>
                      <ul className="space-y-2">
                        {importDialog.failures.map((failure) => (
                          <li
                            key={failure.fileName}
                            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
                          >
                            <p className="text-sm font-medium text-foreground">
                              {failure.fileName}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-destructive">
                              {failure.message}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs text-text-subtle">失败 0 个。</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-surface-subtle/40 px-5 py-3">
              {importDialog.phase === "confirm" ? (
                <>
                  <button
                    type="button"
                    data-slot="knowledge-import-cancel"
                    onClick={() => setImportDialog(null)}
                    className={cn(
                      buttonCls,
                      "border border-border bg-surface text-foreground hover:bg-surface-subtle",
                    )}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    data-slot="knowledge-import-confirm"
                    disabled={disabled || busy !== "idle"}
                    onClick={() => void handleDocumentFiles(importDialog.files)}
                    className={cn(
                      buttonCls,
                      "bg-brand text-brand-foreground hover:bg-brand/90",
                    )}
                  >
                    确认导入
                  </button>
                </>
              ) : importDialog.phase === "done" ? (
                <button
                  type="button"
                  data-slot="knowledge-import-close"
                  onClick={() => setImportDialog(null)}
                  className={cn(
                    buttonCls,
                    "bg-brand text-brand-foreground hover:bg-brand/90",
                  )}
                >
                  知道了
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
