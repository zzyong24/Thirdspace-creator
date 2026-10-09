import {beforeAll,afterAll,beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createServer,type Server} from 'node:http';
import {isDeepStrictEqual} from 'node:util';
import {createDb,aiTasks,aiTaskSteps,executionTasks,executionCalls,projects,eq,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {workerPortInputSchemas,transcribeAsrPlanSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {localWhisperSpec,createOpenaiAsrAdapter,createWhisperLocalAdapter,type MultimodalSpec,type MultimodalProviderRegistry} from '@creatoros/ai-worker';
import type {FetchVideoSourceOptions,FetchVideoSourceDeps,DouyinVideoSource} from '../../../../ai-worker/src/runtime/douyin-transcribe-source';
import {runTranscribeInWorker} from '../../../../ai-worker/src/execution/transcribe-worker-run';
import {GenerationFailure} from '../../../../ai-worker/src/execution/generation-error';
import {createTranscribeBusinessExecutionService} from './transcribe-business-execution.service';
import {createExecutionTranscribePreparationService} from '../execution/execution-transcribe-preparation.service';
import {createExecutionTranscribeAudioService} from '../execution/execution-transcribe-audio.service';
import {createExecutionTranscribeSourceService} from '../execution/execution-transcribe-source.service';
import {DouyinNotLoggedInError} from '../../../../ai-worker/src/runtime/douyin-errors';
import {createExecutionAsrPorts} from '../execution/execution-asr-ports.service';
import {createExecutionTranscribeWorkflowService} from '../execution/execution-transcribe-workflow.service';
import {createExecutionTranscribePostprocessService} from '../execution/execution-transcribe-postprocess.service';
import {createExecutionWorkerOutcomeService} from '../execution/execution-worker-outcome.service';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createTranscriptArtifactService} from '../projects/transcript-artifact.service';
import {createArtifactsService} from '../artifacts';
import {createMockObjectStorage} from '../assets/object-storage';
import {TranscribeConfigError} from './multimodal/resolve';
import {classifyTranscribeFailure,IMAGE_ALBUM_TRANSCRIPT_PLACEHOLDER} from './transcribe-runner';

// 仅媒体网络/抽音/模型供应商/等待时钟是隔离 IO；整批编排、ASR调用账本、后处理回放、工件与终态都是真实代码。
const injected=vi.hoisted(()=>({
 source:vi.fn<(opts:FetchVideoSourceOptions,deps:FetchVideoSourceDeps)=>Promise<DouyinVideoSource>>(),
 extract:vi.fn<(url:string,signal:AbortSignal)=>Promise<Uint8Array>>(),
 registry:():MultimodalProviderRegistry=>({}),
 wait:vi.fn<(ms:number,value:undefined,options:{signal?:AbortSignal})=>Promise<void>>(),
 restoreFailure:false,restoreHostFailure:false,restoreCalls:vi.fn<(awemeId:string)=>void>(),masterCreates:vi.fn<(projectId:string)=>void>(),
}));
vi.mock('../../../../ai-worker/src/runtime/douyin-transcribe-source',async original=>({...await original<typeof import('../../../../ai-worker/src/runtime/douyin-transcribe-source')>(),fetchDouyinVideoSource:(opts:FetchVideoSourceOptions,deps:FetchVideoSourceDeps)=>injected.source(opts,deps)}));
vi.mock('../../../../ai-worker/src/runtime/transcribe-audio-extract',()=>({createTranscribeAudioExtractor:()=>injected.extract}));
vi.mock('../../../../ai-worker/src/execution/transcribe-asr-registry',async original=>({...await original<typeof import('../../../../ai-worker/src/execution/transcribe-asr-registry')>(),createTranscribeAsrRegistry:()=>injected.registry()}));
vi.mock('node:timers/promises',async original=>({...await original<typeof import('node:timers/promises')>(),setTimeout:(ms:number,value:undefined,options:{signal?:AbortSignal})=>injected.wait(ms,value,options)}));
vi.mock('../projects/transcript-artifact.service',async original=>{
 const actual=await original<typeof import('../projects/transcript-artifact.service')>();
 return {...actual,createTranscriptArtifactService:(deps:Parameters<typeof actual.createTranscriptArtifactService>[0])=>{
  const service=actual.createTranscriptArtifactService(deps);
  return {...service,restoreExisting:async(context:RequestContext,awemeId:string)=>{injected.restoreCalls(awemeId);if(injected.restoreHostFailure)throw Error('temporary host restore failure');await service.restoreExisting(context,awemeId);}};
 }};
});
// 只注入可选派生 master 创建的下游故障；原事实读取、锁和 restoreMaster catch 都是真实代码。
vi.mock('../artifacts',async original=>{
 const actual=await original<typeof import('../artifacts')>();
 return {...actual,createArtifactsService:(deps:Parameters<typeof actual.createArtifactsService>[0])=>{
  const service=actual.createArtifactsService(deps);
  return {...service,createArtifact:async(...args:Parameters<typeof service.createArtifact>)=>{
   if(args[1].artifactType==='master_script'){injected.masterCreates(args[1].projectId);if(injected.restoreFailure)throw Error('temporary derived master failure');}
   return service.createArtifact(...args);
  }};
 }};
});
const legalAsrText='今天天气很好我们一起去公园散步';
const legalCorrectedText='今天天气很好，\n我们一起去公园散步。';
let db:Db,close:()=>Promise<void>,seq=0;
const servers:Server[]=[];
const now=()=>new Date().toISOString(),nextId=(prefix:string)=>`${prefix}-runner-${++seq}`;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close());
beforeEach(()=>{injected.source.mockReset();injected.extract.mockReset();injected.wait.mockReset();injected.restoreCalls.mockReset();injected.masterCreates.mockReset();injected.restoreFailure=false;injected.restoreHostFailure=false;injected.wait.mockImplementation(async(_ms,_value,options)=>{options.signal?.throwIfAborted();});});
afterEach(async()=>{for(const server of servers.splice(0)){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}});
type Options={ids:string[];album?:string[];existing?:boolean;existingIds?:string[];missingProjects?:string[];existingWithoutMaster?:boolean;restoreFailure?:boolean;restoreHostFailure?:boolean;sourceLoginFailure?:boolean;streamFailure?:string;streamTimes?:number;local?:boolean;noCloud?:boolean;invalidCloud?:boolean;cooldown?:'retry'|'over-cap'|'no-port'|'cancel';post?:'applied'|'declined'|'throw'|'absent'|'unknown'|'cancel'|'rejected'|'model-absent'|'fidelity-rejected';cancel?:'asr'|'stream'|'probe'|'post';probeValue?:boolean;readyFailure?:boolean};
async function fixture(options:Options){
 const id=nextId('task'),ctx:RequestContext={userId:'runner-owner',accountId:id,requestId:id,source:'user'},controller=new AbortController();
 const spec:MultimodalSpec=options.noCloud?localWhisperSpec():{kind:'audio',provider:'siliconflow',model:'FunAudioLLM/SenseVoiceSmall',baseUrl:null,token:'synthetic-key'};
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:'transcribe.douyin',idempotencyKey:id,inputData:{awemeIds:options.ids},requestedAt:now(),requestFingerprint:'sha256:'+'a'.repeat(64)});
 for(const awemeId of options.ids.filter(id=>!options.missingProjects?.includes(id)))await db.insert(projects).values({id:`project-${id}-${awemeId}`,userId:ctx.userId,accountId:ctx.accountId,title:'隔离导入作品',source:'imported',platformRef:{platform:'douyin',externalId:awemeId},creationMode:'talking_head',status:'active',currentStage:'script',startedAt:now(),createdAt:now(),updatedAt:now()});
 const artifact=createTranscriptArtifactService({db,now,nextId});
 for(const awemeId of options.existing?options.ids:options.existingIds??[]){
  if(options.existingWithoutMaster){
   const service=createArtifactsService({db,now,nextId});
   const output=await service.createArtifact(ctx,{projectId:`project-${id}-${awemeId}`,title:'逐字稿',artifactType:'output_script',stage:'script'});
   await service.createVersion(ctx,output.id,{contentText:'已有真实逐字稿',contentData:{transcript:'已有真实逐字稿',source:'transcribed',awemeId},changeSummary:'隔离已确认转写事实'});
  }else await artifact.ensure(ctx,{awemeId,transcript:'已有真实逐字稿',source:'transcribed'});
 }
 const resolveSpec=vi.fn(async()=>spec),mapped=await createTranscribeBusinessExecutionService(db,{budget:{maxCalls:20,maxTokens:100000,deadlineMs:120000},resolveSpec}).prepare(ctx,id);
 if(!mapped.executionTaskId)throw Error('当前任务未绑定真实执行');
 const tasks=createPersistentTaskService(db),claim=await tasks.claimTask({taskId:mapped.executionTaskId,workerId:'runner-worker'});
 if(!claim)throw Error('真实Worker未取得租约');
 const ref={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},budget={maxCalls:100,maxTokens:1000000,deadlineMs:120000};
 const bytes=new Map<string,Uint8Array>(),base=createMockObjectStorage({nextKey:()=>nextId('audio')});
 const storage={...base,getObject:async(key:string)=>{const value=bytes.get(key);if(!value)throw Object.assign(Error('missing'),{code:'ENOENT'});return Uint8Array.from(value);},putObject:async(input:Parameters<typeof base.putObject>[0])=>{bytes.set(input.storageKey,Uint8Array.from(input.bytes));await base.putObject(input);}};
 const audio=createExecutionTranscribeAudioService(db,{objectStorageForCtx:async()=>storage}),asr=createExecutionAsrPorts(db,{budget});
 const prepareSpec=vi.fn(async(_ctx:RequestContext,current:MultimodalSpec,_input:{audioBytes:Uint8Array;intentId:string})=>current);
 const preparation=createExecutionTranscribePreparationService(db,{audio,asr,resolveSpec:async()=>{if(options.invalidCloud)throw new TranscribeConfigError('显式无效云配置');return resolveSpec();},prepareSpec});
 let modelRequests=0;
 const server=createServer(async(req,res)=>{for await(const _chunk of req){}modelRequests++;if(options.post==='cancel'||options.cancel==='post'){controller.abort();req.socket.destroy();return;}if(options.post==='rejected'){res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'synthetic definitive rejection'}}));return;}const corrected=JSON.stringify({correctedText:options.post==='applied'?legalCorrectedText:'逐字稿X(已校正)'});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'postprocess',object:'chat.completion',created:1,model:'fixture',choices:[{index:0,message:{role:'assistant',content:corrected},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:12,total_tokens:22}}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);
 const address=server.address();if(!address||typeof address==='string')throw Error('隔离模型端口未创建');
 const post=createExecutionTranscribePostprocessService(db,{budget,now,maxOutputTokens:128,resolveModelSpec:async()=>options.post==='applied'||options.post==='rejected'||options.post==='fidelity-rejected'||options.post==='cancel'||options.cancel==='post'?{apiFormat:'openai_chat',model:'fixture',baseUrl:`http://127.0.0.1:${address.port}/v1`,token:'synthetic-model-key'}:null,readContext:async()=>({title:'隔离作品'})});
 const ready=vi.fn(async(_ctx:RequestContext,_input:{awemeId:string;projectId:string})=>{if(options.readyFailure)throw Error('重建队列暂不可用');});
 const probe=vi.fn(async(context:RequestContext,awemeId:string)=>{const exists=options.probeValue??await artifact.hasExisting(context,awemeId);if(options.cancel==='probe')controller.abort();return exists;});
 const workflow=createExecutionTranscribeWorkflowService(db,{now,nextId,postprocess:post,hasTranscriptArtifact:probe,onTranscriptReady:ready});
 injected.restoreFailure=options.restoreFailure===true;injected.restoreHostFailure=options.restoreHostFailure===true;
 const sourceHost=createExecutionTranscribeSourceService(db,{now,
  resolveProfile:async()=>{throw Error('该来源控制不使用登录档案');},
  acquireChannel:async()=>{throw new DouyinNotLoggedInError();},reportChannel:async()=>({ok:true}),
 });
 let cooldownAdmissions=0,streamAttempts=0;
 injected.source.mockImplementation(async(source,deps)=>{
  source.signal?.throwIfAborted();
  const selected:DouyinVideoSource=options.album?.includes(source.awemeId)?{kind:'image-album'}:{kind:'video',playUrl:`https://v.example/${source.awemeId}?play=1`};
  if(deps.channel)await deps.channel(async()=>({playUrl:`https://v.example/${source.awemeId}?play=1`}),()=>({kind:'net-timeout',consecutiveTimeouts:1}),source.signal);
  return selected;
 });
 injected.extract.mockImplementation(async(url,signal)=>{expect(signal).toBe(controller.signal);if(options.cancel==='stream'){controller.abort();throw new DOMException('cancel','AbortError');}if(url.includes(`/${options.streamFailure}?`)&&++streamAttempts<=(options.streamTimes??Infinity))throw Error('streamAudioFromVideo: ffmpeg 非 0 退出 (code=1): 403');return new Uint8Array([1,2,3,4]);});
 const fetcher=vi.fn<typeof fetch>(async(_url,init)=>{expect(init?.signal).toBe(controller.signal);if(options.cancel==='asr'){controller.abort();throw new DOMException('cancel','AbortError');}return options.local?new Response('云端明确拒绝',{status:401}):new Response(JSON.stringify({text:options.post==='applied'?legalAsrText:'逐字稿X'}),{status:200});});
 const pipeline=vi.fn(async(_pcm:Float32Array,_settings?:Record<string,unknown>,signal?:AbortSignal)=>{expect(signal).toBe(controller.signal);return {text:'本地真实逐字稿'};});
 injected.registry=()=>({siliconflow:createOpenaiAsrAdapter({fetch:fetcher}),'whisper-local':createWhisperLocalAdapter({getPipeline:async()=>pipeline,decodeAudioToFloat32:async()=>new Float32Array([.1])})});
 const invoke=async(port:WorkerPort,raw:unknown,signal?:AbortSignal):Promise<unknown>=>{
  signal?.throwIfAborted();
  if(port==='acquireTranscribeChannel'){
   workerPortInputSchemas.acquireTranscribeChannel.parse(raw);
   if(options.cooldown==='no-port')throw Error('来源通道端口未装配');
   if(options.sourceLoginFailure)return sourceHost.invoke(ref,port,raw,signal);
   if(options.cooldown && (options.cooldown!=='retry'||cooldownAdmissions++===0))return {sourceFailure:{outcome:'retry_wait',errorCode:'TRANSCRIBE_SOURCE_COOLDOWN',retryAfterMs:options.cooldown==='over-cap'?3600000:960000}};
   return {ok:true};
  }
  if(port==='reportTranscribeChannel'){workerPortInputSchemas.reportTranscribeChannel.parse(raw);return {ok:true};}
  if(port==='prepareTranscribeAsr')return preparation.prepare(ref,workerPortInputSchemas.prepareTranscribeAsr.parse(raw).awemeId,signal);
  if(port==='readTranscribeAudio'||port==='saveTranscribeAudio')return audio.invoke(ref,port,raw,signal);
  if(['selectTranscribeLocalFallback','reserveAsrRequest','startAsrRequest','settleAsrRequest'].includes(port))return asr.invoke(ref,port,raw);
  if(['prepareTranscribeItem','recordTranscribeSource','saveTranscribeArtifact','failTranscribeItem','completeTranscribeTask'].includes(port)){
   if(port==='completeTranscribeTask'&&options.post==='rejected'){
    for(const awemeId of options.ids){const restored=await post.read(ref,{awemeId},signal);expect(restored).toMatchObject({applied:false,transcript:'逐字稿X',reason:'模型明确拒绝，保留原文'});expect(await post.prepare(ref,{awemeId},signal)).toEqual({status:'restored',result:restored});}
   }
   if(port==='saveTranscribeArtifact'){
    const {awemeId}=workerPortInputSchemas.saveTranscribeArtifact.parse(raw);
    if(!options.album?.includes(awemeId)){
     const result=await post.read(ref,{awemeId},signal);
     const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,ref.executionTaskId));
     const payload=row!.payload as {transcribePostprocess?:Record<string,{result?:unknown}>},frozen=payload.transcribePostprocess?.[awemeId]?.result;
     console.info('回执相等白名单',JSON.stringify({keysFrozen:frozen&&typeof frozen==='object'?Object.keys(frozen):[],keysParsed:result?Object.keys(result):[],deepEqual:isDeepStrictEqual(frozen,result),jsonEqual:JSON.stringify(frozen)===JSON.stringify(result)}));
    }
   }
   return workflow.invoke(ref,port,raw,signal);
  }
  if(options.post==='absent')throw Error('后处理端口未装配');
  if(options.post==='throw')throw Error('后处理内部崩了');
  if(options.post==='unknown')throw new GenerationFailure('unknown_result','MODEL_RESULT_UNKNOWN');
  return post.invoke(ref,port,raw,signal);
 };
 const call=vi.fn(async(port:WorkerPort,raw:unknown,signal?:AbortSignal)=>{try{return await invoke(port,raw,signal);}catch(error){console.warn('隔离宿主端口失败',port,error instanceof Error?error.message:'unknown');throw error;}});
 if(options.cooldown==='cancel')injected.wait.mockImplementation(async(_ms,_value,scope)=>{expect(scope.signal).toBe(controller.signal);controller.abort();scope.signal?.throwIfAborted();});
 const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,ref.executionTaskId));
 const {transcribeTaskInputSchema}=await import('@creatoros/contract/execution-worker');
 const input=transcribeTaskInputSchema.parse((execution!.payload as Record<string,unknown>).modelInput);
 async function run(){
  try{return await runTranscribeInWorker(input,controller.signal,call);}catch(error){
   if(error instanceof GenerationFailure){await createExecutionWorkerOutcomeService(db).recordFailure(ref,{outcome:error.outcome,errorCode:error.errorCode});return {status:error.outcome};}
   throw error;
  }
 }
 async function rows(){return {execution:(await db.select().from(executionTasks).where(eq(executionTasks.id,ref.executionTaskId)))[0]!,business:(await db.select().from(aiTasks).where(eq(aiTasks.id,id)))[0]!,calls:await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,ref.executionTaskId)),steps:await db.select().from(aiTaskSteps).where(eq(aiTaskSteps.aiTaskId,id))};}
 async function texts(){const service=createArtifactsService({db,now,nextId}),result:Array<{awemeId:string;text:string;data:Record<string,unknown>}>=[];for(const awemeId of options.ids){const artifacts=await service.listProjectArtifacts(ctx,`project-${id}-${awemeId}`);const output=artifacts.find(row=>row.artifactType==='output_script');if(output){const version=(await service.listVersions(ctx,output.id)).find(row=>row.id===output.currentVersionId);if(version)result.push({awemeId,text:version.contentText,data:(version.contentData??{}) as Record<string,unknown>});}}return result;}
 return {id,ctx,ref,controller,run,rows,texts,fetcher,pipeline,prepareSpec,probe,ready,call,get modelRequests(){return modelRequests;}};
}
it('成功路径:markRunning → 取音频 → ASR → 绑作品(收到真 text)→ recordStep → markSucceeded',async()=>{
 const f=await fixture({ids:['7400000000000000001']});expect(await f.run()).toEqual({status:'succeeded'});
 expect(injected.source).toHaveBeenCalledTimes(1);expect(injected.extract).toHaveBeenCalledTimes(1);expect(f.fetcher).toHaveBeenCalledTimes(1);
 expect(f.prepareSpec).toHaveBeenCalledWith(expect.objectContaining({userId:f.ctx.userId,accountId:f.ctx.accountId}),expect.objectContaining({provider:'siliconflow'}),expect.objectContaining({intentId:`task:${f.id}:aweme:7400000000000000001`}));
 expect(await f.texts()).toMatchObject([{awemeId:'7400000000000000001',text:'逐字稿X',data:{source:'transcribed'}}]);expect(f.ready).toHaveBeenCalledTimes(1);
 const rows=await f.rows();expect(rows.business.status).toBe('succeeded');expect(rows.steps.length).toBeGreaterThan(0);expect(rows.calls.map(row=>row.status)).toEqual(['settled']);
});
it('逐字稿已落库后，后续重建排队失败只告警，不反向把转写判失败',async()=>{
 const f=await fixture({ids:['ready'],readyFailure:true});expect(await f.run()).toEqual({status:'succeeded'});expect((await f.texts())[0]?.text).toBe('逐字稿X');expect(f.ready).toHaveBeenCalledTimes(1);expect((await f.rows()).business.status).toBe('succeeded');
});
it('在线失败后本地成功时接受 host 回传的真实 whisper-local 执行规格',async()=>{
 const f=await fixture({ids:['fallback-local'],local:true});expect(await f.run()).toEqual({status:'succeeded'});expect((await f.texts())[0]?.text).toBe('本地真实逐字稿');expect(f.fetcher).toHaveBeenCalledTimes(1);expect(f.pipeline).toHaveBeenCalledTimes(1);expect((await f.rows()).calls.map(row=>({key:row.operationKey,status:row.status}))).toEqual([{key:'transcribe:fallback-local/asr/1',status:'rejected'},{key:'transcribe:fallback-local/local-asr/1',status:'settled'}]);
});
it('F7-a:按后续T768完全未配或坏云配置安全丢弃并本地一次，不使用不可信线上规格',async()=>{
 const f=await fixture({ids:['a1','a2'],noCloud:true});expect(await f.run()).toEqual({status:'succeeded'});expect(f.fetcher).not.toHaveBeenCalled();expect(f.pipeline).toHaveBeenCalledTimes(2);expect(await f.texts()).toHaveLength(2);
 const invalid=await fixture({ids:['invalid-cloud'],invalidCloud:true});
 expect(await invalid.run()).toEqual({status:'succeeded'});
 expect(invalid.fetcher).not.toHaveBeenCalled();expect(invalid.prepareSpec).not.toHaveBeenCalled();expect(invalid.pipeline).toHaveBeenCalledTimes(1);
 expect(await invalid.texts()).toMatchObject([{awemeId:'invalid-cloud',text:'本地真实逐字稿'}]);
 const rows=await invalid.rows(),payload=rows.execution.payload as Record<string,unknown>,plans=payload.transcribeAsrPlans as Record<string,unknown>;
 expect(transcribeAsrPlanSchema.parse(plans['invalid-cloud']).identity).toMatchObject({protocol:'whisper-local.v1',provider:'whisper-local'});
 expect(rows.calls.map(row=>({operationKey:row.operationKey,status:row.status}))).toEqual([{operationKey:'transcribe:invalid-cloud/local-asr/1',status:'settled'}]);
 expect(rows.business.status).toBe('succeeded');expect(JSON.stringify(rows)).not.toContain('synthetic-key');
});
it('F7-b:多 aweme,其中一条 streamAudio 抛 → 该 aweme 失败、其余成功、任务不整体崩(markSucceeded 带失败计数)',async()=>{
 const f=await fixture({ids:['ok1','bad','ok2'],streamFailure:'bad'});await f.run();expect(f.fetcher).toHaveBeenCalledTimes(2);expect(await f.texts()).toHaveLength(2);
 const rows=await f.rows();expect(rows.execution.status).toBe('succeeded');expect(rows.business.status).toBe('succeeded');expect(rows.steps.map(row=>row.text).join('\n')).toContain('成功 2 条');expect(rows.steps.map(row=>row.text).join('\n')).toContain('失败 1 条');
});
it('幂等:hasTranscriptArtifact 报已存在 → 跳过 fetch/ASR(fetchVideoUrl 未被调)',async()=>{
 const f=await fixture({ids:['dup'],existing:true});expect(await f.run()).toEqual({status:'succeeded'});expect(injected.source).not.toHaveBeenCalled();expect(injected.extract).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();expect(f.pipeline).not.toHaveBeenCalled();expect(await f.texts()).toMatchObject([{text:'已有真实逐字稿'}]);expect((await f.rows()).calls).toHaveLength(0);
});
it.each([false,true])('已有事实恢复口播稿且恢复失败不重复 ASR (失败=%s)',async(fail)=>{
 const f=await fixture({ids:['dup'],existing:true,existingWithoutMaster:true,restoreFailure:fail});
 const artifacts=createArtifactsService({db,now,nextId}),projectId=`project-${f.id}-dup`;
 const before=await artifacts.listProjectArtifacts(f.ctx,projectId),output=before.find(row=>row.artifactType==='output_script')!;
 const versionsBefore=await artifacts.listVersions(f.ctx,output.id);
 expect(before.some(row=>row.artifactType==='master_script')).toBe(false);
 expect(await f.run()).toEqual({status:'succeeded'});expect(injected.restoreCalls).toHaveBeenCalledWith('dup');expect(injected.masterCreates).toHaveBeenCalledTimes(1);
 expect(injected.source).not.toHaveBeenCalled();expect(injected.extract).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();expect(f.pipeline).not.toHaveBeenCalled();expect(f.modelRequests).toBe(0);expect((await f.rows()).calls).toHaveLength(0);
 expect((await f.rows()).execution.status).toBe('succeeded');expect((await f.texts())[0]?.text).toBe('已有真实逐字稿');
 expect(await artifacts.getArtifact(f.ctx,output.id)).toEqual(output);expect(await artifacts.listVersions(f.ctx,output.id)).toEqual(versionsBefore);
 expect((await artifacts.listProjectArtifacts(f.ctx,projectId)).some(row=>row.artifactType==='master_script')).toBe(!fail);
 injected.restoreFailure=false;
 await createTranscriptArtifactService({db,now,nextId}).restoreExisting(f.ctx,'dup');
 const restored=(await artifacts.listProjectArtifacts(f.ctx,projectId)).filter(row=>row.artifactType==='master_script');expect(restored).toHaveLength(1);
 const master=restored[0]!,masterVersions=await artifacts.listVersions(f.ctx,master.id);
 expect(masterVersions.find(row=>row.id===master.currentVersionId)?.contentText).toBe('已有真实逐字稿');
 await createTranscriptArtifactService({db,now,nextId}).restoreExisting(f.ctx,'dup');
 expect((await artifacts.listProjectArtifacts(f.ctx,projectId)).filter(row=>row.artifactType==='master_script')).toEqual(restored);expect(await artifacts.listVersions(f.ctx,master.id)).toEqual(masterVersions);
 expect(await artifacts.listVersions(f.ctx,output.id)).toEqual(versionsBefore);expect((await f.rows()).calls).toHaveLength(0);expect(f.modelRequests).toBe(0);
});
it('图集作品 → 写占位锚(source:image-album + skipMasterScript),不抽音不 ASR,计数单列不算失败',async()=>{
 const f=await fixture({ids:['album1','vid1'],album:['album1']});expect(await f.run()).toEqual({status:'succeeded'});expect(injected.extract).toHaveBeenCalledTimes(1);expect(f.fetcher).toHaveBeenCalledTimes(1);const texts=await f.texts();expect(texts.find(row=>row.awemeId==='album1')).toMatchObject({text:IMAGE_ALBUM_TRANSCRIPT_PLACEHOLDER,data:{source:'image-album',skipMasterScript:true}});expect(f.ready).toHaveBeenCalledTimes(1);expect(f.ready).toHaveBeenCalledWith(expect.objectContaining({userId:f.ctx.userId}),{awemeId:'vid1',projectId:`project-${f.id}-vid1`});
 expect((await f.rows()).steps.map(row=>row.text).join('\n')).toContain('图集跳过 1 条');
});
it('全图集(0 转写成功)→ 仍 markSucceeded(诚实处理结果,非失败)',async()=>{const f=await fixture({ids:['album1'],album:['album1']});expect(await f.run()).toEqual({status:'succeeded'});expect(f.fetcher).not.toHaveBeenCalled();expect(f.pipeline).not.toHaveBeenCalled();});
it('ffmpeg 首抽失败 → 重取直链重试一次成功(fetchVideoUrl 调 2 次,任务成功零失败)',async()=>{const f=await fixture({ids:['flaky'],streamFailure:'flaky',streamTimes:1});expect(await f.run()).toEqual({status:'succeeded'});expect(injected.source).toHaveBeenCalledTimes(2);expect(injected.extract).toHaveBeenCalledTimes(2);expect(f.fetcher).toHaveBeenCalledTimes(1);});
it('ffmpeg 重试后仍失败 → 单作品失败继续,汇总带分类计数(ffmpeg 1)',async()=>{const f=await fixture({ids:['dead','ok1'],streamFailure:'dead'});await f.run();expect(await f.texts()).toHaveLength(1);expect(f.fetcher).toHaveBeenCalledTimes(1);const rows=await f.rows();expect(rows.execution.status).toBe('succeeded');expect(rows.steps.map(row=>row.text).join('\n')).toContain('ffmpeg 1');});
it('classifyTranscribeFailure 纯函数:按消息归类(解析/ffmpeg/验证码/其他)',()=>{
 for(const text of ['parseDouyinVideoUrl: 无法从 _ROUTER_DATA 中解析视频信息(item_list 为空)','parseAwemeDetail: aweme_detail 为空(作品不存在/不可见/接口风控)','fetchDouyinVideoUrl: iesdouyin HTTP 503 (aweme x)'])expect(classifyTranscribeFailure(text)).toBe('parse-failed');
 expect(classifyTranscribeFailure('streamAudioFromVideo: ffmpeg 非 0 退出 (code=1)')).toBe('ffmpeg');expect(classifyTranscribeFailure('fetchDouyinVideoUrlViaDetail: 作品页命中验证码,跳过 (aweme x)')).toBe('captcha');expect(classifyTranscribeFailure('ASR 返回空逐字稿')).toBe('other');
});
it('classifyTranscribeFailure:冷却消息归 cooldown 类',()=>{expect(classifyTranscribeFailure('[douyin-gateway] channel "iesdouyin" 冷却中,剩余 960s 超过单次 acquire 等待上限,快速失败本轮')).toBe('cooldown');});
it('全批撞冷却 → 等冷却结束重试子集一次 → 全部成功,任务 markSucceeded',async()=>{
 const f=await fixture({ids:['a1','a2'],cooldown:'retry'});expect(await f.run()).toEqual({status:'succeeded'});expect(await f.texts()).toHaveLength(2);expect(injected.wait).toHaveBeenCalledTimes(1);expect(injected.wait).toHaveBeenCalledWith(960000+5000,undefined,{signal:f.controller.signal});expect(injected.source).toHaveBeenCalledTimes(4);expect((await f.rows()).steps.map(row=>row.text).join('\n')).toContain('限流冷却');
});
it('冷却剩余超等待上限 → 诚实不等(sleep 不被调),失败照旧终态',async()=>{const f=await fixture({ids:['a1'],cooldown:'over-cap'});await f.run();expect(injected.wait).not.toHaveBeenCalled();expect((await f.rows()).execution.status).toBe('failed');expect((await f.rows()).steps.map(row=>row.text).join('\n')).toContain('超过等待上限');});
it('已确认来源登录失败 → Host typed waiting_user，不重试或启动付费调用',async()=>{const f=await fixture({ids:['a1'],sourceLoginFailure:true});expect(await f.run()).toEqual({status:'waiting_user'});expect(injected.source).toHaveBeenCalledTimes(1);expect(injected.wait).not.toHaveBeenCalled();expect(injected.extract).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();expect(f.modelRequests).toBe(0);expect(await f.texts()).toHaveLength(0);const rows=await f.rows();expect(rows.execution.status).toBe('waiting_user');expect(rows.execution.lastErrorCode).toBe('TRANSCRIBE_LOGIN_REQUIRED');expect(rows.calls).toHaveLength(0);expect(rows.steps).toHaveLength(0);});
it('后处理生效 → ensure 收到校正稿(非 ASR 原文),步骤注记「纠错+断句完成」,任务成功',async()=>{const f=await fixture({ids:['a1'],post:'applied'});await f.run();expect((await f.texts())[0]?.text).toBe(legalCorrectedText);expect(f.modelRequests).toBe(1);expect((await f.rows()).calls.map(row=>row.status)).toEqual(['settled','settled']);expect((await f.rows()).steps.map(row=>row.text).join('\n')).toContain('纠错+断句完成');expect((await f.rows()).execution.status).toBe('succeeded');});
it('后处理未执行(applied:false + reason)→ 落 ASR 原文,步骤注记「后处理未执行:<原因>」,不阻断',async()=>{const f=await fixture({ids:['a1'],post:'declined'});expect(await f.run()).toEqual({status:'succeeded'});expect((await f.texts())[0]?.text).toBe('逐字稿X');expect((await f.rows()).steps.map(row=>row.text).join('\n')).toContain('后处理未执行:');expect(f.modelRequests).toBe(0);});
it('后处理供应商明确 HTTP 401 拒绝 → 真实账本 rejected，保原文并注记，不重发',async()=>{const f=await fixture({ids:['a1'],post:'rejected'});expect(await f.run()).toEqual({status:'succeeded'});expect((await f.texts())[0]?.text).toBe('逐字稿X');const rows=await f.rows();expect(rows.execution.status).toBe('succeeded');expect(rows.steps.map(row=>row.text).join('\n')).toContain('后处理未执行:模型明确拒绝，保留原文');expect(f.modelRequests).toBe(1);expect(rows.calls.map(row=>row.status)).toEqual(['settled','rejected']);expect(rows.calls[1]?.operationKey).toMatch(/^transcribe:a1\/postprocess:.*\/model\/1$/);});
it('完整后处理协议但模型缺省 → Host 冻结保原文原因，零模型调用',async()=>{const f=await fixture({ids:['a1'],post:'model-absent'});expect(await f.run()).toEqual({status:'succeeded'});expect((await f.texts())[0]?.text).toBe('逐字稿X');expect((await f.rows()).execution.status).toBe('succeeded');expect((await f.rows()).steps.map(row=>row.text).join('\n')).toContain('后处理未执行:模型未配置或暂不可用，保留原文');expect(f.modelRequests).toBe(0);expect((await f.rows()).calls.map(row=>row.status)).toEqual(['settled']);expect(f.call.mock.calls.some(row=>row[0]==='prepareTranscribePostprocess')).toBe(true);});
it('图集占位锚路径不走后处理(占位文本非 ASR 产文本)',async()=>{const f=await fixture({ids:['album1'],album:['album1'],post:'applied'});expect(await f.run()).toEqual({status:'succeeded'});expect(f.modelRequests).toBe(0);expect(f.call.mock.calls.some(row=>row[0]==='prepareTranscribePostprocess')).toBe(false);});
it('取消后的 ASR 返回不继续后处理或落稿，并原样交回取消状态',async()=>{const f=await fixture({ids:['one','two'],cancel:'asr'});await expect(f.run()).rejects.toMatchObject({name:'AbortError'});expect(await f.texts()).toHaveLength(0);expect(f.call.mock.calls.some(row=>row[0]==='prepareTranscribePostprocess'||row[0]==='failTranscribeItem')).toBe(false);expect(injected.source).toHaveBeenCalledTimes(1);});
it('抽音阶段取消不再重取直链或启动 ASR',async()=>{const f=await fixture({ids:['one'],cancel:'stream'});await expect(f.run()).rejects.toMatchObject({name:'AbortError'});expect(injected.source).toHaveBeenCalledTimes(1);expect(f.fetcher).not.toHaveBeenCalled();expect(f.call.mock.calls.some(row=>row[0]==='failTranscribeItem')).toBe(false);});
it('把同一个取消信号传给首次和重试取流、抽音端口',async()=>{const f=await fixture({ids:['one'],streamFailure:'one',streamTimes:1});expect(await f.run()).toEqual({status:'succeeded'});expect(injected.source.mock.calls.map(row=>row[0].signal)).toEqual([f.controller.signal,f.controller.signal]);expect(injected.extract.mock.calls.map(row=>row[1])).toEqual([f.controller.signal,f.controller.signal]);});
it('冷却等待可立即取消，不等待到期、不重新抓取',async()=>{const f=await fixture({ids:['cooldown'],cooldown:'cancel'});await expect(f.run()).rejects.toMatchObject({name:'AbortError'});expect(injected.wait).toHaveBeenCalledTimes(1);expect(injected.source).toHaveBeenCalledTimes(1);expect(f.fetcher).not.toHaveBeenCalled();expect(f.call.mock.calls.some(row=>row[0]==='failTranscribeItem')).toBe(false);});
it.each([true,false])('已存事实探测返回 %s 时取消，不再启动恢复或取流',async(hasTranscript)=>{const f=await fixture({ids:['existing'],cancel:'probe',probeValue:hasTranscript});await expect(f.run()).rejects.toMatchObject({name:'AbortError'});expect(injected.restoreCalls).not.toHaveBeenCalled();expect(injected.source).not.toHaveBeenCalled();expect(f.call.mock.calls.some(row=>row[0]==='failTranscribeItem')).toBe(false);});
it('后处理取消传播 signal 并阻止落稿和下一作品',async()=>{const f=await fixture({ids:['one','two'],cancel:'post'});await expect(f.run()).rejects.toMatchObject({name:'AbortError'});expect(await f.texts()).toHaveLength(0);expect(injected.source).toHaveBeenCalledTimes(1);expect(f.call.mock.calls.filter(row=>row[0]==='prepareTranscribePostprocess').every(row=>row[2]===f.controller.signal)).toBe(true);expect(f.call.mock.calls.some(row=>row[0]==='failTranscribeItem')).toBe(false);});
it('后处理结果未知不能记成原文成功，也不继续下一作品',async()=>{const f=await fixture({ids:['one','two'],post:'unknown'});expect(await f.run()).toEqual({status:'unknown_result'});expect(await f.texts()).toHaveLength(0);expect(injected.source).toHaveBeenCalledTimes(1);expect(f.call.mock.calls.some(row=>row[0]==='failTranscribeItem')).toBe(false);expect((await f.rows()).execution.status).toBe('unknown_result');});

