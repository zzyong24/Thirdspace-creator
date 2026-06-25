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
} from "./assets.service";

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
