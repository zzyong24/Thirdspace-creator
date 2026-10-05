import {beforeEach,afterEach,expect,it} from "vitest";
import {createDb,projects,assets,assetFiles,eq,and,OwnershipError,type Db} from "@creatoros/backend";
import {createProjectsService,createProjectRepository} from "../projects";
import {createArtifactsService} from "../artifacts";
import {createMomentsService} from "./moments.service";
const ctx={userId:"moments-user",accountId:"moments-account",source:"user" as const,requestId:"http-request"};
let db:Db,close:()=>Promise<void>,seq=0;
const now=()=>"2026-10-02T05:00:00.000Z",nextId=(prefix:string)=>`${prefix}-${++seq}`;
const document=(text="手工朋友圈")=>({schemaVersion:1 as const,text,imageUses:[],sourceRefs:[]});
async function assertProjectOwned(transaction:Db,id:string){const [row]=await transaction.select().from(projects).where(and(eq(projects.id,id),eq(projects.userId,ctx.userId),eq(projects.accountId,ctx.accountId)));if(!row)throw new OwnershipError("项目不存在");}
const owner=()=>createMomentsService({db,now,nextId,ports:{assertProjectOwned:async(c,id,tx,forUpdate)=>{await createProjectsService(createProjectRepository(tx),{now,nextId}).getProject(c,id,forUpdate);},artifacts:tx=>createArtifactsService({db:tx,now,nextId}),assertFile:async()=>{throw Error("未授权配图");},assertSource:async()=>{throw Error("未授权来源");}}});
beforeEach(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();seq=0;await db.insert(projects).values({id:"moments-project",userId:ctx.userId,accountId:ctx.accountId,title:"真实项目",creationMode:"guided",status:"active",currentStage:"planning",startedAt:now(),createdAt:now(),updatedAt:now()});});afterEach(async()=>close());
it("朋友圈为独立真实Artifact：创建、保存、刷新、历史与原请求恢复",async()=>{
 const initial=await owner().create(ctx,{projectId:"moments-project",clientRequestId:"moments-create-request",document:document()});expect(initial.current.text).toBe("手工朋友圈");
 const saved=await owner().save(ctx,initial.momentsId,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"moments-save-request",document:document("手工修改")});
 expect((await owner().get(ctx,initial.momentsId)).currentVersionId).toBe(saved.versionId);expect((await owner().history(ctx,initial.momentsId)).map(v=>v.document.text)).toEqual(["手工朋友圈","手工修改"]);
 expect(await owner().save(ctx,initial.momentsId,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"moments-save-request",document:document("手工修改")})).toEqual(saved);
 expect(await owner().request(ctx,"moments-save-request")).toMatchObject({operation:"save",status:"committed",versionId:saved.versionId,target:{kind:"moments",momentsId:initial.momentsId}});
});
it("同请求并发不创建第二份表达，异输入和跨账号不能写入",async()=>{
 const input={projectId:"moments-project",clientRequestId:"moments-concurrent-create",document:document("")};const results=await Promise.all([owner().create(ctx,input),owner().create(ctx,input)]);expect(results[0].momentsId).toBe(results[1].momentsId);
 await expect(owner().create(ctx,{...input,document:document("不同输入")})).rejects.toThrow();await expect(owner().get({...ctx,accountId:"other-account"},results[0].momentsId)).rejects.toThrow();await expect(owner().request({...ctx,accountId:"other-account"},input.clientRequestId)).rejects.toThrow();
 expect((await owner().list(ctx,"moments-project")).length).toBe(1);
});
it("同一前值并发保存只有一个提交，拒绝配图后正文和历史保留",async()=>{
 const initial=await owner().create(ctx,{projectId:"moments-project",clientRequestId:"moments-create-race",document:document()});const result=await Promise.allSettled(["a","b"].map(suffix=>owner().save(ctx,initial.momentsId,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:`moments-save-race-${suffix}`,document:document(suffix)})));expect(result.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 const current=await owner().get(ctx,initial.momentsId);await expect(owner().save(ctx,initial.momentsId,{expectedCurrentVersionId:current.currentVersionId,clientRequestId:"moments-foreign-image",document:{...current.current,imageUses:[{assetId:"foreign",assetFileId:"foreign-file",order:0}]}})).rejects.toThrow("未授权配图");expect((await owner().get(ctx,initial.momentsId)).current).toEqual(current.current);expect(await owner().history(ctx,initial.momentsId)).toHaveLength(2);
});

it("公开朋友圈保存回执如实标记手工版本，恢复不回写后来的正文",async()=>{
 const {ENDPOINTS}=await import("@creatoros/contract"),{createMomentsTransport}=await import("./moments.transport");const transport=createMomentsTransport(()=>owner()),body={projectId:"moments-project",clientRequestId:"public-moments-create",document:document()};
 const result=await transport.request(ENDPOINTS.createMoments,{params:undefined,query:undefined,body},ctx) as {data:{moments:{momentsId:string;currentVersionId:string}}};expect(ENDPOINTS.createMoments.response.safeParse(result.data).success).toBe(true);const initial=result.data.moments;
 const saveBody={expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"public-moments-save",document:document("原保存")};const saved=await transport.request(ENDPOINTS.createMomentsVersion,{params:{momentsId:initial.momentsId},query:undefined,body:saveBody},ctx) as {data:{version:{versionId:string};receipt:{kind:string}}};expect(ENDPOINTS.createMomentsVersion.response.safeParse(saved.data).success).toBe(true);expect(saved.data.receipt.kind).toBe("manual_save");
 await owner().save(ctx,initial.momentsId,{expectedCurrentVersionId:saved.data.version.versionId,clientRequestId:"public-moments-manual",document:document("新的手工输入")});
 const restored=await transport.request(ENDPOINTS.createMomentsVersion,{params:{momentsId:initial.momentsId},query:undefined,body:saveBody},ctx);expect(restored).toEqual(saved);expect((await owner().get(ctx,initial.momentsId)).current.text).toBe("新的手工输入");
});

