import type {RequestContext} from "@creatoros/contract";
import type {Db} from "@creatoros/backend";
import {projects as originalProjects} from "../../schema/projects";
import {randomUUID} from "node:crypto";
import {expect,it} from "vitest";
import {createDb,eq,learnings} from "@creatoros/backend";
import {createLearningsService} from "./learnings.service";
const ctx={userId:"adopt-user",accountId:"adopt-account",requestId:"test",source:"user" as const};
it("领域提交回执丢失和并发重投只创建同一经验，保留真实来源与状态",async()=>{
 const f=await createDb();try{
  const service=createLearningsService({db:f.db,now:()=>"2026-09-05T00:00:00.000Z",nextId:p=>`${p}-${randomUUID()}`,projects:{assertOwnsProject:async()=>{},recordActivity:async()=>{}}});
  await seedOriginalProject(f.db,ctx,"source-project","2026-09-05T00:00:00.000Z");
  for(const evidenceStrength of [null,"grounded"] as const){
   const input={title:"真实经验",insight:"实际候选内容",projectId:"source-project",evidenceStrength,adoptionKey:`candidate:${evidenceStrength}`};
   await service.createLearning(ctx,input); // 已提交，但调用者没有保存该回执。
   const rows=await Promise.all(Array.from({length:5},()=>service.createLearning(ctx,input)));
   expect(new Set(rows.map(row=>row.id)).size).toBe(1);
   const [stored]=await f.db.select().from(learnings).where(eq(learnings.id,rows[0]!.id));
   expect(stored).toMatchObject({projectId:"source-project",evidenceStrength,validationStatus:evidenceStrength?"validated":"candidate"});
   await f.db.update(learnings).set({validationStatus:"discarded",title:"用户编辑内容"}).where(eq(learnings.id,stored!.id));
   expect((await service.createLearning(ctx,input)).title).toBe("用户编辑内容");
   expect((await f.db.select().from(learnings).where(eq(learnings.id,stored!.id)))[0]?.validationStatus).toBe("discarded");
  }
  expect(await f.db.select().from(learnings)).toHaveLength(2);
 }finally{await f.client.close();}
});
it("稳定项键按用户账号隔离，未提供项键保持原创建语义",async()=>{
 const f=await createDb();try{
  const service=createLearningsService({db:f.db,now:()=>new Date().toISOString(),nextId:p=>`${p}-${randomUUID()}`,projects:{assertOwnsProject:async()=>{},recordActivity:async()=>{}}});
  const body={title:"经验",adoptionKey:"same-candidate-item"};
  const rows=await Promise.all([ctx,{...ctx,accountId:"other-account"},{...ctx,userId:"other-user"}].map(c=>service.createLearning(c,body)));
  expect(new Set(rows.map(row=>row.id)).size).toBe(3);
  const a=await service.createLearning(ctx,{title:"手工重复"}),b=await service.createLearning(ctx,{title:"手工重复"});expect(a.id).not.toBe(b.id);
 }finally{await f.client.close();}
});

async function seedOriginalProject(db:Db,owner:RequestContext,id:string,stamp:string){
 await db.insert(originalProjects).values({id,userId:owner.userId,accountId:owner.accountId??null,groupId:owner.groupId??null,title:'原用例真实父项目',creationMode:'free',status:'active',currentStage:'review',startedAt:stamp,createdAt:stamp,updatedAt:stamp});
}
