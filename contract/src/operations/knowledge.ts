import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery } from "../primitives";
import {
  knowledgeItemResource,
  knowledgeRevisionResource,
  knowledgeRelationResource,
  knowledgeFolderResource,
} from "../resources/knowledge";

const knowledgeParams = z.object({ knowledgeId: id });

// SPEC §13 "知识库" group.
export const knowledgeOperations = {
  listKnowledge: defineEndpoint({
    id: "knowledge.list",
    method: "GET",
    path: "/knowledge",
    query: paginationQuery,
    response: knowledgeItemResource,
    isList: true,
    fr: ["FR-KNOWLEDGE-LIST"],
  }),
  createKnowledge: defineEndpoint({
    id: "knowledge.create",
    method: "POST",
    path: "/knowledge",
    body: z.object({
      title: z.string().min(1),
      // [T-079a] 与 resources/knowledge.ts 的 knowledgeType 枚举同步(additive
      // 加四原子 claim/evidence/quote/qa,gate-F3 零删除)。
      knowledgeType: z
        .enum([
          "note",
          "reference",
          "inspiration",
          "snippet",
          "transcript",
          "claim",
          "evidence",
          "quote",
          "qa",
        ])
        .default("note"),
      content: z.string().default(""),
      // [T-079a] 可选出处(缺省落库为 NULL)。
      sourceNote: z.string().optional(),
      // [T-092] 评论回流(qa 原子)additive:sourceType 允许调用方声明来源
      // (评论经采集导入 = 'import',语义吻合既有枚举,不扩);sourceMetadata 携
      // 溯源与幂等双料锚 { origin: 'comment_backflow', signalIds, signalExternalIds }。
      // 均可选,缺省行为与旧契约完全一致(manual + {})——gate-F3 零删除。
      sourceType: z.enum(["manual", "web", "import", "ai"]).optional(),
      sourceMetadata: z.record(z.string(), z.unknown()).optional(),
      folderId: id.nullable().optional(),
      assetId: id.nullable().optional(),
    }),
    response: knowledgeItemResource,
    fr: ["FR-KNOWLEDGE-CREATE"],
  }),
  listKnowledgeFolders: defineEndpoint({
    id: "knowledge.folders.list",
    method: "GET",
    path: "/knowledge-folders",
    response: knowledgeFolderResource,
    isList: true,
    fr: ["FR-KNOWLEDGE-LIST"],
  }),
  createKnowledgeFolder: defineEndpoint({
    id: "knowledge.folders.create",
    method: "POST",
    path: "/knowledge-folders",
    body: z.object({
      name: z.string().trim().min(1).max(120),
      parentId: id.nullable().optional(),
    }),
    response: knowledgeFolderResource,
    fr: ["FR-KNOWLEDGE-CREATE"],
  }),
  moveKnowledge: defineEndpoint({
    id: "knowledge.move",
    method: "POST",
    path: "/knowledge/:knowledgeId/move",
    params: knowledgeParams,
    body: z.object({ folderId: id.nullable() }),
    response: knowledgeItemResource,
    fr: ["FR-KNOWLEDGE-CREATE"],
  }),
  getKnowledge: defineEndpoint({
    id: "knowledge.get",
    method: "GET",
    path: "/knowledge/:knowledgeId",
    params: knowledgeParams,
    response: knowledgeItemResource,
    fr: ["FR-KNOWLEDGE-GET"],
  }),
  createKnowledgeRevision: defineEndpoint({
    id: "knowledge.revisions.create",
    method: "POST",
    path: "/knowledge/:knowledgeId/revisions",
    params: knowledgeParams,
    body: z.object({ content: z.string().min(1) }),
    response: knowledgeRevisionResource,
    fr: ["FR-KNOWLEDGE-REVISION-CREATE"],
  }),
  listKnowledgeRevisions: defineEndpoint({
    id: "knowledge.revisions.list",
    method: "GET",
    path: "/knowledge/:knowledgeId/revisions",
    params: knowledgeParams,
    response: knowledgeRevisionResource,
    isList: true,
    fr: ["FR-KNOWLEDGE-REVISION-LIST"],
  }),
  listKnowledgeRelations: defineEndpoint({
    id: "knowledge.relations.list",
    method: "GET",
    path: "/knowledge/:knowledgeId/relations",
    params: knowledgeParams,
    response: knowledgeRelationResource,
    isList: true,
    fr: ["FR-KNOWLEDGE-RELATION-LIST"],
  }),
  createKnowledgeRelation: defineEndpoint({
    id: "knowledge.relations.create",
    method: "POST",
    path: "/knowledge/:knowledgeId/relations",
    params: knowledgeParams,
    body: z.object({
      targetKnowledgeId: id,
      relationType: z.string().min(1),
      // [T-091] AI 建边确认门:采纳 AI 候选边时以 createdByType='ai' 落 provenance
      // (resource 枚举早已支持)。可选,缺省 'user'(旧调用方行为不变,additive)。
      createdByType: z.enum(["user", "ai"]).optional(),
    }),
    response: knowledgeRelationResource,
    fr: ["FR-KNOWLEDGE-RELATION-CREATE"],
  }),
  // [T-091] 知识图谱全量语义边读(user-scoped)。既有 relations.list 是 per-source
  // (单源查询),画全图会 N+1;本 op 一次返回该用户全部 knowledge_relations 行。
  // additive 新 op,路径避开 /knowledge/:knowledgeId 的参数段。
  listAllKnowledgeRelations: defineEndpoint({
    id: "knowledge.relations.listAll",
    method: "GET",
    path: "/knowledge-relations",
    query: paginationQuery,
    response: knowledgeRelationResource,
    isList: true,
    fr: ["FR-KNOWLEDGE-RELATION-LIST"],
  }),
  // Soft-delete the item (status 'active' → 'archived', stamps archivedAt).
  // Mirrors assets.trash: a status transition, returns the updated item.
  archiveKnowledge: defineEndpoint({
    id: "knowledge.archive",
    method: "POST",
    path: "/knowledge/:knowledgeId/archive",
    params: knowledgeParams,
    response: knowledgeItemResource,
    fr: ["FR-KNOWLEDGE-ARCHIVE"],
  }),
  // Remove one relation off the (owned) source item. POST /remove keeps the
  // collection path style consistent with relations.create's POST; identifies
  // the relation to drop via the body's targetKnowledgeId + relationType.
  removeKnowledgeRelation: defineEndpoint({
    id: "knowledge.relations.delete",
    method: "POST",
    path: "/knowledge/:knowledgeId/relations/remove",
    params: knowledgeParams,
    body: z.object({
      targetKnowledgeId: id,
      relationType: z.string().min(1),
    }),
    response: knowledgeRelationResource,
    fr: ["FR-KNOWLEDGE-RELATION-DELETE"],
  }),
} as const;
