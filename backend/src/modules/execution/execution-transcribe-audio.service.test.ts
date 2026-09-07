import {createHash} from "node:crypto";
import {transcribeAudio,createQwenAsrAdapter,createDurableAsrRequestExecutor} from "@creatoros/ai-worker";
import type {AsrRequest} from "@creatoros/contract/execution-worker";
import {createExecutionAsrPorts} from "./execution-asr-ports.service";
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createDb,aiTasks,executionTasks,eq,type Db} from '@creatoros/backend';
import {createExecutionAuthorityService} from './execution-authority.service';
import {createPersistentTaskService} from './persistent-task.service';
import {createLocalFsObjectStorage} from '../assets/localfs-object-storage';
import {createExecutionTranscribeAudioService} from './execution-transcribe-audio.service';
let db:Db,close:()=>Promise<void>,dir:string,seq=0;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();dir=await mkdtemp(join(tmpdir(),'t915-audio-input-'));});
afterAll(async()=>{await close?.();await rm(dir,{recursive:true,force:true});});
async function fixture(){
 const id=`audio-${++seq}`,ctx={userId:'audio-user',accountId:'audio-account',requestId:id,source:'user' as const};
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:'transcribe.douyin',idempotencyKey:id,inputData:{awemeIds:['video']},requestedAt:new Date().toISOString()});
 const mapped=await createExecutionAuthorityService(db).bindAiTask(ctx,id);await db.update(executionTasks).set({payload:{aiTaskId:id,modelInput:{kind:'transcribe.douyin',awemeIds:['video']}}}).where(eq(executionTasks.id,mapped.executionTaskId));
 const claim=(await createPersistentTaskService(db).claimTask({taskId:mapped.executionTaskId,workerId:'fixture'}))!,ref={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const storage=createLocalFsObjectStorage({rootPath:join(dir,id),publicBaseUrl:'/blob'},{nextKey:()=>`key-${++seq}`});
 const service=createExecutionTranscribeAudioService(db,{objectStorageForCtx:async()=>storage});
 return {id,ref,storage,service};
}
it('原音频保存后重建服务与新租约回读精确字节，不重新取流',async()=>{
 const f=await fixture(),bytes=new Uint8Array([1,2,3]);expect(await f.service.read(f.ref,{awemeId:'video'})).toEqual({status:'missing'});
 await f.service.save(f.ref,{awemeId:'video',bytes});const next={...f.ref,attempt:f.ref.attempt+1,fenceToken:'new'};await db.update(executionTasks).set({attempt:next.attempt,fenceToken:next.fenceToken}).where(eq(executionTasks.id,next.executionTaskId));
 const restored=createExecutionTranscribeAudioService(db,{objectStorageForCtx:async()=>f.storage});expect(await restored.read(next,{awemeId:'video'})).toMatchObject({status:'ready',bytes});
 await expect(restored.save(next,{awemeId:'video',bytes:new Uint8Array([9])})).rejects.toThrow();
});
it('存储写成功后 ACK 丢失，read 可核对实际字节并恢复 ready',async()=>{
 const f=await fixture();const put=vi.fn(async(input:Parameters<typeof f.storage.putObject>[0])=>{await f.storage.putObject(input);throw Error('ACK lost');});
 const service=createExecutionTranscribeAudioService(db,{objectStorageForCtx:async()=>({...f.storage,putObject:put})});
 await expect(service.save(f.ref,{awemeId:'video',bytes:new Uint8Array([4,5])})).rejects.toThrow();expect(await service.read(f.ref,{awemeId:'video'})).toMatchObject({status:'ready',bytes:new Uint8Array([4,5])});expect(put).toHaveBeenCalledTimes(1);
});
it('并发同字节保存共用原回执，不同字节不能覆盖',async()=>{
 const f=await fixture(),bytes=new Uint8Array([6,7]);const [a,b]=await Promise.all([f.service.save(f.ref,{awemeId:'video',bytes}),f.service.save(f.ref,{awemeId:'video',bytes})]);expect(a).toEqual(b);
 await expect(f.service.save(f.ref,{awemeId:'video',bytes:new Uint8Array([8,9])})).rejects.toThrow();expect(await f.service.read(f.ref,{awemeId:'video'})).toMatchObject({bytes});
});
it('不同字节同时首次保存只有一个成功，回读保持获胜正文',async()=>{
 const f=await fixture(),inputs=[new Uint8Array([10]),new Uint8Array([20])];
 const results=await Promise.allSettled(inputs.map(bytes=>f.service.save(f.ref,{awemeId:'video',bytes})));
 expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
 expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
 expect(await f.service.read(f.ref,{awemeId:'video'})).toMatchObject({status:'ready',bytes:inputs[results.findIndex(result=>result.status==='fulfilled')]});
});
for(const stop of ['cancel','fence'] as const)it(`写入中 ${stop} 不让旧执行继续，恢复使用已写字节`,async()=>{
 const f=await fixture(),controller=new AbortController(),bytes=new Uint8Array([30,40]);
 let entered!:()=>void,release!:()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;}),barrier=new Promise<void>(resolve=>{release=resolve;});
 const service=createExecutionTranscribeAudioService(db,{objectStorageForCtx:async()=>({...f.storage,putObject:async(input)=>{await f.storage.putObject(input);entered();await barrier;}})});
 const result=service.save(f.ref,{awemeId:'video',bytes},controller.signal).then(value=>({value,error:undefined}),error=>({value:undefined,error}));
 await started;
 const next={...f.ref,attempt:f.ref.attempt+1,fenceToken:'replacement'};
 if(stop==='cancel'){
  controller.abort();await db.update(executionTasks).set({status:'cancel_requested'}).where(eq(executionTasks.id,f.ref.executionTaskId));
 }else await db.update(executionTasks).set({attempt:next.attempt,fenceToken:next.fenceToken}).where(eq(executionTasks.id,f.ref.executionTaskId));
 release();expect((await result).error).toBeDefined();
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
 expect((task!.payload as any).transcribeAudioInputs.video.state).toBe(stop==='cancel'?'ready':'reserved');
 await db.update(executionTasks).set({status:'running',attempt:next.attempt,fenceToken:next.fenceToken}).where(eq(executionTasks.id,f.ref.executionTaskId));
 expect(await f.service.read(next,{awemeId:'video'})).toMatchObject({status:'ready',bytes});
});
it('已存在 ASR 清单但缺少原音频快照，不能重新保存或报告普通 missing',async()=>{
 const f=await fixture();await db.update(executionTasks).set({payload:{aiTaskId:f.id,modelInput:{kind:'transcribe.douyin',awemeIds:['video']},asrAudioManifests:{video:{audioDigest:'old'}}}}).where(eq(executionTasks.id,f.ref.executionTaskId));
 await expect(f.service.read(f.ref,{awemeId:'video'})).rejects.toThrow();await expect(f.service.save(f.ref,{awemeId:'video',bytes:new Uint8Array([1])})).rejects.toThrow();
});
it('取消后不存新字节，跨作品/旧 fence/额外路径均拒绝',async()=>{
 const f=await fixture(),bytes=new Uint8Array([1]);const controller=new AbortController();controller.abort();await expect(f.service.save(f.ref,{awemeId:'video',bytes},controller.signal)).rejects.toMatchObject({name:'AbortError'});
 await expect(f.service.save(f.ref,{awemeId:'other',bytes})).rejects.toThrow();await expect(f.service.save({...f.ref,fenceToken:'old'},{awemeId:'video',bytes})).rejects.toThrow();await expect(f.service.save(f.ref,{awemeId:'video',bytes,storageKey:'injected'})).rejects.toThrow();
 expect(await f.service.read(f.ref,{awemeId:'video'})).toEqual({status:'missing'});
});
it('ready 对象被删除或损坏时明确报错，不能当成可重取的 missing',async()=>{
 const f=await fixture();await f.service.save(f.ref,{awemeId:'video',bytes:new Uint8Array([2])});
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));const saved=(task!.payload as any).transcribeAudioInputs.video;
 await f.storage.putObject({storageKey:saved.storageKey,bytes:new Uint8Array([3]),assetType:'audio',mimeType:'audio/mpeg'});await expect(f.service.read(f.ref,{awemeId:'video'})).rejects.toThrow();await f.storage.deleteObject!(saved.storageKey);await expect(f.service.read(f.ref,{awemeId:'video'})).rejects.toThrow();
});

