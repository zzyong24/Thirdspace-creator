"use client";

/**
 * `AssetUploadButton` — module 07 E2 needs-backend control ("＋上传素材",
 * two-phase upload). A Client island button mounted inside the (otherwise
 * Server-Component) AssetToolbar.
 *
 * On click it runs the two-phase upload through the typed client (over the
 * /api/v1 dispatch route → the same pglite store the page reads):
 *   1. assets.uploads.create  (POST /assets/uploads) → { uploadId, storageKey,
 *      uploadUrl, expiresAt }. The bytes would PUT to `uploadUrl` via
 *      MockObjectStorage; in this wave the mock records the object at
 *      createPresignedUpload time, so no separate byte PUT is needed.
 *   2. assets.uploads.complete (POST /assets/uploads/:uploadId/complete,
 *      body { name }) → the new assetResource (Upload created → completed).
 * Then `router.refresh()` re-runs the server read so the new asset appears.
 *
 * Determinism: no Date.now / Math.random / direct fetch — the only inputs are a
 * fixed default name + the contract enums; ids/clock/storage keys are minted
 * server-side by the injected RepoDeps + MockObjectStorage.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";

// A fixed default upload payload. A real upload UI would collect a file +
// metadata; this wave wires the op chain with a deterministic stub payload so
// the button is functional (the bytes live in MockObjectStorage). The `name`
// carries a stable, human-readable default.
const DEFAULT_UPLOAD = {
  assetType: "image" as const,
  mimeType: "image/png",
  fileSize: 1024,
  name: "新上传素材",
};

export function AssetUploadButton() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const handleUpload = React.useCallback(() => {
    startTransition(async () => {
      const upload = (await client.createUpload({
        params: undefined,
        query: undefined,
        body: {
          assetType: DEFAULT_UPLOAD.assetType,
          mimeType: DEFAULT_UPLOAD.mimeType,
          fileSize: DEFAULT_UPLOAD.fileSize,
        },
      })) as unknown as { uploadId: string };
      await client.completeUpload({
        params: { uploadId: upload.uploadId },
        query: undefined,
        body: { name: DEFAULT_UPLOAD.name },
      });
      router.refresh();
    });
  }, [router]);

  return (
    <button
      type="button"
      data-slot="assets-upload-button"
      aria-label="上传素材"
      disabled={pending}
      onClick={handleUpload}
      className="inline-flex h-8 items-center gap-1.5 rounded-control bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
    >
      <span aria-hidden="true">＋</span>
      <span>上传素材</span>
    </button>
  );
}
