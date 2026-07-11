import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createPlatformAccountRepository,
  type PlatformAccountRepository,
  type RepoDeps,
} from "./platform-account.repository";
import {
  toPlatformAccountDto,
  type PlatformAccountResource,
} from "./platform-account.schema";
import { OwnershipError, ValidationError } from "./platform-account.errors";

// PlatformAccount service (foundation §5.3) — every public method takes
// `(ctx: RequestContext, …)` and builds a repository bound to `ctx.userId`
// (createPlatformAccountRepository(db, { now, nextId, userId: ctx.userId })) so scoping
// is structural. The service owns the account registry (七步整合 §7.1 多账号矩阵) and the
// PUBLIC cross-module binding guard `assertOwnedAccount` (the seam Publishing/Projects
// call before stamping accountId — through index.ts, never the repo).
//
// No external port needed: accounts are pure local records; the `secretReference` is an
// opaque reference resolved elsewhere — this module NEVER stores or fetches a raw token
// (§7.1 + Settings precedent). No AI candidate state machine (C-3 N/A here).

// The valid platform set (= contract platformId enum). Kept inline (no zod dependency
// in the frontend package) and deterministic (C-5 — no Date.now/Math.random/fetch).
const VALID_PLATFORMS = new Set([
  "youtube",
  "bilibili",
  "douyin",
  "xiaohongshu",
  "wechatVideo",
  "x",
]);

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
}

export interface CreateAccountInput {
  platform: string;
  accountHandle: string;
  externalAccountId?: string | null; // [T-201b] 稳定身份锚(sec_uid)
  secretReference?: string | null;
  followerBaseline?: number;
}

export interface UpdateAccountInput {
  accountHandle?: string; // [T-201b] 显示名(display),非唯一可改
  externalAccountId?: string | null; // [T-201b] 身份锚回填(仅 NULL→值)
  secretReference?: string | null;
  followerBaseline?: number;
  status?: "active" | "archived";
}

export interface ListAccountsQuery {
  platform?: string;
  limit: number;
  offset: number;
}

export interface PlatformAccountService {
  listAccounts(
    ctx: RequestContext,
    query: ListAccountsQuery,
  ): Promise<{ rows: PlatformAccountResource[]; total: number }>;
  createAccount(
    ctx: RequestContext,
    input: CreateAccountInput,
  ): Promise<PlatformAccountResource>;
  getAccount(
    ctx: RequestContext,
    accountId: string,
  ): Promise<PlatformAccountResource>;
  updateAccount(
    ctx: RequestContext,
    accountId: string,
    patch: UpdateAccountInput,
  ): Promise<PlatformAccountResource>;
  archiveAccount(
    ctx: RequestContext,
    accountId: string,
  ): Promise<PlatformAccountResource>;

  // PUBLIC cross-module binding guard (the seam, exported on index.ts). Returns void
  // on success; throws OwnershipError if the account is not owned (404), ValidationError
  // if it is archived or its platform mismatches the row's platform. Publishing's
  // createPublication and Projects' targetPlatform write call THIS before stamping
  // accountId — so a Publication/target can only bind to a live, same-platform,
  // same-user account. Keeps the modular-monolith no-cross-repo rule (foundation §1).
  assertOwnedAccount(
    ctx: RequestContext,
    accountId: string,
    platform: string,
  ): Promise<void>;
}

function guardCreateInput(input: CreateAccountInput): void {
  if (!VALID_PLATFORMS.has(input.platform)) {
    throw new ValidationError(
      `ValidationError: unknown platform '${input.platform}'`,
    );
  }
  if (input.accountHandle.trim().length === 0) {
    throw new ValidationError(
      "ValidationError: accountHandle must be non-empty",
    );
  }
  if (
    input.followerBaseline !== undefined &&
    (input.followerBaseline < 0 || !Number.isInteger(input.followerBaseline))
  ) {
    throw new ValidationError(
      "ValidationError: followerBaseline must be a non-negative integer",
    );
  }
}

function guardUpdateInput(patch: UpdateAccountInput): void {
  if (
    patch.accountHandle !== undefined &&
    patch.accountHandle.trim().length === 0
  ) {
    throw new ValidationError(
      "ValidationError: accountHandle must be non-empty",
    );
  }
  if (
    patch.followerBaseline !== undefined &&
    (patch.followerBaseline < 0 || !Number.isInteger(patch.followerBaseline))
  ) {
    throw new ValidationError(
      "ValidationError: followerBaseline must be a non-negative integer",
    );
  }
  if (
    patch.status !== undefined &&
    patch.status !== "active" &&
    patch.status !== "archived"
  ) {
    throw new ValidationError(
      `ValidationError: unknown status '${patch.status}'`,
    );
  }
}

export function createPlatformAccountService(
  deps: ServiceDeps,
): PlatformAccountService {
  const { db, now, nextId } = deps;

  function repoFor(ctx: RequestContext): PlatformAccountRepository {
    const repoDeps: RepoDeps = { now, nextId, userId: ctx.userId };
    return createPlatformAccountRepository(db, repoDeps);
  }

  return {
    async listAccounts(ctx, query) {
      const { rows, total } = await repoFor(ctx).listAccounts(query);
      return { rows: rows.map(toPlatformAccountDto), total };
    },

    async createAccount(ctx, input) {
      guardCreateInput(input);
      const row = await repoFor(ctx).createAccount({
        platform: input.platform,
        accountHandle: input.accountHandle,
        externalAccountId: input.externalAccountId ?? null, // [T-201b]
        secretReference: input.secretReference ?? null,
        followerBaseline: input.followerBaseline,
      });
      return toPlatformAccountDto(row);
    },

    async getAccount(ctx, accountId) {
      return toPlatformAccountDto(await repoFor(ctx).getAccount(accountId));
    },

    async updateAccount(ctx, accountId, patch) {
      guardUpdateInput(patch);
      const row = await repoFor(ctx).updateAccount(accountId, patch);
      return toPlatformAccountDto(row);
    },

    async archiveAccount(ctx, accountId) {
      const repo = repoFor(ctx);
      // [T-136§D-bind ⑥] 末号保护:不准移除最后一个 active 号。移除了就没号可切、
      // ctx.accountId 落 NULL → 读门退化把所有 NULL 数据全显(用户误以为"隔离失效");
      // 且该号名下作品/定位/项目会失去归属锚点。至少保留一个号。
      const target = await repo.getAccount(accountId); // ownership gate + 拿当前状态
      if (target.status === "active") {
        const { rows } = await repo.listAccounts({ limit: 1000, offset: 0 });
        const activeCount = rows.filter((r) => r.status === "active").length;
        if (activeCount <= 1) {
          throw new ValidationError(
            "ValidationError: 不能移除最后一个抖音号——至少保留一个号,否则作品/定位/项目将失去归属。",
          );
        }
      }
      const row = await repo.archiveAccount(accountId);
      return toPlatformAccountDto(row);
    },

    async assertOwnedAccount(ctx, accountId, platform) {
      const repo = repoFor(ctx);
      // Ownership gate first: a cross-user / unknown id throws OwnershipError (→404)
      // BEFORE leaking active/platform state.
      const row = await repo.getAccount(accountId);
      if (row.status !== "active") {
        throw new ValidationError(
          `ValidationError: platform account ${accountId} is archived (cannot bind)`,
        );
      }
      if (row.platform !== platform) {
        throw new ValidationError(
          `ValidationError: platform account ${accountId} is ${row.platform}, not ${platform}`,
        );
      }
    },
  };
}

// Re-export for the cross-module seam consumers that only need the error type.
export { OwnershipError };
