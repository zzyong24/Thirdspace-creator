import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, iso8601, paginationQuery, assetType } from "../primitives";
import { assetResource, assetFileResource } from "../resources/assets";
import { materialLinkResource } from "../resources/material-links";

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
  // [T-055d SPEC §7.2] 下载 = 复制:换取当前文件的带签名 GET URL(local-fs = token 门
  // blob route;s3 = presigned GET)。前端 <a download> 触发系统保存对话框。
  getDownloadUrl: defineEndpoint({
    id: "assets.downloadUrl",
    method: "GET",
    path: "/assets/:assetId/download-url",
    params: z.object({ assetId: id }),
    response: z.object({ url: z.string(), fileName: z.string() }),
    fr: ["FR-ASSETS-DOWNLOAD-URL"],
  }),
  createUpload: defineEndpoint({
    id: "assets.uploads.create",
    method: "POST",
    path: "/assets/uploads",
    body: z.object({
      assetType,
      mimeType: z.string().min(1),
      fileSize: z.number().int().positive(),
      // [T-055d SPEC §7.1] 目录规则:带 projectId → 落 projects/<safe-title>-<id6>/素材/;
      // 不带 → inbox/。fileName 原名保真(local-fs 落盘名);均可选,旧调用不变。
      projectId: id.optional(),
      fileName: z.string().min(1).optional(),
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
  // 收藏翻转 (mirror trashAsset): POST flips the asset's isFavorite flag and
  // returns the updated Asset. Persists 收藏 so the gallery affordance survives
  // reloads (replaces the old storageKey=favorites/ file-version hack).
  toggleFavorite: defineEndpoint({
    id: "assets.favorite.toggle",
    method: "POST",
    path: "/assets/:assetId/favorite",
    params: assetParams,
    response: assetResource,
    fr: ["FR-ASSETS-FAVORITE-TOGGLE"],
  }),
  // 用料反查 (mirror materialLinks.list, inverse direction): which 创作 (用料链
  // edges) reference THIS asset. The 料库⇄创作 BillOfMaterials read by entityId
  // instead of projectId — no N-project walk on the FE.
  listAssetUsage: defineEndpoint({
    id: "assets.usage.list",
    method: "GET",
    path: "/assets/:assetId/usage",
    params: assetParams,
    response: materialLinkResource,
    isList: true,
    fr: ["FR-ASSETS-USAGE-LIST"],
  }),
} as const;
