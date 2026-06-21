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

export {
  OwnershipError,
  StageTransitionError,
  OutputStateError,
  TaskStateError,
  ProjectStateError,
} from "./projects.errors";

export {
  projectResource,
  contentOutputResource,
  taskResource,
  projectActivityResource,
  type ProjectResource,
  type ContentOutputResource,
  type TaskResource,
  type ProjectActivityResource,
} from "./projects.schema";