// T208 新增原 Host 步骤维护验证；本例正文保留，原库存的 T210 五处校准另记。
it('T208 实际Worker五类回执汇总按原作品排序，同键结算不增加步骤或调用',async()=>{
 const ids=['already','album','saved','broken','missing'];
 const f=await fixture({ids,existingIds:['already'],album:['album'],streamFailure:'broken',missingProjects:['missing']});
 expect(await f.run()).toEqual({status:'failed'}); // 维持原完整批次终态，不借此修改partial。
 const before=await f.rows(),payload=before.execution.payload as {transcribeItems:Record<string,{awemeId:string;status:string}>};
 expect(ids.map(id=>payload.transcribeItems[id]?.status)).toEqual(['existing','image-album','saved','failed','no-project']);
 const summary=before.steps.filter(row=>row.id===`transcribe:${f.ref.executionTaskId}:summary`);
 expect(summary).toHaveLength(1);expect(summary[0]).toMatchObject({aiTaskId:f.id,stepNo:6,kind:'transcribe',toolCalls:[],text:'转写完成 1 条，已有逐字稿跳过 1 条，图集跳过 1 条，转写失败 1 条，未找到对应作品 1 条'});
 expect(before.steps).toHaveLength(6);
 for(const [index,id] of ids.entries())expect(before.steps.find(row=>row.id===`transcribe:${f.ref.executionTaskId}:${id}:${payload.transcribeItems[id]!.status}`)).toMatchObject({aiTaskId:f.id,stepNo:index+1});
 for(const id of ['already','album','broken','missing'])expect(before.steps.find(row=>row.id.startsWith(`transcribe:${f.ref.executionTaskId}:${id}:`))?.text).not.toContain('后处理未执行:');
 expect(f.fetcher).toHaveBeenCalledTimes(2);expect(f.modelRequests).toBe(0);expect(before.calls.map(row=>row.status)).toEqual(['settled','settled']);
 expect(await f.call('completeTranscribeTask',{})).toEqual({status:'failed'});
 const after=await f.rows();expect(after.steps).toEqual(before.steps);expect(after.calls).toEqual(before.calls);expect(after.execution.payload).toEqual(before.execution.payload);expect(f.fetcher).toHaveBeenCalledTimes(2);
});

