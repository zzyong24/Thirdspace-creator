// @vitest-environment node
import {it,expect,vi} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {resolve} from "node:path";
import {tmpdir} from "node:os";
import type {Db} from "@creatoros/backend";
import type {Endpoint,RequestContext} from "@creatoros/contract";
import type {ResearchMaterialAdoptionPorts} from "../../../backend/src/modules/ai/research-material-adoption.service";
const fixture=vi.hoisted(()=>({db:undefined as Db|undefined,ports:undefined as ResearchMaterialAdoptionPorts|undefined}));
vi.mock("@creatoros/backend",async original=>{const actual=await original<typeof import("@creatoros/backend")>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const result=await actual.createConfiguredDb(...args);fixture.db=result.db;return result;}};});
vi.mock("@creatoros/backend/modules/assets",async original=>{const actual=await original<typeof import("@creatoros/backend/modules/assets")>();return {...actual,migrateStorageRoot:async()=>{throw new Error("本测试禁止迁移媒体目录");}};});
vi.mock("@creatoros/backend/modules/ai",async original=>{const actual=await original<typeof import("@creatoros/backend/modules/ai")>();return {...actual,createResearchMaterialAdoptionService:(...args:Parameters<typeof actual.createResearchMaterialAdoptionService>)=>{fixture.ports=args[1];return actual.createResearchMaterialAdoptionService(...args);}};});
import {getChatRuntime,compositeTransport,__resetPersistenceForTests} from "./persistence-client";
it("正式研究用料事务端口返回真实组项目：跨域/缺父项拒绝，写后失败完整回滚",async()=>{
 const dir=mkdtempSync(resolve(tmpdir(),"t1072-materiallinks-composition-"));
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",resolve(dir,"db"));__resetPersistenceForTests();
 const user:RequestContext={userId:"isolated-research-link-owner",accountId:null,source:"user",requestId:"test"};
 const call=async(ctx:RequestContext,id:string,body?:unknown,params?:unknown)=>(await compositeTransport.request({id} as Endpoint,{body,params} as never,ctx) as {data:any}).data;
 try{
  await getChatRuntime();
  const group=await call(user,"accountGroups.create",{name:"研究用料组",idempotencyKey:"research-group"});
  const other=await call(user,"accountGroups.create",{name:"其它用料组",idempotencyKey:"research-other"});
  const ctx={...user,groupId:group.id,groupVersion:group.version};
  const project=await call(ctx,"projects.create",{title:"真实研究用料项目"});
  const db=fixture.db!,ports=fixture.ports!;
  const {materialLinks,knowledgeItems,eq}=await import("@creatoros/backend");
  const input=(id:string)=>({projectId:project.id,entityType:"knowledge" as const,entityId:id,role:"reference" as const,stage:"research" as const,addedByType:"ai" as const});
  const create=(tx:any)=>ports.createKnowledge(ctx,{title:"真实研究素材",knowledgeType:"note",content:"明确来源正文"},tx);
  const before=await db.select().from(knowledgeItems);
  await expect(db.transaction(async tx=>{const k=await create(tx);await ports.linkKnowledge(ctx,input(k.id),tx);throw new Error("原事务写后断开");})).rejects.toThrow("原事务写后断开");
  expect(await db.select().from(knowledgeItems)).toHaveLength(before.length);
  expect(await db.select().from(materialLinks).where(eq(materialLinks.projectId,project.id))).toEqual([]);
  const k=await db.transaction(async tx=>{const k=await create(tx);await ports.linkKnowledge(ctx,input(k.id),tx);return k;});
  const rows=await db.select().from(materialLinks).where(eq(materialLinks.projectId,project.id));
  expect(rows).toMatchObject([{groupId:group.id,entityId:k.id,role:"reference",stage:"research"}]);expect(rows).toHaveLength(1);
  for(const foreign of [{...ctx,groupId:other.id},{...ctx,userId:"different-owner"}])await expect(db.transaction(tx=>ports.linkKnowledge(foreign,input(k.id),tx))).rejects.toThrow();
  await expect(db.transaction(tx=>ports.linkKnowledge(ctx,{...input(k.id),projectId:"missing-project"},tx))).rejects.toThrow();
  expect(await db.select().from(materialLinks).where(eq(materialLinks.projectId,project.id))).toEqual(rows);
 }finally{await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});}
},30000);
