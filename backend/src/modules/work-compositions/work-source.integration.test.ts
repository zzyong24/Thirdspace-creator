import {it as test} from "vitest";
import type {RequestContext} from "@creatoros/contract";
import assert from "node:assert/strict";
import {createDb,projects,type Db} from "@creatoros/backend";
import {createProjectsService,createProjectRepository} from "@creatoros/backend/modules/projects";
import {createArtifactsService} from "@creatoros/backend/modules/artifacts";
import {createMomentsService} from "@creatoros/backend/modules/moments";
import {createWorkCompositionsService} from "@creatoros/backend/modules/work-compositions";
import {createWorkSourceService,sourceTextDigest,sourceDigest,type WorkSourcePorts} from "./work-source.service";
const ctx={userId:"source-user",accountId:"source-account",source:"user" as const,requestId:"http-request"};
async function fixture(){
 const opened=await createDb(),db=opened.db;let seq=0;
 const now=()=>"2026-10-02T06:00:00.000Z",nextId=(p:string)=>`${p}-${++seq}`;
 for(const id of ["project","other"])await db.insert(projects).values({id,userId:ctx.userId,accountId:ctx.accountId,title:id,brief:"真实 Brief",creationMode:"guided",status:"active",currentStage:"planning",startedAt:now(),createdAt:now(),updatedAt:now()});
 const project=(tx:Db)=>createProjectsService(createProjectRepository(tx),{now,nextId});
 const assertProjectOwned=async(c:RequestContext,id:string,tx:Db,lock?:boolean)=>project(tx).getProject(c,id,lock);
 const moments=(tx:Db)=>createMomentsService({db:tx,now,nextId,ports:{artifacts:t=>createArtifactsService({db:t,now,nextId}),assertProjectOwned,assertFile:async()=>{throw Error("unused");},assertSource:async()=>{throw Error("unused");}}});
 const basis=(tx:Db)=>createWorkCompositionsService({db:tx,now,nextId,ports:{artifacts:t=>createArtifactsService({db:t,now,nextId}),assertProjectOwned,readMember:async()=>{throw Error("unused");},createMember:async()=>{throw Error("unused");},findCreatedMember:async()=>null,assertSource:async()=>{throw Error("unused");},assertRule:async()=>{throw Error("unused");}}});
 const unavailable=async():Promise<never>=>{throw Error("未装配的公开端口不能假通过");};
 const ports=(tx:Db):WorkSourcePorts=>({projects:project(tx),assets:{assertAssetFileOwned:unavailable,readDocumentFileSource:unavailable,getAsset:unavailable},assertAssetLinkedToProject:unavailable,readIntelligenceSnapshot:unavailable,moments:moments(tx),compositions:basis(tx),conversion:{selectSavedSource:unavailable,restore:unavailable,freeze:unavailable},ownerProject:async(c,kind,id)=>kind==="moments"?(await moments(tx).get(c,id)).projectId:(await basis(tx).get(c,id)).projectId});
 return {db,source:createWorkSourceService(ports),moments:moments(db),basis:basis(db),close:()=>opened.client.close()};
}
test("真实 Moments 历史选区：UTF16、摘要、未选正文、隔离、跨项目和账号拒绝",async()=>{
 const f=await fixture();try{
  const doc={schemaVersion:1 as const,text:"甲😀乙秘密",imageUses:[],sourceRefs:[]};
  const initial=await f.moments.create(ctx,{projectId:"project",clientRequestId:"source-create-moments",document:doc});
  const pick={kind:"moments_version",momentsId:initial.momentsId,versionId:initial.currentVersionId,selection:{mode:"selected",fields:[],textRanges:[{start:1,end:3,textDigest:sourceTextDigest(doc.text)}]}};
  const frozen=await f.source.selectMoments(ctx,"project",pick,f.db);assert.deepEqual(frozen.content,{textFragments:["😀"]});assert(!JSON.stringify(frozen.content).includes("秘密"));
  const ranges=[{start:0,end:1,textDigest:sourceTextDigest(doc.text)},{start:3,end:4,textDigest:sourceTextDigest(doc.text)}];
  assert.deepEqual(await f.source.selectMoments(ctx,"project",{...pick,selection:{...pick.selection,textRanges:ranges}},f.db),await f.source.selectMoments(ctx,"project",{...pick,selection:{...pick.selection,textRanges:[...ranges].reverse()}},f.db));
  const {contentDigest,...payload}=frozen;
  const forged={...payload,content:{textFragments:["伪造"]}};
  await assert.rejects(f.source.restoreSnapshot(ctx,"project",{...forged,contentDigest:sourceDigest(forged)},f.db),/真实历史/);
  await f.moments.save(ctx,initial.momentsId,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"source-new-moments",document:{...doc,text:"新稿"}});
  assert.deepEqual(await f.source.read(ctx,"project",frozen.source,f.db),frozen);
  assert.deepEqual(await f.source.restoreSnapshot(ctx,"project",frozen,f.db),frozen);
  await assert.rejects(f.source.selectMoments(ctx,"project",{...pick,selection:{...pick.selection,textRanges:[{start:1,end:2,textDigest:sourceTextDigest(doc.text)}]}},f.db),/UTF-16/);
  await assert.rejects(f.source.read(ctx,"other",frozen.source,f.db),/项目/);
  await assert.rejects(f.source.read({...ctx,accountId:"foreign"},"project",frozen.source,f.db));
  await assert.rejects(f.source.read(ctx,"project",{...frozen.source,selectionDigest:"b".repeat(64)},f.db),/摘要/);
  await assert.rejects(f.source.restoreSnapshot(ctx,"project",{...frozen,content:{textFragments:["伪造"]}},f.db),/摘要/);
  const changed=structuredClone(frozen);if(changed.kind==="moments")changed.content.textFragments![0]="本地修改";
  assert.deepEqual(await f.source.read(ctx,"project",frozen.source,f.db),frozen);
 }finally{await f.close();}
});
test("真实 Basis 观点 ID 按保存顺序冻结，不泄露未选观点；当前改稿不影响历史",async()=>{
 const f=await fixture();try{
  const initial=await f.basis.create(ctx,{projectId:"project",title:"真实组合",clientRequestId:"source-create-basis"});
  const saved=await f.basis.saveBasis(ctx,initial.compositionId,{expectedRevision:0,clientRequestId:"source-save-basis",document:{schemaVersion:1,topic:"未选主题",claims:[{id:"one",text:"观点一",sourceRefs:[]},{id:"two",text:"观点二",sourceRefs:[]},{id:"hidden",text:"秘密观点",sourceRefs:[]}],factItems:[],sourceRefs:[],ruleRefs:[]}});
  const pick={kind:"work_basis_version",compositionId:initial.compositionId,versionId:saved.current.basisVersionId,selection:{mode:"selected",fields:[],claimIds:["two","one"],factItemIds:[]}};
  const frozen=await f.source.selectBasis(ctx,"project",pick,f.db),forward=await f.source.selectBasis(ctx,"project",{...pick,selection:{...pick.selection,claimIds:["one","two"]}},f.db);
  assert.deepEqual(frozen,forward);assert(!JSON.stringify(frozen.content).includes("秘密"));assert(!("topic" in frozen.content));
  await f.basis.saveBasis(ctx,initial.compositionId,{expectedRevision:saved.currentRevision,clientRequestId:"source-save-new-basis",document:{schemaVersion:1,topic:"新稿",claims:[],factItems:[],sourceRefs:[],ruleRefs:[]}});
  assert.deepEqual(await f.source.read(ctx,"project",frozen.source,f.db),frozen);
  await assert.rejects(f.source.selectBasis(ctx,"project",{...pick,selection:{...pick.selection,claimIds:["missing"]}},f.db),/不存在/);
 }finally{await f.close();}
});
test("来源校验接受并使用传入真实事务，不访问根连接",async()=>{
 const f=await fixture();try{
  const initial=await f.moments.create(ctx,{projectId:"project",clientRequestId:"source-tx-moments",document:{schemaVersion:1,text:"真实文字",imageUses:[],sourceRefs:[]}});
  await f.db.transaction(async tx=>{const t=tx as unknown as Db;const frozen=await f.source.selectMoments(ctx,"project",{kind:"moments_version",momentsId:initial.momentsId,versionId:initial.currentVersionId,selection:{mode:"whole"}},t);await f.source.assertSource(ctx,"project",frozen.source,t);});
 }finally{await f.close();}
});
