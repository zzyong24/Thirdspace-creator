"use client";

import * as React from "react";
import { FileText, Image as ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { useCreationScope, creationScopeKey, readCreationScope } from "@/lib/creation-workspace-scope";
import { uploadFileForCopilot } from "@/features/draft-workbench/upload-to-project";

const MAX_ATTACHMENTS = 5;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const ACCEPT = ".txt,.md,.pdf,.docx,.png,.jpg,.jpeg,.webp,.gif";

type AttachmentStatus = "uploading" | "ready" | "error";

interface AttachmentItem {
  localId: string;
  workspaceOwner: string;
  assetId?: string;
  name: string;
  kind: "image" | "document";
  status: AttachmentStatus;
  error?: string;
}

export type CopilotAttachmentDraft = readonly AttachmentItem[];

export interface CopilotAttachmentState {
  ids: string[];
  uploading: boolean;
  count: number;
}

export interface CopilotAttachmentPickerHandle {
  clear(): void;
  addFiles(files: File[]): void;
  readDraft(): CopilotAttachmentDraft;
}

export interface CopilotAttachmentPickerProps {
  projectId?: string | null;
  disabled?: boolean;
  onStateChange(state: CopilotAttachmentState): void;
  initialDraft?: CopilotAttachmentDraft;
}

function classify(file: File):
  | { ok: true; kind: "image" | "document" }
  | { ok: false; message: string } {
  const lower = file.name.toLowerCase();
  const isImage =
    /^image\/(?:png|jpeg|webp|gif)$/i.test(file.type) ||
    /\.(?:png|jpe?g|webp|gif)$/i.test(lower);
  const isDocument =
    /^(?:text\/plain|text\/markdown|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i.test(
      file.type,
    ) || /\.(?:txt|md|pdf|docx)$/i.test(lower);
  if (!isImage && !isDocument) {
    return { ok: false, message: "仅支持图片、PDF、DOCX、Markdown 和 TXT。" };
  }
  const max = isImage ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
  if (file.size <= 0 || file.size > max) {
    return {
      ok: false,
      message: isImage ? "图片需小于 15MB。" : "文档需小于 20MB。",
    };
  }
  return { ok: true, kind: isImage ? "image" : "document" };
}

export const CopilotAttachmentPicker = React.forwardRef<
  CopilotAttachmentPickerHandle,
  CopilotAttachmentPickerProps
>(function CopilotAttachmentPicker(
  { projectId, disabled = false, onStateChange, initialDraft },
  ref,
) {
  const workspaceOwner=creationScopeKey(useCreationScope());
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  // SEMANTIC_BOUNDARY_ALLOW: 仅延续当前窗口附件的机械local ID序号，防恢复后ID碰撞；不判断内容、选材或创作。
  const localIdSequence = React.useRef(initialDraft?.reduce((max,item)=>{const value=Number(item.localId.split(":").at(-1));return Number.isSafeInteger(value)&&value>=0?Math.max(max,value):max;},0)??0);
  const [items, setItems] = React.useState<AttachmentItem[]>(()=>initialDraft?.map(item=>item.status==="uploading"?{...item,status:"error",error:"原上传状态尚未确认，请核对后重新选择附件。"}:{...item})??[]);
  const [dragging, setDragging] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    onStateChange({
      ids: items
        .filter((item) => item.status === "ready" && item.assetId && item.workspaceOwner === workspaceOwner)
        .map((item) => item.assetId as string),
      uploading: items.some((item) => item.status === "uploading" && item.workspaceOwner === workspaceOwner),
      count: items.length,
    });
  }, [items, onStateChange, workspaceOwner]);

  const addFiles = React.useCallback(
    (files: File[]) => {
      if (disabled || files.length === 0) return;
      const remaining = Math.max(0, MAX_ATTACHMENTS - items.length);
      const accepted = files.slice(0, remaining);
      if (remaining === 0 || files.length > remaining) {
        setNotice(`每轮最多添加 ${MAX_ATTACHMENTS} 个附件。`);
      } else {
        setNotice(null);
      }
      const capturedWorkspaceOwner=creationScopeKey(readCreationScope());
      for (const file of accepted) {
        const verdict = classify(file);
        const localId = `${file.name}:${file.size}:${file.lastModified}:${++localIdSequence.current}`;
        if (!verdict.ok) {
          setItems((current) => [
            ...current,
            {
              localId,
              workspaceOwner:capturedWorkspaceOwner,
              name: file.name,
              kind: "document",
              status: "error",
              error: verdict.message,
            },
          ]);
          continue;
        }
        setItems((current) => [
          ...current,
          { localId, workspaceOwner:capturedWorkspaceOwner, name: file.name, kind: verdict.kind, status: "uploading" },
        ]);
        void uploadFileForCopilot(file, projectId)
          .then((uploaded) => {
            if (!uploaded) throw new Error("上传完成但没有生成素材记录");
            setItems((current) => {
              const alreadyShown = current.some(
                (item) =>
                  item.localId !== localId &&
                  item.status === "ready" &&
                  item.workspaceOwner === capturedWorkspaceOwner &&
                  item.assetId === uploaded.assetId,
              );
              if (alreadyShown) return current.filter((item) => item.localId !== localId);
              return current.map((item) =>
                item.localId === localId
                  ? { ...item, assetId: uploaded.assetId, status: "ready", error: undefined }
                  : item,
              );
            });
            if (uploaded.deduplicated) {
              setNotice("相同内容已存在，已直接复用原素材。");
            }
          })
          .catch((cause) => {
            setItems((current) =>
              current.map((item) =>
                item.localId === localId
                  ? {
                      ...item,
                      status: "error",
                      error: cause instanceof Error ? cause.message : "上传失败，请重试。",
                    }
                  : item,
              ),
            );
          });
      }
    },
    [disabled, items.length, projectId],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      clear: () => setItems([]),
      addFiles,
      readDraft:()=>items.map(item=>({...item})),
    }),
    [addFiles,items],
  );

  const remove = React.useCallback((localId: string) => {
    setItems((current) => current.filter((item) => item.localId !== localId));
  }, []);

  return (
    <div
      className={`rounded-xl border px-2.5 py-2 transition-colors ${
        dragging ? "border-brand bg-brand/5" : "border-dashed border-border/80 bg-surface-muted/30"
      }`}
      data-slot="copilot-attachment-picker"
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        multiple
        accept={ACCEPT}
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || items.length >= MAX_ATTACHMENTS}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg px-1.5 text-xs font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
        >
          <Paperclip className="size-3.5 text-brand" aria-hidden="true" />
          添加文件或图片
        </button>
        <span className="text-[11px] text-muted-foreground">
          也可拖到这里；图片识别效果取决于当前模型
        </span>
      </div>
      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <div
              key={item.localId}
              className={`flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${
                item.status === "error"
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : "border-border bg-surface text-foreground"
              }`}
              title={item.error ?? item.name}
            >
              {item.status === "uploading" ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : item.kind === "image" ? (
                <ImageIcon className="size-3 text-brand" aria-hidden="true" />
              ) : (
                <FileText className="size-3 text-brand" aria-hidden="true" />
              )}
              <span className="max-w-48 truncate">{item.name}</span>
              <span className="text-muted-foreground">
                {item.workspaceOwner !== workspaceOwner
                  ? "请核对原工作区附件"
                  : item.status === "uploading"
                    ? "上传中"
                  : item.status === "ready"
                    ? "已就绪"
                    : item.error}
              </span>
              <button
                type="button"
                aria-label={`移除附件 ${item.name}`}
                onClick={() => remove(item.localId)}
                className="rounded p-0.5 hover:bg-surface-muted"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      {notice && <p className="mt-1 text-[11px] text-warning">{notice}</p>}
    </div>
  );
});
