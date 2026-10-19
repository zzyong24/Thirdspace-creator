import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {createDb,aiTasks,executionTasks,executionCalls,eq,OwnershipError,type Db} from '@creatoros/backend';
import {runTranscribeAsrInWorker,localWhisperSpec,createQwenAsrAdapter,createOpenaiAsrAdapter,createWhisperLocalAdapter,transcribeAudio,createDurableAsrRequestExecutor,type MultimodalSpec} from '@creatoros/ai-worker';
import {createTranscribeBusinessExecutionService} from '../ai-runtime/transcribe-business-execution.service';
import {ConflictError,ExecutionBudgetError} from './execution.errors';
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
 const prepareSpec=vi.fn(async(_ctx:unknown,current:MultimodalSpec,_input:{audioBytes:Uint8Array;intentId:string})=>current),service=createExecutionTranscribePreparationService(db,{audio,asr:createExecutionAsrPorts(db,{budget}),resolveSpec,prepareSpec});
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
 const refreshed=await f.service.prepare(f.ref,'one');expect(refreshed.plan).toEqual(first.plan);if(refreshed.status!=='prepared')throw Error('unexpected restored');expect(refreshed.spec.token).toBe('fresh-token');
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
 if(selected.status!=='prepared')throw Error('unexpected restored');
 expect(selected.spec.model).toBe('small');
 const ports={reserve:(input:any)=>asr.reserve(f.ref,{awemeId:'one',request:input.request}),start:async(callId:string)=>{await asr.start(f.ref,{awemeId:'one',callId});},settle:async(callId:string,input:any)=>{await asr.settle(f.ref,{awemeId:'one',callId,...input});}};
 const pipeline=vi.fn(async()=>({text:'原逐字稿'})),registry={'whisper-local':createWhisperLocalAdapter({getPipeline:async()=>pipeline,decodeAudioToFloat32:async()=>new Float32Array([.1])})};
 for(let i=0;i<2;i++){const saved=await f.audio.read(f.ref,{awemeId:'one'});if(saved.status!=='ready')throw Error('missing');expect((await transcribeAudio(selected.spec,{audioBytes:saved.bytes,language:'zh',executeRequest:createDurableAsrRequestExecutor({operationKey:'transcribe:one',ports})},registry)).text).toBe('原逐字稿');}
 expect(pipeline).toHaveBeenCalledTimes(1);
 const read=vi.spyOn(f.audio,'read');read.mockRejectedValue(Error('原音频暂不可读取'));
 f.resolveSpec.mockRejectedValue(Error('当前凭据失效'));f.prepareSpec.mockRejectedValue(Error('当前凭据失效'));
 const priorResolves=f.resolveSpec.mock.calls.length;
 expect(await f.service.prepare(f.ref,'one')).toMatchObject({status:'restored',result:{text:'原逐字稿'}});
 expect(read).not.toHaveBeenCalled();expect(f.resolveSpec).toHaveBeenCalledTimes(priorResolves);

});

it('云端完整正文恢复先于原音频读取及凭据续期，失败凭据不影响已确认结果',async()=>{
 const f=await fixture(),selected=await f.service.prepare(f.ref,'one');if(selected.status!=='prepared')throw Error('missing preparation');
 const asr=createExecutionAsrPorts(db,{budget});
 const ports={reserve:(input:any)=>asr.reserve(f.ref,{awemeId:'one',request:input.request}),start:async(callId:string)=>{await asr.start(f.ref,{awemeId:'one',callId});},settle:async(callId:string,input:any)=>{await asr.settle(f.ref,{awemeId:'one',callId,...input});}};
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'云端原文'}}]})));
 expect(await transcribeAudio(selected.spec,{audioBytes:new Uint8Array([1]),language:'zh',executeRequest:createDurableAsrRequestExecutor({operationKey:'transcribe:one',ports})},{qwen:createQwenAsrAdapter({fetch:fetcher})})).toEqual({text:'云端原文',language:'zh'});
 f.resolveSpec.mockClear().mockRejectedValue(Error('expired'));f.prepareSpec.mockClear().mockRejectedValue(Error('expired'));
 const read=vi.spyOn(f.audio,'read').mockRejectedValue(Error('storage unavailable'));
 expect(await f.service.prepare(f.ref,'one')).toEqual({status:'restored',plan:selected.plan,result:{text:'云端原文',language:'zh'}});
 const call=vi.fn(async(port:string,data:any)=>{if(port==='prepareTranscribeAsr')return f.service.prepare(f.ref,data.awemeId);throw Error('恢复不应读取音频或发起识别');});
 expect(await runTranscribeAsrInWorker('one',new AbortController().signal,call,{})).toEqual({text:'云端原文',language:'zh'});
 expect(call).toHaveBeenCalledTimes(1);
 expect(read).not.toHaveBeenCalled();expect(f.resolveSpec).not.toHaveBeenCalled();expect(f.prepareSpec).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(1);
});

