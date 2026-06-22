// Identity module — the ONLY public entry (foundation §1 / MODULE-ARCH §2).
// Identity owns NO contract dispatch ops, so there is no transport map export.
// Later modules import Identity ONLY through this file (never its internals),
// for `RequestContext` + `resolveContextFromToken` (Tasks 8/9 consume both).
//
// Surface: the service factory + its DTO/context types, the repository factory
// needed to construct the service over the shared db, and (Task 7) the
// canonical-user seed helper so every fixture-backed page keeps resolving.

export {
  createIdentityService,
  seedCanonicalUser,
  CANONICAL_USER_ID,
  DEV_PASSWORD,
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
