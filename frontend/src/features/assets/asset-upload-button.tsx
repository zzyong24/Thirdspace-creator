"use client";

/**
 * `AssetUploadButton` — the "＋上传素材" control (module 07 E2 + Plan D1). A
 * Client island button mounted inside the (otherwise Server-Component)
 * AssetToolbar.
 *
 * P3: it takes a REAL file and ships its REAL bytes. The button opens a hidden
 * `<input type="file">`; on selection it runs the two-phase upload through the
 * typed client:
 *   1. assets.uploads.create (POST /assets/uploads, body { assetType, mimeType,
 *      fileSize }) → { uploadId, storageKey, uploadUrl, expiresAt }.
 *   1b. PUT the file's bytes to `uploadUrl` (the presigned URL). Real S3/MinIO
 *      stores the object; the in-memory mock returns a `mock://` URL and records
 *      metadata at create-time, so only http(s) URLs get a byte PUT.
 *   2. assets.uploads.complete (POST /assets/uploads/:uploadId/complete, body
 *      { name }) → the service headObjects the stored bytes and creates the asset.
 * Then `router.refresh()` re-runs the server read so the new asset appears.
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
  // Upload feedback: P3 ships the real bytes (PUT to the presigned URL), so the
  // success line confirms the file was stored.
  const [uploadStatus, setUploadStatus] = React.useState<string>("");

  const handleFile = React.useCallback(
    (file: File) => {
      // The File may have an empty `type`; this same value goes to createUpload AND (for
      // real storage) the PUT's Content-Type header — they MUST match the signed value.
      const mimeType = file.type || "application/octet-stream";
      startTransition(async () => {
        const upload = (await client.createUpload({
          params: undefined,
          query: undefined,
          body: {
            assetType: assetTypeForFile(file),
            mimeType,
            // `fileSize.positive()` — clamp 0-byte files to 1.
            fileSize: Math.max(1, file.size),
          },
        })) as unknown as { uploadId: string; uploadUrl: string };
        // Phase 1: PUT the real bytes to the presigned URL (real S3/MinIO). The in-memory
        // mock returns a `mock://` URL that records metadata at create-time and needs no
        // byte PUT — so only http(s) presigned URLs get the upload.
        if (/^https?:\/\//.test(upload.uploadUrl)) {
          const put = await fetch(upload.uploadUrl, {
            method: "PUT",
            headers: { "content-type": mimeType },
            body: file,
          });
          if (!put.ok) {
            setUploadStatus(`上传失败「${file.name}」(${put.status})。`);
            return;
          }
        }
        // Phase 2: finalize — the service headObjects the stored bytes and creates the asset.
        await client.completeUpload({
          params: { uploadId: upload.uploadId },
          query: undefined,
          body: { name: file.name },
        });
        setUploadStatus(`已上传素材「${file.name}」。`);
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
        title="上传素材文件"
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
