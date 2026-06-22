// MaterialLink module schema surface — the contract Zod DTO this module produces
// (foundation §5). The transport's mapper and the contract test validate their outputs
// against this; the contract is the single source of truth for the wire shape
// (contract/src/resources/material-links.ts). The @creatoros/contract root barrel
// re-exports `materialLinkResource` directly (same convention as taxonomy/positioning).
import { materialLinkResource } from "@creatoros/contract";
import type { MaterialLinkRow } from "./material-links.repository";

export { materialLinkResource };

// Derive the inferred output type from the schema's phantom `_output` (the frontend
// package does not declare `zod` as a direct dependency, so we read the output type
// structurally — mirrors platform-account).
export type MaterialLinkResource = (typeof materialLinkResource)["_output"];

// Row → DTO mapper (the API DTO is built by an explicit mapper, NEVER the Drizzle row).
// The service + contract test share ONE mapping so a wire-shape change is caught once.
export function toMaterialLinkDto(row: MaterialLinkRow): MaterialLinkResource {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    contentOutputId: row.contentOutputId ?? null,
    entityType: row.entityType as MaterialLinkResource["entityType"],
    entityId: row.entityId,
    role: row.role,
    stage: row.stage,
    addedByType: row.addedByType,
    createdAt: row.createdAt,
  };
}
