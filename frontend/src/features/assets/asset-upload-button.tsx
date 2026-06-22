"use client";

/**
 * `AssetUploadButton` — the "＋上传素材" control (module 07 E2 + Plan D1). A
 * Client island button mounted inside the (otherwise Server-Component)
 * AssetToolbar.
 *
 * Plan D1: it now takes a REAL file. The button opens a hidden `<input
 * type="file">`; on selection it reads the File's real name / type / size and
 * runs the two-phase upload through the typed client (over the /api/v1 dispatch
 * route → the same pglite store the page reads):
 *   1. assets.uploads.create  (POST /assets/uploads, body { assetType,
 *      mimeType, fileSize }) → { uploadId, storageKey, uploadUrl, expiresAt }.
 *      The bytes would PUT to `uploadUrl` via MockObjectStorage; the mock records
 *      the object at createPresignedUpload time, so no separate byte PUT is
 *      needed — we only persist the real metadata.
 *   2. assets.uploads.complete (POST /assets/uploads/:uploadId/complete,
 *      body { name }) → the new assetResource (Upload created → completed).
 * Then `router.refresh()` re-runs the server read so the new asset appears.
 *
 * `assets.uploads.create` only accepts the metadata triplet (assetType /
 * mimeType / fileSize); there is no byte-upload op this wave, so we don't ship
 * the file's bytes anywhere — only its real name/type/size.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import type { AssetType } from "@/types/domain";

// Map a File's MIME type to the contract `assetType` enum
// (image | video | audio | document | subtitle).
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

export function AssetUploadButton() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);
  // GAP-AST-1: honest 规划中 feedback — the upload persists REAL metadata
  // (name/type/size) but ships no bytes (no byte-upload op / object storage this
  // wave), so the success line says so rather than implying the file was stored.
  const [uploadStatus, setUploadStatus] = React.useState<string>("");

  const handleFile = React.useCallback(
    (file: File) => {
      startTransition(async () => {
        const upload = (await client.createUpload({
          params: undefined,
          query: undefined,
          body: {
            assetType: assetTypeForFile(file),
            // The File may have an empty `type`; fall back to a safe default so
            // the contract's `mimeType.min(1)` validation holds.
            mimeType: file.type || "application/octet-stream",
            // `fileSize.positive()` — clamp 0-byte files to 1.
            fileSize: Math.max(1, file.size),
          },
        })) as unknown as { uploadId: string };
        await client.completeUpload({
          params: { uploadId: upload.uploadId },
          query: undefined,
          body: { name: file.name },
        });
        setUploadStatus(
          `已登记素材信息「${file.name}」（文件字节存储规划中）。`,
        );
        router.refresh();
      });
    },
    [router],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        data-slot="assets-upload-input"
        aria-hidden="true"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so re-selecting the same file fires `change` again.
          e.target.value = "";
          if (file) handleFile(file);
        }}
      />
      <button
        type="button"
        data-slot="assets-upload-button"
        aria-label="上传素材"
        title="上传仅登记素材信息，文件字节存储规划中"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-8 items-center gap-1.5 rounded-control bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
      >
        <span aria-hidden="true">＋</span>
        <span>上传素材</span>
      </button>
      <span
        data-slot="assets-upload-status"
        role="status"
        aria-live="polite"
        className={uploadStatus ? "text-[11px] text-muted-foreground" : "sr-only"}
      >
        {uploadStatus}
      </span>
    </>
  );
}
