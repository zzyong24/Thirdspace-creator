// @vitest-environment node
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import {createDb,type Db} from '@creatoros/backend';
import {createAiRepository,createChatTurnSubmissionService} from '@creatoros/backend/modules/ai';
import {ConflictError,createPersistentTaskService,createExecutionCallLedgerService,createExecutionLeaseService,type WorkbenchArtifactBlobPort} from '@creatoros/backend/modules/execution';
import {createExecutionChatToolPorts,readExecutionChatTask} from '../../../backend/src/modules/execution/execution-chat-tool-ports.service';
import {createChatWorkbenchCapabilityHost} from '../../../backend/src/modules/ai-runtime/chat-workbench-capability-host';
import {defineWorkbenchChatTool} from '../../../backend/src/modules/ai-runtime/chat-tool-gate';
import {prepareChatToolDefinitions} from '../../../backend/src/modules/ai-runtime/chat-tool-definitions';
import {workbenchResultSchema,workbenchArtifactSchema} from '@creatoros/contract/agent-workbench';
import type {AgenticToolOutcome} from '@creatoros/contract/execution-worker';
import {createWorkbenchArtifactHost} from './workbench-artifact-host';
import type {NativeFileAction} from './workbench-native-client';

let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();},20000);
afterAll(async()=>close?.());
function resultOf(outcome:AgenticToolOutcome){
 const data=outcome.data;
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('缺少工作台回执');
 return workbenchResultSchema.parse(data.workbench);
}
function textOf(outcome:AgenticToolOutcome){
 const result=resultOf(outcome);
 if(result.status!=='succeeded'||result.content[0]?.type!=='text')throw new Error(JSON.stringify(result));
 return JSON.parse(result.content[0].text);
}

