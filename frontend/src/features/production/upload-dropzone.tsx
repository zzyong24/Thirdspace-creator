"use client";

/**
 * `UploadDropzone` — L5 录制页「用户上传」区(SPEC 2026-07-01 §4 区②)。
 *
 * 拖拽(或点选)文件 → presigned PUT(P3)→ 建 asset → **绑定当前项目**(用料链 A4)。
 * 纯前端接线,复用现成件、不改后端/契约:
 *   1. `assets.uploads.create` → { uploadId, uploadUrl }(与 D1 `AssetUploadButton` 同款两阶段)。
 *   1b. PUT 真字节到 presigned URL(mock:// 跳过 PUT,只 http(s) 才传)。
 *   2. `assets.uploads.complete { name }` → 建 asset,返回 { id }。
 *   3. **上传即绑定**:`materialLinks.create { projectId, entityType:"asset", entityId, role:"clip",
 *      stage:"production" }`(与 Assets 中心「附到项目」同一条绑定门),把新 asset 挂进本项目用料链。
 *   4. `router.refresh()` — 素材库(已配素材)重读,新素材出现在当前项目下。
 *
 * 没 wiring(项目未解析)时 dropzone 仍渲染但禁用(诚实:无 projectId 无法绑定)。
 * Determinism:无 Date.now/Math.random;文件字节走真 fetch(与 D1 一致,已是既有真上传路径)。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";

import { SectionCard } from "@/components/project/section-card";
import { client } from "@/lib/contract-client";
import type { AssetType } from "@/types/domain";

// Map a File's MIME → contract assetType enum(与 D1 AssetUploadButton 同一映射)。
function assetTypeForFile(file: File): AssetType {
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/x-subrip" || /\.(srt|vtt|ass)$/i.test(file.name)) {
    return "subtitle";
  }
  return "document";
}

type UploadState =
  | { readonly phase: "idle" }
  | { readonly phase: "uploading"; readonly name: string }
  | { readonly phase: "done"; readonly name: string; readonly bound: boolean }
  | { readonly phase: "error"; readonly name: string; readonly reason: string };

export interface UploadDropzoneProps {
  /** 当前项目 id — 上传成功后把新 asset 绑定到它(用料链)。 */
  readonly projectId: string;
  /**
   * 项目已解析(有真 output/production)才允许绑定。缺失(纯 fixture / 未 seed)→ dropzone
   * 禁用并显式说明,不假装能上传绑定(诚实)。
   */
  readonly canBind: boolean;
}

export function UploadDropzone({ projectId, canBind }: UploadDropzoneProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [state, setState] = React.useState<UploadState>({ phase: "idle" });
  const busy = state.phase === "uploading";

  const handleFile = React.useCallback(
    (file: File) => {
      // The File may have an empty `type`; this same value goes to createUpload AND the
      // PUT Content-Type — they MUST match the signed value(与 D1 一致)。
      const mimeType = file.type || "application/octet-stream";
      setState({ phase: "uploading", name: file.name });
      void (async () => {
        try {
          const upload = (await client.createUpload({
            params: undefined,
            query: undefined,
            body: {
              assetType: assetTypeForFile(file),
              mimeType,
              fileSize: Math.max(1, file.size), // fileSize.positive() — clamp 0-byte to 1
            },
          })) as unknown as { uploadId: string; uploadUrl: string };

          // Phase 1: PUT real bytes to the presigned URL(只 http(s);mock:// 记录于 create,跳过)。
          if (/^https?:\/\//.test(upload.uploadUrl)) {
            const put = await fetch(upload.uploadUrl, {
              method: "PUT",
              headers: { "content-type": mimeType },
              body: file,
            });
            if (!put.ok) {
              setState({
                phase: "error",
                name: file.name,
                reason: `上传失败（${put.status}）`,
              });
              return;
            }
          }

          // Phase 2: finalize — service headObjects the stored bytes and creates the asset.
          const asset = (await client.completeUpload({
            params: { uploadId: upload.uploadId },
            query: undefined,
            body: { name: file.name },
          })) as unknown as { id: string };

          // Phase 3: 上传即绑定 — 把新 asset 挂进当前项目用料链(与 Assets「附到项目」同一门)。
          let bound = false;
          if (canBind && asset?.id) {
            await client.createMaterialLink({
              params: undefined,
              query: undefined,
              body: {
                projectId,
                entityType: "asset",
                entityId: asset.id,
                role: "clip",
                stage: "production",
              },
            });
            bound = true;
          }
          setState({ phase: "done", name: file.name, bound });
          router.refresh();
        } catch {
          setState({
            phase: "error",
            name: file.name,
            reason: "上传或绑定出错",
          });
        }
      })();
    },
    [projectId, canBind, router],
  );

  const onDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      if (!canBind || busy) return;
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [canBind, busy, handleFile],
  );

  return (
    <div
      data-slot="upload-dropzone-region"
      data-testid="production-region"
      data-region="upload"
    >
      <SectionCard
        title="上传素材"
        description="拖拽文件到这里,上传后自动绑定当前项目(用料链)"
      >
        <input
          ref={inputRef}
          type="file"
          data-slot="upload-dropzone-input"
          aria-hidden="true"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // reset so re-selecting the same file fires change again
            if (file) handleFile(file);
          }}
        />
        <div
          data-slot="upload-dropzone-area"
          data-drag-active={dragActive ? "true" : "false"}
          data-disabled={!canBind ? "true" : "false"}
          role="button"
          tabIndex={canBind && !busy ? 0 : -1}
          aria-disabled={!canBind}
          aria-label="拖拽或点击上传素材"
          onDragOver={(e) => {
            e.preventDefault();
            if (canBind && !busy) setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={() => {
            if (canBind && !busy) inputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && canBind && !busy) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={
            "flex flex-col items-center justify-center gap-2 rounded-card border border-dashed px-4 py-8 text-center transition-colors " +
            (!canBind
              ? "cursor-not-allowed border-border bg-surface-subtle opacity-60"
              : dragActive
                ? "cursor-copy border-brand bg-brand-soft/40"
                : "cursor-pointer border-border bg-surface-subtle hover:border-brand/60")
          }
        >
          <span
            aria-hidden="true"
            className="inline-flex size-9 items-center justify-center rounded-full border border-brand/40 bg-brand-soft text-brand"
          >
            <UploadCloud className="size-5" strokeWidth={1.75} />
          </span>
          {busy ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              正在上传「{state.name}」…
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">
                拖拽文件到此处,或点击选择
              </p>
              <p className="text-[11px] text-muted-foreground">
                支持图片 / 视频 / 音频 / 字幕 / 文档
              </p>
            </>
          )}
        </div>

        {!canBind ? (
          <p
            data-slot="upload-dropzone-disabled-note"
            className="mt-2 text-[11px] text-muted-foreground"
          >
            该项目尚未进入制作阶段(无可绑定的 output),暂不能上传绑定。
          </p>
        ) : null}

        {state.phase === "done" ? (
          <p
            data-slot="upload-dropzone-status"
            role="status"
            aria-live="polite"
            className="mt-2 text-[11px] text-success"
          >
            ✓ 已上传「{state.name}」
            {state.bound ? "并绑定到当前项目(用料链)。" : "。"}
          </p>
        ) : null}
        {state.phase === "error" ? (
          <p
            data-slot="upload-dropzone-status"
            role="status"
            aria-live="polite"
            className="mt-2 text-[11px] text-destructive"
          >
            「{state.name}」{state.reason}。
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
}
