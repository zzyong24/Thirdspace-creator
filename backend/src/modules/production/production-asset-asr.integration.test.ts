import {vi as ownedPgVi} from 'vitest';
ownedPgVi.setConfig({testTimeout:180000,hookTimeout:180000});
import {assertOwnedPostgresUrl} from '../../test-fixtures/owned-postgres';
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, projects, contentOutputs, productions, type Db } from "@creatoros/backend";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";
import { createProductionService } from "./production.service";
import { createProductionTransport } from "./production.transport";
import {mkdtemp,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import { itemDigest } from "./production-editor-plan";

const now="2026-10-01T10:00:00.000Z";
const ctx:RequestContext={userId:"user",accountId:"account-a",source:"user",requestId:"http-request"};
const plan=()=>({extra:{preserve:true},renderProps:{meta:{title:"视频A"},talkingHead:{file:"master",durationSec:20},
  scenes:[{id:"scene",title:"正文",label:"正文",startSec:0,endSec:20,cards:[]}],captions:[{start:0,end:4,cn:"原文"}],broll:[]}});
let db:Db, close:(()=>Promise<void>)|undefined, seq=0;
const service=()=>createProductionService({db,now:()=>now,nextId:p=>`${p}-${++seq}`,assertEditorAsset:async(_ctx,input)=>{if(input.assetId!=="master")throw new Error("非当前项目素材");}});
beforeEach(async()=>{
  const opened=await createDb();db=opened.db;close=()=>opened.client.close();seq=0;
  for(const [id,accountId] of [["project-a","account-a"],["project-b","account-b"]]) {
    await db.insert(projects).values({id:id!,userId:"user",accountId:accountId!,title:"真实项目",creationMode:"guided",status:"active",currentStage:"production",startedAt:now,createdAt:now,updatedAt:now});
  }
  for(const [id,projectId,contentType] of [["image","project-a","image"],["article","project-a","article"],["video-a","project-a","video"],["video-b","project-a","video"],["other-account","project-b","video"]]) {
    await db.insert(contentOutputs).values({id:id!,projectId:projectId!,contentType:contentType!,title:id!,status:"drafting",createdAt:now,updatedAt:now});
  }
});
afterEach(async()=>{await close?.();close=undefined;});
const save=(requestId:string,expectedRevision=0)=>({expectedRevision,requestId,plan:plan(),source:"manual" as const});

it.each([{mode:'v2',identity:'current'},{mode:'native',identity:'current'},{mode:'v2',identity:'legacy-old'},{mode:'v2',identity:'legacy-pending'},{mode:'native',identity:'legacy-unbound'},{mode:'v2',identity:'current-lost-create'},{mode:'v2',identity:'group-only'},{mode:'native',identity:'group-platform'}] as const)("T850 正式候选公共Source真实probe/adopt→精确Assets对象物化/抽音→prepared ASR→公共全文get/adopt ($mode/$identity)",async({mode,identity})=>{
 const grouped=identity.startsWith('group-');
 const ctx:RequestContext={userId:'user',accountId:identity==='group-only'?null:'account-a',...(grouped?{groupId:'asr-group',groupVersion:1}:{}),source:'user',requestId:'http-request'};
 const {execFile}=await import("node:child_process"),{promisify}=await import("node:util"),{readFile,copyFile,stat}=await import("node:fs/promises"),{createHash}=await import("node:crypto");
 const {createAiService}=await import("../ai/ai.service"),{createExecutionService}=await import("../execution/execution.service"),{runExecutionTask,abortExecutionTask}=await import("../execution/run-execution-task"),{createExecutorRegistry}=await import("../execution/executor-registry"),{createMediaProbeExecutor}=await import("../execution/media-probe");
 const root=await mkdtemp(join(tmpdir(),"creatoros-public-probe-retry-")),file=join(root,"original.mp4");
 try{
  await promisify(execFile)("/opt/homebrew/bin/ffmpeg",["-v","error","-f","lavfi","-i","testsrc2=size=320x180:rate=30","-f","lavfi","-i","sine=frequency=440:sample_rate=48000","-t","1","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac",file]);
  const fileDigest=createHash("sha256").update(await readFile(file)).digest("hex");
  // 未使用的领域采纳口明确抛错，不返回虚构领域实体；本测试真正调用原任务 owner。
  const unavailable=new Proxy({}, {get:()=>()=>{throw Error("该领域端口不属于探针旅程");}});
  type Deps=Parameters<typeof createAiService>[0];
  const aiDeps:Deps={db,now:()=>now,nextId:p=>`${p}-${++seq}`,artifacts:unavailable as Deps["artifacts"],knowledge:unavailable as Deps["knowledge"],candidate:unavailable as Deps["candidate"],learnings:unavailable as Deps["learnings"],publishing:unavailable as Deps["publishing"],materialLinks:unavailable as Deps["materialLinks"],positioning:unavailable as Deps["positioning"],calibration:unavailable as Deps["calibration"]};const ai=createAiService(aiDeps);
  const {assets,assetFiles,aiTasks,executionCalls,executionTasks,productionMediaRequests,platformAccounts,eq}=await import('@creatoros/backend');
  const {accountGroups,accountGroupMemberships}=await import('../../schema/account-groups');
  if(grouped){
   await db.insert(accountGroups).values([{id:'asr-group',userId:'user',name:'转写组',createdAt:now,updatedAt:now},{id:'foreign-group',userId:'user',name:'外组',createdAt:now,updatedAt:now}]);
   await db.update(projects).set({groupId:'asr-group'}).where(eq(projects.id,'project-a'));
   for(const id of ['video-a','video-b','image','article'])await db.update(contentOutputs).set({groupId:'asr-group'}).where(eq(contentOutputs.id,id));
   if(identity==='group-platform')for(const id of ['account-a','account-c']){await db.insert(platformAccounts).values({id,userId:'user',platform:'douyin',accountHandle:id,createdAt:now,updatedAt:now});await db.insert(accountGroupMemberships).values({id:'member-'+id,userId:'user',groupId:'asr-group',accountId:id,joinedAt:now});}
  }
  const {createAssetsService,createAssetRepository}=await import('@creatoros/backend/modules/assets');
  const {createAssetAsrOwner}=await import('../execution/asset-asr-owner.service');
  const {createAssetAsrPortInvoker}=await import('../execution/asset-asr-port-invoker');
  const {createProductionTranscripts}=await import('./production-transcripts.service');
  const {createProductionAsrExactReader,extractProductionAsrAudio}=await import('./production-asset-asr-media');
  const {createExecutionAuthorityService}=await import('../execution/execution-authority.service');
  const {createExecutionWorkerCallPorts}=await import('../execution/execution-worker-call-ports.service');
  const {createPersistentTaskService}=await import('../execution/persistent-task.service');
  const {runAssetAsrInWorker}=await import('@creatoros/ai-worker');
  const {createOpenaiAsrAdapter}=await import('@creatoros/ai-worker');
  const originalBytes=await readFile(file);const objects=new Map<string,Uint8Array>([['original.mp4',originalBytes]]);let audioNumber=0;
  const storage={createPresignedUpload:async()=>({storageKey:`asr-audio-${++audioNumber}`}),putObject:async(input:any)=>{objects.set(input.storageKey,Uint8Array.from(input.bytes));},getObject:async(key:string)=>{const bytes=objects.get(key);if(!bytes)throw Object.assign(Error('missing'),{code:'ENOENT'});return Uint8Array.from(bytes);},getSignedUrl:async(key:string)=>`https://fixture-media.invalid/${key}`,objectExists:async(key:string)=>objects.has(key)};
  await db.insert(assets).values({id:'master',userId:ctx.userId,accountId:grouped?null:ctx.accountId!,...(grouped?{groupId:'asr-group'}:{}),assetType:'video',name:'original.mp4',status:'active',currentFileId:'frozen',createdAt:now,updatedAt:now});await db.insert(assetFiles).values({id:'frozen',assetId:'master',versionNumber:1,storageKey:'original.mp4',mimeType:'video/mp4',fileSize:originalBytes.length,checksum:fileDigest,createdAt:now});
  const scopedAssets=(tx:import('@creatoros/backend').Db=db)=>createAssetsService(createAssetRepository(tx,{now:()=>now,nextId:p=>`${p}-${++seq}`}),async()=>storage as never,{now:()=>now,nextId:p=>`${p}-${++seq}`});const assetOwner=scopedAssets();
  const exact=createProductionAsrExactReader({assets:(_c,tx)=>scopedAssets(tx),assertProjectAsset:async(c,input,tx)=>{if(input.projectId!=='project-a')throw Error('项目不属于原片');await scopedAssets(tx).assertAssetFileOwned(c,input.assetId,input.assetFileId,false);}});
  const config={kind:'audio' as const,provider:'openai',model:'fixture-asr',baseUrl:'https://asr.fixture.invalid'},budget={maxCalls:6,maxTokens:1000000,deadlineMs:600000};
  const prepareCredential=vi.fn(async()=>({...config,token:'fixture-no-supplier-credential'}));
  const asr=createAssetAsrOwner(db,{assertProductionReservation:(c,proof,tx)=>owner.assertAssetAsrReservation(c,proof,tx),now:()=>now,nextId:p=>`${p}-${++seq}`,budget,objectStorageForCtx:async()=>storage as never,readExactFile:(c,input,signal)=>exact(c,input,undefined,signal),extractAudio:extractProductionAsrAudio,prepareSpec:prepareCredential});
  let loseBinding=identity!=='current-lost-create',loseCreate=identity==='current-lost-create';const readTaskState=vi.fn((c:RequestContext,id:string)=>ai.getTask(c,id));
  const transcripts=createProductionTranscripts(db,{now:()=>now,nextId:p=>`${p}-${++seq}`,asr,readAiTaskState:readTaskState,resolveConfiguration:async()=>config,readExactFile:exact,aiCreateTask:async(c,body)=>{const task=await ai.createTask(c,body);if(loseCreate){loseCreate=false;throw Error('ASR create已提交但回复丢失');}return task;},bindExecution:async(c,id)=>{if(loseBinding){loseBinding=false;throw Error('真实预约已绑原AI任务但execution绑定前失败');}const actual=await asr.readAggregate(c,id),task=await ai.getTask(c,id);return createExecutionAuthorityService(db,{now:()=>now}).bindAiTask(c,id,{requestFingerprint:task.requestFingerprint,modelInput:actual.input,budget});}});
  const registry=createExecutorRegistry();registry.register(createMediaProbeExecutor());
  const execution=createExecutionService({ai,assets:{createGeneratedAsset:async()=>{throw Error("探针不创建素材");}},hasExecutor:type=>registry.has(type),workspacesRoot:root,abortRun:abortExecutionTask,resolveOutputProjectId:async(_c,id)=>id==="video-a"?"project-a":null});
  let transient=true;const run=async(task:import("@creatoros/contract").ExecutionTaskResource)=>runExecutionTask(ctx,{id:task.id,inputData:{spec:task.spec},deterministicGeneration:task.deterministicGeneration},{ai,registry,workspacesRoot:root,assets:{materializeAsset:async(_c,id,path,exact)=>{if(id!=="master"||exact?.assetFileId!=="frozen"||exact?.fileDigest!==fileDigest)throw Error("冻结原片不一致");if(transient){transient=false;throw Error("fixture临时读取故障");}return assetOwner.materializeAsset(ctx,id,path,exact);}}});
  let lost=true;const owner=createProductionService({assertEditorAsset:async(c,input,tx)=>{await scopedAssets(tx).assertAssetFileOwned(c,input.assetId,input.assetFileId!,false);},transcripts:()=>transcripts,db,now:()=>now,nextId:p=>`${p}-${++seq}`,sourcePorts:{assertTaskSettled:(c,id,generation,digest,tx)=>ai.probeControl.assertSettled(c,id,generation,digest,tx),readMediaFile:async(_c,input,tx)=>{if(input.assetId!=="master"||input.assetFileId!=="frozen")throw Error("原片身份不一致");return scopedAssets(tx).readMediaFile(ctx,input.assetId,input.assetFileId,input.fileDigest);},createTask:async(c,input,tx)=>{const scoped=tx?createExecutionService({ai:createAiService({...aiDeps,db:tx}),assets:{createGeneratedAsset:async()=>{throw Error('探针不创建素材');}},hasExecutor:type=>registry.has(type),workspacesRoot:root,abortRun:abortExecutionTask,resolveOutputProjectId:async(_c,id)=>id==='video-a'?'project-a':null}):execution;const task=await scoped.create(c,input);if(!tx)await run(task);return{id:task.id};},dispatchTask:async(c,id)=>{const task=await execution.get(c,id);if(task.status==='queued')await run(task);},readTask:(c,id)=>execution.get(c,id),retryTask:async(c,input)=>{if(grouped)expect(c.accountId).toBeNull();await ai.probeControl.retry(c,input);const task=await execution.get(c,input.taskId);if(task.status==="queued")await run(task);if(lost){lost=false;throw Error("恢复回复丢失");}}}});
  const transport=createProductionTransport(()=>owner),params={outputId:"video-a"};
  if(mode==='native'){await transport.request(ENDPOINTS.saveProductionEditor,{params,query:undefined,body:{expectedRevision:0,requestId:'formal-native-initial',plan:{editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'c'.repeat(40),mediaRefs:[{mediaId:'m',assetId:'master',assetFileId:'frozen'}],nativeDocument:{version:31,metadata:{id:'video-a'},currentSceneId:'scene',settings:{fps:{numerator:30,denominator:1}},scenes:[{id:'scene',tracks:{main:{id:'main',type:'video',elements:[{id:'clip',type:'video',mediaId:'m',startTime:0,duration:120000,trimStart:0,trimEnd:0,params:{}}]},overlay:[],audio:[]}}]}}},source:'manual'}},ctx);}
  const prepared=await transport.request(ENDPOINTS.prepareProductionEditorSource,{params,query:undefined,body:{assetId:"master",assetFileId:"frozen",requestId:"public-source-retry"}},ctx) as {data:import("@creatoros/contract").ProductionSourceRequest};expect(prepared.data.status).toBe("failed");
  const original=await ai.getTask(ctx,prepared.data.taskId!),body={sourceRequestId:"public-source-retry",requestId:"public-retry-command"};
  await expect(transport.request(ENDPOINTS.retryProductionEditorSource,{params,query:undefined,body},ctx)).rejects.toThrow("回复丢失");
  const recovered=await transport.request(ENDPOINTS.retryProductionEditorSource,{params,query:undefined,body},ctx) as {data:import("@creatoros/contract").ProductionSourceRequest};expect(recovered.data).toMatchObject({taskId:original.id,status:"succeeded",probe:{fileDigest,durationTicks:15360,hasAudio:true}});
  const current=await ai.getTask(ctx,original.id);expect(current.inputData).toEqual(original.inputData);expect(current.attemptId).toBe(original.attemptId);expect(current.deterministicGeneration).toBe(1);expect((await ai.listTasks(ctx,{limit:100,offset:0})).total).toBe(1);
  const adopted=await transport.request(ENDPOINTS.adoptProductionEditorSource,{params,query:undefined,body:{sourceRequestId:body.sourceRequestId,requestId:"public-probe-adopt",expectedRevision:mode==='native'?1:0,addWholeClip:mode!=='native',...(mode==='native'?{mediaId:'m'}:{})}},ctx) as {data:import("@creatoros/contract").ProductionEditorVersion};if(mode==='native'){expect(adopted.data.plan).toMatchObject({editorVersion:3,nativeSources:[{mediaId:'m',source:{fileDigest,assetFileId:'frozen'}}]});expect(adopted.data.plan).not.toHaveProperty('mainTrack');}else expect(adopted.data.plan).toMatchObject({editorVersion:2,mainTrack:{sources:[{fileDigest,assetFileId:"frozen"}],clips:[{sourceInTicks:0,sourceOutTicks:15360}]}});
 const {createAiTransport}=await import('../ai/ai.transport');const generic=createAiTransport(()=>ai);await expect(generic.request(ENDPOINTS.createAITask,{params:undefined,query:undefined,body:{taskType:'asset.asr',attemptId:'formal-bypass-asset-asr',inputData:{}}},ctx)).rejects.toThrow('生产预约');expect((await ai.listTasks(ctx,{limit:100,offset:0})).total).toBe(1);
 const source=mode==='native'?(adopted.data.plan.nativeSources as any)[0].source:(adopted.data.plan.mainTrack as any).sources[0];const sourceRevision=mode==='native'?2:1;
  await expect(transport.request(ENDPOINTS.createProductionEditorTranscript,{params,query:undefined,body:{sourceId:source.sourceId,expectedRevision:sourceRevision,requestId:'formal-transcript-request'}},ctx)).rejects.toThrow(identity==='current-lost-create'?'create已提交但回复丢失':'execution绑定前失败');
  if(identity.startsWith('legacy-')){
   // 持久旧协议兼容输入：原public创建后仅还原c531已记录的账号key/fingerprint与未版本化reservation形状，正文/费用/原IDs不改。
   const [business]=await db.select().from(aiTasks).where(eq(aiTasks.taskType,'asset.asr'));const [reservation]=await db.select().from(productionMediaRequests).where(eq(productionMediaRequests.kind,'transcript'));if(!business||!reservation)throw Error('缺原预约事实');
   const frozen=await import('@creatoros/contract/execution-worker');const parsed=frozen.productionAssetAsrReservationFrozen.parse(reservation.frozenInput);
   await db.update(productionMediaRequests).set({frozenInput:{ownerCreateBody:parsed.ownerCreateBody,ownerCreateBodyDigest:parsed.ownerCreateBodyDigest},...(identity!=='legacy-old'?{taskId:null}:{})}).where(eq(productionMediaRequests.id,reservation.id));
   const {hash}=await import('./production-mechanical-digest');if(identity==='legacy-pending')await db.delete(aiTasks).where(eq(aiTasks.id,business.id));else await db.update(aiTasks).set({idempotencyKey:`${business.accountId}:${business.taskType}:${business.attemptId}`,requestFingerprint:`sha256:${hash({userId:business.userId,accountId:business.accountId,taskType:business.taskType,inputData:business.inputData,retryOfTaskId:business.retryOfTaskId})}`}).where(eq(aiTasks.id,business.id));
  }
  const beforeRecover=await db.select().from(aiTasks).where(eq(aiTasks.taskType,'asset.asr'));const frozenBefore=await db.select().from(productionMediaRequests).where(eq(productionMediaRequests.kind,'transcript'));
  await transcripts.recoverPending();expect(readTaskState).toHaveBeenCalledTimes(['legacy-pending','legacy-unbound','current-lost-create'].includes(identity)?0:1);
  const created=await transport.request(ENDPOINTS.createProductionEditorTranscript,{params,query:undefined,body:{sourceId:source.sourceId,expectedRevision:sourceRevision,requestId:'formal-transcript-request'}},ctx) as {data:any};
  const task=await ai.getTask(ctx,created.data.taskId);
  expect(created.data).toMatchObject({executionTaskId:task.executionTaskId,transcript:null});
  const afterRecover=await db.select().from(aiTasks).where(eq(aiTasks.taskType,'asset.asr'));expect(afterRecover).toHaveLength(1);if(beforeRecover[0])expect(afterRecover[0]).toMatchObject({id:beforeRecover[0].id,inputData:beforeRecover[0].inputData,requestFingerprint:beforeRecover[0].requestFingerprint,idempotencyKey:beforeRecover[0].idempotencyKey});else{const originalFrozen=(await import('@creatoros/contract/execution-worker')).productionAssetAsrReservationFrozen.parse(frozenBefore[0]!.frozenInput);expect(afterRecover[0]).toMatchObject({attemptId:originalFrozen.ownerCreateBody.attemptId,inputData:originalFrozen.ownerCreateBody.inputData});}expect((await db.select().from(productionMediaRequests).where(eq(productionMediaRequests.kind,'transcript')))[0]!.frozenInput).toEqual(frozenBefore[0]!.frozenInput);
  if(grouped){expect(afterRecover[0]).toMatchObject({groupId:'asr-group',accountId:null});expect(frozenBefore[0]).toMatchObject({groupId:'asr-group',accountId:null});await expect(transcripts.get({...ctx,groupId:'foreign-group'},'video-a','formal-transcript-request')).rejects.toThrow();}

  const transcriptGet=()=>transport.request(ENDPOINTS.getProductionEditorTranscript,{params:{...params,requestId:'formal-transcript-request'},query:undefined,body:undefined},ctx) as Promise<{data:any}>;
  // execution_tasks无project列：真实business与冻结modelInput完整证明父链，不编造execution的非NULL列。
  const [executionBefore]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.executionTaskId!));const [businessBefore]=await db.select().from(aiTasks).where(eq(aiTasks.id,task.id));if(!executionBefore||!businessBefore)throw Error('缺原执行事实');
  expect(executionBefore).not.toHaveProperty('projectId');
  await db.update(aiTasks).set({projectId:'project-b'}).where(eq(aiTasks.id,task.id));await expect(transcriptGet()).rejects.toThrow();await db.update(aiTasks).set({projectId:businessBefore.projectId}).where(eq(aiTasks.id,task.id));
  await db.update(aiTasks).set({contentOutputId:'other-account'}).where(eq(aiTasks.id,task.id));await expect(transcriptGet()).rejects.toThrow();await db.update(aiTasks).set({contentOutputId:businessBefore.contentOutputId}).where(eq(aiTasks.id,task.id));
  const realInput=(await import('@creatoros/contract/execution-worker')).assetAsrInput.parse(businessBefore.inputData);await db.update(aiTasks).set({inputData:{...realInput,projectId:'project-b'}}).where(eq(aiTasks.id,task.id));await expect(transcriptGet()).rejects.toThrow();await db.update(aiTasks).set({inputData:businessBefore.inputData}).where(eq(aiTasks.id,task.id));
  await db.update(executionTasks).set({ownerId:original.id}).where(eq(executionTasks.id,task.executionTaskId!));await expect(transcriptGet()).rejects.toThrow();await db.update(executionTasks).set({ownerId:executionBefore.ownerId}).where(eq(executionTasks.id,task.executionTaskId!));
  await db.update(executionTasks).set({groupVersion:(executionBefore.groupVersion??0)+1}).where(eq(executionTasks.id,task.executionTaskId!));await expect(transcriptGet()).rejects.toThrow();await db.update(executionTasks).set({groupVersion:executionBefore.groupVersion}).where(eq(executionTasks.id,task.executionTaskId!));
  const [reservationBefore]=await db.select().from(productionMediaRequests).where(eq(productionMediaRequests.kind,'transcript'));if(!reservationBefore)throw Error('缺原预约');await db.delete(productionMediaRequests).where(eq(productionMediaRequests.id,reservationBefore.id));await expect(transcriptGet()).rejects.toThrow();await db.insert(productionMediaRequests).values(reservationBefore);expect((await transcriptGet()).data.taskId).toBe(task.id);expect(await db.select().from(executionCalls)).toHaveLength(0);

  for(const status of ['failed','waiting_user','running']){
   await db.update(executionTasks).set({status}).where(eq(executionTasks.id,task.executionTaskId!));
   expect((await transcriptGet()).data).toMatchObject({status,executionTaskId:task.executionTaskId,transcript:null});
  }
  await db.update(executionTasks).set({status:'queued'}).where(eq(executionTasks.id,task.executionTaskId!));
  readTaskState.mockRejectedValueOnce(Error('原执行读取暂时失败'));
  await expect(transcriptGet()).rejects.toThrow('原执行读取暂时失败');
  const {OwnershipError}=await import('@creatoros/backend');
  readTaskState.mockRejectedValueOnce(new OwnershipError('原执行不属于当前用户'));
  await expect(transcriptGet()).rejects.toThrow('原执行不属于当前用户');
  const claimed=await createPersistentTaskService(db,{now:()=>now}).claimTask({taskId:task.executionTaskId!,workerId:'formal-asr-test'});if(!claimed)throw Error('原队列未领取');const ref={executionTaskId:claimed.task.id,attempt:claimed.lease.attempt,fenceToken:claimed.lease.fenceToken},invoke=createAssetAsrPortInvoker(asr),provider=vi.fn(async()=>new Response(JSON.stringify({text:'供应商adapter注入全文，不称真实语音识别',language:'zh'}),{status:200}));
  const originalSettle=asr.settle;let lostAsrAck=true;asr.settle=async(...args)=>{const receipt=await originalSettle(...args);if(lostAsrAck){lostAsrAck=false;throw Error('formal ASR settle reply lost');}return receipt;};
  await expect(runAssetAsrInWorker(await createExecutionWorkerCallPorts(db,{budget,now:()=>now}).readTaskContext(ref) as any,new AbortController().signal,(port,data)=>invoke(ref,port as any,data),{openai:createOpenaiAsrAdapter({fetch:provider as never})})).rejects.toThrow();
  await runAssetAsrInWorker(await createExecutionWorkerCallPorts(db,{budget,now:()=>now}).readTaskContext(ref) as any,new AbortController().signal,(port,data)=>invoke(ref,port as any,data),{openai:createOpenaiAsrAdapter({fetch:provider as never})});
  const read=await transport.request(ENDPOINTS.getProductionEditorTranscript,{params:{...params,requestId:'formal-transcript-request'},query:undefined,body:undefined},ctx) as {data:any};expect(ENDPOINTS.getProductionEditorTranscript.response.parse(read.data).transcript).toMatchObject({granularity:'text'});expect(read.data.transcript).not.toHaveProperty('tokens');expect(provider).toHaveBeenCalledTimes(1);expect(prepareCredential).toHaveBeenCalledTimes(1);
  const final=await transport.request(ENDPOINTS.adoptProductionEditorTranscript,{params,query:undefined,body:{transcriptRequestId:'formal-transcript-request',expectedRevision:sourceRevision,requestId:'formal-adopt-transcript'}},ctx) as {data:any};expect(final.data.revision).toBe(sourceRevision+1);expect(final.data.plan.sourceTranscripts[0].providerReceiptId).toBe(read.data.transcript.providerReceiptId);expect(await db.select().from(executionCalls)).toHaveLength(1);
  const readCtx=identity==='group-platform'?{...ctx,accountId:'account-c'}:ctx;
  expect((await transcripts.get(readCtx,'video-a','formal-transcript-request')).transcript).toEqual(read.data.transcript);
  if(grouped){await db.update(accountGroups).set({status:'archived'}).where(eq(accountGroups.id,'asr-group'));expect((await transcripts.get(readCtx,'video-a','formal-transcript-request')).status).toBe('succeeded');await expect(transcripts.create(readCtx,'video-a',{sourceId:source.sourceId,expectedRevision:sourceRevision+1,requestId:'archived-new-transcript'})).rejects.toThrow();expect(await db.select().from(executionCalls)).toHaveLength(1);}
  else{await db.insert(accountGroups).values({id:'moved-group',userId:'user',name:'转组',createdAt:now,updatedAt:now});await db.insert(accountGroupMemberships).values({id:'moved-member',userId:'user',groupId:'moved-group',accountId:'account-a',joinedAt:now});await expect(transcripts.create(ctx,'video-a',{sourceId:source.sourceId,expectedRevision:sourceRevision+1,requestId:'moved-new-transcript'})).rejects.toThrow();expect(await db.select().from(executionCalls)).toHaveLength(1);}

 }finally{await rm(root,{recursive:true,force:true});}
},180000);

