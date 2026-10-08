import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, iso8601, paginationQuery } from "../primitives";
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
    // T-595：可见性已在采集边界归一，列表只有普通分页，不再暴露 hidden 分支。
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
      accountId:id.optional(),
      expectedMembershipVersion:z.number().int().positive().optional(),
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
  // [T-055h③ / T-063c] 登记已发布:用户把平台链接粘进来(稿面发布包区/排期条目),
  // 解析出 external_id 后走这里直接落一条 published publication(status=published +
  // external_id/external_url/published_at)。语义与数据底座导入同源 —— backend 复用
  // publishingService.createImportedPublication(幂等于 (platform, externalId),重复
  // 登记返回既有行)。可选 title 给 revision 起个真名(缺省空 revision,只为满足
  // currentRevisionId 非空的 DTO 约束)。
  registerPublishedPublication: defineEndpoint({
    id: "outputs.publications.register",
    method: "POST",
    path: "/outputs/:outputId/publications/register",
    params: outputParams,
    // [DATA-M03] 输入与输出（publicationResource）同源规范:
    //   - publishedAt 用 iso8601 校验（输出 publishedAt 是 iso8601|null,输入放任意字符串会
    //     落库后毒化响应解析）。缺省/未提供仍合法(可选)。
    //   - externalUrl 规范化:trim + 合法 URL（前端粘链接场景防前后空白/半截串)。
    body: z.object({
      platform: z.string().min(1),
      accountId:id.optional(),
      expectedMembershipVersion:z.number().int().positive().optional(),
      externalId: z.string().min(1),
      externalUrl: z.string().trim().url().nullable().optional(),
      publishedAt: iso8601.nullable().optional(),
      title: z.string().optional(),
    }),
    response: publicationResource,
    fr: ["FR-PUBLISHING-REGISTER-PUBLISHED"],
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
