import { z } from "zod";
import { id, iso8601 } from "../primitives";

// MaterialLink (用料链 / Bill-of-Materials, Plan A4). The edge recording that a project
// (and optionally a specific content output) USES a library item — a KnowledgeItem or
// an Asset — with a role + stage + provenance. The single source of truth for the wire
// shape; the module's `<module>.schema.ts` re-exports it.
export const materialLinkResource = z.object({
  id,
  userId: id,
  projectId: id,
  contentOutputId: id.nullable(),
  entityType: z.enum(["knowledge", "asset"]),
  entityId: id,
  role: z.string(),
  stage: z.string(),
  addedByType: z.string(),
  createdAt: iso8601,
});
export type MaterialLinkResource = z.infer<typeof materialLinkResource>;
