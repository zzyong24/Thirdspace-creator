import {z} from 'zod';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDb,aiTasks,executionTasks,executionCalls,projects,eq,sql,type Db} from '@creatoros/backend';
import {workerPortInputSchemas,type WorkerPort} from '@creatoros/contract/execution-worker';
import {runTranscribeAsrInWorker,createQwenAsrAdapter,type MultimodalSpec} from '@creatoros/ai-worker';
import {createTranscribeBusinessExecutionService} from './transcribe-business-execution.service';
import {createExecutionTranscribeAudioService} from '../execution/execution-transcribe-audio.service';
import {createExecutionTranscribePreparationService} from '../execution/execution-transcribe-preparation.service';
import {createExecutionAsrPorts} from '../execution/execution-asr-ports.service';
import {createExecutionTranscribePostprocessService} from '../execution/execution-transcribe-postprocess.service';
import {createExecutionTranscribeWorkflowService} from '../execution/execution-transcribe-workflow.service';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createLocalFsObjectStorage} from '../assets/localfs-object-storage';
import {createTranscriptArtifactService} from '../projects/transcript-artifact.service';
import {createArtifactsService} from '../artifacts';
import {classifyTranscribeFailure,IMAGE_ALBUM_TRANSCRIPT_PLACEHOLDER} from './transcribe-runner';
// 旧执行循环已迁至Worker。取流/抽音/取消/冷却/未知回执覆盖在真实
// ai-worker/execution/transcribe-worker-run.test.ts；本文件验证原公开持久端口与已保存事实。
let db:Db,close:()=>Promise<void>,dir:string,seq=0;
const now=()=>new Date().toISOString(),nextId=(prefix:string)=>`${prefix}-${++seq}`;
const budget={maxCalls:20,maxTokens:100000,deadlineMs:600000};
const spec:MultimodalSpec={kind:'audio',provider:'qwen',model:'asr',baseUrl:null,token:'fixture-only'};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();dir=await mkdtemp(join(tmpdir(),'t1062-transcribe-durable-'));});
afterAll(async()=>{await close?.();await rm(dir,{recursive:true,force:true});});
async function fixture(ids=['one'],opts:{readyFailure?:boolean;postSpecFailure?:boolean}={}){
 const id=`durable-transcribe-${++seq}`,ctx={userId:id,accountId:id,requestId:id,source:'user' as const};
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:'transcribe.douyin',idempotencyKey:id,inputData:{awemeIds:ids},requestedAt:now(),requestFingerprint:'sha256:'+'a'.repeat(64)});
 for(const awemeId of ids)await db.insert(projects).values({id:`${id}-${awemeId}`,userId:ctx.userId,accountId:ctx.accountId,title:awemeId,source:'imported',platformRef:{platform:'douyin',externalId:awemeId},brief:'',creationMode:'free',status:'active',currentStage:'analysis',startedAt:now(),createdAt:now(),updatedAt:now()});
 const business=createTranscribeBusinessExecutionService(db,{budget,resolveSpec:async()=>spec}),mapped=await business.prepare(ctx,id);
 if(!mapped.executionTaskId)throw Error('新fixture必须进入真实执行');
 const claim=await createPersistentTaskService(db).claimTask({taskId:mapped.executionTaskId,workerId:'isolated-fixture'});if(!claim)throw Error('真实claim失败');
 const ref={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const storage=createLocalFsObjectStorage({rootPath:join(dir,id),publicBaseUrl:'/unused'},{nextKey:()=>`audio-${++seq}`});
 const audio=createExecutionTranscribeAudioService(db,{objectStorageForCtx:async()=>storage}),asr=createExecutionAsrPorts(db,{budget});
 const prepare=createExecutionTranscribePreparationService(db,{audio,asr,resolveSpec:async()=>spec,prepareSpec:async(_c,s)=>s});
 const post=createExecutionTranscribePostprocessService(db,{budget,resolveModelSpec:async()=>{if(opts.postSpecFailure)throw Error('可选模型暂不可用');return null;},readContext:async()=>({})});
 const transcripts=createTranscriptArtifactService({db,now,nextId});
 const ready=vi.fn(async()=>{if(opts.readyFailure)throw Error('重建排队失败');});
 const workflow=createExecutionTranscribeWorkflowService(db,{now,nextId,postprocess:post,hasTranscriptArtifact:(c,awemeId)=>transcripts.hasExisting(c,awemeId),onTranscriptReady:ready});
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'真实端口原文'}}]})));
 const call=async(port:WorkerPort,raw:unknown,signal?:AbortSignal):Promise<unknown>=>{
  if(port==='prepareTranscribeAsr')return prepare.prepare(ref,workerPortInputSchemas.prepareTranscribeAsr.parse(raw).awemeId,signal);
  if(port==='readTranscribeAudio')return audio.read(ref,raw,signal);
  if(['reserveAsrRequest','startAsrRequest','settleAsrRequest','selectTranscribeLocalFallback'].includes(port))return asr.invoke(ref,port,raw);
  if(port.includes('TranscribePostprocess'))return post.invoke(ref,port,raw,signal);
  return workflow.invoke(ref,port,raw,signal);
 };
 async function prepareSaving(awemeId:string,signal=new AbortController().signal){
  await workflow.recordSource(ref,{awemeId,source:{kind:'video',playUrl:`https://fixture.invalid/${awemeId}`}});
  await audio.save(ref,{awemeId,bytes:new Uint8Array([1])},signal);
  await runTranscribeAsrInWorker(awemeId,signal,call,{qwen:createQwenAsrAdapter({fetch:fetcher})});
  await post.prepare(ref,{awemeId},signal);
 }
 async function save(awemeId:string,signal=new AbortController().signal){await prepareSaving(awemeId,signal);return workflow.saveArtifact(ref,{awemeId},signal);}
 const artifactService=createArtifactsService({db,now,nextId});
 async function read(awemeId:string){const rows=await artifactService.listProjectArtifacts(ctx,`${id}-${awemeId}`),artifact=rows.find(r=>r.artifactType==='output_script');if(!artifact?.currentVersionId)throw Error('公开逐字稿不存在');const version=(await artifactService.listVersions(ctx,artifact.id)).find(v=>v.id===artifact.currentVersionId);return{artifact,version};}
 return{id,ctx,ref,workflow,save,prepareSaving,read,artifactService,fetcher,ready,transcripts,post,business};
}
describe('转写当前durable公共持久链',()=>{
 it('完整保存与公开读同一正文、真实单次ASR账本、总态成功',async()=>{const f=await fixture();expect(await f.save('one')).toMatchObject({status:'saved'});expect((await f.read('one')).version?.contentText).toBe('真实端口原文');expect(await f.workflow.complete(f.ref,{})).toEqual({status:'succeeded'});const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.id));expect(task?.status).toBe('succeeded');const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.ref.executionTaskId));expect(calls.map(c=>c.status)).toEqual(['settled']);expect(f.fetcher).toHaveBeenCalledTimes(1);},30000);
 it('部分失败总态failed但已完成子集保留原正文/版本并经公开工件读取可用',async()=>{const f=await fixture(['one','two']);await f.save('one');const before=await f.read('one');await f.workflow.failItem(f.ref,{awemeId:'two',error:'抽音失败'});expect(await f.workflow.complete(f.ref,{})).toEqual({status:'failed'});expect(await f.read('one')).toEqual(before);const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.id));expect(task).toMatchObject({status:'failed',errorMessage:'1 个作品转写失败，已保存其它完成结果'});expect(f.fetcher).toHaveBeenCalledTimes(1);},30000);
 it('保存后重建排队失败不反转原事实或成功终态',async()=>{const f=await fixture(['one'],{readyFailure:true});expect(await f.save('one')).toMatchObject({status:'saved'});expect(f.ready).toHaveBeenCalledTimes(1);expect((await f.read('one')).version?.contentText).toBe('真实端口原文');expect(await f.workflow.complete(f.ref,{})).toEqual({status:'succeeded'});},30000);
 it.each([false,true])('可选后处理未配置/配置读取故障=%s仍真实落原文与明确reason',async failure=>{const f=await fixture(['one'],{postSpecFailure:failure});await f.save('one');expect(await f.post.read(f.ref,{awemeId:'one'})).toMatchObject({applied:false,transcript:'真实端口原文',reason:'模型未配置或暂不可用，保留原文'});expect((await f.read('one')).version?.contentText).toBe('真实端口原文');},30000);
 it('同作品已有事实经真实prepareItem恢复，不识别第二次，也不新增逐字稿版本',async()=>{const f=await fixture();await f.save('one');const before=await f.read('one');const state=await f.workflow.prepareItem(f.ref,{awemeId:'one'});expect(state.receipt).toMatchObject({status:'saved'});expect(await f.workflow.saveArtifact(f.ref,{awemeId:'one'})).toEqual(state.receipt);expect(await f.read('one')).toEqual(before);expect(f.fetcher).toHaveBeenCalledTimes(1);},30000);
 it.each([false,true])('此前逐字稿无item回执，派生恢复失败=%s仍保原文并跳过重复ASR',async failRestore=>{
  const f=await fixture();const prior=await f.artifactService.createArtifact(f.ctx,{projectId:`${f.id}-one`,title:'先前已保存事实',artifactType:'output_script',stage:'analysis',initialContentText:'历史原文字节',initialContentData:{awemeId:'one',source:'transcribed'}});
  const before=await f.read('one');if(failRestore)await db.execute(sql`CREATE OR REPLACE FUNCTION reject_transcribe_master_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.artifact_type='master_script' THEN RAISE EXCEPTION 'fixture restore master failure'; END IF; RETURN NEW; END $$`);
  if(failRestore)await db.execute(sql`CREATE TRIGGER reject_transcribe_master_fixture BEFORE INSERT ON artifacts FOR EACH ROW EXECUTE FUNCTION reject_transcribe_master_fixture()`);
  try{
   const state=await f.workflow.prepareItem(f.ref,{awemeId:'one'});expect(state.receipt).toMatchObject({status:'existing',awemeId:'one'});expect(await f.workflow.saveArtifact(f.ref,{awemeId:'one'})).toEqual(state.receipt);expect(await f.read('one')).toEqual(before);expect((await f.read('one')).artifact.id).toBe(prior.id);expect(f.fetcher).not.toHaveBeenCalled();expect(await f.workflow.complete(f.ref,{})).toEqual({status:'succeeded'});
   const rows=await f.artifactService.listProjectArtifacts(f.ctx,`${f.id}-one`);expect(rows.filter(row=>row.artifactType==='master_script')).toHaveLength(failRestore?0:1);
  }finally{if(failRestore){await db.execute(sql`DROP TRIGGER reject_transcribe_master_fixture ON artifacts`);await db.execute(sql`DROP FUNCTION reject_transcribe_master_fixture()`);}}
 },30000);
 it('三作品混合视频/图集/验证码失败，公开保留两份事实且不伪造图集口播',async()=>{
  const f=await fixture(['one','album','blocked']);await f.save('one');await f.workflow.recordSource(f.ref,{awemeId:'album',source:{kind:'image-album'}});await f.workflow.saveArtifact(f.ref,{awemeId:'album'});await f.workflow.failItem(f.ref,{awemeId:'blocked',error:'作品页命中验证码'});expect(await f.workflow.complete(f.ref,{})).toEqual({status:'failed'});expect((await f.read('one')).version?.contentText).toBe('真实端口原文');expect((await f.read('album')).version?.contentText).toBe(IMAGE_ALBUM_TRANSCRIPT_PLACEHOLDER);expect(await f.artifactService.listProjectArtifacts(f.ctx,`${f.id}-blocked`)).toEqual([]);expect(f.fetcher).toHaveBeenCalledTimes(1);
 },30000);
 it('图集真实保存诚实占位，跳过口播初始化及后处理',async()=>{const f=await fixture();await f.workflow.recordSource(f.ref,{awemeId:'one',source:{kind:'image-album'}});expect(await f.workflow.saveArtifact(f.ref,{awemeId:'one'})).toMatchObject({status:'image-album'});expect((await f.read('one')).version?.contentText).toBe(IMAGE_ALBUM_TRANSCRIPT_PLACEHOLDER);expect(f.fetcher).not.toHaveBeenCalled();expect(f.ready).not.toHaveBeenCalled();expect(await f.workflow.complete(f.ref,{})).toEqual({status:'succeeded'});},30000);
 it('取消后的保存入口保留已保存事实，不能新写另一作品或覆盖终态',async()=>{const f=await fixture(['one','two']);await f.save('one');const before=await f.read('one'),controller=new AbortController();controller.abort();await expect(f.workflow.saveArtifact(f.ref,{awemeId:'two'},controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(await f.read('one')).toEqual(before);await expect(f.workflow.complete(f.ref,{})).rejects.toThrow('尚未全部处理');},30000);
 it.each([
  {name:'正文',field:'transcript',value:'被替换正文'},
  {name:'reason',field:'reason',value:'被替换原因'},
  {name:'applied',field:'applied',value:true},
 ])('已读回执后冻结$name突变拒绝且零工件/零新增付费',async mutation=>{
  const f=await fixture();await f.prepareSaving('one');const originalRead=f.post.read.bind(f.post);
  vi.spyOn(f.post,'read').mockImplementation(async(...args)=>{
   const observed=await originalRead(...args);const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
   const payload=z.record(z.string(),z.unknown()).parse(task?.payload),entries=z.record(z.string(),z.unknown()).parse(payload.transcribePostprocess),entry=z.record(z.string(),z.unknown()).parse(entries.one),result=z.record(z.string(),z.unknown()).parse(entry.result);
   const changed=mutation.field==='applied'?{applied:true,transcript:result.transcript}:{...result,[mutation.field]:mutation.value};
   await db.update(executionTasks).set({payload:{...payload,transcribePostprocess:{...entries,one:{...entry,result:changed}}}}).where(eq(executionTasks.id,f.ref.executionTaskId));return observed;
  });
  await expect(f.workflow.saveArtifact(f.ref,{awemeId:'one'})).rejects.toThrow('后处理最终正文与原回执不符');
  expect(await f.artifactService.listProjectArtifacts(f.ctx,`${f.id}-one`)).toEqual([]);expect(f.fetcher).toHaveBeenCalledTimes(1);expect(f.ready).not.toHaveBeenCalled();
 },30000);
 it.each([
  {name:'extra',field:'unexpected',value:'非法字段'},
  {name:'reason类型',field:'reason',value:3},
  {name:'applied数组',field:'applied',value:[]},
  {name:'正文数组',field:'transcript',value:['正文']},
 ])('两侧同样非法$name不能因深等而落稿',async mutation=>{
  const f=await fixture();await f.prepareSaving('one');const originalRead=f.post.read.bind(f.post);
  vi.spyOn(f.post,'read').mockImplementation(async(...args)=>{
   const observed=await originalRead(...args);if(!observed)throw Error('fixture缺少原回执');
   Object.defineProperty(observed,mutation.field,{value:mutation.value,enumerable:true,configurable:true});
   const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));const payload=z.record(z.string(),z.unknown()).parse(task?.payload),entries=z.record(z.string(),z.unknown()).parse(payload.transcribePostprocess),entry=z.record(z.string(),z.unknown()).parse(entries.one);
   await db.update(executionTasks).set({payload:{...payload,transcribePostprocess:{...entries,one:{...entry,result:observed}}}}).where(eq(executionTasks.id,f.ref.executionTaskId));return observed;
  });
  await expect(f.workflow.saveArtifact(f.ref,{awemeId:'one'})).rejects.toThrow();expect(await f.artifactService.listProjectArtifacts(f.ctx,`${f.id}-one`)).toEqual([]);expect(f.fetcher).toHaveBeenCalledTimes(1);expect(f.ready).not.toHaveBeenCalled();
 },30000);
 it('已保存原回执先返回，不重新读后处理或付费，并保留原版本',async()=>{
  const f=await fixture();const receipt=await f.save('one'),before=await f.read('one');const read=vi.spyOn(f.post,'read').mockRejectedValue(Error('不得重读已保存后处理'));
  expect(await f.workflow.saveArtifact(f.ref,{awemeId:'one'})).toEqual(receipt);expect(await f.read('one')).toEqual(before);expect(read).not.toHaveBeenCalled();expect(f.fetcher).toHaveBeenCalledTimes(1);
 },30000);
 it('原配置准备失败不制造Execution、付费调用或伪转写成功',async()=>{const id=`config-failure-${++seq}`,ctx={userId:id,accountId:id,requestId:id,source:'user' as const};await db.insert(aiTasks).values({id,userId:id,accountId:id,taskType:'transcribe.douyin',idempotencyKey:id,inputData:{awemeIds:['one']},requestedAt:now()});const service=createTranscribeBusinessExecutionService(db,{budget,resolveSpec:async()=>{throw Error('ASR未配置，请设置');}});await expect(service.prepare(ctx,id)).rejects.toThrow('ASR未配置');const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,id));expect(task).toMatchObject({status:'queued',executionTaskId:null});expect(await db.select().from(executionTasks).where(eq(executionTasks.ownerId,id))).toEqual([]);},30000);
});
describe('保留原失败分类',()=>{
 it('按消息归类解析/ffmpeg/验证码/其他，不作内容语义选择',()=>{expect(classifyTranscribeFailure('parseDouyinVideoUrl: 无法从 _ROUTER_DATA 中解析视频信息(item_list 为空)')).toBe('parse-failed');expect(classifyTranscribeFailure('parseAwemeDetail: aweme_detail 为空(作品不存在/不可见/接口风控)')).toBe('parse-failed');expect(classifyTranscribeFailure('fetchDouyinVideoUrl: iesdouyin HTTP 503 (aweme x)')).toBe('parse-failed');expect(classifyTranscribeFailure('streamAudioFromVideo: ffmpeg 非 0 退出 (code=1)')).toBe('ffmpeg');expect(classifyTranscribeFailure('fetchDouyinVideoUrlViaDetail: 作品页命中验证码,跳过 (aweme x)')).toBe('captcha');expect(classifyTranscribeFailure('ASR 返回空逐字稿')).toBe('other');});
 it('冷却原错误分类保持',()=>{expect(classifyTranscribeFailure('DouyinCooldownActiveError: 限流冷却中，960000ms')).toBe('cooldown');});
});
