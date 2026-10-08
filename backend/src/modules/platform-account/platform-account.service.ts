import {createHash} from "node:crypto";
import {accountGroupCommands} from "../../schema/account-groups";
import {ConflictError} from "./platform-account.errors";
import {createAccountGroupService} from "./account-group.service";
import type { RequestContext } from "@creatoros/contract";
import {and,eq,type Db} from "@creatoros/backend";
import {platformAccounts} from "./platform-account.db-schema";
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
  "wechatOfficial",
  "kuaishou",
  "x",
]);

export interface ServiceDeps {
  bindingCapabilities?: (ctx:RequestContext)=>Promise<import("@creatoros/contract").PlatformAccountCapabilitiesResource[]>;
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
}

export interface CreateAccountInput {
  platform: string;
  accountHandle: string;
  idempotencyKey?:string;
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
  getBindingCapabilities(ctx:RequestContext):Promise<import("@creatoros/contract").PlatformAccountCapabilitiesResource[]>;
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
    async getBindingCapabilities(ctx){return deps.bindingCapabilities?.(ctx)??[];},
    async listAccounts(ctx, query) {
      const { rows, total } = await repoFor(ctx).listAccounts(query);
      return { rows: rows.map(toPlatformAccountDto), total };
    },

    async createAccount(ctx, input) {
      guardCreateInput(input);
      const command={...input,groupId:ctx.groupId??null};
      const inputHash=createHash("sha256").update(JSON.stringify(command)).digest("hex");
      const cached=async()=>{
        if(!input.idempotencyKey)return null;
        const [r]=await db.select().from(accountGroupCommands).where(and(eq(accountGroupCommands.userId,ctx.userId),eq(accountGroupCommands.key,input.idempotencyKey)));
        if(r&&(r.kind!=="create-account"||r.inputHash!==inputHash))throw new ConflictError("提交内容已改变，请重新登记");
        return r?.result as PlatformAccountResource|null;
      };
      const previous=await cached();if(previous)return previous;
      try{const row = await db.transaction(async tx=>{
        const row = await createPlatformAccountRepository(tx as unknown as Db,{now,nextId,userId:ctx.userId}).createAccount({
        platform: input.platform,
        accountHandle: input.accountHandle,
        externalAccountId: input.externalAccountId ?? null, // [T-201b]
        secretReference: input.secretReference ?? null,
        followerBaseline: input.followerBaseline,
      });
        await createAccountGroupService({db,now,nextId}).registerAccount(ctx,row.id,tx);
        if(input.idempotencyKey)await tx.insert(accountGroupCommands).values({userId:ctx.userId,key:input.idempotencyKey,kind:"create-account",inputHash,result:toPlatformAccountDto(row),createdAt:now()});
        return row;
      });
      return toPlatformAccountDto(row);
      }catch(error){const previous=await cached();if(previous)return previous;throw error;}
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
      await repo.getAccount(accountId); // 归属验证；组允许无账号，隐藏不删除历史。
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
      if(ctx.groupId){const m=await createAccountGroupService({db,now,nextId}).forAccount(ctx,accountId);if(m.groupId!==ctx.groupId)throw new OwnershipError("账号不属于当前账号组");}
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

/** 日供给提交以真实账号为互斥键，锁寿命由调用方事务统一管理。 */
export async function lockAccountForSupply(tx:Parameters<Parameters<Db["transaction"]>[0]>[0],ctx:RequestContext):Promise<void>{
 if(!ctx.accountId)throw new OwnershipError("账号不存在");
 const [account]=await tx.select({id:platformAccounts.id}).from(platformAccounts).where(and(eq(platformAccounts.id,ctx.accountId),eq(platformAccounts.userId,ctx.userId))).for("update");
 if(!account)throw new OwnershipError("账号不存在");
}
