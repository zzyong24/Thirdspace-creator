// MaterialLink module (用料链 / Bill-of-Materials, Plan A4) — the ONLY public entry
// (foundation §1 / MODULE-ARCH §2). The composite transport imports MaterialLink ONLY
// through this file (never its internals): the service + repository factories to
// construct it over the shared db, the transport factory + op-id list the composite
// merges, MATERIAL_LINKS_DDL, the contract DTO, and the error classes the dispatch route
// maps. No cross-module repository import.

export {
  createMaterialLinksService,
  type MaterialLinksService,
  type CreateMaterialLinkInput,
  type ListMaterialLinksQuery,
} from "./material-links.service";

export {
  createMaterialLinkRepository,
  type MaterialLinkRepository,
  type RepoDeps,
  type MaterialLinkRow,
} from "./material-links.repository";

export {
  createMaterialLinksTransport,
  MATERIAL_LINKS_OP_IDS,
} from "./material-links.transport";

export { MATERIAL_LINKS_DDL } from "./material-links.db-schema";

export { OwnershipError, ValidationError } from "./material-links.errors";

export {
  materialLinkResource,
  toMaterialLinkDto,
  type MaterialLinkResource,
} from "./material-links.schema";
