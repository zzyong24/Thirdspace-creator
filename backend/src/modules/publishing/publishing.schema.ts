// Publishing module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs
// for this module"). The transport's toResource(row) and the contract test
// validate their outputs against these; the contract is the single source of truth
// for the wire shape (contract/src/resources/publishing.ts).
//
// Topology (verified against production.schema.ts): the @creatoros/contract root
// barrel re-exports `ENDPOINTS` but NOT the resource files. The per-op response
// schema is reachable as ENDPOINTS.<op>.response:
//   - listPublications.response === createPublication.response === getPublication.response
//       === transitionPublication.response === publicationResource
//   - createPublicationRevision.response === publicationRevisionResource
import { ENDPOINTS } from "@creatoros/contract";

export const publicationResource = ENDPOINTS.listPublications.response;
export const publicationRevisionResource =
  ENDPOINTS.createPublicationRevision.response;

// Derive the inferred output types from each schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod` as a
// direct dependency, so we read the output type structurally instead of a bare
// `import type { z } from "zod"`.
export type PublicationResource = (typeof publicationResource)["_output"];
export type PublicationRevisionResource =
  (typeof publicationRevisionResource)["_output"];
