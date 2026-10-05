// PlatformAccount module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports PlatformAccount ONLY through this file (never its
// internals): the service + repository factories to construct it over the shared db,
// the transport factory + op-id list the composite merges, PLATFORM_ACCOUNT_DDL, the
// contract DTO, and the error classes the dispatch route maps. No cross-module
// repository import.
//
// `PlatformAccountService.assertOwnedAccount` is the PUBLIC cross-module binding seam
// (§7.1): Publishing's createPublication and Projects' targetPlatform write inject this
// service and call assertOwnedAccount(ctx, accountId, platform) before stamping
// accountId — through THIS index.ts, never the repo.

export {
  createPlatformAccountService,
  type PlatformAccountService,
  type CreateAccountInput,
  type UpdateAccountInput,
  type ListAccountsQuery,
} from "./platform-account.service";

export {
  createPlatformAccountRepository,
  type PlatformAccountRepository,
  type RepoDeps,
  type PlatformAccountRow,
} from "./platform-account.repository";

export {
  createPlatformAccountTransport,
  PLATFORM_ACCOUNT_OP_IDS,
} from "./platform-account.transport";

export { PLATFORM_ACCOUNT_DDL } from "./platform-account.db-schema";

export {
  OwnershipError,
  ConflictError,
  ValidationError,
} from "./platform-account.errors";

export {
  platformAccountResource,
  toPlatformAccountDto,
  type PlatformAccountResource,
} from "./platform-account.schema";

export {lockAccountForSupply} from "./platform-account.service";

export {createBrowserProfileAuthority} from "./browser-profile-authority.service";
export { createVerifiedAccountBindingPort, VerifiedAccountBindingError,
  type VerifiedAccountBindingPortDeps } from "./verified-account-binding.port";
