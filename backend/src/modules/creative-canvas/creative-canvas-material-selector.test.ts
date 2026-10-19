import {accountGroups} from '../../schema/account-groups';
import {createCreativeCanvasTransport} from './creative-canvas.transport';
import {createClient,ENDPOINTS} from '@creatoros/contract';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb,aiTasks,aiTaskResults,canvasGenerationLinks,eq,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createFixtureProjectsService} from '../../test-fixtures/owner-services';
import {createExecutionAuthorityService} from '../execution/execution-authority.service';
import {generationFingerprint} from '../ai-runtime/asset-provider-checkpoint';
import {createAssetBusinessExecutionService} from '../ai-runtime/asset-business-execution.service';
import {executionTasks,executionCalls} from '@creatoros/backend';
import {createAiService} from '../ai/ai.service';
import {createAiTaskSubmissionService} from '../ai/ai-task-submission.service';
import {createCreativeCanvasService} from './creative-canvas.service';
import {createExecutionCandidateService} from '../ai/execution-candidate.service';
import {createExecutionAssetResultService} from '../execution/execution-asset-result.service';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createGeneratedAssetAdoptionService} from '../ai/generated-asset-adoption.service';
import {readCommittedGeneratedAssetFile} from '../assets/generated-asset-candidate.service';
import {createLocalFsObjectStorage} from '../assets/localfs-object-storage';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {assets,assetFiles} from '@creatoros/backend';
let db:Db,close:()=>Promise<void>,seq=0;const storageRoots:string[]=[];
const globalContext:RequestContext={userId:'canvas-original-ai',accountId:'a',source:'user',requestId:'frozen'},now='2026-10-02T00:00:00.000Z';
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});afterAll(async()=>{await close();for(const root of storageRoots)await rm(root,{recursive:true,force:true});});
function owners(database:Db=db){
 // 真原AI创建/请求幂等/读取端口；此测试不调用模型，下面未用采纳ports仅满足原工厂依赖。
 const ai=createAiService({generatedAssets:createGeneratedAssetAdoptionService(database,{link:async()=>{throw Error("project null不链接");}},()=>now),db:database,now:()=>now,nextId:prefix=>prefix+'-'+(++seq),artifacts:{createVersion:async()=>({}),adoptThesisCandidate:async()=>{}},knowledge:{createKnowledge:async()=>({id:'unused'})},candidate:{createFromAIResult:async()=>({id:'unused'}),enrichCard:async()=>({id:'unused'})},learnings:{createLearning:async()=>({id:'unused'})},publishing:{createPublicationFromDraft:async()=>({id:'unused'})},materialLinks:{link:async()=>({id:'unused'})},positioning:{upsertProfile:async()=>({id:'unused'}),createStatementVersion:async()=>({id:'unused'})},calibration:{createDraftPrediction:async()=>({id:'unused'})}});
 const submissions=createAiTaskSubmissionService({findTaskByAttempt:ai.findTaskByAttempt,submit:ai.createTask});
 const canvas=createCreativeCanvasService(database,{now:()=>now,assertProject:async(c,id,tx=db,lock)=>{await createFixtureProjectsService(tx,{now:()=>now,nextId:prefix=>prefix+'-'+(++seq)}).getProject(c,id,lock);},assertMediaAsset:async()=>{throw Error('unused');},assertReferenceAsset:async()=>{},getMediaFileDownloadUrl:async()=>{throw Error('unused');},getReference:async()=>null,resolveCapability:async()=>({provider:'openai',model:'fixture-image'}),submitTask:async(c,body)=>submissions.submit(c,{taskType:'asset.generate',attemptId:body.attemptId,inputData:body.inputData}),readTask:async(c,id,tx=database)=>owners(tx).ai.getTask(c,id),readTaskResults:(c,id,tx=database)=>owners(tx).ai.listResults(c,id),getCommittedAssetResult:(c,input,tx)=>proofReader(tx).getCommittedAssetResult(c,input)});return{ai,canvas};
}
async function generated(projectId?:string,ctx:RequestContext=globalContext){const owner=owners(),c=await owner.canvas.create(ctx,{title:'原AI真实task',...(projectId?{projectId}:{})}),saved=await owner.canvas.save(ctx,c.id,{expectedRevision:1,document:{schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes:[{id:'generate',type:'image_generation',position:{x:0,y:0},label:'画面',prompt:'真实冻结原输入',mode:'text_to_image'}],edges:[]}}),attemptId='original-canvas-attempt-'+(++seq),link=await owner.canvas.generate(ctx,c.id,'generate',{expectedRevision:saved.revision,attemptId});return{...owner,c,link};}

