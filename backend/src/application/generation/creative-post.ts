import { structuredGenerationInputSchema } from "@creatoros/contract/execution-worker";
import { buildGraphicPostFacets, validateGraphicPostTextCandidate } from "@creatoros/ai-worker/graphic-post-text";
import {generationRequestDigest} from "@creatoros/ai-worker/chat";
import { buildWechatArticleTextFacets, validateWechatArticleTextCandidate } from "@creatoros/ai-worker/wechat-article-text";
import { buildPublicationTextFacets, validatePublicationTextCandidate } from "@creatoros/ai-worker/publication-text";
import type { CoverContext } from "@creatoros/ai-worker/cover";
import type { RequestContext } from "@creatoros/contract";
import type { createStructuredBusinessExecutionService } from "../../modules/ai-runtime";
import { assembleCreativeContext, type ContextDeps } from "../../modules/ai-runtime/creative-context";
import {readFrozenGraphicCardContext,readFrozenGraphicSeries} from "../../modules/ai-runtime/frozen-cover-context";
import type { GraphicPostsService } from "../../modules/graphic-posts";
import type { ArticlesService } from "../../modules/articles";
import type {PublicationResultsService} from "../../modules/publishing";

/** Capture exactly the cover inputs before queuing; retries reuse these bytes. */
export function createGraphicCoverContextSnapshotter(deps: ContextDeps) {
  return async (ctx: RequestContext, input: {projectId: string; topic: string; fullText: string}): Promise<CoverContext> => {
    const context = await assembleCreativeContext(ctx, {projectId: input.projectId, topic: input.topic}, deps);
    return {positioningBrief: context.positioningBrief, projectBriefHard: context.projectBriefHard,
      reviewScript: input.fullText, userMaterialHardBrief: context.userMaterialHardBrief,
      userMaterialRefBrief: context.userMaterialRefBrief, knowledgeBrief: context.knowledgeBrief,
      orientationHint: context.orientationHint, topic: {title: context.topic.title, angle: context.topic.angle}};
  };
}

/**
 * The application adapter re-reads the current owned graphic post before a model
 * request and projects only a validated candidate. Domain adoption stays in
 * graphic-posts; the worker never writes the document.
 */
export function createGraphicPostBusinessAdapters(ports: {
  graphicPostsService: Pick<GraphicPostsService, "getGraphicPost" | "getVersion">;
}) {
  return {
    "graphic.post-text": {
      skillId: "graphic.post-text",
      capability: "copy.generate",
      async prepare(ctx, task) {
        const input = task.inputData;
        const outputId = String(input.outputId ?? "");
        const post = await ports.graphicPostsService.getGraphicPost(ctx, outputId);
        if (post.projectId !== task.projectId || post.artifactId !== input.artifactId ||
            post.targetPlatform !== input.targetPlatform) {
          throw new Error("GRAPHIC_POST_GENERATION_OWNER_CHANGED");
        }
        // The task was submitted against an immutable version. A later user edit
        // must not cancel generation; adoption performs the current-version CAS.
        const base = await ports.graphicPostsService.getVersion(ctx, outputId, String(input.baseVersionId ?? ""));
        // SEMANTIC_BOUNDARY_ALLOW: exact JSON snapshot equality ignores object key order; preserves array order and content, makes no creative choice.
        if (base.versionId !== input.baseVersionId || generationRequestDigest({document: base.document}) !== generationRequestDigest({document: input.current})) {
          throw new Error("GRAPHIC_POST_GENERATION_BASE_MISMATCH");
        }
        return buildGraphicPostFacets(input);
      },
      project(_input, object, execution) {
        const frozen = structuredGenerationInputSchema.parse(execution?.frozenInput);
        if (frozen.skillId !== "graphic.post-text" || frozen.capability !== "copy.generate") {
          throw new Error("GRAPHIC_POST_GENERATION_FROZEN_TYPE_MISMATCH");
        }
        const context = JSON.parse(frozen.facets.graphicPostContext ?? "null");
        const proposal = validateGraphicPostTextCandidate(object, context);
        return {resultType: "graphic_post_text_candidate", resultData: {kind: proposal.kind, value: proposal.value}};
      },
    },
  } satisfies Parameters<typeof createStructuredBusinessExecutionService>[1]["adapters"];
}

