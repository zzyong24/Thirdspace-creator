import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {createDb,aiTasks,executionTasks,executionCalls,eq,type Db} from '@creatoros/backend';
import {createExecutionRoute} from '@creatoros/contract/execution-worker';
import {createPersistentTaskService} from './persistent-task.service';
import {createExecutionVideoVisualReviewService} from './execution-video-visual-review.service';
import {createSettingsRepository} from '../settings';
let db:Db,close:()=>Promise<void>,temporary:string,piEntry:string,codexEntry:string;
const ctx={userId:'t1238-visual',accountId:'t1238-visual-account',requestId:'visual-review',source:'user' as const};
const picture={bytes:Buffer.from('original-contact-sheet'),mimeType:'image/jpeg' as const,prompt:'检查原成片的遮挡，返回JSON'};
beforeAll(async()=>{
 const opened=await createDb();db=opened.db;close=()=>opened.client.close();
 const require=createRequire(resolve('../ai-worker/package.json')),build=require('esbuild').build;
 const {piRuntimeInitializationPlugin}=await import(resolve('../ai-worker/scripts/pi-runtime-bundle.mjs'));
 await mkdir(resolve('../ai-worker/dist'),{recursive:true});
 temporary=await mkdtemp(resolve('../ai-worker/dist/t1238-video-'));piEntry=resolve(temporary,'pi.cjs');codexEntry=resolve(temporary,'codex.cjs');
 const options={entryPoints:[resolve('../ai-worker/src/execution/video-visual-review-worker-entry.ts')],bundle:true,platform:'node',target:'node24',format:'cjs',logLevel:'warning',external:['@openclaw/fs-safe']};
 await build({...options,outfile:piEntry,plugins:[piRuntimeInitializationPlugin()]});
 await build({...options,outfile:codexEntry,plugins:[piRuntimeInitializationPlugin(),{name:'controlled-native-fixture',setup(builder:any){builder.onResolve({filter:/\/codex-app-server$/},()=>({path:resolve('src/modules/execution/video-visual-codex.fixture.ts')}));}}]});
});
afterAll(async()=>{await close?.();if(temporary)await rm(temporary,{recursive:true,force:true});});
async function original(id:string,engine:'pi'|'codex'='codex',timeoutSec:number|null=600,requestedAt=new Date().toISOString()){
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:'exec.video.render',status:'running',idempotencyKey:id,requestedAt,inputData:{spec:{taskType:'video.render',goal:'制作原视频',constraints:{timeoutSec,network:'deny',maxOutputMB:512}}},runtimeData:{executionRoute:createExecutionRoute(engine)}});
}
async function ownedChild(id:string){return (await db.select().from(executionTasks).where(eq(executionTasks.ownerId,id)))[0]!;}
async function remote(handler:(body:any,res:import('node:http').ServerResponse)=>void){
 let requests=0;const server=createServer((req,res)=>{let data='';req.on('data',chunk=>data+=chunk);req.on('end',()=>{requests++;handler(JSON.parse(data),res);});});
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 return {requests:()=>requests,spec:{apiFormat:'openai_chat',baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:'fixture-vision',token:'fixture-private'},close:async()=>{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}};
}
function success(res:import('node:http').ServerResponse){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'fixture',object:'chat.completion',created:1,model:'fixture-vision',choices:[{index:0,message:{role:'assistant',content:'{"verdict":"pass","summary":"原Pi图片已审查","issues":[]}'},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));}
it('真实Pi图片请求经审核Worker、原父ID/截止和唯一调用账本，偏好改Codex不改变原执行',async()=>{
 const id='visual-pi';await original(id,'pi');await createSettingsRepository(db,{now:()=>new Date().toISOString(),nextId:(prefix:string)=>prefix+'-'+Math.random()}).patchPreferences(ctx,{assistantExecutionEngine:'codex'});
 const api=await remote((body,res)=>{expect(body.messages.at(-1).content).toEqual(expect.arrayContaining([expect.objectContaining({type:'image_url',image_url:expect.objectContaining({url:expect.stringContaining('data:image/jpeg;base64,')})})]));success(res);});
 const resolver=vi.fn(async(_ctx,owner)=>{expect(owner).toEqual({aiTaskId:id});return api.spec;});
 const service=createExecutionVideoVisualReviewService(db,{entryPath:piEntry,resolvePiModelSpec:resolver});
 try{
  const {deadlineAt}=await service.freezeParentDeadline(ctx,{taskId:id,deadlineAt:Date.now()+600_000}),scope={parentTaskId:id,deadlineAt,signal:new AbortController().signal};
  expect(await service.review(ctx,picture,scope)).toContain('原Pi图片已审查');expect(await service.review(ctx,picture,scope)).toContain('原Pi图片已审查');
  await expect(service.review(ctx,{...picture,bytes:Buffer.from('different-picture')},scope)).rejects.toThrow('原成片审核输入不能改变');
  expect(api.requests()).toBe(1);expect(resolver).toHaveBeenCalledTimes(1);
  expect(await createPersistentTaskService(db).claimNext({workerId:'generic-model',executionMode:'model'})).toBeNull();
  const child=await ownedChild(id);expect(child.status).toBe('succeeded');expect(child.ownerId).toBe(id);expect(child.payload).toMatchObject({parentAiTaskId:id,executionRoute:{engine:'pi',source:'parent'}});expect(JSON.stringify(child.payload)).not.toContain('fixture-private');expect(Date.parse(child.deadlineAt!)).toBeLessThanOrEqual(deadlineAt!);
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,child.id));expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({status:'settled',totalTokens:5});
 }finally{await service.stop();await api.close();}
});
it('Codex原生协议fixture经真实子进程和图片provider，零API配置且持久同一thread/turn',async()=>{
 const id='visual-codex';await original(id);await createSettingsRepository(db,{now:()=>new Date().toISOString(),nextId:(prefix:string)=>prefix+'-'+Math.random()}).patchPreferences(ctx,{assistantExecutionEngine:'pi'});
 const resolver=vi.fn(async()=>{throw Error('API配置不应读取');}),service=createExecutionVideoVisualReviewService(db,{entryPath:codexEntry,resolvePiModelSpec:resolver});
 try{
  const {deadlineAt}=await service.freezeParentDeadline(ctx,{taskId:id,deadlineAt:Date.now()+600_000});
  expect(await service.review(ctx,picture,{parentTaskId:id,deadlineAt,signal:new AbortController().signal})).toContain('原Codex图片已审查');expect(resolver).not.toHaveBeenCalled();
  const child=await ownedChild(id),calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,child.id));expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({status:'settled',totalTokens:5});expect(child.payload).toMatchObject({executionRoute:{engine:'codex',source:'parent'},codexCalls:{[calls[0]!.id]:{threadId:'visual-fixture-thread',turnId:'visual-fixture-turn'}}});
 }finally{await service.stop();}
});
it('父创建期限只冻结一次，预算不足保留成片且不读取模型配置',async()=>{
 const id='visual-expiring',created=Date.now()-90_000;await original(id,'codex',120,new Date(created).toISOString());
 const resolver=vi.fn(async()=>{throw Error('不可调用模型');}),service=createExecutionVideoVisualReviewService(db,{entryPath:codexEntry,resolvePiModelSpec:resolver});
 try{
  const a=await service.freezeParentDeadline(ctx,{taskId:id,deadlineAt:Date.now()+600_000});expect(a.deadlineAt).toBe(created+120_000);
  expect(await service.freezeParentDeadline(ctx,{taskId:id,deadlineAt:Date.now()+900_000})).toEqual(a);
  await expect(service.review(ctx,picture,{parentTaskId:id,...a,signal:new AbortController().signal})).rejects.toThrow('剩余期限不足完整审核预算');expect(resolver).not.toHaveBeenCalled();expect(await ownedChild(id)).toBeUndefined();
 }finally{await service.stop();}
});
it('未配置Pi视觉模型沿用可选审核，不创建子任务；错误账号不能借父ID生成',async()=>{
 const id='visual-unconfigured';await original(id,'pi');const resolver=vi.fn(async()=>null),service=createExecutionVideoVisualReviewService(db,{entryPath:piEntry,resolvePiModelSpec:resolver});
 try{const a=await service.freezeParentDeadline(ctx,{taskId:id,deadlineAt:null});expect(await service.review(ctx,picture,{parentTaskId:id,...a,signal:new AbortController().signal})).toBeNull();expect(await ownedChild(id)).toBeUndefined();await expect(service.review({...ctx,accountId:'another'},picture,{parentTaskId:id,...a,signal:new AbortController().signal})).rejects.toThrow();expect(resolver).toHaveBeenCalledTimes(1);}finally{await service.stop();}
});
it('供应商明确拒绝图片后保留脱敏错误码，成片原任务仍running且不重发',async()=>{
 const id='visual-provider-rejected';await original(id,'pi');
 const api=await remote((_body,res)=>{res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:'vision_unsupported',message:'Image input not supported; api_key=sk-private-fixture'}}));});
 const service=createExecutionVideoVisualReviewService(db,{entryPath:piEntry,resolvePiModelSpec:async()=>api.spec});
 try{
  const a=await service.freezeParentDeadline(ctx,{taskId:id,deadlineAt:Date.now()+600_000});
  const error=await service.review(ctx,picture,{parentTaskId:id,...a,signal:new AbortController().signal}).catch(error=>error);
  expect(error).toBeInstanceOf(Error);expect(error.message).toContain('http_400');expect(error.message).not.toContain('sk-private-fixture');expect(error.message).not.toContain('fixture-private');
  const child=await ownedChild(id);expect(child.lastErrorCode).toBe('http_400');expect(api.requests()).toBe(1);
  expect((await db.select().from(aiTasks).where(eq(aiTasks.id,id)))[0]!.status).toBe('running');
 }finally{await service.stop();await api.close();}
});
it('在途审核取消保留未知原调用，不重发，不把原成片任务改成失败',async()=>{
 const id='visual-cancel';await original(id,'pi');const api=await remote(()=>{}),service=createExecutionVideoVisualReviewService(db,{entryPath:piEntry,resolvePiModelSpec:async()=>api.spec});
 try{
  const a=await service.freezeParentDeadline(ctx,{taskId:id,deadlineAt:Date.now()+600_000}),controller=new AbortController();
  const running=service.review(ctx,picture,{parentTaskId:id,...a,signal:controller.signal});const caught=running.catch(error=>error);
  await vi.waitFor(()=>expect(api.requests()).toBe(1),{timeout:120_000});controller.abort();expect(await caught).toBeInstanceOf(Error);
  const child=await ownedChild(id),calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,child.id));expect(calls).toHaveLength(1);expect(calls[0]?.status).toBe('unknown');expect(child.status).toBe('unknown_result');
  await expect(service.review(ctx,picture,{parentTaskId:id,...a,signal:new AbortController().signal})).rejects.toThrow('原成片审核尚未完成');expect(api.requests()).toBe(1);expect((await db.select().from(aiTasks).where(eq(aiTasks.id,id)))[0]!.status).toBe('running');
 }finally{await service.stop();await api.close();}
});

it('原视频停止后不能启动Codex审核，原期限scope不能伪造',async()=>{
 const id='visual-parent-stopped';await original(id);const resolver=vi.fn(async()=>{throw Error('API读取禁止');}),service=createExecutionVideoVisualReviewService(db,{entryPath:codexEntry,resolvePiModelSpec:resolver});
 try{const a=await service.freezeParentDeadline(ctx,{taskId:id,deadlineAt:Date.now()+600000});await expect(service.review(ctx,picture,{parentTaskId:id,deadlineAt:a.deadlineAt!+1,signal:new AbortController().signal})).rejects.toThrow('冻结期限');await db.update(aiTasks).set({status:'cancelled'}).where(eq(aiTasks.id,id));await expect(service.review(ctx,picture,{parentTaskId:id,...a,signal:new AbortController().signal})).rejects.toThrow('原视频已停止');expect(resolver).not.toHaveBeenCalled();expect(await ownedChild(id)).toBeUndefined();}finally{await service.stop();}
});