function proofReader(tx:Db){return createExecutionCandidateService(tx,{projectCandidate:()=>{throw Error('unused');},committedAssets:{aiFor:tx=>owners(tx).ai,assetsFor:tx=>({readCommittedGeneratedAssetFile:(c,id,r)=>readCommittedGeneratedAssetFile(tx,c,id,r)})}});}
async function committed(ctx:RequestContext=globalContext){const f=await generated(undefined,ctx),budget={maxCalls:3,maxTokens:10000,deadlineMs:600000},business=createAssetBusinessExecutionService(db,{now:()=>now,budget,assertProject:async()=>{},resolveSpec:async()=>({kind:'image',provider:'openai',model:'fixture-image',baseUrl:null,token:'fixture-secret'}),assertCanvasInput:(c,input,tx)=>f.canvas.assertFrozenGenerationInput(c,input,tx)}),mapped=await business.prepare(ctx,f.link.taskId!),tasks=createPersistentTaskService(db,{now:()=>now}),claim=(await tasks.claimTask({taskId:mapped.executionTaskId,workerId:'fixture-worker'}))!,ref={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},root=await mkdtemp(join(tmpdir(),'canvas-selector-')),storage=createLocalFsObjectStorage({rootPath:root,publicBaseUrl:'/blob'},{now:()=>Date.parse(now),nextKey:()=>String(++seq)}),service=createExecutionAssetResultService({db,budget,now:()=>now,objectStorageForCtx:async()=>storage}),call=await service.reserve(ref,128);await service.start(ref,call.id);const receipt=await service.save(ref,call.id,Buffer.from('fixture real bytes'));const result=await createExecutionCandidateService(db,{now:()=>now,projectCandidate:()=>{throw Error('unused');}}).commitResult(ref,{callId:call.id,outcome:'succeeded',text:JSON.stringify(receipt)});storageRoots.push(root);return{...f,receipt,result};}
const ctx=globalContext;
it('Canvas真实原AI→execution→commit→selector pending，原用户confirm后confirmed，改current仍精确历史file',async()=>{const f=await committed(),read=()=>f.canvas.getGenerationMaterial(ctx,f.c.id,f.link.id);expect(await read()).toMatchObject({status:'available',phase:'candidate',file:{assetId:f.receipt.assetId,assetFileId:f.receipt.fileId}});await f.ai.confirmTask(ctx,f.link.taskId!);expect(await read()).toMatchObject({status:'available',phase:'confirmed',assetStatus:'active',taskStatus:'succeeded'});await db.insert(assetFiles).values({id:'new-'+f.receipt.fileId,assetId:f.receipt.assetId,versionNumber:2,storageKey:'new-'+f.receipt.fileId,mimeType:'image/png',fileSize:1,checksum:'a'.repeat(64),createdAt:now});await db.update(assets).set({currentFileId:'new-'+f.receipt.fileId}).where(eq(assets.id,f.receipt.assetId));const before={links:await db.select().from(canvasGenerationLinks),results:await db.select().from(aiTaskResults),calls:await db.select().from(executionCalls)};expect(await read()).toMatchObject({status:'available',phase:'confirmed',file:{assetFileId:f.receipt.fileId},checksum:f.receipt.checksum});expect({links:await db.select().from(canvasGenerationLinks),results:await db.select().from(aiTaskResults),calls:await db.select().from(executionCalls)}).toEqual(before);});
it('Canvas零结果真实not_ready，2结果/篡改input不猜，跨号与不同Canvas链接拒绝',async()=>{const f=await generated();expect(await f.canvas.getGenerationMaterial(ctx,f.c.id,f.link.id)).toMatchObject({status:'not_ready'});await expect(f.canvas.getGenerationMaterial({...ctx,accountId:'b'},f.c.id,f.link.id)).rejects.toThrow();const other=await generated();await expect(f.canvas.getGenerationMaterial(ctx,other.c.id,f.link.id)).rejects.toThrow();await db.insert(aiTaskResults).values([{id:'multi-one',aiTaskId:f.link.taskId!,resultType:'generated_asset',assetId:'one',resultData:{}},{id:'multi-two',aiTaskId:f.link.taskId!,resultType:'generated_asset',assetId:'two',resultData:{}}]);expect(await f.canvas.getGenerationMaterial(ctx,f.c.id,f.link.id)).toMatchObject({status:'unverifiable'});const task=await f.ai.getTask(ctx,f.link.taskId!);await db.update(aiTasks).set({inputData:{...task.inputData,prompt:'tampered'}}).where(eq(aiTasks.id,task.id));expect(await f.canvas.getGenerationMaterial(ctx,f.c.id,f.link.id)).toMatchObject({status:'unverifiable'});});

