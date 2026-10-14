import type {RequestContext} from "@creatoros/contract";
import type {Db} from "@creatoros/backend";
import {projects as originalProjects} from "../../schema/projects";
import {randomUUID} from "node:crypto";
import {expect,it} from "vitest";
import {createDb} from "@creatoros/backend";
import {createLearningsService} from "./learnings.service";
it("相同经验在不同来源项目采纳不会串归属，同项目重试不重复",async()=>{
 const f=await createDb();try{
 const service=createLearningsService({db:f.db,now:()=>"2026-09-11T00:00:00.000Z",nextId:p=>`${p}-${randomUUID()}`,projects:{assertOwnsProject:async()=>{},recordActivity:async()=>{}}});
 const ctx={userId:"u",accountId:"a",requestId:"test",source:"user" as const};const body={title:"先展示过程",insight:"观察所得",source:"稿件开头",applicability:"同类演示内容"};
 for(const id of ["p1","p2"])await seedOriginalProject(f.db,ctx,id,"2026-09-11T00:00:00.000Z");
 const first=await service.adoptLearning(ctx,{...body,projectId:"p1"});
 const repeat=await service.adoptLearning(ctx,{...body,projectId:"p1"});
 const other=await service.adoptLearning(ctx,{...body,projectId:"p2"});
 expect(first.id).toBe(repeat.id);expect(other.id).not.toBe(first.id);
 expect((await service.listLearnings(ctx,{limit:10,offset:0},{projectId:"p1"})).rows.map(row=>row.id)).toEqual([first.id]);
 }finally{await f.client.close();}
});

async function seedOriginalProject(db:Db,owner:RequestContext,id:string,stamp:string){
 await db.insert(originalProjects).values({id,userId:owner.userId,accountId:owner.accountId??null,groupId:owner.groupId??null,title:'原用例真实父项目',creationMode:'free',status:'active',currentStage:'review',startedAt:stamp,createdAt:stamp,updatedAt:stamp});
}