it('Worker 识别节点经真实命名端口完成一次调用，恢复不再进入适配器',async()=>{
 const f=await fixture(),asr=createExecutionAsrPorts(db,{budget});
 const call=vi.fn(async(port:any,data:any)=>port==='prepareTranscribeAsr'?f.service.prepare(f.ref,data.awemeId):port==='readTranscribeAudio'?f.audio.read(f.ref,data):asr.invoke(f.ref,port,data));
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'Worker 原文'}}]}))),registry={qwen:createQwenAsrAdapter({fetch:fetcher})};
 const first=await runTranscribeAsrInWorker('one',new AbortController().signal,call,registry);
 expect(first).toEqual({text:'Worker 原文',language:'zh'});call.mockClear();
 expect(await runTranscribeAsrInWorker('one',new AbortController().signal,call,{})).toEqual(first);
 expect(call.mock.calls.map(args=>args[0])).toEqual(['prepareTranscribeAsr']);expect(fetcher).toHaveBeenCalledTimes(1);
});

it('云端明确拒绝后原任务只回退一次本地，恢复不续凭据也不再推理',async()=>{
 const f=await fixture(),asr=createExecutionAsrPorts(db,{budget});
 const call=vi.fn(async(port:any,data:any)=>port==='prepareTranscribeAsr'?f.service.prepare(f.ref,data.awemeId):port==='readTranscribeAudio'?f.audio.read(f.ref,data):asr.invoke(f.ref,port,data));
 const fetcher=vi.fn(async()=>new Response('拒绝',{status:401})),pipeline=vi.fn(async()=>({text:'本地补回原文'}));
 const registry={qwen:createQwenAsrAdapter({fetch:fetcher}),'whisper-local':createWhisperLocalAdapter({getPipeline:async()=>pipeline,decodeAudioToFloat32:async()=>new Float32Array([.1])})};
 expect((await runTranscribeAsrInWorker('one',new AbortController().signal,call,registry)).text).toBe('本地补回原文');
 f.resolveSpec.mockClear().mockRejectedValue(Error('不能续凭据'));f.prepareSpec.mockClear().mockRejectedValue(Error('不能续凭据'));
 expect((await runTranscribeAsrInWorker('one',new AbortController().signal,call,{})).text).toBe('本地补回原文');
 expect(fetcher).toHaveBeenCalledTimes(1);expect(pipeline).toHaveBeenCalledTimes(1);expect(f.resolveSpec).not.toHaveBeenCalled();expect(f.prepareSpec).not.toHaveBeenCalled();
 const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.ref.executionTaskId));
 expect(calls.map(c=>({key:c.operationKey,status:c.status}))).toEqual([{key:'transcribe:one/asr/1',status:'rejected'},{key:'transcribe:one/local-asr/1',status:'settled'}]);
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
 expect((task!.payload as any).transcribeAsrPlans.one.identity.protocol).toBe('qwen-chat-audio.v1');
 expect((task!.payload as any).transcribeLocalFallbacks.one.plan.identity.protocol).toBe('whisper-local.v1');
});
it('没有云端失败事实时不能申请本地回退',async()=>{
 const f=await fixture(),asr=createExecutionAsrPorts(db,{budget});await f.service.prepare(f.ref,'one');
 await expect(asr.invoke(f.ref,'selectTranscribeLocalFallback' as any,{awemeId:'one'})).rejects.toThrow();
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));expect((task!.payload as any).transcribeLocalFallbacks).toBeUndefined();
});

