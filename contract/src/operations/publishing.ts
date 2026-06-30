import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery } from "../primitives";
import {
  publicationResource,
  publicationRevisionResource,
} from "../resources/publishing";

const outputParams = z.object({ outputId: id });
const publicationParams = z.object({ publicationId: id });

// SPEC §13 "发布" group.
export const publishingOperations = {
  listPublications: defineEndpoint({
    id: "outputs.publications.list",
    method: "GET",
    path: "/outputs/:outputId/publications",
    params: outputParams,
    query: paginationQuery,
    response: publicationResource,
    isList: true,
    fr: ["FR-PUBLISHING-LIST"],
  }),
  createPublication: defineEndpoint({
    id: "outputs.publications.create",
    method: "POST",
    path: "/outputs/:outputId/publications",
    params: outputParams,
    body: z.object({
      platform: z.string().min(1),
      accountReference: z.string().min(1),
    }),
    response: publicationResource,
    fr: ["FR-PUBLISHING-CREATE"],
  }),
  getPublication: defineEndpoint({
    id: "publications.get",
    method: "GET",
    path: "/publications/:publicationId",
    params: publicationParams,
    response: publicationResource,
    fr: ["FR-PUBLISHING-GET"],
  }),
  createPublicationRevision: defineEndpoint({
    id: "publications.revisions.create",
    method: "POST",
    path: "/publications/:publicationId/revisions",
    params: publicationParams,
    // SPEC §8「多平台 标签」行:platform_tags 由人增删做真(发布工作台 chip ×/添加)。
    // 标签集是 append-only revision 的一部分(改标签 = append 新版本,守 revision 不可变),
    // 故走 revision create 的可选 platformTags 入口;省略时服务沿用旧行为(空数组)。
    body: z.object({
      title: z.string().min(1),
      description: z.string().default(""),
      platformTags: z.array(z.string()).optional(),
    }),
    response: publicationRevisionResource,
    fr: ["FR-PUBLISHING-REVISION-CREATE"],
  }),
  listPublicationRevisions: defineEndpoint({
    id: "publications.revisions.list",
    method: "GET",
    path: "/publications/:publicationId/revisions",
    params: publicationParams,
    query: paginationQuery,
    response: publicationRevisionResource,
    isList: true,
    fr: ["FR-PUBLISHING-REVISION-LIST"],
  }),
  transitionPublication: defineEndpoint({
    id: "publications.transition",
    method: "POST",
    path: "/publications/:publicationId/transition",
    params: publicationParams,
    body: z.object({ status: z.string().min(1) }),
    response: publicationResource,
    fr: ["FR-PUBLISHING-TRANSITION"],
  }),
} as const;
