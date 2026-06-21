// Knowledge module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs
// for this module"). The transport's toResource(row) and the contract test
// validate their outputs against these; the contract is the single source of
// truth for the wire shape (contract/src/resources/knowledge.ts).
//
// Topology (verified against notifications.schema.ts): the @creatoros/contract
// root barrel re-exports `ENDPOINTS` but NOT the resource files. The per-op
// response schema is reachable as ENDPOINTS.<op>.response:
//   - listKnowledge.response === getKnowledge.response === createKnowledge.response
//       === knowledgeItemResource
//   - createKnowledgeRevision.response === knowledgeRevisionResource
//   - createKnowledgeRelation.response === knowledgeRelationResource
// So derive the DTOs from ENDPOINTS, not a non-existent resource subpath.
import { ENDPOINTS } from "@creatoros/contract";

export const knowledgeItemResource = ENDPOINTS.listKnowledge.response;
export const knowledgeRevisionResource =
  ENDPOINTS.createKnowledgeRevision.response;
export const knowledgeRelationResource =
  ENDPOINTS.createKnowledgeRelation.response;

// Derive the inferred output types from each schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod`
// as a direct dependency, so we read the output type structurally instead of a
// bare `import type { z } from "zod"`.
export type KnowledgeItemResource = (typeof knowledgeItemResource)["_output"];
export type KnowledgeRevisionResource =
  (typeof knowledgeRevisionResource)["_output"];
export type KnowledgeRelationResource =
  (typeof knowledgeRelationResource)["_output"];
