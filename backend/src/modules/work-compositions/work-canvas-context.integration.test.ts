import {it,expect} from "vitest";
import {createDb,assets,assetFiles,workDependencies,eq,type Db} from "@creatoros/backend";
import {ENDPOINTS,successEnvelope,ErrorCode,workCanvasContext,type RequestContext} from "@creatoros/contract";
import {createProjectsService,createProjectRepository} from "../projects";
import {createArtifactsService} from "../artifacts";
import {createAssetsService,createAssetRepository} from "../assets";
import {createMomentsService} from "../moments";
import {createWorkCompositionsService} from "./work-compositions.service";
import {createWorkMaterialsService} from "./work-materials.service";
import {createWorkSourceService} from "./work-source.service";
import {createMomentsMaterialPorts} from "./moments-materials";
import {createWorkCompositionsTransport} from "./work-compositions.transport";
const ctx:RequestContext={userId:"materials-user",accountId:"materials-account",source:"user",requestId:"http-request"};
const unavailable=async():Promise<never>=>{throw Error("本用例未选模型与来源");};
async function fixture(){
 let available=false;
 const opened=await createDb(),db=opened.db;let seq=0;const deps={now:()=>"2026-10-02T07:00:00.000Z",nextId:(p:string)=>`${p}-${++seq}`};
 const projectOwner=(tx:Db=db)=>createProjectsService(createProjectRepository(tx),deps),artifactOwner=(tx:Db)=>createArtifactsService({db:tx,...deps});
 const assertFile=async(c:RequestContext,_p:string,file:{assetId:string;assetFileId:string},tx:Db)=>{await createAssetsService(createAssetRepository(tx,deps),unavailable,deps).assertAssetFileOwned(c,file.assetId,file.assetFileId,true);};
 const momentsFor=(tx:Db=db)=>createMomentsService({db:tx,...deps,ports:{artifacts:artifactOwner,assertProjectOwned:async(c,id,store,lock)=>projectOwner(store).getProject(c,id,lock),assertFile,assertSource:unavailable}});
 const compositionFor=(tx:Db=db)=>createWorkCompositionsService({db:tx,...deps,ports:{artifacts:artifactOwner,assertProjectOwned:async(c,id,store,lock)=>projectOwner(store).getProject(c,id,lock),readMember:async(c,p,member,store=tx)=>{if(member.kind!=="moments")throw Error("仅朋友圈fixture");const item=await momentsFor(store).get(c,member.momentsId);if(item.projectId!==p)throw Error("项目错误");return{kind:"artifact",artifactId:item.artifactId,versionId:item.currentVersionId};},createMember:unavailable,findCreatedMember:async()=>null,assertSource:unavailable,assertRule:unavailable}});
 const source=createWorkSourceService(tx=>({projects:projectOwner(tx),assets:{assertAssetFileOwned:unavailable,readDocumentFileSource:unavailable,getAsset:unavailable},assertAssetLinkedToProject:unavailable,readIntelligenceSnapshot:unavailable,moments:momentsFor(tx),compositions:compositionFor(tx),conversion:{selectSavedSource:unavailable,freeze:unavailable,restore:unavailable},ownerProject:async(c,kind,id)=>kind==="moments"?(await momentsFor(tx).get(c,id)).projectId:(await compositionFor(tx).get(c,id)).projectId}));
 const materials=()=>createWorkMaterialsService({db,...deps,ports:{...createMomentsMaterialPorts(momentsFor),canvasAvailable:async()=>available,assertComposition:async(c,id,tx,lock)=>compositionFor(tx).readWorkspaceAuthority(c,id,lock),lockMember:(c,id,member,tx)=>compositionFor(tx).lockMember(c,id,member),assertFile,assertSource:async(c,p,ref,tx)=>{await source.read(c,p,ref,tx);},sourceRules:async(c,p,ref,tx)=>{const rules=(await source.read(c,p,ref,tx)).constraints.ruleSnapshotRef;return rules===null?[]:Array.isArray(rules)?rules:[rules];}}});
 const project=await projectOwner().createProject(ctx,{title:"真实物料项目",brief:"明确选择配图"}),moments=await momentsFor().create(ctx,{projectId:project.id,clientRequestId:"materials-moments-create",document:{schemaVersion:1,text:"原朋友圈正文",imageUses:[],sourceRefs:[]}}),composition=await compositionFor().create(ctx,{projectId:project.id,title:"作品组合",clientRequestId:"materials-work-create"}),member={kind:"moments" as const,momentsId:moments.momentsId};await compositionFor().bindMember(ctx,composition.compositionId,{expectedRevision:0,clientRequestId:"materials-member-bind",member});
 for(const [id,accountId]of ([["file-a",ctx.accountId!],["file-b",ctx.accountId!],["foreign-file","other-account"]] as const)){await db.insert(assets).values({id,userId:ctx.userId,accountId,assetType:"image",name:id,status:"active",currentFileId:`${id}-1`,createdAt:deps.now(),updatedAt:deps.now()});await db.insert(assetFiles).values({id:`${id}-1`,assetId:id,versionNumber:1,storageKey:`${id}.png`,mimeType:"image/png",fileSize:68,checksum:"db-file-identity",createdAt:deps.now()});}
 const current=async()=>{const item=await momentsFor().get(ctx,moments.momentsId);return{kind:"artifact" as const,artifactId:item.artifactId,versionId:item.currentVersionId};};
 return{opened,db,source,materials,setAvailable:(value:boolean)=>{available=value;},momentsFor,compositionFor,project,composition,member,current,target:{kind:"moments_images" as const,momentsId:moments.momentsId},file:(id:string)=>({assetId:id,assetFileId:`${id}-1`})};
}

