import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery } from "../primitives";
import {
  knowledgeItemResource,
  knowledgeRevisionResource,
  knowledgeRelationResource,
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
      knowledgeType: z
        .enum(["note", "reference", "inspiration", "snippet", "transcript"])
        .default("note"),
      content: z.string().default(""),
    }),
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
    }),
    response: knowledgeRelationResource,
    fr: ["FR-KNOWLEDGE-RELATION-CREATE"],
  }),
} as const;
