import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import { AuthenticationError, UnsupportedOperationError } from "@creatoros/backend";
import type { ArticlesService } from "./articles.service";

export const ARTICLE_OP_IDS = [
  "articles.get", "articles.versions.get", "articles.versions.create",
  "articles.candidates.generate", "articles.candidates.get", "articles.candidates.adopt",
] as const;

export function createArticlesTransport(serviceFor: (ctx: RequestContext) => ArticlesService): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFor(ctx);
      const payload = (input ?? {}) as {params?: Record<string, string>; body?: Record<string, unknown>};
      const params = payload.params ?? {};
      const body = payload.body ?? {};
      const meta = {requestId: ctx.requestId};
      switch (endpoint.id) {
        case "articles.get": return {data: await service.getArticle(ctx, params.outputId ?? ""), meta};
        case "articles.versions.get": return {data: await service.getVersion(ctx, params.outputId ?? "", params.versionId ?? ""), meta};
        case "articles.versions.create": return {data: await service.createVersion(ctx, params.outputId ?? "", {
          expectedCurrentVersionId: String(body.expectedCurrentVersionId ?? ""),
          document: body.document as Parameters<ArticlesService["createVersion"]>[2]["document"],
          clientRequestId: String(body.clientRequestId ?? ""),
        }), meta};
        case "articles.candidates.generate": return {data: await service.generateCandidate(ctx, params.outputId ?? "", String(body.clientRequestId ?? ""),
          typeof body.brandProfileVersionId === "string" ? body.brandProfileVersionId : undefined,
          body.sourceAssets as Array<{assetId: string; assetFileId: string}> | undefined), meta};
        case "articles.candidates.get": return {data: await service.getCandidate(ctx, params.candidateId ?? ""), meta};
        case "articles.candidates.adopt": return {data: await service.adoptCandidate(ctx, params.candidateId ?? "", {
          expectedCurrentVersionId: String(body.expectedCurrentVersionId ?? ""),
          selectedSectionIds: body.selectedSectionIds as string[],
          selectedMetadataFields: body.selectedMetadataFields as Array<"title" | "summary" | "factItems">,
          ...(body.editedMetadata!==undefined?{editedMetadata:body.editedMetadata as Parameters<ArticlesService["adoptCandidate"]>[2]["editedMetadata"]}:{}),
          ...(body.editedSections!==undefined?{editedSections:body.editedSections as Parameters<ArticlesService["adoptCandidate"]>[2]["editedSections"]}:{}),
          clientRequestId: String(body.clientRequestId ?? ""),
        }), meta};
        default: throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