it.each(['unknown','budget','deadline','local-failure'])('%s 仍守原账本，不无限回退或重置预算',async mode=>{
 const f=await fixture(),asr=createExecutionAsrPorts(db,{budget});
 if(mode==='budget')await db.update(executionTasks).set({executionBudget:{...budget,maxCalls:1}}).where(eq(executionTasks.id,f.ref.executionTaskId));
 const call=vi.fn(async(port:any,data:any)=>port==='prepareTranscribeAsr'?f.service.prepare(f.ref,data.awemeId):port==='readTranscribeAudio'?f.audio.read(f.ref,data):asr.invoke(f.ref,port,data));
 const fetcher=vi.fn(async()=>{if(mode==='unknown')throw Error('connection lost');if(mode==='deadline')await db.update(executionTasks).set({deadlineAt:'2000-01-01T00:00:00.000Z'}).where(eq(executionTasks.id,f.ref.executionTaskId));return new Response('拒绝',{status:401});});
 const pipeline=vi.fn(async()=>{throw Error('local inference failed');}),registry={qwen:createQwenAsrAdapter({fetch:fetcher}),'whisper-local':createWhisperLocalAdapter({getPipeline:async()=>pipeline,decodeAudioToFloat32:async()=>new Float32Array([.1])})};
 await expect(runTranscribeAsrInWorker('one',new AbortController().signal,call,registry)).rejects.toThrow();
 if(mode==='unknown')await expect(asr.selectLocalFallback(f.ref,{awemeId:'one'})).rejects.toThrow();
 const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.ref.executionTaskId));
 expect(fetcher).toHaveBeenCalledTimes(1);expect(pipeline).toHaveBeenCalledTimes(mode==='local-failure'?1:0);expect(calls).toHaveLength(mode==='local-failure'?2:1);
 if(mode==='local-failure'){
  await expect(runTranscribeAsrInWorker('one',new AbortController().signal,call,registry)).rejects.toThrow();expect(pipeline).toHaveBeenCalledTimes(1);
 }else {const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));expect((task!.payload as any).transcribeLocalFallbacks).toBeUndefined();}
});
it('云端已确认空正文可回退，本地完成后原空回执仍保留',async()=>{
 const f=await fixture({kind:'audio',provider:'openai',model:'whisper-1',baseUrl:null,token:'fixture'}),asr=createExecutionAsrPorts(db,{budget});
 const call=async(port:any,data:any)=>port==='prepareTranscribeAsr'?f.service.prepare(f.ref,data.awemeId):port==='readTranscribeAudio'?f.audio.read(f.ref,data):asr.invoke(f.ref,port,data);
 const pipeline=vi.fn(async()=>({text:'补回正文'})),fetcher=vi.fn(async()=>new Response(JSON.stringify({text:''})));
 expect((await runTranscribeAsrInWorker('one',new AbortController().signal,call,{openai:createOpenaiAsrAdapter({fetch:fetcher}),'whisper-local':createWhisperLocalAdapter({getPipeline:async()=>pipeline,decodeAudioToFloat32:async()=>new Float32Array([.1])})})).text).toBe('补回正文');
 const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.ref.executionTaskId));expect(calls.map(c=>c.status)).toEqual(['settled','settled']);
 expect(JSON.parse(calls[0]!.resultText!).result.text).toBe('');
});

