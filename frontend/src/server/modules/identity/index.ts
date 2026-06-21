// Identity module — the ONLY public entry (foundation §1 / MODULE-ARCH §2).
// Identity owns NO contract dispatch ops, so there is no transport map export.
// Later modules import Identity ONLY through this file (never its internals),
// for `RequestContext` + `resolveContextFromToken` (Tasks 8/9 consume both).
//
// Task 5 surface: the service factory + its DTO/context types, plus the
// repository factory needed to construct the service over the shared db. The
// canonical-user seed helper lands in Task 7 and is re-exported here then.

export {
  createIdentityService,
  type IdentityService,
  type RequestContext,
  type UserDTO,
  type LoginInput,
  type LoginResult,
  type ServiceDeps,
} from "./identity.service";

export {
  createIdentityRepository,
  type IdentityRepository,
  type RepoDeps,
  type UserRow,
  type SessionRow,
} from "./identity.repository";

export { AuthenticationError, OwnershipError } from "./identity.errors";
