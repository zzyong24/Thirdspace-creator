// Taxonomy module schema surface — re-export the contract Zod DTOs this module
// produces (foundation §5: "<module>.schema.ts — re-export/usage of the contract
// Zod DTOs for this module"). The transport/service validate their outputs
// against these; the contract is the single source of truth for the wire shape
// (contract/src/resources/taxonomy.ts).
export {
  tagResource,
  entityTagResource,
  tagEntityType,
  type TagResource,
  type EntityTagResource,
  type TagEntityType,
} from "@creatoros/contract";