// T210 保留原注入边界作为独立拒绝控制，不把未知回执／越权改写修成普通成功。
it('T210 控制：真实 Host restoreExisting 整体抛错仍 unknown，不重复 ASR',async()=>{
 const f=await fixture({ids:['dup'],existing:true,restoreHostFailure:true});expect(await f.run()).toEqual({status:'unknown_result'});
 expect((await f.rows()).execution.status).toBe('unknown_result');expect(injected.source).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();expect(f.modelRequests).toBe(0);expect((await f.rows()).calls).toHaveLength(0);expect((await f.texts())[0]?.text).toBe('已有真实逐字稿');
});
it('T210 控制：缺必需来源端口仍 unknown，零 ASR，不等待',async()=>{
 const f=await fixture({ids:['a1'],cooldown:'no-port'});expect(await f.run()).toEqual({status:'unknown_result'});expect((await f.rows()).execution.status).toBe('unknown_result');expect(injected.source).toHaveBeenCalledTimes(1);expect(injected.wait).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();expect(f.modelRequests).toBe(0);expect((await f.rows()).calls).toHaveLength(0);expect(await f.texts()).toHaveLength(0);
});
it('T210 控制：原超阈校正正文被拒，保存原文及真实保真原因',async()=>{
 const f=await fixture({ids:['a1'],post:'fidelity-rejected'});expect(await f.run()).toEqual({status:'succeeded'});expect((await f.texts())[0]?.text).toBe('逐字稿X');expect(f.modelRequests).toBe(1);expect((await f.rows()).calls.map(row=>row.status)).toEqual(['settled','settled']);expect((await f.rows()).steps.map(row=>row.text).join('\n')).toContain('后处理未执行:输出未过保真校验，保留原文');
});
it.each(['throw','absent'] as const)('T210 控制：后处理协议 %s 仍 unknown，不保存或处理下一作品',async(post)=>{
 const f=await fixture({ids:['one','two'],post});expect(await f.run()).toEqual({status:'unknown_result'});expect((await f.rows()).execution.status).toBe('unknown_result');expect(await f.texts()).toHaveLength(0);expect(injected.source).toHaveBeenCalledTimes(1);expect(f.modelRequests).toBe(0);expect((await f.rows()).calls.map(row=>row.status)).toEqual(['settled']);expect(f.call.mock.calls.some(row=>row[0]==='saveTranscribeArtifact'||row[0]==='failTranscribeItem'||row[0]==='completeTranscribeTask')).toBe(false);
});
