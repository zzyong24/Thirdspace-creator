// Artifacts module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs
// for this module"). The transport's toResource(row) and the contract test
// validate their outputs against these; the contract is the single source of
// truth for the wire shape (contract/src/resources/artifacts.ts).
//
// Topology (verified against assets.schema.ts): the @creatoros/contract root
// barrel re-exports `ENDPOINTS` but NOT the resource files. The per-op response
// schema is reachable as ENDPOINTS.<op>.response:
//   - listArtifacts.response === getArtifact.response === createArtifact.response
//       === restoreArtifact.response === artifactResource
//   - createArtifactVersion.response === listArtifactVersions.response
//       === artifactVersionResource
//   - createArtifactRelation.response === artifactRelationResource
import { ENDPOINTS } from "@creatoros/contract";

export const artifactResource = ENDPOINTS.listArtifacts.response;
export const artifactVersionResource = ENDPOINTS.createArtifactVersion.response;
export const artifactRelationResource =
  ENDPOINTS.createArtifactRelation.response;

// Derive the inferred output types from each schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod` as
// a direct dependency, so we read the output type structurally instead of a bare
// `import type { z } from "zod"`.
export type ArtifactResource = (typeof artifactResource)["_output"];
export type ArtifactVersionResource =
  (typeof artifactVersionResource)["_output"];
export type ArtifactRelationResource =
  (typeof artifactRelationResource)["_output"];
