import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {createDb,aiTasks,executionTasks,eq,type Db} from '@creatoros/backend';
import {localWhisperSpec,createWhisperLocalAdapter,transcribeAudio,createDurableAsrRequestExecutor,type MultimodalSpec} from '@creatoros/ai-worker';
import {createTranscribeBusinessExecutionService} from '../ai-runtime/transcribe-business-execution.service';
import {createExecutionTranscribePreparationService} from './execution-transcribe-preparation.service';
import {createExecutionTranscribeAudioService} from './execution-transcribe-audio.service';
import {createExecutionAsrPorts} from './execution-asr-ports.service';
import {createLocalFsObjectStorage} from '../assets/localfs-object-storage';
import {createPersistentTaskService} from './persistent-task.service';
let db:Db,close:()=>Promise<void>,dir:string,seq=0;
const budget={maxCalls:10,maxTokens:1000,deadlineMs:60000};
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();dir=await mkdtemp(join(tmpdir(),'t915-asr-prepare-'));});afterAll(async()=>{await close?.();await rm(dir,{recursive:true,force:true});});
async function fixture(spec:MultimodalSpec={kind:'audio',provider:'qwen',model:'asr',baseUrl:null,token:'private-token'}){
 const id=`asr-prepare-${++seq}`,ctx={userId:'asr-prepare',accountId:'asr-prepare',requestId:id,source:'user' as const};
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:'transcribe.douyin',idempotencyKey:id,inputData:{awemeIds:['one','two']},requestedAt:new Date().toISOString(),requestFingerprint:'sha256:'+'a'.repeat(64)});
 const resolveSpec=vi.fn(async()=>spec),mapped=await createTranscribeBusinessExecutionService(db,{budget,resolveSpec}).prepare(ctx,id);
 const claim=(await createPersistentTaskService(db).claimTask({taskId:mapped.executionTaskId!,workerId:'fixture'}))!,ref={executionTaskId:mapped.executionTaskId!,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const storage=createLocalFsObjectStorage({rootPath:join(dir,id),publicBaseUrl:'/unused'},{nextKey:()=>`blob-${++seq}`}),audio=createExecutionTranscribeAudioService(db,{objectStorageForCtx:async()=>storage});
 await audio.save(ref,{awemeId:'one',bytes:new Uint8Array([1])});await audio.save(ref,{awemeId:'two',bytes:new Uint8Array([2,3])});
 const prepareSpec=vi.fn(async(_ctx:unknown,current:MultimodalSpec,_input:{audioBytes:Uint8Array;intentId:string})=>current),service=createExecutionTranscribePreparationService(db,{audio,resolveSpec,prepareSpec});
 return {id,ref,audio,service,prepareSpec,resolveSpec};
}
it('逐作品固定实际身份与稳定凭据意图，密钥不落库',async()=>{
 const f=await fixture();f.prepareSpec.mockImplementation(async(_ctx,spec,input)=>input.audioBytes.length===1?localWhisperSpec():spec);
 expect((await f.service.prepare(f.ref,'one')).plan.identity).toMatchObject({protocol:'whisper-local.v1',model:'Xenova/whisper-small'});
 expect((await f.service.prepare(f.ref,'two')).plan.identity.protocol).toBe('qwen-chat-audio.v1');
 const calls=f.resolveSpec.mock.calls.length;await f.service.prepare(f.ref,'one');expect(f.resolveSpec).toHaveBeenCalledTimes(calls);
 expect(f.prepareSpec.mock.calls.map(call=>call[2].intentId)).toEqual([`task:${f.id}:aweme:one`,`task:${f.id}:aweme:two`]);
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));expect(JSON.stringify(task)).not.toContain('private-token');
});
it('已固定云身份不能因凭据刷新失败改成本地，但可刷新同身份短效 token',async()=>{
 const f=await fixture(),first=await f.service.prepare(f.ref,'one');f.prepareSpec.mockImplementation(async(_ctx,spec)=>({...spec,token:'fresh-token'}));
 const refreshed=await f.service.prepare(f.ref,'one');expect(refreshed.plan).toEqual(first.plan);expect(refreshed.spec.token).toBe('fresh-token');
 f.prepareSpec.mockResolvedValue(localWhisperSpec());await expect(f.service.prepare(f.ref,'one')).rejects.toThrow();
});
it.each(['cancel','fence'])('申请期间 %s 不保存迟到执行选择',async mode=>{
 const f=await fixture(),controller=new AbortController();f.prepareSpec.mockImplementation(async(_ctx,spec)=>{if(mode==='cancel')controller.abort();else await db.update(executionTasks).set({fenceToken:'replacement'}).where(eq(executionTasks.id,f.ref.executionTaskId));return spec;});
 await expect(f.service.prepare(f.ref,'one',controller.signal)).rejects.toThrow();const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));expect((task!.payload as any).transcribeAsrPlans).toBeUndefined();
});
it('配置读取期间换租约，旧执行不再申请按次凭据',async()=>{
 const f=await fixture();f.resolveSpec.mockImplementation(async()=>{await db.update(executionTasks).set({fenceToken:'new-owner'}).where(eq(executionTasks.id,f.ref.executionTaskId));return {kind:'audio',provider:'qwen',model:'asr',baseUrl:null,token:'private-token'};});
 await expect(f.service.prepare(f.ref,'one')).rejects.toThrow();expect(f.prepareSpec).not.toHaveBeenCalled();
});
it('真实任务准备、文件保存、实际本地身份和识别回执贯通',async()=>{
 const f=await fixture({...localWhisperSpec(),model:'base'}),selected=await f.service.prepare(f.ref,'one'),asr=createExecutionAsrPorts(db,{budget});
 expect(selected.spec.model).toBe('small');
 const ports={reserve:(input:any)=>asr.reserve(f.ref,{awemeId:'one',request:input.request}),start:async(callId:string)=>{await asr.start(f.ref,{awemeId:'one',callId});},settle:async(callId:string,input:any)=>{await asr.settle(f.ref,{awemeId:'one',callId,...input});}};
 const pipeline=vi.fn(async()=>({text:'原逐字稿'})),registry={'whisper-local':createWhisperLocalAdapter({getPipeline:async()=>pipeline,decodeAudioToFloat32:async()=>new Float32Array([.1])})};
 for(let i=0;i<2;i++){const saved=await f.audio.read(f.ref,{awemeId:'one'});if(saved.status!=='ready')throw Error('missing');expect((await transcribeAudio(selected.spec,{audioBytes:saved.bytes,language:'zh',executeRequest:createDurableAsrRequestExecutor({operationKey:'transcribe:one',ports})},registry)).text).toBe('原逐字稿');}
 expect(pipeline).toHaveBeenCalledTimes(1);
});
