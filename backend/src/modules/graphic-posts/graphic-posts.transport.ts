import type { Endpoint, RequestContext, Transport, ContentOutputResource } from "@creatoros/contract";
import { AuthenticationError, UnsupportedOperationError } from "@creatoros/backend";
import type { GraphicPostsService } from "./graphic-posts.service";

export const GRAPHIC_POST_OP_IDS = [
  "graphicPosts.outputs.create",
  "graphicPosts.get",
  "graphicPosts.versions.get",
  "graphicPosts.versions.create",
  "graphicPosts.candidates.generate",
  "graphicPosts.candidates.get",
  "graphicPosts.candidates.adopt",
] as const;

export function createGraphicPostsTransport(serviceFor: (ctx: RequestContext) => GraphicPostsService, assisted?: (ctx:RequestContext,outputId:string,body:unknown)=>Promise<unknown>): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFor(ctx);
      const payload = (input ?? {}) as {params?: Record<string, string>; body?: Record<string, unknown>};
      const params = payload.params ?? {};
      const body = payload.body ?? {};
      const meta = {requestId: ctx.requestId};
      switch (endpoint.id) {
        case "graphicPosts.outputs.create": {
          const row = await service.createOutput(ctx, params.projectId ?? "", {
            title: String(body.title ?? ""),
            targetPlatform: typeof body.targetPlatform === "string" ? body.targetPlatform : undefined,
            clientRequestId: String(body.clientRequestId ?? ""),
          });
          const resource: ContentOutputResource = {
            id: row.id, projectId: row.projectId, title: row.title,
            contentType: row.contentType as ContentOutputResource["contentType"],
            targetPlatform: (row.targetPlatform ?? null) as ContentOutputResource["targetPlatform"],
            format: row.format, aspectRatio: row.aspectRatio,
            targetDurationSeconds: row.targetDurationSeconds,
            status: row.status as ContentOutputResource["status"],
            contentRole: row.contentRole as ContentOutputResource["contentRole"],
            primaryAssetId: row.primaryAssetId ?? null,
            createdAt: row.createdAt, updatedAt: row.updatedAt,
          };
          return {data: resource, meta};
        }
        case "graphicPosts.get": return {data: await service.getGraphicPost(ctx, params.outputId ?? ""), meta};
        case "graphicPosts.versions.get": return {data: await service.getVersion(ctx, params.outputId ?? "", params.versionId ?? ""), meta};
        case "graphicPosts.versions.create": if(body.adoptionMode==='assistant'){if(!assisted)throw new Error('候选采纳服务尚未装配');return {data:await assisted(ctx,params.outputId??'',body),meta};} return {data: await service.createVersion(ctx, params.outputId ?? "", {
          expectedCurrentVersionId: String(body.expectedCurrentVersionId ?? ""),
          document: body.document as Parameters<GraphicPostsService["createVersion"]>[2]["document"],
          clientRequestId: String(body.clientRequestId ?? ""),
        }), meta};
        case "graphicPosts.candidates.generate": return {data: await service.generateTextCandidate(ctx, params.outputId ?? "", {
          kind: body.kind as "title" | "body" | "summary" | "tags",
          clientRequestId: String(body.clientRequestId ?? ""),
          sourceItemId: typeof body.sourceItemId === "string" ? body.sourceItemId : undefined,
          targetPlatform: typeof body.targetPlatform === "string" ? body.targetPlatform : body.targetPlatform === null ? null : undefined,
          ruleOverrides: body.ruleOverrides as Record<string, unknown> | undefined,
        }), meta};
        case "graphicPosts.candidates.get": return {data: await service.getTextCandidate(ctx, params.candidateId ?? ""), meta};
        case "graphicPosts.candidates.adopt": return {data: await service.adoptTextCandidate(ctx, params.candidateId ?? "", {
          kind: body.kind as "title" | "body" | "summary" | "tags",
          expectedCurrentVersionId: String(body.expectedCurrentVersionId ?? ""),
          editedValue: body.editedValue as string | string[],
          clientRequestId: String(body.clientRequestId ?? ""),
        }), meta};
        default: throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
