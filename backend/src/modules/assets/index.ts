// Assets module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Assets ONLY through this file (never its
// internals): the service + repository factories to construct it over the shared
// db, the object-storage port + mock adapter, the transport factory + op-id list
// the composite merges, ASSETS_DDL, the contract DTOs, and the error classes the
// dispatch route maps. No cross-module repository import.

export {
  createAssetsService,
  type AssetsService,
  type AssetUploadDto,
  type ObjectStorageForCtx,
} from "./assets.service";
export { createPendingDocumentService, type PendingDocumentInput, type PendingDocumentReceipt } from "./pending-document.service";
export {hasPendingGeneratedAssetCommit,createPendingGeneratedAssetService,type PendingGeneratedAssetInput,type PendingGeneratedAssetReceipt} from "./pending-generated-asset.service";

export {
  createAssetRepository,
  type AssetRepository,
  type RepoDeps,
  type AssetRow,
  type AssetFileRow,
  type AssetUploadRow,
  type MaterialLinkRow,
} from "./assets.repository";

export {
  createMockObjectStorage,
  type ObjectStoragePort,
} from "./object-storage";

export {
  createS3ObjectStorage,
  ensureBucket,
  type S3ObjectStorageConfig,
} from "./s3-object-storage";

export {
  createLocalFsObjectStorage,
  type LocalFsObjectStorageConfig,
} from "./localfs-object-storage";

export { resolveRootPath, defaultMediaRoot, blobRouteRoot } from "./media-root";
// [T-162] 存储目录迁移(改 rootPath 时搬旧文件到新目录)。
export {
  migrateStorageRoot,
  type StorageMigrationResult,
} from "./migrate-storage-root";

// Blob-security primitives (signed-URL token + path-traversal guard). Exposed via the
// public index so consumers (blob route, settings storage-config) never deep-import
// module internals across the package boundary (前后端分离:走 index 公开出口)。
export {
  safeJoin,
  signBlobToken,
  verifyBlobToken,
  blobSecret,
  rootPathLegalityReason,
  PathTraversalError,
  type BlobMethod,
  type VerifyResult,
} from "./blob-security";

export { createAssetsTransport, ASSET_OP_IDS } from "./assets.transport";

export { ASSETS_DDL } from "./assets.db-schema";

export {
  OwnershipError,
  InvalidTransitionError,
  ConflictError,
  UploadValidationError,
} from "./assets.errors";

export {
  assetResource,
  assetFileResource,
  assetUpload,
  type AssetResource,
  type AssetFileResource,
  type AssetUpload,
} from "./assets.schema";

export {createWebDocumentCacheService,type WebDocumentCachePreparation} from "./web-document-cache.service";

export {readCommittedGeneratedAssetFile,discardGeneratedAssetCandidate,activateGeneratedAssetCandidate,verifyGeneratedAssetCandidate} from "./generated-asset-candidate.service";

export {createWorkspaceBlobService} from "./workspace-blob.service";
export {encodeWorkspaceBlobScope,decodeWorkspaceBlobScope,signWorkspaceBlobToken,verifyWorkspaceBlobToken,type WorkspaceBlobScope} from "./blob-security";
export {createVisualTemplateService,type VisualTemplateService,type VisualTemplateServiceDeps,type VisualTemplateReference} from "./visual-template.service";
export {createVisualTemplateTransport,VISUAL_TEMPLATE_OP_IDS} from "./visual-template.transport";
