import {beforeAll,afterAll,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createDb,executionTasks,executionCalls,intelligenceItems,eq,platformAccounts} from '@creatoros/backend';
import {accountGroupMemberships} from '../../schema/account-groups';
import {createServer} from 'node:http';
import {ENDPOINTS,createClient,type RequestContext} from '@creatoros/contract';
import {createAccountGroupService,createPlatformAccountService} from '../platform-account';
import {createPersistentTaskService} from '../execution';
import {createIntelligenceService} from './intelligence.service';
import {createIntelligenceTransport} from './intelligence.transport';
import {createIntelligenceTranscriptBridge} from './intelligence-transcript-bridge';
import {runIntelligenceTranscriptTask} from './transcript-runner';

let temporary:string,entry:string;
beforeAll(async()=>{
 const require=createRequire(resolve('../ai-worker/package.json'));
 const {piRuntimeInitializationPlugin}=await import(resolve('../ai-worker/scripts/pi-runtime-bundle.mjs'));
 await mkdir(resolve('../ai-worker/dist'),{recursive:true});
 temporary=await mkdtemp(resolve('../ai-worker/dist/t1458-'));entry=join(temporary,'transcript.cjs');
 await require('esbuild').build({entryPoints:[resolve('../ai-worker/src/execution/intelligence-transcript-worker-entry.ts')],outfile:entry,bundle:true,platform:'node',target:'node24',format:'cjs',logLevel:'warning',external:['@openclaw/fs-safe','mammoth','pdf-parse','@playwright/test','jsdom','@mozilla/readability','@xenova/transformers'],plugins:[piRuntimeInitializationPlugin()]});
},180000);
afterAll(async()=>{if(temporary)await rm(temporary,{recursive:true,force:true});});

async function fixture(mode:'group'|'explicit'|'anonymous'='group',videoBaseUrl?:string){
 const opened=await createDb(),db=opened.db;let n=0;
 const now=()=>new Date().toISOString(),nextId=(p:string)=>`${p}-t1458-${++n}`,deps={db,now,nextId};
 const base:RequestContext={userId:'t1458-user',requestId:'t1458',source:'user'};
 const groups=createAccountGroupService(deps),accounts=createPlatformAccountService(deps);
 const group=await groups.create(base,{name:'来源组',idempotencyKey:'group'});
 const account=await accounts.createAccount({...base,groupId:group.id},{platform:'douyin',accountHandle:'原来源号',idempotencyKey:'original-account'});
 // 同组两个号也必须使用来源号，不能取列表首项或默认号。
 await accounts.createAccount({...base,groupId:group.id},{platform:'douyin',accountHandle:'另一个号',idempotencyKey:'other-account'});
 const ctx:RequestContext={...base,groupId:group.id,accountId:mode==='explicit'?account.id:null};
 const tasks=createPersistentTaskService(db,{now,nextId}),intelligence=createIntelligenceService(db,{tasks,now,nextId});
 const itemId=await intelligence.seedItemForTest({...ctx,accountId:mode==='anonymous'?null:account.id},{canonicalUrl:'https://www.douyin.com/video/1458',externalId:'1458',title:'来源作品'});
 const api=createClient(ENDPOINTS,createIntelligenceTransport(()=>intelligence),ctx);
 const queued=await api.enqueueIntelligenceTranscripts({params:undefined,query:undefined,body:{itemIds:[itemId],idempotencyKey:'original-intent'}});
 const task=queued.tasks[0]!;
 const readSource=vi.fn(async(c:RequestContext)=>{
  expect(c).toMatchObject({userId:ctx.userId,groupId:group.id,accountId:mode==='anonymous'?null:account.id});
  return videoBaseUrl?{kind:'video' as const,playUrl:'https://fixture.invalid/video'}:{kind:'image-album' as const};
 });
 const resolveSpec=vi.fn(async(_ctx:RequestContext)=>({kind:'audio' as const,provider:videoBaseUrl?'openai':'whisper-local',model:videoBaseUrl?'fixture-asr':'tiny',baseUrl:videoBaseUrl??null,token:videoBaseUrl?'fixture-only':''}));
 const objects=new Map<string,Uint8Array>();
 const bridge=createIntelligenceTranscriptBridge(db,{entryPath:entry,tasks,now,budget:{maxCalls:8,maxTokens:10000,deadlineMs:600000},resolveSpec,prepareSpec:async(c,s)=>{expect(c.accountId).toBe(ctx.accountId);return s;},readSource,extractAudio:async()=>{if(!videoBaseUrl)throw Error('图文不抽音');return Uint8Array.from([1,2,3,4]);},objectStorageForCtx:async(c)=>{expect(c.accountId).toBe(ctx.accountId);return {createPresignedUpload:async()=>({storageKey:'fixture-audio'}),putObject:async(v:{storageKey:string;bytes:Uint8Array})=>{objects.set(v.storageKey,v.bytes);},getObject:async(key:string)=>{const v=objects.get(key);if(!v)throw Object.assign(Error('missing'),{code:'ENOENT'});return v;}} as never;}});
 return {db,ctx,base,groups,accounts,account,group,tasks,intelligence,api,itemId,task,readSource,resolveSpec,bridge,close:async()=>{await bridge.stop();await opened.client.close();}};
}

