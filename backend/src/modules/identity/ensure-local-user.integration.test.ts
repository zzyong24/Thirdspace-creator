import {randomUUID} from "node:crypto";
import {expect,it} from "vitest";
import {createDb,users,sessions} from "@creatoros/backend";
import {createIdentityRepository,createIdentityService,ensureLocalUser,CANONICAL_USER_ID,DEV_PASSWORD,type UserRow} from "./index";
import {hashPassword,verifyPassword} from "./identity.crypto";
const deps={now:()=>"2026-09-05T12:34:56.000Z",nextId:(prefix:string)=>`${prefix}-${randomUUID()}`};
it("已有非canonical最早用户全部属性原样复用，不新增身份或改变归属",async()=>{
 const f=await createDb();try{
  const repo=createIdentityRepository(f.db,deps);
  const old:UserRow={id:"legacy-real-user",email:"old@example.com",displayName:"历史用户",timezone:"Europe/Paris",locale:"fr-FR",passwordHash:hashPassword("old-password"),createdAt:"2020-01-01T00:00:00.000Z",updatedAt:"2025-02-01T00:00:00.000Z"};
  await repo.createUser(old);await repo.createUser({...old,id:"later-user",email:"later@example.com",createdAt:"2021-01-01T00:00:00.000Z"});
  const result=await ensureLocalUser(repo,{now:()=>{throw new Error("已有用户不能刷新时间");},nextId:()=>{throw new Error("已有用户不能分配新ID");}});
  expect(result).toEqual(old);expect(await repo.getUserById(old.id)).toEqual(old);expect(await f.db.select().from(users)).toHaveLength(2);
 }finally{await f.client.close();}
});
it("空库创建真实随机身份，属性留空、实际时间、已知默认密码不能登录",async()=>{
 const ids:string[]=[];
 for(let i=0;i<2;i++){
  const f=await createDb();try{
   const repo=createIdentityRepository(f.db,deps),row=await ensureLocalUser(repo,deps);ids.push(row.id);
   expect(row.id).not.toBe(CANONICAL_USER_ID);expect(row).toMatchObject({email:"",displayName:"",locale:"zh-CN",timezone:"Asia/Shanghai",createdAt:deps.now(),updatedAt:deps.now()});
   expect(await repo.findLocalUser()).toEqual(row);expect(await ensureLocalUser(repo,deps)).toEqual(row);
   for(const password of [DEV_PASSWORD,"creatoros-dev","",row.id])expect(verifyPassword(password,row.passwordHash)).toBe(false);
   const service=createIdentityService(repo,deps);await expect(service.login({email:"",password:DEV_PASSWORD})).rejects.toMatchObject({name:"AuthenticationError"});
   expect(await f.db.select().from(sessions)).toHaveLength(0);expect((await service.resolveLocalContext()).userId).toBe(row.id);
  }finally{await f.client.close();}
 }
 expect(new Set(ids).size).toBe(2);
});
it("多实例并发启动只创建一个本地用户，所有调用返回持久同一行",async()=>{
 const f=await createDb();try{
  const results=await Promise.all(Array.from({length:12},()=>ensureLocalUser(createIdentityRepository(f.db,deps),deps)));
  expect(new Set(results.map(row=>row.id)).size).toBe(1);const rows=await f.db.select().from(users);expect(rows).toHaveLength(1);
  for(const result of results)expect(result).toEqual(rows[0]);
 }finally{await f.client.close();}
});
it("历史canonical身份存在时也保留真实属性和密码，不做隐式迁移",async()=>{
 const f=await createDb();try{
  const repo=createIdentityRepository(f.db,deps),row:UserRow={id:CANONICAL_USER_ID,email:"real@example.com",displayName:"已经填写的名字",timezone:"UTC",locale:"en-US",passwordHash:hashPassword("user-custom-password"),createdAt:"2021-01-01T00:00:00.000Z",updatedAt:"2025-01-01T00:00:00.000Z"};
  await repo.createUser(row);expect(await ensureLocalUser(repo,deps)).toEqual(row);expect(await f.db.select().from(users)).toEqual([row]);
 }finally{await f.client.close();}
});
