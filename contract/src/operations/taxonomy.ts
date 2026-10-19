import { z } from "zod";
import { defineEndpoint } from "../endpoint-definition";
import { id, paginationQuery } from "../primitives";
import {
  tagResource,
  entityTagResource,
  tagEntityType,
} from "../resources/taxonomy";

const tagParams = z.object({ tagId: id });
const entityRef = z.object({ entityType: tagEntityType, entityId: id });

// SPEC §13 "知识与素材" group — Taxonomy (Tag / EntityTag) sub-group.
export const taxonomyOperations = {
  listTags: defineEndpoint({
    id: "taxonomy.tags.list",
    method: "GET",
    path: "/tags",
    query: paginationQuery,
    response: tagResource,
    isList: true,
    fr: ["FR-TAXONOMY-TAG-LIST"],
  }),
  createTag: defineEndpoint({
    id: "taxonomy.tags.create",
    method: "POST",
    path: "/tags",
    body: z.object({
      name: z.string().min(1).max(64),
      color: z.string().min(1).optional(),
      kind: z.string().min(1).optional(),
    }),
    response: tagResource,
    fr: ["FR-TAXONOMY-TAG-CREATE"],
  }),
  patchTag: defineEndpoint({
    id: "taxonomy.tags.patch",
    method: "PATCH",
    path: "/tags/:tagId",
    params: tagParams,
    body: z.object({
      name: z.string().min(1).max(64).optional(),
      color: z.string().min(1).optional(),
      kind: z.string().min(1).optional(),
    }),
    response: tagResource,
    fr: ["FR-TAXONOMY-TAG-UPDATE"],
  }),
  deleteTag: defineEndpoint({
    id: "taxonomy.tags.delete",
    method: "POST",
    path: "/tags/:tagId/delete",
    params: tagParams,
    response: tagResource,
    fr: ["FR-TAXONOMY-TAG-DELETE"],
  }),
  assignTags: defineEndpoint({
    id: "taxonomy.entityTags.assign",
    method: "POST",
    path: "/tags/assignments",
    body: entityRef.extend({ tagIds: z.array(id).min(1).max(50) }),
    response: entityTagResource,
    isList: true,
    fr: ["FR-TAXONOMY-ASSIGN"],
  }),
  removeAssignment: defineEndpoint({
    id: "taxonomy.entityTags.remove",
    method: "POST",
    path: "/tags/assignments/remove",
    body: entityRef.extend({ tagId: id }),
    response: entityTagResource,
    fr: ["FR-TAXONOMY-REMOVE"],
  }),
  listTagsForEntity: defineEndpoint({
    id: "taxonomy.entityTags.listForEntity",
    method: "GET",
    path: "/tags/for-entity",
    query: entityRef,
    response: tagResource,
    isList: true,
    fr: ["FR-TAXONOMY-LIST-FOR-ENTITY"],
  }),
  listEntitiesForTag: defineEndpoint({
    id: "taxonomy.entityTags.listEntitiesForTag",
    method: "GET",
    path: "/tags/:tagId/entities",
    params: tagParams,
    query: paginationQuery,
    response: entityTagResource,
    isList: true,
    fr: ["FR-TAXONOMY-LIST-ENTITIES-FOR-TAG"],
  }),
} as const;
