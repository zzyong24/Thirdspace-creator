export const CONTRACT_API_BASE = "/api/v1";

export * from "./envelope";
export * from "./primitives";
export * from "./endpoints";
export * from "./request-context";
export * from "./transport";
export * from "./client";

// Taxonomy resource DTOs (module-04). Resources are normally reached via
// `ENDPOINTS.<op>.response`, but the taxonomy module's `<module>.schema.ts`
// re-exports these named Zod schemas + types directly (foundation §5 / Step 0c:
// "export the resource from contract/src/index.ts"), so the service/repository
// layer can validate against the single source of truth.
export {
  tagResource,
  entityTagResource,
  tagEntityType,
  type TagResource,
  type EntityTagResource,
  type TagEntityType,
} from "./resources/taxonomy";
