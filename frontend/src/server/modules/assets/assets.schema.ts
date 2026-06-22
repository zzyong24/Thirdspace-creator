// Assets module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs
// for this module"). The transport's toResource(row) and the contract test
// validate their outputs against these; the contract is the single source of
// truth for the wire shape (contract/src/resources/assets.ts).
//
// Topology (verified against knowledge.schema.ts): the @creatoros/contract root
// barrel re-exports `ENDPOINTS` but NOT the resource files. The per-op response
// schema is reachable as ENDPOINTS.<op>.response:
//   - listAssets.response === getAsset.response === completeUpload.response
//       === trashAsset.response === restoreAsset.response === assetResource
//   - addAssetFile.response === assetFileResource
//   - createUpload.response === assetUpload (the upload-session DTO)
import { ENDPOINTS } from "@creatoros/contract";

export const assetResource = ENDPOINTS.listAssets.response;
export const assetFileResource = ENDPOINTS.addAssetFile.response;
export const assetUpload = ENDPOINTS.createUpload.response;

// Derive the inferred output types from each schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod`
// as a direct dependency, so we read the output type structurally instead of a
// bare `import type { z } from "zod"`.
export type AssetResource = (typeof assetResource)["_output"];
export type AssetFileResource = (typeof assetFileResource)["_output"];
export type AssetUpload = (typeof assetUpload)["_output"];
