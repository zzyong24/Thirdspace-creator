import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { aiTaskStatus, id } from "../primitives";
import {
  articleCandidate,
  articleCandidateEdits,
  articleDocument,
  articleResource,
  articleWriteResult,
} from "../resources/articles";

const outputParams = z.object({ outputId: id });
const candidateParams = z.object({ candidateId: id });
const versionParams = z.object({ outputId: id, versionId: id });
const requestId = z.string().min(8).max(128);

export const articlesOperations = {
  getArticle: defineEndpoint({
    id: "articles.get",
    method: "GET",
    path: "/outputs/:outputId/article",
    params: outputParams,
    response: articleResource,
    fr: ["FR-ARTICLE-READ"],
  }),
  getArticleVersion: defineEndpoint({
    id: "articles.versions.get",
    method: "GET",
    path: "/outputs/:outputId/article/versions/:versionId",
    params: versionParams,
    response: articleWriteResult,
    fr: ["FR-ARTICLE-READ"],
  }),
  generateArticleCandidate: defineEndpoint({
    id: "articles.candidates.generate",
    method: "POST",
    path: "/outputs/:outputId/article/candidates/generate",
    params: outputParams,
    body: z.object({ clientRequestId: requestId, brandProfileVersionId: id.optional(),
      sourceAssets: z.array(z.object({assetId: id, assetFileId: id}).strict()).max(20).optional(),
    }).strict(),
    response: z.object({ taskId: id, candidateId: id, status: aiTaskStatus }),
    fr: ["FR-ARTICLE-CANDIDATE"],
  }),
  getArticleCandidate: defineEndpoint({
    id: "articles.candidates.get",
    method: "GET",
    path: "/articles/candidates/:candidateId",
    params: candidateParams,
    response: articleCandidate,
    fr: ["FR-ARTICLE-CANDIDATE"],
  }),
  adoptArticleCandidate: defineEndpoint({
    id: "articles.candidates.adopt",
    method: "POST",
    path: "/articles/candidates/:candidateId/adopt",
    params: candidateParams,
    body: z.object({
      expectedCurrentVersionId: id,
      selectedSectionIds: z.array(id),
      selectedMetadataFields: z.array(z.enum(["title", "summary", "factItems"])),
      clientRequestId: requestId,
      ...articleCandidateEdits.shape,
    }).strict(),
    response: articleWriteResult,
    fr: ["FR-ARTICLE-ADOPT"],
  }),
  createArticleVersion: defineEndpoint({
    id: "articles.versions.create",
    method: "POST",
    path: "/outputs/:outputId/article/versions",
    params: outputParams,
    body: z.object({
      expectedCurrentVersionId: id,
      document: articleDocument,
      clientRequestId: requestId,
    }).strict(),
    response: articleWriteResult,
    fr: ["FR-ARTICLE-EDIT"],
  }),
} as const;
