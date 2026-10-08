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

export {createAccountGroupService,type AccountGroupService} from "./account-group.service";
export {createAccountGroupTransport,ACCOUNT_GROUP_OP_IDS} from "./account-group.transport";

export {createGroupMigrationService,type GroupMigrationService} from "./group-migration.service";
export {createMembershipLockService,lockWorkspaceMembership,assertFrozenWorkspaceMembership,activeAccountTaskCount} from "./membership-lock.service";

export {createAccountBindingCommitter} from "./account-binding-commit";

export {createAccountBindingService,type AccountBindingService,type AccountBindingStagePort} from "./account-binding.service";
export {createAccountBindingTransport,ACCOUNT_BINDING_OP_IDS} from "./account-binding.transport";

export {createAccountBindingPreparer,type AccountBindingPreparedPlan} from "./account-binding-commit";

export {createGroupResourceAccessService,type GroupResourceAccessService} from "./group-resource-access.service";
