// Ingestion module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Ingestion ONLY through this file (never its
// internals): the service + repository factories to construct it over the shared db
// (with the injected downstream Service ports), the transport factory + op-id list
// the composite merges, INGESTION_DDL, the contract DTO, the MockIngestionSource
// producer (foundation §4), and the error classes the dispatch route maps.
//
// Ingestion owns the run ops (ingestion.runs.create/complete/get + 抖音四 op;
// [T-248 批C] 四个 batch-push 契约 op 已删,批量写只走 service 层进程内调用); it fans out to
// Publishing/Analytics/Knowledge/Assets/Artifacts ONLY through their public
// Services (injected as narrow ports — no cross-module repository import, SPEC
// §17.6/.7). Artifact pushes create a CANDIDATE version, never current_version
// (roadmap §401).

export {
  createIngestionService,
  type IngestionService,
  type IngestionPorts,
  type IngestionPublishingPort,
  type IngestionProjectsPort,
  type IngestionAnalyticsPort,
  type IngestionKnowledgePort,
  type IngestionAssetsPort,
  type IngestionArtifactsPort,
  type DouyinFetchPort,
  type ServiceDeps,
} from "./ingestion.service";

export {
  createIngestionRepository,
  type IngestionRepository,
  type RepoDeps,
  type ExternalSourceRow,
  type IngestionRunRow,
  type IngestionErrorRow,
  type IngestionRecordRow,
} from "./ingestion.repository";

export {
  createIngestionTransport,
  INGESTION_OP_IDS,
} from "./ingestion.transport";

export { INGESTION_DDL } from "./ingestion.db-schema";

export {
  createMockIngestionSource,
  type IngestionSourcePort,
  type MockIngestionSource,
} from "./ingestion.mock-source";

export { OwnershipError } from "./ingestion.errors";

export {
  ingestionRunResource,
  type IngestionRunResource,
  type MetricRecord,
  parseMetricRecord,
} from "./ingestion.schema";