async function rows(f:Awaited<ReturnType<typeof fixture>>){
 const tables=(await f.opened.client.query<{table_name:string}>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")).rows;
 const entries=await Promise.all(tables.map(async({table_name})=>[table_name,(await f.opened.client.query(`SELECT row_to_json(t) AS row FROM "${table_name.replaceAll('"','""')}" t`)).rows.map(r=>JSON.stringify(r)).sort()]));
 return Object.fromEntries(entries);
}
async function input(f:Awaited<ReturnType<typeof fixture>>){
 const basis=await f.compositionFor().saveBasis(ctx,f.composition.compositionId,{expectedRevision:1,clientRequestId:"canvas-source-basis",document:{schemaVersion:1,topic:"用户明确的画面来源",claims:[],factItems:[],sourceRefs:[],ruleRefs:[]}});
 const source=(await f.source.selectBasis(ctx,f.project.id,{kind:"work_basis_version",compositionId:f.composition.compositionId,versionId:basis.current.basisVersionId,selection:{mode:"whole"}},f.db)).source;
 return {member:f.member,target:f.target,ownerVersion:await f.current(),source};
}
function transport(f:Awaited<ReturnType<typeof fixture>>){return createWorkCompositionsTransport(()=>f.compositionFor(),()=>f.materials());}
async function read(f:Awaited<ReturnType<typeof fixture>>,body:unknown,c=ctx,id=f.composition.compositionId){return successEnvelope(ENDPOINTS.getWorkCompositionCanvasContext.response).parse(await transport(f).request(ENDPOINTS.getWorkCompositionCanvasContext,{params:{compositionId:id},query:undefined,body:ENDPOINTS.getWorkCompositionCanvasContext.body.parse(body)},c));}
it("原 strict 公共 canvasContext 完整来源与ownerVersion零写读回，未装配诚实unavailable",async()=>{
 const f=await fixture();try{const body=await input(f),before=await rows(f);const response=await read(f,body);
 expect(workCanvasContext.parse(response.data)).toEqual({compositionId:f.composition.compositionId,...body,availability:"unavailable",reasonCode:"CANVAS_NOT_ASSEMBLED"});
 expect(await rows(f)).toEqual(before);f.setAvailable(true);const available=await read(f,body);expect(available.data).toEqual({...response.data,availability:"available",reasonCode:null});expect(await rows(f)).toEqual(before);
 }finally{await f.opened.client.close();}
});
it("公共context拒旧完整版本、错误target/member/account/source与strict额外字段，每次拒绝零写",async()=>{
 const f=await fixture();try{const body=await input(f),before=await rows(f);const cases=[
 {body:{...body,ownerVersion:{...body.ownerVersion,artifactId:"not-the-owner"}}},
 {body:{...body,ownerVersion:{...body.ownerVersion,versionId:"not-the-saved-version"}}},
 {body:{...body,target:{kind:"moments_images",momentsId:"not-the-member"}}},
 {body:{...body,member:{kind:"moments",momentsId:"not-the-member"}}},
 {body:{...body,source:{...body.source,selectionDigest:"f".repeat(64)}}},
 {body:{...body,source:{...body.source,versionId:"not-the-source-version"}}},
 {body:{...body,source:{...body.source,compositionId:"not-the-source-composition"}}},
 {body:{...body,extra:"strict-reject"}},
 {body,c:{...ctx,accountId:"other-account"}},
 {body,c:{...ctx,userId:"other-user"}},
 {body,id:"not-the-composition"},
 ];for(const c of cases){await expect(read(f,c.body,c.c??ctx,c.id??f.composition.compositionId)).rejects.toThrow();expect(await rows(f)).toEqual(before);}
 }finally{await f.opened.client.close();}
});
it("共享依据原历史可读；稿件变化后context CAS拒绝且不会阻合法手工保存",async()=>{
 const f=await fixture();try{const old=await input(f);const current=await f.momentsFor().get(ctx,f.member.momentsId);await f.momentsFor().save(ctx,f.member.momentsId,{expectedCurrentVersionId:current.currentVersionId,clientRequestId:"canvas-independent-manual-save",document:{...current.current,text:"画布上下文失效后用户仍合法保存"}});
 const before=await rows(f);await expect(read(f,old)).rejects.toMatchObject({code:ErrorCode.ConflictError});expect(await rows(f)).toEqual(before);
 const body={...old,ownerVersion:await f.current()};expect((await read(f,body)).data).toMatchObject({ownerVersion:body.ownerVersion,source:old.source,availability:"unavailable"});expect(await rows(f)).toEqual(before);expect((await f.momentsFor().get(ctx,f.member.momentsId)).current.text).toBe("画布上下文失效后用户仍合法保存");
 }finally{await f.opened.client.close();}
});
