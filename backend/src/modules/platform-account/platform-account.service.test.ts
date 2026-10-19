import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { platformId, type RequestContext } from "@creatoros/contract";
import {createAccountGroupService} from './account-group.service';
import {createProjectRepository,createProjectsService} from '../projects';
import {
  createPlatformAccountService,
  type PlatformAccountService,
} from "./platform-account.service";
import {
  OwnershipError,
  ConflictError,
  ValidationError,
} from "./platform-account.errors";

// Step 3 (service, fake now/nextId, pglite db) — validation guards (valid + invalid),
// assertOwnedAccount cross-tenant / cross-platform / archived rejection, archive
// soft-flip. Mirrors the realized candidate/monetization service tests.

const NOW = "2026-06-21T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "r2", source: "user" };

function makeService(db: Db): PlatformAccountService {
  let seq = 0;
  return createPlatformAccountService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
}

describe("platform-account service", () => {
  let db: Db;
  let svc: PlatformAccountService;
  beforeEach(async () => {
    ({ db } = await createDb());
    svc = makeService(db);
  });

  it("createAccount happy path → active, baseline echoed", async () => {
    const acct = await svc.createAccount(ctxA, {
      platform: "douyin",
      accountHandle: "@main",
      followerBaseline: 1200,
    });
    expect(acct).toMatchObject({
      platform: "douyin",
      accountHandle: "@main",
      followerBaseline: 1200,
      status: "active",
      secretReference: null,
    });
  });

  it("createAccount defaults followerBaseline to 0", async () => {
    const acct = await svc.createAccount(ctxA, {
      platform: "bilibili",
      accountHandle: "@b",
    });
    expect(acct.followerBaseline).toBe(0);
  });

  it("合同支持的每种平台都可建立账号登记，包含抖音、小红书和快手", async () => {
    for (const platform of platformId.options) {
      const account = await svc.createAccount(ctxA, {
        platform, accountHandle: `@${platform}`,
      });
      expect(account.platform).toBe(platform);
    }
  });

  it("rejects an invalid platform string with ValidationError", async () => {
    await expect(
      svc.createAccount(ctxA, {
        platform: "tiktok", // not in the platformId enum
        accountHandle: "@x",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a negative followerBaseline with ValidationError", async () => {
    await expect(
      svc.createAccount(ctxA, {
        platform: "douyin",
        accountHandle: "@neg",
        followerBaseline: -5,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an empty handle with ValidationError", async () => {
    await expect(
      svc.createAccount(ctxA, { platform: "douyin", accountHandle: "   " }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  // [T-201b] 身份唯一键换 external_account_id(sec_uid):撞同 sec_uid → ConflictError;
  //   同 handle 不同/无 sec_uid → 允许(display 非唯一)。
  it("rejects a duplicate external_account_id with ConflictError; allows duplicate handle", async () => {
    await svc.createAccount(ctxA, {
      platform: "douyin",
      accountHandle: "@a",
      externalAccountId: "sec-uid-1",
    });
    await expect(
      svc.createAccount(ctxA, {
        platform: "douyin",
        accountHandle: "@b",
        externalAccountId: "sec-uid-1",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    // 同 handle、无 sec_uid → 允许(不再撞唯一)。
    const dup = await svc.createAccount(ctxA, {
      platform: "douyin",
      accountHandle: "@a",
    });
    expect(dup.accountHandle).toBe("@a");
  });

  it("updateAccount patches only provided fields and rejects unknown status", async () => {
    const acct = await svc.createAccount(ctxA, {
      platform: "douyin",
      accountHandle: "@u",
      followerBaseline: 10,
    });
    const updated = await svc.updateAccount(ctxA, acct.id, {
      followerBaseline: 99,
    });
    expect(updated.followerBaseline).toBe(99);
    expect(updated.accountHandle).toBe("@u");
    await expect(
      svc.updateAccount(ctxA, acct.id, {
        status: "frozen" as unknown as "active",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("getAccount cross-user → OwnershipError (404)", async () => {
    const acct = await svc.createAccount(ctxA, {
      platform: "douyin",
      accountHandle: "@a",
    });
    await expect(svc.getAccount(ctxB, acct.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  describe("assertOwnedAccount (cross-module binding guard)", () => {
    it("passes for an owned, active, same-platform account", async () => {
      const acct = await svc.createAccount(ctxA, {
        platform: "douyin",
        accountHandle: "@bind",
      });
      await expect(
        svc.assertOwnedAccount(ctxA, acct.id, "douyin"),
      ).resolves.toBeUndefined();
    });

    it("throws OwnershipError for another user's account", async () => {
      const acct = await svc.createAccount(ctxA, {
        platform: "douyin",
        accountHandle: "@bind",
      });
      await expect(
        svc.assertOwnedAccount(ctxB, acct.id, "douyin"),
      ).rejects.toBeInstanceOf(OwnershipError);
    });

    it("throws ValidationError on platform mismatch", async () => {
      const acct = await svc.createAccount(ctxA, {
        platform: "douyin",
        accountHandle: "@bind",
      });
      await expect(
        svc.assertOwnedAccount(ctxA, acct.id, "bilibili"),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("throws ValidationError for an archived account", async () => {
      const acct = await svc.createAccount(ctxA, {
        platform: "douyin",
        accountHandle: "@bind",
      });
      // [T-136§D-bind⑥] 留一个"守门号",否则末号保护会拒绝 archive(@bind 成末号)。
      await svc.createAccount(ctxA, {
        platform: "douyin",
        accountHandle: "@keep",
      });
      const archived = await svc.archiveAccount(ctxA, acct.id);
      expect(archived.status).toBe("archived");
      await expect(
        svc.assertOwnedAccount(ctxA, acct.id, "douyin"),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  // T1022 允许账号组隐藏全部平台账号，保留组及其真实历史内容。
  describe("archiveAccount 空组与历史保留", () => {
    async function historyFor(accountId:string){
      const groups=createAccountGroupService({db,now:()=>NOW,nextId:prefix=>`${prefix}-history`});
      const membership=await groups.forAccount(ctxA,accountId),group=await groups.get(ctxA,membership.groupId);
      const scope:RequestContext={...ctxA,accountId:null,groupId:group.id,groupVersion:group.version};
      let historySequence=0;
      const projects=createProjectsService(createProjectRepository(db),{now:()=>NOW,nextId:prefix=>`${prefix}-${accountId}-history-${++historySequence}`});
      const project=await projects.createProject(scope,{title:'原账号组的历史创作'});
      return {groups,group,membership,scope,projects,project};
    }
    it("允许隐藏最后一个active号，真0活跃且原组历史仍可读，外人仍拒绝", async () => {
      const only = await svc.createAccount(ctxA, {platform:"douyin",accountHandle:"@only"});
      const h=await historyFor(only.id);
      await expect(svc.archiveAccount(ctxA,only.id)).resolves.toMatchObject({id:only.id,status:'archived'});
      expect((await svc.getAccount(ctxA,only.id)).status).toBe('archived');
      const all=await svc.listAccounts(ctxA,{limit:100,offset:0});
      expect(all.rows.filter(row=>row.status==='active')).toEqual([]);
      expect(all.rows).toHaveLength(1);
      const group=await h.groups.get(h.scope,h.group.id);
      expect(group).toMatchObject({id:h.group.id,status:'active',members:[{id:h.membership.id,accountId:only.id,status:'archived'}]});
      expect(await h.projects.getProject(h.scope,h.project.id)).toEqual(h.project);
      await expect(svc.archiveAccount(ctxB,only.id)).rejects.toBeInstanceOf(OwnershipError);
      await expect(h.groups.get(ctxB,h.group.id)).rejects.toBeInstanceOf(OwnershipError);
      expect((await svc.getAccount(ctxA,only.id)).status).toBe('archived');
    });
    it("多active先隐藏其一，再隐藏末号成功，两账号与原组历史都保留", async () => {
      const a1=await svc.createAccount(ctxA,{platform:'douyin',accountHandle:'@a1'});
      const a2=await svc.createAccount(ctxA,{platform:'douyin',accountHandle:'@a2'});
      const h=await historyFor(a2.id);
      expect((await svc.archiveAccount(ctxA,a1.id)).status).toBe('archived');
      expect((await svc.getAccount(ctxA,a2.id)).status).toBe('active');
      expect((await svc.listAccounts(ctxA,{limit:100,offset:0})).rows.filter(row=>row.status==='active').map(row=>row.id)).toEqual([a2.id]);
      expect((await svc.archiveAccount(ctxA,a2.id)).status).toBe('archived');
      const all=await svc.listAccounts(ctxA,{limit:100,offset:0});
      expect(all.rows).toHaveLength(2);expect(all.rows.filter(row=>row.status==='active')).toEqual([]);
      expect(await h.projects.getProject(h.scope,h.project.id)).toEqual(h.project);
      expect(await h.groups.get(h.scope,h.group.id)).toMatchObject({id:h.group.id,status:'active',members:[{accountId:a2.id,status:'archived'}]});
      await expect(svc.archiveAccount(ctxB,a2.id)).rejects.toBeInstanceOf(OwnershipError);
      await expect(h.projects.getProject({...h.scope,userId:ctxB.userId},h.project.id)).rejects.toBeInstanceOf(OwnershipError);
    });
  });

  it("listAccounts is platform-filtered and user-scoped", async () => {
    await svc.createAccount(ctxA, { platform: "douyin", accountHandle: "@d1" });
    await svc.createAccount(ctxA, { platform: "bilibili", accountHandle: "@b1" });
    await svc.createAccount(ctxB, { platform: "douyin", accountHandle: "@d1" });

    const aDouyin = await svc.listAccounts(ctxA, {
      platform: "douyin",
      limit: 100,
      offset: 0,
    });
    expect(aDouyin.total).toBe(1);
    expect(aDouyin.rows[0]?.userId).toBe("user-a");

    const aAll = await svc.listAccounts(ctxA, { limit: 100, offset: 0 });
    expect(aAll.total).toBe(2); // A's douyin + bilibili, never B's row
  });
});