it('纯组画布原公共transport→task→真实bytes提交→候选证明→confirm保留→历史精确文件，不重发生成',async()=>{
 const c:RequestContext={userId:'canvas-group-user-'+(++seq),groupId:'canvas-group-'+seq,accountId:null,groupVersion:1,requestId:'group-proof',source:'user'};
 await db.insert(accountGroups).values({id:c.groupId!,userId:c.userId,name:'中性画布证明组',status:'active',version:1,createdAt:now,updatedAt:now});
 const f=await committed(c),client=createClient(ENDPOINTS,createCreativeCanvasTransport(f.canvas),c),read=()=>client.getCanvasGenerationMaterial({params:{canvasId:f.c.id,generationLinkId:f.link.id},query:undefined,body:undefined});
 expect(await read()).toMatchObject({status:'available',phase:'candidate',file:{assetFileId:f.receipt.fileId},checksum:f.receipt.checksum});
 await f.ai.confirmTask(c,f.link.taskId!);
 expect(await read()).toMatchObject({status:'available',phase:'confirmed',assetStatus:'active',taskStatus:'succeeded'});
 await db.insert(assetFiles).values({id:'new-group-'+f.receipt.fileId,assetId:f.receipt.assetId,versionNumber:2,storageKey:'new-group-'+f.receipt.fileId,mimeType:'image/png',fileSize:1,checksum:'b'.repeat(64),createdAt:now});
 await db.update(assets).set({currentFileId:'new-group-'+f.receipt.fileId}).where(eq(assets.id,f.receipt.assetId));
 const before={tasks:await db.select().from(aiTasks),links:await db.select().from(canvasGenerationLinks),results:await db.select().from(aiTaskResults),calls:await db.select().from(executionCalls)};
 expect(await read()).toMatchObject({status:'available',phase:'confirmed',file:{assetFileId:f.receipt.fileId},checksum:f.receipt.checksum});
 await expect(createClient(ENDPOINTS,createCreativeCanvasTransport(f.canvas),{...c,groupId:'foreign'}).getCanvasGenerationMaterial({params:{canvasId:f.c.id,generationLinkId:f.link.id},query:undefined,body:undefined})).rejects.toThrow();
 expect({tasks:await db.select().from(aiTasks),links:await db.select().from(canvasGenerationLinks),results:await db.select().from(aiTaskResults),calls:await db.select().from(executionCalls)}).toEqual(before);
});