/** The image card uses a distinct semantic Skill and the durable image worker. */
export function createGraphicCardBusinessAdapters(ports: {
  graphicPostsService: Pick<GraphicPostsService, "getGraphicPost" | "getVersion">;
  articlesService?: Pick<ArticlesService, "getArticle" | "getVersion">;
}) {
  return {"graphic.card.generate": {
    skillId: "graphic.card-brief", capability: "copy.generate", additionalCalls: () => 1,
    async prepare(ctx, task) {
      const input = task.inputData;
      const snapshot = readFrozenGraphicCardContext(input);
      const scriptSnapshot = input.scriptSnapshot;
      if (!snapshot || !scriptSnapshot || typeof scriptSnapshot !== "object" || Array.isArray(scriptSnapshot)) {
        throw new Error("GRAPHIC_CARD_GENERATION_SNAPSHOT_MISSING");
      }
      const script = scriptSnapshot as Record<string, unknown>;
      const outputId = String(input.outputId ?? "");
      const baseVersionId = String(input.baseVersionId ?? "");
      if (input.kind !== "image_card" || input.contentOutputId !== outputId ||
          script.artifactId !== input.artifactId || script.versionId !== baseVersionId) {
        throw new Error("GRAPHIC_CARD_GENERATION_BINDING_MISMATCH");
      }
      let series:ReturnType<typeof readFrozenGraphicSeries>=null;
      if (input.contentType === "article") {
        if (!ports.articlesService) throw new Error("ARTICLE_CARD_ADAPTER_NOT_READY");
        const article = await ports.articlesService.getArticle(ctx, outputId);
        if (article.projectId !== task.projectId || article.artifactId !== input.artifactId ||
            (input.targetPlatform !== null && input.targetPlatform !== "wechatOfficialAccount")) {
          throw new Error("ARTICLE_CARD_GENERATION_OWNER_CHANGED");
        }
        const base = await ports.articlesService.getVersion(ctx, outputId, baseVersionId);
        const section = base.document.sections.find(item => item.sectionId === input.targetSectionId);
        const frozenText = section && [base.document.title, section.heading, section.body].filter(Boolean).join("\n\n");
        if (base.versionId !== baseVersionId || !section || frozenText !== snapshot.reviewScript ||
            frozenText !== script.fullText) {
          throw new Error("ARTICLE_CARD_GENERATION_BASE_MISMATCH");
        }
      } else if (input.contentType === undefined || input.contentType === "graphic_post") {
        const post = await ports.graphicPostsService.getGraphicPost(ctx, outputId);
        if (post.projectId !== task.projectId || post.artifactId !== input.artifactId ||
            post.targetPlatform !== input.targetPlatform) {
          throw new Error("GRAPHIC_CARD_GENERATION_OWNER_CHANGED");
        }
        const base = await ports.graphicPostsService.getVersion(ctx, outputId, baseVersionId);
        series=readFrozenGraphicSeries(input,base.document);
        const frozenText = [base.document.title, base.document.body, base.document.summary].filter(Boolean).join("\n\n");
        if (base.versionId !== baseVersionId || frozenText !== snapshot.reviewScript ||
            frozenText !== script.fullText) {
          throw new Error("GRAPHIC_CARD_GENERATION_BASE_MISMATCH");
        }
      } else {
        throw new Error("GRAPHIC_CARD_GENERATION_CONTENT_TYPE_MISMATCH");
      }
      const visualRequirements = typeof input.visualRequirements === "string" ? input.visualRequirements : "";
      return {graphicCardContext: JSON.stringify({context: snapshot, visualRequirements,
          ...(input.contentType === "article" || series ? {targetSectionId: input.targetSectionId} : {}),...(series?{series}:{})}),
        __coverTaskInputDigest: generationRequestDigest({inputData: input, projectId: task.projectId}),
        __coverContext: JSON.stringify({context: snapshot, visualRequirements, referenceAssetId: series?.seriesProfile?.referenceImage?.assetId??null,
          ...(series?.seriesProfile?.referenceImage?{referenceFileId:series.seriesProfile.referenceImage.assetFileId}:{}),
          ...(series && "referenceProof" in series ? {referenceChecksum:(series.referenceProof as {checksum:string}).checksum}:{}),
          ...(series?.seriesProfile?.aspectRatio?{aspectRatio:series.seriesProfile.aspectRatio}:{})})};
    },
    project() { throw new Error("图卡候选必须携带已保存图片回执"); },
  }} satisfies Parameters<typeof createStructuredBusinessExecutionService>[1]["adapters"];
}

