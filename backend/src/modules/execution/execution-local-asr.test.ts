import {createHash} from 'node:crypto';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {createDb,aiTasks,executionTasks,executionCalls,eq,type Db} from '@creatoros/backend';
import {createWhisperLocalAdapter,createDurableAsrRequestExecutor,transcribeAudio,AsrExecutionInterruption} from '@creatoros/ai-worker';
import {createExecutionAuthorityService} from './execution-authority.service';
import {createPersistentTaskService} from './persistent-task.service';
import {createExecutionAsrPorts} from './execution-asr-ports.service';
import {createExecutionCallLedgerService} from './execution-call-ledger.service';
import {asrRequestSchema} from '@creatoros/contract/execution-worker';
const bytes=new Uint8Array([1,2,3]),hash=`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const identity={protocol:'whisper-local.v1',provider:'whisper-local',model:'Xenova/whisper-small',endpointDigest:null,language:'zh'};
let db:Db,close:()=>Promise<void>,seq=0;
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});
afterAll(async()=>close?.());
async function fixture(){
 const id=`local-asr-${++seq}`,ctx={userId:'local',accountId:'local',requestId:id,source:'user' as const};
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:'transcribe.douyin',idempotencyKey:id,inputData:{awemeIds:['one']},requestedAt:new Date().toISOString()});
 const mapped=await createExecutionAuthorityService(db).bindAiTask(ctx,id);
 await db.update(executionTasks).set({payload:{aiTaskId:id,modelInput:{kind:'transcribe.douyin',awemeIds:['one'],identity},transcribeAudioInputs:{one:{schemaVersion:1,state:'ready',storageKey:'isolated-fixture',audioDigest:hash,audioByteLength:bytes.length}}}}).where(eq(executionTasks.id,mapped.executionTaskId));
 const claim=(await createPersistentTaskService(db).claimTask({taskId:mapped.executionTaskId,workerId:'fixture'}))!,ref={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const service=createExecutionAsrPorts(db,{budget:{maxCalls:2,maxTokens:100,deadlineMs:60000}});
 const ports={reserve:async(input:any)=>service.reserve(ref,{awemeId:'one',request:input.request}),start:async(callId:string)=>{await service.start(ref,{awemeId:'one',callId});},settle:async(callId:string,input:any)=>{await service.settle(ref,{awemeId:'one',callId,...input});}};
 const pipeline=vi.fn(async()=>({text:'完整本地正文'})),decode=vi.fn(async()=>new Float32Array([.1]));
 const registry={'whisper-local':createWhisperLocalAdapter({getPipeline:async model=>{expect(model).toBe(identity.model);return pipeline;},decodeAudioToFloat32:decode})};
 const run=(signal?:AbortSignal)=>transcribeAudio({provider:'whisper-local',model:'small',baseUrl:null,token:'',kind:'audio'},{audioBytes:bytes,language:'zh',signal,executeRequest:createDurableAsrRequestExecutor({operationKey:'transcribe:one',ports,signal})},registry);
 return {ref,service,ports,pipeline,decode,run};
}
it('本地识别使用真实模型身份和原音频，恢复不再解码或推理',async()=>{
 const f=await fixture();expect((await f.run()).text).toBe('完整本地正文');expect((await f.run()).text).toBe('完整本地正文');
 expect(f.pipeline).toHaveBeenCalledTimes(1);expect(f.decode).toHaveBeenCalledTimes(1);
 const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.ref.executionTaskId));
 expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({operationKey:'transcribe:one/local-asr/1',status:'settled',accountingBasis:'requests',reservedTokens:0,totalTokens:null});
});
it('本地结算 ACK 丢失时回读原正文，不重新推理',async()=>{
 const f=await fixture(),settle=f.ports.settle;f.ports.settle=async(...args)=>{await settle(...args);throw Error('lost ACK');};
 await expect(f.run()).rejects.toBeInstanceOf(AsrExecutionInterruption);expect((await f.run()).text).toBe('完整本地正文');expect(f.pipeline).toHaveBeenCalledTimes(1);
});
it('本地开始 ACK 未确认不启动解码或推理，也不重投',async()=>{
 const f=await fixture(),start=f.ports.start;f.ports.start=async id=>{await start(id);throw Error('lost ACK');};
 await expect(f.run()).rejects.toBeInstanceOf(AsrExecutionInterruption);await expect(f.run()).rejects.toBeInstanceOf(AsrExecutionInterruption);expect(f.decode).not.toHaveBeenCalled();expect(f.pipeline).not.toHaveBeenCalled();
});
it('本地已返回失败可按宿主指定原调用重试，仍消耗原次数预算',async()=>{
 const f=await fixture();f.pipeline.mockRejectedValue(Error('inference failed'));
 await expect(f.run()).rejects.not.toBeInstanceOf(AsrExecutionInterruption);
 for(let i=0;i<2;i++){
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.ref.executionTaskId));
  expect(calls.at(-1)?.status).toBe('rejected');
  await db.update(executionTasks).set({retryOfCallId:calls.at(-1)!.id}).where(eq(executionTasks.id,f.ref.executionTaskId));
  await expect(f.run()).rejects.toThrow();
 }
 expect(f.pipeline).toHaveBeenCalledTimes(2);
});
it('未知云调用阻止本地新调用，不能拿本地正文覆盖云事实',async()=>{
 const f=await fixture(),ledger=createExecutionCallLedgerService(db,{budget:{maxCalls:2,maxTokens:100,deadlineMs:60000}});
 const cloud=await ledger.reserve(f.ref,{operationKey:'transcribe:one/asr/1',kind:'model',inputDigest:'sha256:'+'1'.repeat(64),reservedTokens:0,accountingBasis:'requests'});
 await ledger.start(f.ref,cloud.id);await ledger.settle(f.ref,cloud.id,{status:'unknown'});
 await expect(f.run()).rejects.toBeInstanceOf(AsrExecutionInterruption);expect(f.decode).not.toHaveBeenCalled();
 await expect(f.service.settle(f.ref,{awemeId:'one',callId:cloud.id,status:'settled',result:{text:'不得覆盖'}})).rejects.toThrow();
 expect((await ledger.inspect(f.ref)).calls).toHaveLength(1);expect((await ledger.inspect(f.ref)).calls[0]?.status).toBe('unknown');
});
it('旧本地开始不能由新租约补交结果，本地拒绝不能伪造 HTTP 状态',async()=>{
 const f=await fixture(),start=f.ports.start;let callId='';
 f.ports.start=async id=>{callId=id;await start(id);throw Error('lost');};await expect(f.run()).rejects.toThrow();
 await expect(f.service.settle(f.ref,{awemeId:'one',callId,status:'rejected',rejectionStatus:429})).rejects.toThrow();
 const next={...f.ref,attempt:f.ref.attempt+1,fenceToken:'new'};await db.update(executionTasks).set({attempt:next.attempt,fenceToken:next.fenceToken}).where(eq(executionTasks.id,f.ref.executionTaskId));
 await expect(f.service.settle(next,{awemeId:'one',callId,status:'settled',result:{text:'unproven'}})).rejects.toThrow();
});
it('本地推理取消保留未确认状态，恢复不自动重复计算',async()=>{
 const f=await fixture(),controller=new AbortController();f.pipeline.mockImplementation(async()=>{controller.abort();return {text:'取消后迟到正文'};});
 await expect(f.run(controller.signal)).rejects.toMatchObject({name:'AbortError'});await expect(f.run()).rejects.toBeInstanceOf(AsrExecutionInterruption);
 const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.ref.executionTaskId));expect(calls[0]?.status).toBe('unknown');expect(calls[0]?.resultText).toBeNull();expect(f.pipeline).toHaveBeenCalledTimes(1);
});
it('本地请求不能伪造远端地址、模型或截取局部音频',()=>{
 const request={...identity,audioDigest:hash,audioByteLength:3,chunkDigest:hash,chunkByteLength:3,chunkIndex:0,chunkCount:1,chunks:[{digest:hash,byteLength:3}]};
 expect(asrRequestSchema.safeParse(request).success).toBe(true);
 for(const patch of [{endpointDigest:hash},{model:'arbitrary-model'},{audioByteLength:4}])expect(asrRequestSchema.safeParse({...request,...patch}).success).toBe(false);
});
