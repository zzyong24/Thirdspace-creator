export {lockOwnedProjectForUpdate} from "./project-lock.service";
// Projects module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Projects ONLY through this file (never its
// internals): the service + repository factories to construct it over the shared
// db, the transport factory + op-id list the composite merges, PROJECTS_DDL, the
// contract DTOs, and the error classes the dispatch route maps. No cross-module
// repository import. Other Wave-2 modules (Knowledge/Assets/Artifacts) consuming
// Projects import only this file's service interface.

export {
  createProjectsService,
  type ProjectsService,
  type ServiceDeps,
  type CreateProjectCommand,
  type CreateOutputCommand,
  type ProjectSource,
  type PlatformRef,
  type EnsureImportedProjectResult,
  normalizePlatformRef,
  type StageGateReaders,
  type StageGateReadersRef,
  type StageGateResult,
  PROJECT_STAGES,
  OUTPUT_STAGES,
} from "./projects.service";

export {
  createProjectRepository,
  type ProjectRepository,
  type ProjectRow,
  type StageRow,
  type TargetPlatformRow,
  type ContentOutputRow,
  type OutputStageRow,
  type TaskRow,
  type ActivityRow,
} from "./projects.repository";

export {
  createProjectsTransport,
  type ProjectsTransportDeps,
  PROJECT_OP_IDS,
} from "./projects.transport";

export { PROJECTS_DDL } from "./projects.db-schema";

// T-030-D3(SPEC §4.3 + §5.4):逐字稿按 aweme_id 绑 imported 作品的可复用 helper +
// .md 正文解析。D2 直连 ASR 时复用同一签名。
export {
  ensureTranscriptArtifact,
  extractTranscriptBody,
  type EnsureTranscriptArtifactInput,
  type EnsureTranscriptArtifactResult,
  type TranscriptContentData,
  type TranscriptArtifactPorts,
  type TranscriptArtifactSummary,
  type FindImportedProjectByAwemeId,
  type ListProjectArtifacts,
  type GetVersionContentData,
  type CreateScriptArtifact,
  type CreateArtifactVersion,
  type WarnFn,
} from "./transcript-artifact";

export {
  OwnershipError,
  StageTransitionError,
  OutputStateError,
  TaskStateError,
  ProjectStateError,
  StageGateError,
} from "./projects.errors";

export {
  projectResource,
  projectStageResource,
  contentOutputResource,
  taskResource,
  projectActivityResource,
  type ProjectResource,
  type ProjectStageResource,
  type ContentOutputResource,
  type TaskResource,
  type ProjectActivityResource,
} from "./projects.schema";

export { createTranscriptArtifactService } from "./transcript-artifact.service";

export { createProjectTranscriptionTargetService } from "./project-transcription-target.service";
export type { BriefDetail } from "./projects.service";

export {createProjectIntakeService,type ProjectIntakeResult,type ProjectPreparationReservationPort} from "./project-intake.service";

export {createProjectPreparationService,type ProjectPreparationDeps} from "./project-preparation.service";
export {createProjectPreparationGenerationService,type ProjectPreparationGenerationService} from "./project-preparation-generation.service";
