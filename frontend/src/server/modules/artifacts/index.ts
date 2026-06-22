// Artifacts module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Artifacts ONLY through this file (never its
// internals): the service factory to construct it over the shared db, the
// transport factory + op-id list the composite merges, ARTIFACTS_DDL, the contract
// DTOs, and the error classes the dispatch route maps. The AI module (Module 15)
// also imports the service through here to call the version-create seam
// (createVersion with createdByType:'ai'). No cross-module repository import.

export {
  createArtifactsService,
  type ArtifactsService,
  type ServiceDeps,
  type SearchUpsert,
  type AssertOwned,
} from "./artifacts.service";

export {
  createArtifactRepository,
  type ArtifactRepository,
  type RepoDeps,
  type ArtifactRow,
  type ArtifactVersionRow,
  type ArtifactRelationRow,
  type ScriptSectionRow,
  type ThesisNodeRow,
  type StructuredContent,
} from "./artifacts.repository";

export {
  createArtifactsTransport,
  ARTIFACT_OP_IDS,
} from "./artifacts.transport";

export { ARTIFACTS_DDL } from "./artifacts.db-schema";

export { OwnershipError, ConflictError } from "./artifacts.errors";

export {
  artifactResource,
  artifactVersionResource,
  artifactRelationResource,
  type ArtifactResource,
  type ArtifactVersionResource,
  type ArtifactRelationResource,
} from "./artifacts.schema";
