import type { GraphicPostTextKind,GraphicPostTextValue,RequestContext } from "@creatoros/contract";
import type { CreativeResultAdapter } from "../creative-results/creative-results.service";
import type { GraphicPostsService } from "./graphic-posts.service";

/** Text-only adapter. Media stays unavailable until a task-bound Asset candidate owner is wired. */
export function createGraphicPostCreativeResultAdapter(input: {
  service: GraphicPostsService;
  probeTextGeneration(ctx: RequestContext): Promise<{ready: boolean; reasonCode?: string; lastVerifiedAt?: string}>;
}): CreativeResultAdapter {
  return {
    owner: "graphic_post",
    async probe(ctx, cell) {
      if (!["title", "body", "summary", "tags", "cardBriefs"].includes(cell.kind)) {
        return {state: "known_unavailable", reasonCode: "ADAPTER_NOT_READY", lastVerifiedAt: null};
      }
      const status = await input.probeTextGeneration(ctx);
      return status.ready
        ? {state: "supported", reasonCode: null, lastVerifiedAt: status.lastVerifiedAt ?? null}
        : {state: "known_unavailable", reasonCode: status.reasonCode ?? "ADAPTER_NOT_READY", lastVerifiedAt: status.lastVerifiedAt ?? null};
    },
    async enqueue(ctx, request) {
      if (!["title", "body", "summary", "tags", "cardBriefs"].includes(request.kind)) throw new Error("图文交付项尚未接通");
      const result = await input.service.generateTextCandidate(ctx, request.outputId, {
        kind: request.kind as GraphicPostTextKind,
        targetPlatform: request.targetPlatform,
        clientRequestId: request.clientRequestId,
        sourceItemId: request.sourceItemId,
        ruleOverrides: request.ruleOverrides,conversion:request.conversion,
      });
      const candidate = await input.service.getTextCandidate(ctx, result.candidateId);
      return {
        candidateId: result.candidateId, taskId: result.taskId,
        baseVersionId: candidate.baseVersionId, ruleSnapshotRef: candidate.ruleSnapshotRef?.versionId ?? null,
        appliedRules: candidate.appliedRules,
        sourceRefs: candidate.sourceRefs, status: candidate.status,
      };
    },
    async read(ctx, candidateId) {
      const candidate = await input.service.getTextCandidate(ctx, candidateId);
      return {status: candidate.status, value: candidate.value, errorCode: candidate.status === "failed" ? "GENERATION_FAILED" : null};
    },
    async adopt(ctx, request) {
      if (request.expected.owner !== "graphic_post" || typeof request.expected.versionId !== "string") {
        throw new Error("图文候选目标版本无效");
      }
      const result = await input.service.adoptTextCandidate(ctx, request.candidateId, {
        kind: request.kind as GraphicPostTextKind,
        expectedCurrentVersionId: request.expected.versionId,
        editedValue: request.editedValue as GraphicPostTextValue,
        clientRequestId: request.clientRequestId,
      });
      return {versionId: result.versionId};
    },
    async retryFrozen(ctx, request) {
      const retry = await input.service.retryFrozenTextCandidate(ctx, request.candidateId, request.clientRequestId);
      return {candidateId: retry.candidateId, taskId: retry.taskId, status: retry.status,
        baseVersionId: retry.baseVersionId, sourceRefs: retry.sourceRefs,
        ruleSnapshotRef: retry.ruleSnapshotRef?.versionId ?? null, appliedRules: retry.appliedRules};
    },
  };
}