const sourcePgUrl=process.env.CREATOROS_TEST_POSTGRES_URL;
it.skipIf(!sourcePgUrl)('T1062真实PG同组不同父Source并发预约/attach沿原AI创建端口，无SHARE升级互等',async()=>{
 const {OwnedPostgresPool:Pool}=await import('../../test-fixtures/owned-postgres'),{randomUUID,createHash}=await import('node:crypto'),{createRuntimeDb}=await import('../../db');
 const {accountGroups}=await import('../../schema/account-groups'),{aiTasks,productionMediaRequests,assets,assetFiles,eq}=await import('@creatoros/backend');
 const {createAiService}=await import('../ai/ai.service'),{createExecutionService}=await import('../execution/execution.service');
 const url=new URL(sourcePgUrl!);assertOwnedPostgresUrl(url.toString());
 const name='t1062_source_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE DATABASE ${name}`);url.pathname='/'+name;
 const runtime=await createRuntimeDb({connectionString:url.toString()}),root=await mkdtemp(join(tmpdir(),'t1062-source-pg-'));
 let releaseFirst:()=>void=()=>{},firstReached:()=>void=()=>{};
 const firstGate=new Promise<void>(resolve=>{releaseFirst=resolve;}),started=new Promise<void>(resolve=>{firstReached=resolve;});
 try{
  const c:RequestContext={userId:'pg-user',groupId:'pg-group',accountId:null,source:'user',requestId:'pg-source'};let sequence=0,creates=0;
  await runtime.db.insert(accountGroups).values({id:c.groupId!,userId:c.userId,name:'真实并发组',createdAt:now,updatedAt:now});
  for(const n of [1,2]){await runtime.db.insert(projects).values({id:'pg-project-'+n,userId:c.userId,groupId:c.groupId,accountId:null,title:'并发父'+n,creationMode:'guided',status:'active',currentStage:'production',startedAt:now,createdAt:now,updatedAt:now});await runtime.db.insert(contentOutputs).values({id:'pg-video-'+n,projectId:'pg-project-'+n,groupId:c.groupId,contentType:'video',title:'并发原片',status:'drafting',createdAt:now,updatedAt:now});}
  const {execFile}=await import('node:child_process'),{promisify}=await import('node:util'),{readFile}=await import('node:fs/promises');const file=join(root,'fixture-original.mp4');
  await promisify(execFile)('/opt/homebrew/bin/ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-t','1','-c:v','libx264','-pix_fmt','yuv420p',file]);
  const bytes=await readFile(file),fileDigest=createHash('sha256').update(bytes).digest('hex');
  // 实际临时合成原文件及其资源行；仅媒体元数据读取端口为fixture，不运行probe或模型。
  await runtime.db.insert(assets).values({id:'fixture-asset',userId:c.userId,groupId:c.groupId,accountId:null,assetType:'video',name:'fixture-original.mp4',status:'active',currentFileId:'fixture-file',createdAt:now,updatedAt:now});
  await runtime.db.insert(assetFiles).values({id:'fixture-file',assetId:'fixture-asset',versionNumber:1,storageKey:file,mimeType:'video/mp4',fileSize:bytes.length,checksum:fileDigest,createdAt:now});
  type Deps=Parameters<typeof createAiService>[0];const unavailable=new Proxy({}, {get:()=>()=>{throw Error('探针不使用模型或领域采用');}});
  const aiDeps:Deps={db:runtime.db,now:()=>now,nextId:p=>`${p}-${++sequence}`,artifacts:unavailable as Deps['artifacts'],knowledge:unavailable as Deps['knowledge'],candidate:unavailable as Deps['candidate'],learnings:unavailable as Deps['learnings'],publishing:unavailable as Deps['publishing'],materialLinks:unavailable as Deps['materialLinks'],positioning:unavailable as Deps['positioning'],calibration:unavailable as Deps['calibration']},ai=createAiService(aiDeps);
  const execution=(database:Db)=>createExecutionService({ai:createAiService({...aiDeps,db:database}),assets:{createGeneratedAsset:async()=>{throw Error('不生成媒体');}},hasExecutor:type=>type==='media.probe',workspacesRoot:root,abortRun:()=>false,resolveOutputProjectId:async(_ctx,id)=>id==='pg-video-1'?'pg-project-1':id==='pg-video-2'?'pg-project-2':null});
  const owner=createProductionService({db:runtime.db,now:()=>now,nextId:aiDeps.nextId,sourcePorts:{
   // 只fake媒体元数据IO，真实父授权、原AI事务、任务/预约落库不mock；不执行探针或供应商。
   readMediaFile:async(_ctx,input)=>{if(!['pg-project-1','pg-project-2'].includes(input.projectId)||input.assetId!=='fixture-asset'||input.assetFileId!=='fixture-file')throw Error('精确原片不符');return{fileDigest,mimeType:'video/mp4'};},
   createTask:async(original,input,tx)=>{expect(tx).toBeDefined();expect(original).toMatchObject({userId:c.userId,groupId:c.groupId,accountId:null,groupVersion:1});creates++;if(creates===1){firstReached();await firstGate;}return execution(tx!).create(original,input);},
   readTask:(original,id)=>execution(runtime.db).get(original,id),assertTaskSettled:()=>{throw Error('未运行探针，不采用');}
  }});
  const body={assetId:'fixture-asset',assetFileId:'fixture-file',requestId:'same-key-different-output'};
  const first=owner.prepareEditorSource(c,'pg-video-1',body);await started;
  const second=owner.prepareEditorSource({...c,accountId:'page-platform-filter'},'pg-video-2',body);
  let waiting=false;for(let i=0;i<400;i++){const row=await runtime.pool.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND wait_event_type=$2',[name,'Lock']);if(row.rows[0].n>0){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
  expect(waiting).toBe(true);expect(creates).toBe(1);releaseFirst();
  const result=await Promise.all([first,second]);expect(result.map(r=>r.status)).toEqual(['queued','queued']);expect(result[0]!.taskId).not.toBe(result[1]!.taskId);
  const tasks=await runtime.db.select().from(aiTasks).where(eq(aiTasks.userId,c.userId));expect(tasks).toHaveLength(2);expect(tasks.map(t=>t.projectId).sort()).toEqual(['pg-project-1','pg-project-2']);for(const task of tasks)expect(task).toMatchObject({userId:c.userId,groupId:c.groupId,accountId:null,groupVersion:1,membershipVersion:null});
  expect(await owner.prepareEditorSource(c,'pg-video-1',body)).toEqual(result[0]);expect(await owner.prepareEditorSource(c,'pg-video-2',body)).toEqual(result[1]);expect(creates).toBe(2);expect(await runtime.db.select().from(productionMediaRequests)).toHaveLength(2);expect((await ai.listTasks(c,{limit:100,offset:0})).total).toBe(2);
 }finally{releaseFirst();await runtime.pool.end();await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();await rm(root,{recursive:true,force:true});}
},180000);
