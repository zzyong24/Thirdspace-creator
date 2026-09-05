// AI module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The composite
// transport imports AI ONLY through this file (never its internals): the service +
// repository factories to construct it over the shared db (with the injected Artifacts
// port), the transport factory + op-id list the composite merges, AI_DDL, the contract
// DTOs, the seed catalog builders, and the error classes the dispatch route maps.
//
// AI owns the six contract ops (ai.conversations.list/create, ai.conversations.messages
// .create, ai.tasks.create/confirm/cancel). The candidate→confirm boundary (SPEC §18) is
// enforced in the service: AI never writes a current ArtifactVersion directly —
// confirmTask formalizes through the injected AiArtifactsPort (Artifacts public service's
// createVersion, createdByType:"ai"). No cross-module repository import (SPEC §22).
//
// The Agent SDK lives ONLY in @creatoros/ai-worker — this module's service/transport/
// pages NEVER import it (determinism boundary, design-spec §8). The worker reads/writes
// the same shared pglite db via the user-scoped repositories; recordCandidate is the
// service-side write seam it drives.

export {
  createAiService,
  type AiService,
  type ServiceDeps,
  type AiArtifactsPort,
  type AiKnowledgePort,
  // [T-387b] 分镜凝固 pass 的素材库只读端口(组合根绑 assetsService.listAssets 的 id 投影)。
  type AiAssetLibraryPort,
  type CreateTaskInput,
  type RecordCandidateInput,
  type ClaimedTaskExecutionContext,
  type ClaimedTaskExecutionResult,
} from "./ai.service";

// [T-387b] 分镜凝固 pass(纯函数,采纳定稿时刻的确定性凝固;单测锚)。
export {
  freezeStoryboardSections,
  hasStoryboardVisual,
  type FreezeResult,
  type FrozenSectionVisual,
} from "./storyboard-freeze";

export {
  createAiRepository,
  type AiRepository,
  type RepoDeps,
  type ConversationRow,
  type MessageRow,
  type TaskRow,
  type ReferenceRow,
  type ResultRow,
  type AgentConfigRow,
  type ModelConfigRow,
} from "./ai.repository";

export { createAiTransport, AI_OP_IDS } from "./ai.transport";

export { AI_DDL } from "./ai.db-schema";

export {
  OwnershipError,
  ConflictError,
  ExecutionLeaseLostError,
} from "./ai.errors";

export {
  aiConversationResource,
  aiMessageResource,
  aiTaskResource,
  aiTaskResultResource,
  toConversationDto,
  toMessageDto,
  toTaskDto,
  toResultDto,
  type AIConversationResource,
  type AIMessageResource,
  type AITaskResource,
  type AITaskResultResource,
} from "./ai.schema";

export { buildAiModelConfigs, buildAiAgentConfigs } from "./ai.seed";
export { createExecutionCandidateService, type ExecutionCandidateDeps } from "./execution-candidate.service";

export { createAgenticProposalAdoptionService, type AgenticProposalAdoptionPorts } from "./agentic-proposal-adoption.service";
export { createAgenticProposalStagingService } from "./agentic-proposal-staging.service";
