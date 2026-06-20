import { z } from "zod";
import { defineEndpoint } from "../endpoints.js";
import { id, iso8601, paginationQuery, assetType } from "../primitives.js";
import { assetResource, assetFileResource } from "../resources/assets.js";

const assetParams = z.object({ assetId: id });
const uploadParams = z.object({ uploadId: id });

// Upload session DTO returned by POST /assets/uploads (presigned upload init).
const assetUpload = z.object({
  uploadId: id,
  storageKey: z.string(),
  uploadUrl: z.string(),
  expiresAt: iso8601,
});

// SPEC §13 "素材库" (assets) group.
export const assetsOperations = {
  listAssets: defineEndpoint({
    id: "assets.list",
    method: "GET",
    path: "/assets",
    query: paginationQuery,
    response: assetResource,
    isList: true,
    fr: ["FR-ASSETS-LIST"],
  }),
  createUpload: defineEndpoint({
    id: "assets.uploads.create",
    method: "POST",
    path: "/assets/uploads",
    body: z.object({
      assetType,
      mimeType: z.string().min(1),
      fileSize: z.number().int().positive(),
    }),
    response: assetUpload,
    fr: ["FR-ASSETS-UPLOAD-INIT"],
  }),
  completeUpload: defineEndpoint({
    id: "assets.uploads.complete",
    method: "POST",
    path: "/assets/uploads/:uploadId/complete",
    params: uploadParams,
    body: z.object({ name: z.string().min(1) }),
    response: assetResource,
    fr: ["FR-ASSETS-UPLOAD-COMPLETE"],
  }),
  getAsset: defineEndpoint({
    id: "assets.get",
    method: "GET",
    path: "/assets/:assetId",
    params: assetParams,
    response: assetResource,
    fr: ["FR-ASSETS-GET"],
  }),
  addAssetFile: defineEndpoint({
    id: "assets.files.create",
    method: "POST",
    path: "/assets/:assetId/files",
    params: assetParams,
    body: z.object({ storageKey: z.string().min(1) }),
    response: assetFileResource,
    fr: ["FR-ASSETS-FILE-ADD"],
  }),
  trashAsset: defineEndpoint({
    id: "assets.trash",
    method: "POST",
    path: "/assets/:assetId/trash",
    params: assetParams,
    response: assetResource,
    fr: ["FR-ASSETS-TRASH"],
  }),
  restoreAsset: defineEndpoint({
    id: "assets.restore",
    method: "POST",
    path: "/assets/:assetId/restore",
    params: assetParams,
    response: assetResource,
    fr: ["FR-ASSETS-RESTORE"],
  }),
} as const;
