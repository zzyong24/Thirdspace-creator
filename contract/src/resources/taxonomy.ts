import { z } from "zod";
import { id, iso8601 } from "../primitives";

// TagEntityType — mirror frontend/src/types/domain.ts:413-419 exactly.
export const tagEntityType = z.enum([
  "project",
  "artifact",
  "knowledge",
  "asset",
  "learning",
  "publication",
]);
export type TagEntityType = z.infer<typeof tagEntityType>;

// Tag extends BaseEntity (data-model §5 TAG). `color`/`kind` are optional
// presentation/classification facets; `usageCount` is a derived denormalized
// counter the service maintains as entity tags are assigned/removed.
export const tagResource = z.object({
  id,
  userId: id,
  name: z.string(),
  color: z.string().optional(),
  kind: z.string().optional(),
  usageCount: z.number().int().min(0),
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type TagResource = z.infer<typeof tagResource>;

// EntityTag extends BaseEntity (data-model §5 ENTITY_TAG); the polymorphic join
// row carries its own createdAt for ordering "recently tagged" views.
export const entityTagResource = z.object({
  id,
  tagId: id,
  entityType: tagEntityType,
  entityId: id,
  createdAt: iso8601,
});
export type EntityTagResource = z.infer<typeof entityTagResource>;