it("公开朋友圈列表分页符合契约，空列表为真实0",async()=>{
 const {ENDPOINTS,listEnvelope}=await import("@creatoros/contract"),{createMomentsTransport}=await import("./moments.transport"),transport=createMomentsTransport(()=>owner());
 const response=await transport.request(ENDPOINTS.listMoments,{params:undefined,query:{projectId:"moments-project",page:1,pageSize:20},body:undefined},ctx);expect(listEnvelope(ENDPOINTS.listMoments.response).parse(response)).toMatchObject({data:[],meta:{page:1,pageSize:20,total:0}});
});

it("原位置历史来源保留，新增来源仍验证且失败回滚",async()=>{
 let live=true,checks=0;const service=createMomentsService({db,now,nextId,ports:{artifacts:tx=>createArtifactsService({db:tx,now,nextId}),assertProjectOwned:async(c,id,tx,lock)=>{await createProjectsService(createProjectRepository(tx),{now,nextId}).getProject(c,id,lock);},assertFile:async()=>{throw Error("新图需验权");},assertSource:async(c,id,ref,tx)=>{checks++;const actual=await createProjectsService(createProjectRepository(tx),{now,nextId}).getProject(c,id);if(!live||ref.kind!=="project"||ref.id!==actual.id||ref.versionId!==actual.updatedAt)throw Error("来源版本变更");}}});
 const ref={kind:"project",id:"moments-project",versionId:now()},initial=await service.create(ctx,{projectId:"moments-project",clientRequestId:"history-source-create",document:{...document(),sourceRefs:[ref]}});live=false;
 const saved=await service.save(ctx,initial.momentsId,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"history-source-edit",document:{...initial.current,text:"仅修改文字"}});expect(saved.document.sourceRefs).toEqual([ref]);expect(checks).toBe(1);
 await expect(service.save(ctx,initial.momentsId,{expectedCurrentVersionId:saved.versionId,clientRequestId:"history-source-new",document:{...saved.document,sourceRefs:[ref,{kind:"project",id:"moments-project",versionId:"another-version"}]}})).rejects.toThrow("来源版本变更");expect((await service.get(ctx,initial.momentsId)).currentVersionId).toBe(saved.versionId);expect(await service.history(ctx,initial.momentsId)).toHaveLength(2);
});

it("真实素材owner验证非空配图：外账号/错文件拒绝，原历史文件不阻断改文字",async()=>{
 const {createAssetsService,createAssetRepository}=await import("../assets");
 for(const [id,accountId]of ([["image-owned",ctx.accountId],["image-foreign","other-account"]] as const)){await db.insert(assets).values({id,userId:ctx.userId,accountId,assetType:"image",name:id,status:"active",currentFileId:`${id}-file`,createdAt:now(),updatedAt:now()});await db.insert(assetFiles).values({id:`${id}-file`,assetId:id,versionNumber:1,storageKey:`${id}.png`,mimeType:"image/png",fileSize:68,checksum:"actual-db-file-identity",mediaMetadata:{},createdAt:now()});}
 const service=createMomentsService({db,now,nextId,ports:{artifacts:tx=>createArtifactsService({db:tx,now,nextId}),assertProjectOwned:async(c,id,tx,lock)=>{await createProjectsService(createProjectRepository(tx),{now,nextId}).getProject(c,id,lock);},assertFile:async(c,_p,file,tx)=>{await createAssetsService(createAssetRepository(tx,{now,nextId}),async()=>{throw Error("此用例仅验证已落库素材身份");},{now,nextId}).assertAssetFileOwned(c,file.assetId,file.assetFileId,true);},assertSource:async()=>{throw Error("此用例未选来源");}}});
 const initial=await service.create(ctx,{projectId:"moments-project",clientRequestId:"real-file-moments-create",document:{...document(),imageUses:[{assetId:"image-owned",assetFileId:"image-owned-file",order:0}]}});expect(initial.current.imageUses).toHaveLength(1);
 for(const [suffix,assetId,assetFileId]of [["foreign","image-foreign","image-foreign-file"],["mismatch","image-owned","image-foreign-file"]])await expect(service.save(ctx,initial.momentsId,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:`real-file-reject-${suffix}`,document:{...initial.current,imageUses:[{assetId,assetFileId,order:0}]}})).rejects.toThrow();
 expect((await service.get(ctx,initial.momentsId)).currentVersionId).toBe(initial.currentVersionId);expect(await service.history(ctx,initial.momentsId)).toHaveLength(1);
 await db.update(assets).set({status:"deleted"}).where(eq(assets.id,"image-owned"));const saved=await service.save(ctx,initial.momentsId,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"real-file-history-text",document:{...initial.current,text:"旧配图缺失仍可改文字"}});expect(saved.document.imageUses).toEqual(initial.current.imageUses);
});