it.each(['group','explicit','anonymous'] as const)('T1458 %s 公共排队→原任务→真实Worker来源上下文→公开回读，模型归属保持不变',async mode=>{
 const f=await fixture(mode);
 try{
  await runIntelligenceTranscriptTask(f.ctx,{taskId:f.task.id},{tasks:f.tasks,intelligence:f.intelligence,transcript:f.bridge.transcript});
  expect(f.readSource).toHaveBeenCalledTimes(1);
  expect(f.resolveSpec.mock.calls[0]?.[0]).toMatchObject({accountId:f.ctx.accountId,groupId:f.ctx.groupId});
  expect(await f.tasks.get(f.ctx,f.task.id)).toMatchObject({id:f.task.id,status:'succeeded',attempt:1,accountId:f.ctx.accountId});
  const saved=await f.api.getIntelligenceItem({params:{itemId:f.itemId},query:undefined,body:undefined});
  expect(saved.transcript).toMatchObject({status:'skipped',executionTaskId:f.task.id,errorCode:'IMAGE_ALBUM'});
  expect(await f.db.select().from(executionTasks)).toHaveLength(1);
  expect(await f.db.select().from(executionCalls)).toHaveLength(0);
 }finally{await f.close();}
});

it('T1458 视频原任务取流→真实Worker→本机受控ASR→原逐字稿公开非空回读，重入不重复调用',async()=>{
 let requests=0;
 const server=createServer((req,res)=>{req.resume();req.on('end',()=>{expect(req.url).toBe('/v1/audio/transcriptions');requests++;res.setHeader('content-type','application/json');res.end(JSON.stringify({text:'本机受控识别正文，用于验证原任务保存链。',language:'zh'}));});});
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 const address=server.address();if(!address||typeof address==='string')throw Error('缺受控端口');
 const f=await fixture('group',`http://127.0.0.1:${address.port}`);
 try{
  const runner={tasks:f.tasks,intelligence:f.intelligence,transcript:f.bridge.transcript};
  await runIntelligenceTranscriptTask(f.ctx,{taskId:f.task.id},runner);
  expect(await f.tasks.get(f.ctx,f.task.id)).toMatchObject({status:'succeeded',accountId:null,attempt:1});
  const saved=await f.api.getIntelligenceItem({params:{itemId:f.itemId},query:undefined,body:undefined});
  expect(saved.transcript).toMatchObject({status:'done',text:'本机受控识别正文，用于验证原任务保存链。',executionTaskId:f.task.id});
  await runIntelligenceTranscriptTask(f.ctx,{taskId:f.task.id},runner);
  expect(requests).toBe(1);expect(f.readSource).toHaveBeenCalledTimes(1);
  expect(await f.db.select().from(executionTasks)).toHaveLength(1);
  expect(await f.db.select().from(executionCalls)).toMatchObject([{status:'settled'}]);
 }finally{await f.close();await new Promise<void>((done,reject)=>server.close(e=>e?reject(e):done()));}
});

