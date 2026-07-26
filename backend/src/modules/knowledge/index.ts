// Knowledge module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Knowledge ONLY through this file (never its
// internals): the service + repository factories to construct it over the shared
// db, the transport factory + op-id list the composite merges, KNOWLEDGE_DDL, the
// contract DTOs, and the error classes the dispatch route maps. No cross-module
// repository import.

export {
  createKnowledgeService,
  type KnowledgeService,
} from "./knowledge.service";

export {
  createKnowledgeRepository,
  type KnowledgeRepository,
  type RepoDeps,
  type KnowledgeItemRow,
  // [T-079a] 带战绩投影的读路径行(usedCount/usedInPublished)。
  type KnowledgeItemWithStats,
  type KnowledgeRevisionRow,
  type KnowledgeRelationRow,
  type KnowledgeFolderRow,
} from "./knowledge.repository";

export {
  createKnowledgeTransport,
  KNOWLEDGE_OP_IDS,
} from "./knowledge.transport";

export { KNOWLEDGE_DDL } from "./knowledge.db-schema";

export {
  OwnershipError,
  ConflictError,
  InvalidTransitionError,
} from "./knowledge.errors";

export {
  knowledgeItemResource,
  knowledgeRevisionResource,
  knowledgeRelationResource,
  knowledgeFolderResource,
  type KnowledgeItemResource,
  type KnowledgeRevisionResource,
  type KnowledgeRelationResource,
  type KnowledgeFolderResource,
} from "./knowledge.schema";
