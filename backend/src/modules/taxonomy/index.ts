// Taxonomy module — the ONLY public entry (foundation §1 / MODULE-ARCH §2).
// Other modules + the composite transport import Taxonomy ONLY through this file
// (never its internals): the service + repository factories to construct it over
// the shared db, the transport factory + op-id registry the composite merges,
// the contract DTO types, and the error classes the dispatch route maps.

export {
  createTaxonomyService,
  type TaxonomyService,
} from "./taxonomy.service";

export {
  createTaxonomyRepository,
  type TaxonomyRepository,
  type RepoDeps,
  type TagRow,
  type EntityTagRow,
} from "./taxonomy.repository";

export {
  createTaxonomyTransport,
  TAXONOMY_OP_IDS,
} from "./taxonomy.transport";

export {
  TagNotFoundError,
  DuplicateTagError,
  InvalidEntityRefError,
} from "./taxonomy.errors";

export {
  tagResource,
  entityTagResource,
  tagEntityType,
  type TagResource,
  type EntityTagResource,
  type TagEntityType,
} from "./taxonomy.schema";

export { createAssetTagProposalService, type AssetTagTarget, type AssetTagProposal, type AssetTagAdoptionResult } from "./asset-tag-proposal.service";

export type {TaxonomyEntityAccess} from "./taxonomy.service";
