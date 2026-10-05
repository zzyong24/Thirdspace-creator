import {it,expect} from "vitest";
import {createDb,creativeResultBundles} from "@creatoros/backend";
import type {RequestContext,OutputConversionRequest} from "@creatoros/contract";
import {createConversionReservationRepository} from "./conversion-reservation.repository";
const ctx=(accountId="a"):RequestContext=>({userId:"u",accountId,requestId:"r",source:"user"});
const request:OutputConversionRequest={sourceOutputId:"source",sourceVersionId:"v",targetType:"image",mode:"whole",clientRequestId:"stable-conversion-request",reuseImages:[]};
const sourceAnchor={kind:"output_version" as const,sourceOutputId:"source",artifactId:"article",versionId:"v",sourceType:"article" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}};
it("原账本预约先于目标创建；同请求并发取winner，异意图不创建第二预约",async()=>{
 const opened=await createDb();let n=0,reads=0;
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