/** Article text generation reads the owned immutable base; adoption owns the CAS. */
export function createWechatArticleTextBusinessAdapters(ports: {
  articlesService: Pick<ArticlesService, "getArticle" | "getVersion">;
}) {
  return {
    "wechat.article-text": {
      skillId: "wechat.article-text",
      capability: "copy.generate",
      async prepare(ctx, task) {
        const input = task.inputData;
        const outputId = String(input.outputId ?? "");
        const article = await ports.articlesService.getArticle(ctx, outputId);
        if (article.projectId !== task.projectId || article.artifactId !== input.artifactId ||
            (input.targetPlatform !== null && input.targetPlatform !== "wechatOfficialAccount")) {
          throw new Error("ARTICLE_TEXT_GENERATION_OWNER_CHANGED");
        }
        const base = await ports.articlesService.getVersion(ctx, outputId, String(input.baseVersionId ?? ""));
        // SEMANTIC_BOUNDARY_ALLOW: exact JSON snapshot equality ignores object key order; preserves array order and content, makes no creative choice.
        if (base.versionId !== input.baseVersionId || generationRequestDigest({document: base.document}) !== generationRequestDigest({document: input.current})) {
          throw new Error("ARTICLE_TEXT_GENERATION_BASE_MISMATCH");
        }
        return buildWechatArticleTextFacets(input);
      },
      project(_input, object, execution) {
        const frozen = structuredGenerationInputSchema.parse(execution?.frozenInput);
        if (frozen.skillId !== "wechat.article-text" || frozen.capability !== "copy.generate") {
          throw new Error("ARTICLE_TEXT_GENERATION_FROZEN_TYPE_MISMATCH");
        }
        const context = JSON.parse(frozen.facets.articleTextContext ?? "null");
        const proposal = validateWechatArticleTextCandidate(object, context);
        return {resultType: "wechat_article_text_candidate", resultData: {kind: proposal.kind, value: proposal.value}};
      },
    },
  } satisfies Parameters<typeof createStructuredBusinessExecutionService>[1]["adapters"];
}

export function createPublicationTextBusinessAdapters(ports: {
  publicationResultsService: Pick<PublicationResultsService, "verifyFrozenGenerationInput">;
}) {
  return {"publication.text": {
    skillId: "publication.text", capability: "copy.generate",
    async prepare(ctx, task) {
      await ports.publicationResultsService.verifyFrozenGenerationInput(ctx, task.projectId, task.inputData);
      return buildPublicationTextFacets(task.inputData);
    },
    project(_input, object, execution) {
      const frozen = structuredGenerationInputSchema.parse(execution?.frozenInput);
      if (frozen.skillId !== "publication.text" || frozen.capability !== "copy.generate") {
        throw new Error("PUBLICATION_TEXT_FROZEN_TYPE_MISMATCH");
      }
      const context = JSON.parse(frozen.facets.publicationContext ?? "null");
      const proposal = validatePublicationTextCandidate(object, context);
      return {resultType: "publication_text_candidate", resultData: {kind: proposal.kind, value: proposal.value}};
    },
  }} satisfies Parameters<typeof createStructuredBusinessExecutionService>[1]["adapters"];
}