// 全链路经聊天提交、冻结目录、模型账本、正式聊天工具端口、宿主、原子结算、versions/read。
// 不直接写查询数据库来建立或验收产物；只用隔离文件/Blob 端口替代磁盘和对象存储。
type FixtureSession={ctx:{userId:string;accountId:string;requestId:string;source:'user'};conversationId?:string;objects:Map<string,Uint8Array>};
async function fixture(session?:FixtureSession){
 const nonce=randomUUID(),ctx=session?.ctx??{userId:`register-u-${nonce}`,accountId:`register-a-${nonce}`,requestId:nonce,source:'user' as const};
 const files=new Map<string,{bytes:Buffer;version:number}>();
 files.set('report-data.csv',{bytes:Buffer.from('名称,数量\n样本,42\n'),version:1});
 const objects=session?.objects??new Map<string,Uint8Array>();let fileFailure:Error|undefined,storeThenLoseReply=false;
 let beforeNextStore:((operationId:string)=>Promise<void>)|undefined;
 const key=(input:{taskId:string;operationId:string;hash:string})=>JSON.stringify([input.taskId,input.operationId,input.hash]);
 const blobs:WorkbenchArtifactBlobPort={
  submit:vi.fn(async(_ctx,input)=>{
   const before=beforeNextStore;beforeNextStore=undefined;await before?.(input.operationId);
   const hash=createHash('sha256').update(input.bytes).digest('hex');objects.set(key({...input,hash}),new Uint8Array(input.bytes));
   if(storeThenLoseReply)throw new Error('已写入但响应丢失');
   return {hash,size:input.bytes.length};
  }),
  read:async(_ctx,input)=>{const bytes=objects.get(key(input));if(!bytes)throw new Error('BLOB_NOT_FOUND');return new Uint8Array(bytes);},
 };
 const filePort=vi.fn(async(_ref:unknown,_operationId:string,action:NativeFileAction)=>{
  if(fileFailure)throw fileFailure;
  if(action.kind!=='stat'&&action.kind!=='read')throw new Error('未预期文件动作');
  const source=files.get(action.path);if(!source)throw new Error('FILE_NOT_FOUND');
  if(action.kind==='stat')return {isDirectory:false,size:source.bytes.length,version:source.version};
  return {contentBase64:source.bytes.subarray(action.offset,action.offset+action.limit).toString('base64'),total:source.bytes.length,version:source.version};
 });
 const host=createWorkbenchArtifactHost(db,{platform:'darwin',desktop:true,socketPath:'isolated-register.sock',blobs,filePort})!;
 const prepared=await prepareChatToolDefinitions(Object.fromEntries(host.catalog.map(descriptor=>[
  descriptor.name,defineWorkbenchChatTool(descriptor,async()=>{throw new Error('必须经正式宿主调用');}),
 ])),{workbenchCapabilities:[...host.catalog]});
 const repo=createAiRepository(db,{...ctx,now:()=>new Date().toISOString(),nextId:prefix=>`${prefix}-${randomUUID()}`});
 const conversation=session?.conversationId?{id:session.conversationId}:await repo.createConversation({title:'登记身份纠错回归',projectId:null,scope:'global'});
 const source=await repo.createMessage(conversation.id,{role:'user',content:'生成并登记报告',attachments:[],modelMetadata:{}});
 const submitted=await createChatTurnSubmissionService(db,{assemble:async()=>({capability:'copilot.assist',system:'按真实版本交付',messages:[{role:'user',content:'登记报告'}],
  tools:prepared.definitions,workbenchCapabilities:[...host.catalog],workbenchPlatform:'macos',maxSteps:12,maxOutputTokens:128})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 const workerId=`worker-${nonce}`,tasks=createPersistentTaskService(db),claim=(await tasks.claimTask({taskId:submitted.executionTaskId,workerId}))!;
 const ref={executionTaskId:submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const leases=createExecutionLeaseService(db),signal=new AbortController().signal;
 const resolve=createChatWorkbenchCapabilityHost(host,execution=>leases.withLease(execution,'admission',async({task,context})=>({
  userId:context.userId,accountId:context.accountId!,taskId:task.id,attempt:task.attempt,fenceToken:task.fenceToken!,leaseId:task.leaseOwner!,
 })),async()=>{});
 const {input}=await readExecutionChatTask(db,ref);
 const tools=await resolve(ctx,input,ref,signal);
 const budget={maxCalls:100,maxTokens:100000,deadlineMs:60000};
 const ports=createExecutionChatToolPorts(db,{budget,tools}),ledger=createExecutionCallLedgerService(db,{budget});
 async function invoke(name:string,args:Record<string,unknown>){
  const toolCallId=randomUUID(),model=await ledger.reserve(ref,{kind:'model',operationKey:`model-${toolCallId}`,inputDigest:`sha256:${'a'.repeat(64)}`,reservedTokens:1});
  await ledger.start(ref,model.id);
  await ledger.settle(ref,model.id,{status:'settled',usage:{totalTokens:1},providerResult:{content:[{type:'tool-call',toolCallId,toolName:name.replaceAll('.','_'),input:JSON.stringify(args)}],finishReason:{unified:'tool-calls'},usage:{inputTokens:{total:1},outputTokens:{total:0}},warnings:[]}});
  const reserved=await ports.reserve(ref,{modelCallId:model.id,toolCallId});await ports.start(ref,{callId:reserved.callId});
  const outcome=await ports.execute(ref,{callId:reserved.callId},signal);
  const replay=await ports.reserve(ref,{modelCallId:model.id,toolCallId});
  expect(replay.status).toBe('settled');expect(replay.receipt?.output).toEqual(outcome);
  return {outcome,callId:reserved.callId};
 }
 const pauseNextStore=()=>{
  let announce!:(operationId:string)=>void,release!:()=>void;
  const started=new Promise<string>(resolve=>{announce=resolve;}),released=new Promise<void>(resolve=>{release=resolve;});
  beforeNextStore=async operationId=>{announce(operationId);await released;};
  return {started,release};
 };
 return {host,invoke,files,filePort,blobs,ledger,ref,session:{ctx,conversationId:conversation.id,objects},pauseNextStore,setFileUnavailable:(value:boolean)=>{fileFailure=value?new Error('任务文件端口暂时不可用'):undefined;},setFileError:(error:Error)=>{fileFailure=error;},loseStoreReply:()=>{storeThenLoseReply=true;}};
}

it('空 versions 下自拟 ID 得到明确参数修复回执，且不读取文件或提交 Blob',async()=>{
 const f=await fixture();
 expect(textOf((await f.invoke('artifact.versions',{})).outcome).items).toEqual([]);
 for(const identity of [{artifactId:'verify-report-data-csv'},{expectedVersion:0}]){
  const bad=await f.invoke('artifact.register',{path:'report-data.csv',mime:'text/csv',...identity});
  expect(bad.outcome).toMatchObject({status:'error',sideEffect:'none',error:{code:'invalid_input',retryable:false}});
  expect(resultOf(bad.outcome)).toMatchObject({status:'failed',error:{code:'invalid_input',retryable:false,dispatched:false,nextAction:'fix_input'}});
  expect(bad.outcome.error?.recovery).toMatch(/省略 artifactId/);
  expect(bad.outcome.error?.recovery).toMatch(/baseArtifactRef/);
  expect(bad.outcome.error?.recovery).toContain('不要原样重试');
  expect(resultOf(bad.outcome)).toMatchObject({error:{recovery:bad.outcome.error?.recovery}});
 }
 expect(f.filePort).not.toHaveBeenCalled();expect(f.blobs.submit).not.toHaveBeenCalled();
 expect(textOf((await f.invoke('artifact.versions',{})).outcome).items).toEqual([]);
},20000);

it('省略 ID 可新建、原子结算、按相同 hash 读回和修订',async()=>{
 const f=await fixture();
 expect(textOf((await f.invoke('artifact.versions',{})).outcome).items).toEqual([]);
 const created=await f.invoke('artifact.register',{path:'report-data.csv',mime:'text/csv'});
 const metadata=workbenchArtifactSchema.parse(textOf(created.outcome));
 expect(created.outcome).toMatchObject({status:'ok',sideEffect:'committed'});
 expect(metadata.artifactId).toMatch(/^wa-/);expect(metadata.version).toBe(1);
 expect(textOf((await f.invoke('artifact.versions',{artifactId:metadata.artifactId})).outcome).items).toEqual([expect.objectContaining({artifactId:metadata.artifactId,version:1,hash:metadata.hash})]);
 expect(textOf((await f.invoke('artifact.read',{artifactId:metadata.artifactId,version:1})).outcome)).toMatchObject({text:'名称,数量\n样本,42\n',hash:metadata.hash});
 f.files.set('report-data.csv',{bytes:Buffer.from('名称,数量\n样本,43\n'),version:2});
 const revised=await f.invoke('artifact.register',{path:'report-data.csv',mime:'text/csv',artifactId:metadata.artifactId,expectedVersion:1,baseArtifactRef:{artifactId:metadata.artifactId,version:1},provenance:[created.callId]});
 expect(textOf(revised.outcome)).toMatchObject({artifactId:metadata.artifactId,version:2,provenance:[created.callId]});
 expect(textOf((await f.invoke('artifact.read',{artifactId:metadata.artifactId,version:1})).outcome).text).toContain('42');
 expect(textOf((await f.invoke('artifact.read',{artifactId:metadata.artifactId,version:2})).outcome).text).toContain('43');
},20000);

it('补造版本的假 ID、错误 provenance、缺 base 和过期版本均不能转成 transient/retry',async()=>{
 const f=await fixture(),base={path:'report-data.csv',mime:'text/csv'};
 for(const args of [
  {...base,artifactId:'verify-report-data-csv',expectedVersion:1,baseArtifactRef:{artifactId:'verify-report-data-csv',version:1}},
  {...base,provenance:['context.metrics','files.write(call_fake)']},
 ]){
  const {outcome}=await f.invoke('artifact.register',args);
  expect(outcome).toMatchObject({status:'error',sideEffect:'none',error:{code:'invalid_input',retryable:false}});
  expect(resultOf(outcome)).toMatchObject({status:'failed',error:{confirmedNoCommit:true,retryable:false,nextAction:'fix_input'}});
  expect(outcome.error?.recovery).toMatch(/provenance/);
 }
 expect(f.blobs.submit).not.toHaveBeenCalled();
 const metadata=workbenchArtifactSchema.parse(textOf((await f.invoke('artifact.register',base)).outcome));
 for(const args of [
  {...base,artifactId:metadata.artifactId,expectedVersion:1},
  {...base,artifactId:metadata.artifactId,expectedVersion:2,baseArtifactRef:{artifactId:metadata.artifactId,version:2}},
 ])expect((await f.invoke('artifact.register',args)).outcome).toMatchObject({error:{code:'invalid_input',retryable:false},sideEffect:'none'});
 expect(textOf((await f.invoke('artifact.versions',{})).outcome).items).toHaveLength(1);
},20000);

it('暂时文件故障仍可重试；Blob 写入后失联仍待对账，不能冒充参数错误',async()=>{
 const f=await fixture(),args={path:'report-data.csv',mime:'text/csv'};
 f.setFileUnavailable(true);
 const failed=await f.invoke('artifact.register',args);
 expect(resultOf(failed.outcome)).toMatchObject({status:'failed',error:{code:'artifact_not_committed',retryable:true,confirmedNoCommit:true,nextAction:'retry'}});
 f.setFileUnavailable(false);f.loseStoreReply();
 await expect(f.invoke('artifact.register',args)).rejects.toThrow();
 const calls=(await f.ledger.inspect(f.ref)).calls;
 expect(calls.at(-1)?.status).toBe('unknown');
 expect(f.blobs.submit).toHaveBeenCalledTimes(1);
},20000);

it('同会话不同任务读取旧 HTML 后登记 v2，版本归属和两版 hash/正文均可从公共工具回读',async()=>{
 const first=await fixture(),v1='<h1>无样本报告</h1><p>样本数 0；平均值不适用</p>';
 first.files.set('empty-report.html',{bytes:Buffer.from(v1),version:1});
 const original=workbenchArtifactSchema.parse(textOf((await first.invoke('artifact.register',{path:'empty-report.html',mime:'text/html'})).outcome));
 const second=await fixture(first.session);
 expect(second.ref.executionTaskId).not.toBe(first.ref.executionTaskId);
 expect(second.files.has('empty-report.html')).toBe(false);
 expect(textOf((await second.invoke('artifact.versions',{})).outcome).items).toEqual([expect.objectContaining(original)]);
 const read=await second.invoke('artifact.read',{artifactId:original.artifactId,version:1});
 expect(textOf(read.outcome)).toMatchObject({hash:original.hash,text:v1});
 const v2=textOf(read.outcome).text+'<p>版本二：仍为 0 个样本</p>';
 second.files.set('empty-report-v2.html',{bytes:Buffer.from(v2),version:1});
 const baseArtifactRef={artifactId:original.artifactId,version:1};
 const changed=workbenchArtifactSchema.parse(textOf((await second.invoke('artifact.register',{
  path:'empty-report-v2.html',mime:'text/html',artifactId:original.artifactId,expectedVersion:1,baseArtifactRef,
 })).outcome));
 expect(changed).toMatchObject({artifactId:original.artifactId,version:2,taskId:second.ref.executionTaskId,baseArtifactRef,provenance:[]});
 expect(changed.hash).toBe(createHash('sha256').update(v2).digest('hex'));expect(changed.hash).not.toBe(original.hash);
 const third=await fixture(first.session);
 expect(textOf((await third.invoke('artifact.versions',{artifactId:original.artifactId})).outcome).items).toEqual(expect.arrayContaining([
  expect.objectContaining({artifactId:original.artifactId,version:1,taskId:first.ref.executionTaskId,hash:original.hash}),
  expect.objectContaining({artifactId:original.artifactId,version:2,taskId:second.ref.executionTaskId,hash:changed.hash}),
 ]));
 expect(textOf((await third.invoke('artifact.read',{artifactId:original.artifactId,version:1})).outcome)).toMatchObject({text:v1,hash:original.hash});
 expect(textOf((await third.invoke('artifact.read',{artifactId:original.artifactId,version:2})).outcome)).toMatchObject({text:v2,hash:changed.hash});
},20000);

it('同会话跨任务复制 PNG，按来源 hash 回读并进入新 HTML 的静态图片清单',async()=>{
 const first=await fixture(),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 first.files.set('chart.png',{bytes:png,version:1});
 const original=workbenchArtifactSchema.parse(textOf((await first.invoke('artifact.register',{path:'chart.png',mime:'image/png'})).outcome));
 const second=await fixture(first.session);
 const copied=workbenchArtifactSchema.parse(textOf((await second.invoke('artifact.copy',{
  sourceArtifactId:original.artifactId,sourceVersion:1,targetPath:'report/chart.png',
 })).outcome));
 expect(copied).toMatchObject({version:1,mime:'image/png',hash:original.hash,taskId:second.ref.executionTaskId,relativePath:'report/chart.png',
  copiedFrom:{artifactId:original.artifactId,version:1,taskId:first.ref.executionTaskId,hash:original.hash}});
 expect(copied.artifactId).not.toBe(original.artifactId);
 expect(Buffer.from(textOf((await second.invoke('artifact.read',{artifactId:copied.artifactId,version:1})).outcome).contentBase64,'base64')).toEqual(png);
 second.files.set('report/index.html',{bytes:Buffer.from('<h1>版本二</h1><img src="./chart.png">'),version:1});
 const html=workbenchArtifactSchema.parse(textOf((await second.invoke('artifact.register',{path:'report/index.html',mime:'text/html'})).outcome));
 expect(html.htmlResources).toEqual([{path:'report/chart.png',artifactId:copied.artifactId,version:1,taskId:second.ref.executionTaskId,hash:original.hash,size:png.length}]);
 expect(second.filePort.mock.calls.every(call=>call[2].path==='report/index.html')).toBe(true);
},20000);

it('复现真实跨任务修订：合法 ID/base 下描述性或旧任务 provenance 给出具体纠错，省略后成功',async()=>{
 const first=await fixture();
 first.files.set('empty-report.html',{bytes:Buffer.from('<p>样本数 0</p>'),version:1});
 const created=await first.invoke('artifact.register',{path:'empty-report.html',mime:'text/html'});
 const original=workbenchArtifactSchema.parse(textOf(created.outcome)),second=await fixture(first.session);
 second.files.set('empty-report-v2.html',{bytes:Buffer.from('<p>样本数 0</p><p>版本二</p>'),version:1});
 const input={path:'empty-report-v2.html',mime:'text/html',artifactId:original.artifactId,expectedVersion:1,baseArtifactRef:{artifactId:original.artifactId,version:1}};
 for(const provenance of [[`artifact-register: ${original.artifactId}@1 (empty-report.html)`,'files-write: empty-report-v2.html (新增"版本二"段落)'],[created.callId]]){
  const bad=await second.invoke('artifact.register',{...input,provenance});
  expect(bad.outcome).toMatchObject({status:'error',sideEffect:'none',error:{code:'invalid_input',retryable:false}});
  expect(bad.outcome.error?.recovery).toContain('provenance');
  expect(bad.outcome.error?.recovery).toContain('本任务已结算调用的真实 execution callId');
  expect(bad.outcome.error?.recovery).not.toContain(provenance[0]);
 }
 expect(second.blobs.submit).not.toHaveBeenCalled();
 expect(textOf((await second.invoke('artifact.register',input)).outcome)).toMatchObject({artifactId:original.artifactId,version:2});
},20000);

it('HTML 不能当 PNG 复制，错误指引通过 read→files.write→register 修订且不产生副作用',async()=>{
 const first=await fixture();
 first.files.set('empty-report.html',{bytes:Buffer.from('<p>样本数 0</p>'),version:1});
 const original=workbenchArtifactSchema.parse(textOf((await first.invoke('artifact.register',{path:'empty-report.html',mime:'text/html'})).outcome));
 const second=await fixture(first.session);
 for(const targetPath of ['empty-report-v2.html','empty-report.png']){
  const {outcome}=await second.invoke('artifact.copy',{sourceArtifactId:original.artifactId,sourceVersion:1,targetPath});
  expect(outcome).toMatchObject({status:'error',sideEffect:'none',error:{code:'invalid_input',retryable:false}});
  expect(outcome.error?.recovery).toContain('PNG');
  expect(outcome.error?.recovery).toContain('artifact.read');
  expect(outcome.error?.recovery).toContain('files.write');
 }
 expect(second.blobs.submit).not.toHaveBeenCalled();expect(second.filePort).not.toHaveBeenCalled();
},20000);

it('同账号不同会话和其他账号均不能读取、修订或复制来源产物',async()=>{
 const first=await fixture();
 first.files.set('chart.png',{bytes:Buffer.from('isolated-source-png'),version:1});
 const original=workbenchArtifactSchema.parse(textOf((await first.invoke('artifact.register',{path:'chart.png',mime:'image/png'})).outcome));
 const foreignOwner={userId:`other-${randomUUID()}`,accountId:`other-${randomUUID()}`,requestId:randomUUID(),source:'user' as const};
 for(const ctx of [first.session.ctx,foreignOwner]){
  const foreign=await fixture({...first.session,ctx,conversationId:undefined});
  foreign.files.set('chart.png',{bytes:Buffer.from('foreign-change'),version:1});
  expect(textOf((await foreign.invoke('artifact.versions',{})).outcome).items).toEqual([]);
  for(const [name,input] of [
   ['artifact.read',{artifactId:original.artifactId,version:1}],
   ['artifact.register',{path:'chart.png',mime:'image/png',artifactId:original.artifactId,expectedVersion:1,baseArtifactRef:{artifactId:original.artifactId,version:1}}],
   ['artifact.copy',{sourceArtifactId:original.artifactId,sourceVersion:1,targetPath:'copy.png'}],
  ] as const){
   const {outcome}=await foreign.invoke(name,input);
   expect(outcome).toMatchObject({status:'error',sideEffect:'none',error:{code:'invalid_input',retryable:false}});
  }
  expect(foreign.blobs.submit).not.toHaveBeenCalled();
 }
 const next=await fixture(first.session);
 expect(textOf((await next.invoke('artifact.versions',{artifactId:original.artifactId})).outcome).items).toEqual([expect.objectContaining({version:1,hash:original.hash})]);
},20000);

it('跨任务 copy 的 Blob 写入后失联仍按原调用待对账，不归类为 invalid_input',async()=>{
 const first=await fixture();
 first.files.set('chart.png',{bytes:Buffer.from('source-png'),version:1});
 const original=workbenchArtifactSchema.parse(textOf((await first.invoke('artifact.register',{path:'chart.png',mime:'image/png'})).outcome));
 const second=await fixture(first.session);second.loseStoreReply();
 await expect(second.invoke('artifact.copy',{sourceArtifactId:original.artifactId,sourceVersion:1,targetPath:'copy.png'})).rejects.toThrow();
 expect((await second.ledger.inspect(second.ref)).calls.at(-1)?.status).toBe('unknown');
 expect(second.blobs.submit).toHaveBeenCalledTimes(1);
 expect(textOf((await first.invoke('artifact.read',{artifactId:original.artifactId,version:1})).outcome).hash).toBe(original.hash);
},20000);

it('确定性失败仅返回有界宿主纠错文案，不透传底层异常文字',async()=>{
 const f=await fixture(),sensitive='PRIVATE_STORAGE_TOKEN_DO_NOT_EXPOSE';
 f.setFileError(new ConflictError(sensitive.repeat(1000)));
 const {outcome}=await f.invoke('artifact.register',{path:'report-data.csv',mime:'text/csv'});
 expect(outcome).toMatchObject({status:'error',sideEffect:'none',error:{code:'invalid_input',retryable:false}});
 expect(outcome.error?.recovery).toContain('省略 artifactId');
 expect(outcome.error?.recovery?.length).toBeLessThanOrEqual(4000);
 expect(JSON.stringify(outcome)).not.toContain(sensitive);
 expect(f.blobs.submit).not.toHaveBeenCalled();
},20000);

it('另一 operation 正在修订时 B 等待并核对 A；A 完成后 B 按新版本继续，不误报 invalid_input',async()=>{
 const first=await fixture();
 const original=workbenchArtifactSchema.parse(textOf((await first.invoke('artifact.register',{path:'report-data.csv',mime:'text/csv'})).outcome));
 const a=await fixture(first.session),b=await fixture(first.session);
 a.files.set('report-data.csv',{bytes:Buffer.from('版本 A\n'),version:1});
 b.files.set('report-data.csv',{bytes:Buffer.from('版本 B\n'),version:1});
 const revision=(version:number)=>({path:'report-data.csv',mime:'text/csv',artifactId:original.artifactId,expectedVersion:version,baseArtifactRef:{artifactId:original.artifactId,version}});
 const hold=a.pauseNextStore(),pending=a.invoke('artifact.register',revision(1));
 try{
  const operationA=await Promise.race([hold.started,pending.then(()=>{throw new Error('A 未进入待写入阶段');})]);
  const refused=await b.invoke('artifact.register',revision(1));
  expect(refused.outcome).toMatchObject({status:'error',sideEffect:'none',error:{code:'transient',retryable:false}});
  expect(resultOf(refused.outcome)).toMatchObject({operationId:refused.callId,status:'failed',error:{code:'artifact_revision_pending',dispatched:true,confirmedNoCommit:true,retryable:false,nextAction:'wait'}});
  expect(refused.outcome.error?.recovery).toContain(operationA);
  expect(refused.outcome.error?.recovery).toContain('artifact.versions');
  expect(refused.outcome.error?.recovery).not.toContain('省略 artifactId');
  expect(b.blobs.submit).not.toHaveBeenCalled();
  const listing=textOf((await b.invoke('artifact.versions',{artifactId:original.artifactId})).outcome);
  expect(listing.lineages).toEqual([expect.objectContaining({artifactId:original.artifactId,currentVersion:1,pendingOperationId:operationA})]);
 }finally{hold.release();await pending;}
 expect(textOf((await pending).outcome)).toMatchObject({artifactId:original.artifactId,version:2});
 expect(textOf((await b.invoke('artifact.register',revision(2))).outcome)).toMatchObject({artifactId:original.artifactId,version:3});
 expect(textOf((await b.invoke('artifact.read',{artifactId:original.artifactId,version:2})).outcome).text).toBe('版本 A\n');
 expect(textOf((await b.invoke('artifact.read',{artifactId:original.artifactId,version:3})).outcome).text).toBe('版本 B\n');
},20000);

it('copy 目标被另一 operation 占位时返回等待原操作；A 完成后才提示选择未占用路径',async()=>{
 const first=await fixture();first.files.set('chart.png',{bytes:Buffer.from('source-png'),version:1});
 const original=workbenchArtifactSchema.parse(textOf((await first.invoke('artifact.register',{path:'chart.png',mime:'image/png'})).outcome));
 first.files.set('other.png',{bytes:Buffer.from('other-png'),version:1});
 const other=workbenchArtifactSchema.parse(textOf((await first.invoke('artifact.register',{path:'other.png',mime:'image/png'})).outcome));
 const target=await fixture(first.session),input={sourceArtifactId:original.artifactId,sourceVersion:1,targetPath:'copy.png'};
 const competingInput={...input,sourceArtifactId:other.artifactId};
 const hold=target.pauseNextStore(),pending=target.invoke('artifact.copy',input);
 try{
  const operationA=await Promise.race([hold.started,pending.then(()=>{throw new Error('A 未进入待写入阶段');})]);
  const {outcome}=await target.invoke('artifact.copy',competingInput);
  expect(resultOf(outcome)).toMatchObject({status:'failed',error:{code:'artifact_revision_pending',confirmedNoCommit:true,retryable:false,nextAction:'wait'}});
  expect(outcome).toMatchObject({sideEffect:'none',error:{code:'transient',retryable:false}});
  expect(outcome.error?.recovery).toContain(operationA);
  expect(target.blobs.submit).toHaveBeenCalledTimes(1);
 }finally{hold.release();await pending;}
 const after=await target.invoke('artifact.copy',competingInput);
 expect(after.outcome).toMatchObject({sideEffect:'none',error:{code:'invalid_input',retryable:false}});
 expect(target.blobs.submit).toHaveBeenCalledTimes(1);
},20000);
