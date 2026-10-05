import {it,expect} from "vitest";
import {createDb,creativeResultBundles,projects,contentOutputs,eq} from "@creatoros/backend";
import type {RequestContext,OutputConversionRequest} from "@creatoros/contract";
import {accountGroups} from "../../schema/account-groups";
import {createConversionReservationRepository} from "./conversion-reservation.repository";
const ctx=(accountId="a"):RequestContext=>({userId:"u",accountId,requestId:"r",source:"user"});
const request:OutputConversionRequest={sourceOutputId:"source",sourceVersionId:"v",targetType:"image",mode:"whole",clientRequestId:"stable-conversion-request",reuseImages:[]};
const sourceAnchor={kind:"output_version" as const,sourceOutputId:"source",artifactId:"article",versionId:"v",sourceType:"article" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}};
it("原账本预约先于目标创建；同请求并发取winner，异意图不创建第二预约",async()=>{
 const opened=await createDb();let n=0,reads=0;
 await opened.db.insert(projects).values({id:"p",userId:"u",accountId:"a",title:"旧真实父",brief:"",creationMode:"free",status:"active",currentStage:"planning",startedAt:"2026-10-02T00:00:00Z",createdAt:"2026-10-02T00:00:00Z",updatedAt:"2026-10-02T00:00:00Z"});
 await opened.db.insert(contentOutputs).values({id:"target",projectId:"p",contentType:"image",title:"目标",status:"drafting",createdAt:"2026-10-02T00:00:00Z",updatedAt:"2026-10-02T00:00:00Z"});
 const repo=createConversionReservationRepository(opened.db,{now:()=>"2026-10-02T00:00:00Z",nextId:()=>`reservation-${++n}`,
  readCreatedTarget:async()=>({id:"target",projectId:"p",contentType:"image",targetPlatform:null}),
  assertProject:async(c,id)=>{if(c.accountId!=="a"||id!=="p")throw Error("not owned");}});
 try{
  const freeze=async()=>{reads++;return {projectId:"p",sourceAnchor};};
  const [one,two]=await Promise.all([repo.reserve(ctx(),request,freeze),repo.reserve(ctx(),request,freeze)]);
  expect(one).toEqual(two);expect(one.outputId).toBeNull();expect(one.context.sourceAnchor).toEqual(sourceAnchor);
  expect((await opened.db.select().from(creativeResultBundles))).toHaveLength(1);
  await expect(repo.reserve(ctx(),{...request,reuseImages:[{assetId:"different",assetFileId:"file"}]},freeze)).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
  const frozenReads=reads;
  expect(await repo.reserve(ctx(),request,async()=>{throw Error("来源已改稿，不重冻结");})).toEqual(one);expect(reads).toBe(frozenReads);
  await expect(repo.bindOutput(ctx(),one,{id:"nonexistent",projectId:"p"})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
  const bound=await repo.bindOutput(ctx(),one,{id:"target",projectId:"p"});expect(bound.outputId).toBe("target");
  expect((await repo.bindOutput(ctx(),one,{id:"target",projectId:"p"})).outputId).toBe("target");
  await expect(repo.bindOutput(ctx(),one,{id:"other",projectId:"p"})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
  await expect(repo.get(ctx("b"),request.clientRequestId)).rejects.toThrow();
 }finally{await opened.client.close();}
},20000);


it("空组转换预约共享不吃平台筛选，真实父跨组/归档拒绝并保原预约",async()=>{
 const opened=await createDb(),db=opened.db,at="2026-10-05T00:00:00Z";try{
 const a:RequestContext={userId:"u",groupId:"conversion-group-a",accountId:null,requestId:"r",source:"user"},b={...a,groupId:"conversion-group-b"};
 await db.insert(accountGroups).values([a.groupId!,b.groupId!].map(id=>({id,userId:"u",name:id,status:"active",createdAt:at,updatedAt:at})));
 await db.insert(projects).values({id:"conversion-parent",userId:"u",groupId:a.groupId,accountId:null,title:"组创作父",brief:"",creationMode:"free",status:"active",currentStage:"planning",startedAt:at,createdAt:at,updatedAt:at});
 await db.insert(contentOutputs).values({id:"conversion-target",groupId:a.groupId,projectId:"conversion-parent",contentType:"image",title:"真实目标",status:"drafting",createdAt:at,updatedAt:at});
 let n=0,reads=0;const repo=createConversionReservationRepository(db,{now:()=>at,nextId:()=>`group-reservation-${++n}`,assertProject:async()=>{},readCreatedTarget:async()=>({id:"conversion-target",projectId:"conversion-parent",contentType:"image",targetPlatform:null})});
 const freeze=async()=>{reads++;return{projectId:"conversion-parent",sourceAnchor};};
 const row=await repo.reserve(a,request,freeze);
 expect((await db.select().from(creativeResultBundles))[0]).toMatchObject({groupId:a.groupId,accountId:null});
 expect(await repo.reserve({...a,accountId:"filter-account"},request,async()=>{throw Error("不能重冻结");})).toEqual(row);expect(reads).toBe(1);
 await expect(repo.get(b,request.clientRequestId)).rejects.toThrow();
 await expect(repo.reserve(b,request,freeze)).rejects.toThrow();
 const bound=await repo.bindOutput(a,row,{id:"conversion-target",projectId:"conversion-parent"});
 await db.update(projects).set({archivedAt:at,status:"archived"}).where(eq(projects.id,"conversion-parent"));
 const before=await db.select().from(creativeResultBundles);
 expect(await repo.get(a,request.clientRequestId)).toEqual(bound);
 expect(await repo.bindOutput(a,row,{id:"conversion-target",projectId:"conversion-parent"})).toEqual(bound);
 await expect(repo.reserve(a,{...request,clientRequestId:"new-after-archive-request"},freeze)).rejects.toThrow("归档");
 expect(await db.select().from(creativeResultBundles)).toEqual(before);
 }finally{await opened.client.close();}
},30000);


it("同组历史双账号同请求不得任取首预约，显式原ID绑定可精确恢复",async()=>{
 const opened=await createDb(),db=opened.db,at="2026-10-05T00:00:00Z";try{
 const group:RequestContext={userId:"u",groupId:"legacy-conversion-group",accountId:null,requestId:"r",source:"user"};
 await db.insert(accountGroups).values({id:group.groupId!,userId:"u",name:"旧预约组",status:"active",createdAt:at,updatedAt:at});
 await db.insert(projects).values({id:"legacy-conversion-parent",userId:"u",groupId:group.groupId,accountId:"legacy-a",title:"旧真实父",brief:"",creationMode:"free",status:"active",currentStage:"planning",startedAt:at,createdAt:at,updatedAt:at});
 await db.insert(contentOutputs).values({id:"legacy-conversion-target",groupId:group.groupId,projectId:"legacy-conversion-parent",contentType:"image",title:"旧目标",status:"drafting",createdAt:at,updatedAt:at});
 const repo=createConversionReservationRepository(db,{assertProject:async()=>{},readCreatedTarget:async()=>({id:"legacy-conversion-target",projectId:"legacy-conversion-parent",contentType:"image",targetPlatform:null})});
 const first=await repo.reserve(group,request,async()=>({projectId:"legacy-conversion-parent",sourceAnchor}));
 const [source]=await db.select().from(creativeResultBundles);
 await db.update(creativeResultBundles).set({accountId:"legacy-a"}).where(eq(creativeResultBundles.id,first.id));
 await db.insert(creativeResultBundles).values({...source!,id:"legacy-second",accountId:"legacy-b"});
 const before=await db.select().from(creativeResultBundles);
 await expect(repo.get({...group,accountId:"legacy-a"},request.clientRequestId)).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
 await expect(repo.reserve(group,request,async()=>{throw Error("不能重冻结");})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
 const bound=await repo.bindOutput(group,first,{id:"legacy-conversion-target",projectId:"legacy-conversion-parent"});expect(bound.id).toBe(first.id);
 const after=await db.select().from(creativeResultBundles);expect(after).toHaveLength(2);
 expect(after.find(row=>row.id==="legacy-second")).toEqual(before.find(row=>row.id==="legacy-second"));
 expect(after.find(row=>row.id===first.id)).toEqual({...before.find(row=>row.id===first.id)!,outputId:"legacy-conversion-target"});
 }finally{await opened.client.close();}
},30000);