it.each(['other-group','foreign-user','archived','wrong-platform'] as const)('T1458 原来源账号%s时不接触档案，不切换到组内其他账号',async reason=>{
 const f=await fixture();
 try{
  if(reason==='other-group'){
   const other=await f.groups.create(f.base,{name:'另一组',idempotencyKey:'move-fixture'});
   await f.db.update(accountGroupMemberships).set({groupId:other.id}).where(eq(accountGroupMemberships.accountId,f.account.id));
  }else await f.db.update(platformAccounts).set(reason==='foreign-user'?{userId:'other-user'}:reason==='archived'?{status:'archived'}:{platform:'kuaishou'}).where(eq(platformAccounts.id,f.account.id));
  await runIntelligenceTranscriptTask(f.ctx,{taskId:f.task.id},{tasks:f.tasks,intelligence:f.intelligence,transcript:f.bridge.transcript});
  expect(f.readSource).not.toHaveBeenCalled();
  expect((await f.tasks.get(f.ctx,f.task.id)).status).not.toBe('succeeded');
  expect(await f.db.select().from(executionCalls)).toHaveLength(0);
 }finally{await f.close();}
});

it('T1458 取消原任务后不得启动来源或Worker',async()=>{
 const f=await fixture();
 try{
  await f.tasks.command(f.ctx,{taskIds:[f.task.id],command:'cancel',idempotencyKey:'cancel-original'});
  await runIntelligenceTranscriptTask(f.ctx,{taskId:f.task.id},{tasks:f.tasks,intelligence:f.intelligence,transcript:f.bridge.transcript});
  expect(f.readSource).not.toHaveBeenCalled();expect(f.resolveSpec).not.toHaveBeenCalled();
  expect(await f.tasks.get(f.ctx,f.task.id)).toMatchObject({status:'cancelled',attempt:0});
 }finally{await f.close();}
});

it('T1458 配置准备期间原作品绑定改变时不启动取流',async()=>{
 const f=await fixture();
 try{
  f.resolveSpec.mockImplementationOnce(async()=>{
   await f.db.update(intelligenceItems).set({externalId:'different-video'}).where(eq(intelligenceItems.id,f.itemId));
   return {kind:'audio',provider:'whisper-local',model:'tiny',baseUrl:null,token:''};
  });
  await runIntelligenceTranscriptTask(f.ctx,{taskId:f.task.id},{tasks:f.tasks,intelligence:f.intelligence,transcript:f.bridge.transcript});
  expect(f.readSource).not.toHaveBeenCalled();expect((await f.tasks.get(f.ctx,f.task.id)).status).not.toBe('succeeded');
  expect(await f.db.select().from(executionCalls)).toHaveLength(0);
 }finally{await f.close();}
});

it('T1458 登录失败恢复沿同一NULL账号原任务续接，不制造重复任务',async()=>{
 const f=await fixture();
 try{
  f.readSource.mockRejectedValueOnce(Object.assign(Error('fixture'),{name:'DouyinNotLoggedInError'}));
  const runner={tasks:f.tasks,intelligence:f.intelligence,transcript:f.bridge.transcript};
  await runIntelligenceTranscriptTask(f.ctx,{taskId:f.task.id},runner);
  expect(await f.tasks.get(f.ctx,f.task.id)).toMatchObject({status:'blocked',errorCode:'LOGIN_REQUIRED',attempt:1});
  await f.tasks.command(f.ctx,{taskIds:[f.task.id],command:'retry',idempotencyKey:'continue-original'});
  await runIntelligenceTranscriptTask(f.ctx,{taskId:f.task.id},runner);
  expect(await f.tasks.get(f.ctx,f.task.id)).toMatchObject({id:f.task.id,status:'succeeded',attempt:2,accountId:null});
  expect(await f.db.select().from(executionTasks)).toHaveLength(1);
  expect(await f.db.select().from(executionCalls)).toHaveLength(0);
 }finally{await f.close();}
});