it('云拒绝后选择回退前退出，重建 Worker 不需要重新取得云凭据',async()=>{
 const f=await fixture(),asr=createExecutionAsrPorts(db,{budget});
 const call=vi.fn(async(port:any,data:any)=>{if(port==='selectTranscribeLocalFallback')throw Error('Worker exited before selection');return port==='prepareTranscribeAsr'?f.service.prepare(f.ref,data.awemeId):port==='readTranscribeAudio'?f.audio.read(f.ref,data):asr.invoke(f.ref,port,data);});
 const fetcher=vi.fn(async()=>new Response('拒绝',{status:401})),pipeline=vi.fn(async()=>({text:'恢复后的本地正文'})),registry={qwen:createQwenAsrAdapter({fetch:fetcher}),'whisper-local':createWhisperLocalAdapter({getPipeline:async()=>pipeline,decodeAudioToFloat32:async()=>new Float32Array([.1])})};
 await expect(runTranscribeAsrInWorker('one',new AbortController().signal,call,registry)).rejects.toThrow();expect(pipeline).not.toHaveBeenCalled();
 f.resolveSpec.mockClear().mockRejectedValue(Error('expired'));f.prepareSpec.mockClear().mockRejectedValue(Error('expired'));
 expect((await runTranscribeAsrInWorker('one',new AbortController().signal,call,registry)).text).toBe('恢复后的本地正文');
 expect(fetcher).toHaveBeenCalledTimes(1);expect(pipeline).toHaveBeenCalledTimes(1);expect(f.resolveSpec).not.toHaveBeenCalled();expect(f.prepareSpec).not.toHaveBeenCalled();
});

it('选择本地的 ACK 丢失后恢复原选择，旧云事实仍可核对但不能改换结果或再投',async()=>{
 const f=await fixture(),asr=createExecutionAsrPorts(db,{budget});let lost=true;
 const call=vi.fn(async(port:any,data:any)=>{if(port==='selectTranscribeLocalFallback'){const result=await asr.invoke(f.ref,port,data);if(lost){lost=false;throw Error('selection ACK lost');}return result;}return port==='prepareTranscribeAsr'?f.service.prepare(f.ref,data.awemeId):port==='readTranscribeAudio'?f.audio.read(f.ref,data):asr.invoke(f.ref,port,data);});
 const fetcher=vi.fn(async()=>new Response('拒绝',{status:401})),pipeline=vi.fn(async()=>({text:'原回退结果'})),registry={qwen:createQwenAsrAdapter({fetch:fetcher}),'whisper-local':createWhisperLocalAdapter({getPipeline:async()=>pipeline,decodeAudioToFloat32:async()=>new Float32Array([.1])})};
 await expect(runTranscribeAsrInWorker('one',new AbortController().signal,call,registry)).rejects.toThrow();expect(pipeline).not.toHaveBeenCalled();
 await expect(asr.selectLocalFallback({...f.ref,fenceToken:'old'},{awemeId:'one'})).rejects.toThrow();await expect(asr.selectLocalFallback(f.ref,{awemeId:'foreign'})).rejects.toThrow();
 const [cloud]=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.ref.executionTaskId));
 expect(await asr.settle(f.ref,{awemeId:'one',callId:cloud!.id,status:'rejected',rejectionStatus:401})).toMatchObject({status:'rejected'});
 await expect(asr.settle(f.ref,{awemeId:'one',callId:cloud!.id,status:'settled',result:{text:'伪造云端正文'}})).rejects.toThrow();
 const request=call.mock.calls.find(args=>args[0]==='reserveAsrRequest')![1];await expect(asr.reserve(f.ref,request)).rejects.toThrow();
 expect((await runTranscribeAsrInWorker('one',new AbortController().signal,call,registry)).text).toBe('原回退结果');expect(fetcher).toHaveBeenCalledTimes(1);expect(pipeline).toHaveBeenCalledTimes(1);
});

it.each([new OwnershipError('原属主拒绝'),new ConflictError('原scope拒绝'),new ExecutionBudgetError('原期限耗尽'),Object.assign(new OwnershipError('复合属主拒绝'),{details:{domainCode:'MODEL_CREDENTIAL_UNAVAILABLE'}}),Object.assign(new ExecutionBudgetError('复合预算拒绝'),{details:{domainCode:'MODEL_CREDENTIAL_UNAVAILABLE'}})])('配置准备拒绝 %s 不得吞成本地识别',async error=>{
 const f=await fixture();f.resolveSpec.mockRejectedValueOnce(error);
 await expect(f.service.prepare(f.ref,'one')).rejects.toBe(error);expect(f.prepareSpec).not.toHaveBeenCalled();
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));expect((task!.payload as Record<string,unknown>).transcribeAsrPlans).toBeUndefined();
},180_000);
