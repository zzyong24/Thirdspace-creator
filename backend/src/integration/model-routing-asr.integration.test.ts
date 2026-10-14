import {expect,it} from 'vitest';
import {freezeSelectedModelRoutes} from '../modules/ai-runtime/capability-model-routing';
import * as transcribe from '../modules/ai-runtime/transcribe-business-execution.service';
import {executionRouteSchema,productionAssetAsrReservationFrozen,type ExecutionRouteV2} from '@creatoros/contract/execution-worker';
async function route(source:'local'|'self',fallback=true):Promise<ExecutionRouteV2>{return freezeSelectedModelRoutes({choices:{text:'self',vision:'self',image:'self',video:'self',audio:source,embed:'self'},revision:1,read:async entry=>entry.mode==='asr'?source==='local'?{status:'ready',identity:{provider:'whisper-local',level:'tiny',runtimeVersion:'whisper-local.v1'}}:{status:'not_configured',reasonCode:'MODEL_NOT_CONFIGURED',...(fallback?{fallbackPolicy:'existing-local-asr',localFallbackIdentity:{provider:'whisper-local',level:'base',runtimeVersion:'whisper-local.v1'}} as const:{})}:{status:'not_configured',reasonCode:'MODEL_NOT_CONFIGURED'}});}
it('原ASR槽指定local或原fallback时只用冻结档位，未授权fallback拒绝',async()=>{
 expect(transcribe.frozenTranscribeLocalSpec({executionRoute:await route('local')})).toMatchObject({provider:'whisper-local',model:'tiny',token:''});
 expect(transcribe.frozenTranscribeLocalSpec({executionRoute:await route('self')})).toMatchObject({provider:'whisper-local',model:'base'});
},180_000);
it('没有原fallback的云路由不允许代码自动换成本地',async()=>{
 const awaitRoute=await route('self',false);
 expect(()=>transcribe.frozenTranscribeLocalSpec({executionRoute:awaitRoute})).toThrow('MODEL_ROUTE_LOCAL_FALLBACK_NOT_FROZEN');
},180_000);
it('新预约v3严格保完整map，旧v2原形仍接受且不补map',async()=>{
 const executionRoute=await route('local');
 const original={ownerCreateBody:{taskType:'asset.asr',attemptId:'asr-reservation-fixture-0001',inputData:{kind:'asset.asr',projectId:'project',contentOutputId:'output',source:{sourceId:'source',assetId:'asset',assetFileId:'file',fileDigest:'a'.repeat(64),probeDigest:'b'.repeat(64),durationTicks:1000,timebase:{num:1,den:1000},hasAudio:true},language:'zh',timestampMode:'text',extractionProtocolVersion:'asset-original-audio.v1',configuration:{kind:'audio',provider:'whisper-local',model:'tiny',baseUrl:null,settings:{}}}},ownerCreateBodyDigest:'a'.repeat(64),creationScope:{userId:'user',accountId:'account',groupId:null},workspaceScope:{userId:'user',accountId:'account',groupId:null,groupVersion:null,membershipVersion:null}};
 expect(productionAssetAsrReservationFrozen.parse({...original,schemaVersion:2})).not.toHaveProperty('executionRoute');
 expect(productionAssetAsrReservationFrozen.parse({...original,schemaVersion:3,executionRoute})).toMatchObject({schemaVersion:3,executionRoute});
 expect(productionAssetAsrReservationFrozen.parse({...original,schemaVersion:2})).not.toHaveProperty('executionRoute');
 expect(productionAssetAsrReservationFrozen.safeParse({...original,schemaVersion:2,executionRoute}).success).toBe(false);
},180_000);

it('真实后端owner旧v1 local plan恢复保原medium，不改成当前默认档位',async()=>{
 const {createDb,aiTasks,eq}=await import('@creatoros/backend');const {createPersistentTaskService}=await import('../modules/execution/persistent-task.service');const {createAssetAsrOwner}=await import('../modules/execution/asset-asr-owner.service');const {createHash}=await import('node:crypto');
 const opened=await createDb();let n=0;const now=()=>new Date().toISOString(),ctx={userId:'asr-legacy-owner',accountId:'asr-legacy-account',requestId:'legacy-plan',source:'user' as const};
 try{
  const bytes=new Uint8Array([1,2,3]),hash=createHash('sha256').update(bytes).digest('hex'),input={kind:'asset.asr' as const,projectId:'project',contentOutputId:'output',source:{sourceId:'source',assetId:'asset',assetFileId:'file',fileDigest:hash,probeDigest:hash,timebase:{num:1,den:1000},durationTicks:1000,hasAudio:true},language:'zh' as const,timestampMode:'text' as const,extractionProtocolVersion:'asset-original-audio.v1' as const,configuration:{kind:'audio' as const,provider:'whisper-local',model:'medium',baseUrl:null}};
  await opened.db.insert(aiTasks).values({id:'legacy-asset-ai',userId:ctx.userId,accountId:ctx.accountId,taskType:'asset.asr',idempotencyKey:'legacy-asset-ai',inputData:input,requestedAt:now()});
  const tasks=createPersistentTaskService(opened.db,{now}),task=await tasks.enqueue(ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:'legacy-asset-ai',idempotencyKey:'legacy-asset-execution',payload:{aiTaskId:'legacy-asset-ai',modelInput:input}});
  await opened.db.update(aiTasks).set({executionTaskId:task.id}).where(eq(aiTasks.id,'legacy-asset-ai'));
  const claim=await tasks.claimTask({taskId:task.id,workerId:'legacy-worker'}),ref={executionTaskId:task.id,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken};
  const objects=new Map<string,Uint8Array>(),storage={createPresignedUpload:async()=>({storageKey:`fixture-${++n}`}),putObject:async(value:any)=>{objects.set(value.storageKey,value.bytes);},getObject:async(key:string)=>{const value=objects.get(key);if(!value)throw Object.assign(Error('受控对象尚未写入'),{code:'ENOENT'});return value;},getSignedUrl:async()=>'/fixture',objectExists:async(key:string)=>objects.has(key)};
  const owner=createAssetAsrOwner(opened.db,{now,nextId:p=>`${p}-${++n}`,budget:{maxCalls:6,maxTokens:100000,deadlineMs:600000},assertProductionReservation:async(_c,proof)=>{expect(proof.business.id).toBe('legacy-asset-ai');expect(proof.input).toEqual(input);},objectStorageForCtx:async()=>storage as never,readExactFile:async()=>bytes,extractAudio:async()=>({bytes,evidence:{schemaVersion:1,assetFileId:'file',fileDigest:hash,sourceStreamIndex:0,sourceClockOrigin:null,firstDecodedSamplePts:{num:'0',den:'1'},sampleRate:16000,decodedValidSampleCount:3,initialSkipSamples:null,trailingDiscardSamples:null,probeEvidenceDigest:hash,extractorArgumentsDigest:hash,audioDigest:`sha256:${hash}`,audioByteLength:3,mappingStatus:'unverified',reason:'受控接口回归，不代表实际媒体解码'}}),prepareSpec:async()=>({...input.configuration,token:''})});
  await owner.prepareAudio(ref);const cancelled=new AbortController();cancelled.abort();await expect(owner.prepare(ref,cancelled.signal)).rejects.toMatchObject({name:'AbortError'});
  const first=await owner.prepare(ref);expect(first.plan.identity.model).toBe('Xenova/whisper-medium');
  expect((await owner.prepare(ref)).plan).toEqual(first.plan);
 }finally{await opened.client.close();}
},180_000);