it('原音频存储、Qwen 逐片账本和恢复贯通，二次执行不再请求供应商',async()=>{
 const f=await fixture(),frame=new Uint8Array(417);frame.set([255,251,144,0]);const bytes=new Uint8Array(834);bytes.set(frame);bytes.set(frame,417);
 await f.service.save(f.ref,{awemeId:'video',bytes});
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
 const identity={protocol:'qwen-chat-audio.v1',provider:'qwen',model:'asr',endpointDigest:`sha256:${createHash('sha256').update('https://fixture.invalid/v1/chat/completions').digest('hex')}`,language:'zh'};
 await db.update(executionTasks).set({payload:{...task!.payload as Record<string,unknown>,modelInput:{kind:'transcribe.douyin',awemeIds:['video'],identity}}}).where(eq(executionTasks.id,f.ref.executionTaskId));
 const asr=createExecutionAsrPorts(db,{budget:{maxCalls:3,maxTokens:1000,deadlineMs:60000}}),ports={reserve:(input:{request:AsrRequest})=>asr.reserve(f.ref,{awemeId:'video',request:input.request}),start:async(callId:string)=>{await asr.start(f.ref,{awemeId:'video',callId});},settle:async(callId:string,input:unknown)=>{await asr.settle(f.ref,{awemeId:'video',callId,...input as object});}};
 const executeRequest=createDurableAsrRequestExecutor({operationKey:'transcribe:video',ports}),fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'原文'}}]}))),registry={qwen:createQwenAsrAdapter({fetch:fetcher,maxEncodedBytes:600})};
 for(let i=0;i<2;i++){const read=await createExecutionTranscribeAudioService(db,{objectStorageForCtx:async()=>f.storage}).read(f.ref,{awemeId:'video'});if(read.status!=='ready')throw Error('未恢复音频');expect((await transcribeAudio({provider:'qwen',model:'asr',baseUrl:'https://fixture.invalid',token:'fixture',kind:'audio'},{audioBytes:read.bytes,language:'zh',executeRequest},registry)).text).toBe('原文\n原文');}
 expect(fetcher).toHaveBeenCalledTimes(2);
});
