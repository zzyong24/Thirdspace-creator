import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { createPlatformAccountService } from "./platform-account.service";
import { createAccountGroupService } from "./account-group.service";
import type { RequestContext } from "@creatoros/contract";

const ctx: RequestContext = { userId:"group-user", requestId:"group-request", source:"user" };
const now=()=>"2026-10-04T00:00:00.000Z";
let store: Awaited<ReturnType<typeof createDb>>;
let groups: ReturnType<typeof createAccountGroupService>;
let accounts: ReturnType<typeof createPlatformAccountService>;
beforeEach(async()=>{
 store=await createDb(); let seq=0; const deps={db:store.db,now,nextId:(p:string)=>`${p}-${++seq}`};
 groups=createAccountGroupService(deps); accounts=createPlatformAccountService(deps);
});
afterEach(async()=>{await store?.client.close();});
describe("账号组真实持久服务边界",()=>{
 it("空组可创建、重复提交幂等、重新读取仍在",async()=>{
  const a=await groups.create(ctx,{name:"月明",idempotencyKey:"create-moon"});
  const b=await groups.create(ctx,{name:"月明",idempotencyKey:"create-moon"});
  expect(a.id).toBe(b.id); expect((await groups.get(ctx,a.id)).name).toBe("月明");
  expect((await groups.list(ctx)).rows).toHaveLength(1);
  await expect(groups.get({...ctx,userId:"other"},a.id)).rejects.toMatchObject({code:"OwnershipError"});
  await expect(groups.create(ctx,{name:"另一个",idempotencyKey:"create-moon"})).rejects.toMatchObject({code:"ConflictError"});
 });
 it("旧账号各建独立组，不按相同昵称合并，保留真实账号ID",async()=>{
  const a=await accounts.createAccount(ctx,{platform:"douyin",accountHandle:"同名"});
  const b=await accounts.createAccount(ctx,{platform:"kuaishou",accountHandle:"同名"});
  await groups.ensureLegacyGroups(ctx); await groups.ensureLegacyGroups(ctx);
  const ga=await groups.forAccount(ctx,a.id);const gb=await groups.forAccount(ctx,b.id);
  expect(ga.groupId).not.toBe(gb.groupId); expect(ga.accountId).toBe(a.id);
  expect((await groups.list(ctx)).rows).toHaveLength(2);
 });
 it("同平台多个账号可转入同组，旧版本和伪造预览拒绝",async()=>{
  const a=await accounts.createAccount(ctx,{platform:"douyin",accountHandle:"一号"});
  const b=await accounts.createAccount(ctx,{platform:"douyin",accountHandle:"二号"});
  await groups.ensureLegacyGroups(ctx);const target=await groups.forAccount(ctx,a.id);
  const preview=await groups.previewTransfer(ctx,{accountId:b.id,toGroupId:target.groupId});
  await expect(groups.transfer(ctx,{...preview,digest:"wrong",idempotencyKey:"move-b"})).rejects.toMatchObject({code:"ConflictError"});
  const moved=await groups.transfer(ctx,{...preview,idempotencyKey:"move-b"});
  expect(moved.groupId).toBe(target.groupId);
  expect((await groups.get(ctx,target.groupId)).members.map(m=>m.accountId)).toEqual(expect.arrayContaining([a.id,b.id]));
  expect((await groups.transfer(ctx,{...preview,idempotencyKey:"move-b"})).groupId).toBe(target.groupId);
  await expect(groups.transfer(ctx,{...preview,idempotencyKey:"move-again"})).rejects.toMatchObject({code:"ConflictError"});
 });
 it("跨用户目标及已归档组拒绝新成员，组改名需当前版本",async()=>{
  const g=await groups.create(ctx,{name:"空组",idempotencyKey:"empty"});
  await expect(groups.update(ctx,g.id,{name:"错误",expectedVersion:g.version+1})).rejects.toMatchObject({code:"ConflictError"});
  const renamed=await groups.update(ctx,g.id,{name:"新名字",expectedVersion:g.version});
  const archived=await groups.archive(ctx,g.id,renamed.version); expect(archived.status).toBe("archived");
  expect((await groups.get(ctx,g.id)).name).toBe("新名字");
  expect((await groups.restore(ctx,g.id,archived.version)).status).toBe("active");
 });
});
