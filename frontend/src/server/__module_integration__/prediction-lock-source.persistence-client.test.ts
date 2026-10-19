// @vitest-environment node
import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {ENDPOINTS,type Endpoint,type RequestContext} from '@creatoros/contract';
import {aiTasks,aiTaskResults,executionTasks,executionCalls,rubrics,rubricVersions,eq,asc,type Db} from '@creatoros/backend';
const owned=vi.hoisted(()=>({root:'',db:null as Db|null,chat:null as any,model:null as any,errors:[] as any[],ports:[] as any[],scheduling:[] as any[],call:null as null|((name:string,input:any)=>Promise<any>)}));
vi.mock('@creatoros/backend',async original=>{const actual=await original<typeof import('@creatoros/backend')>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const value=await actual.createConfiguredDb(...args);owned.db=value.db;return value;}};});
vi.mock('@creatoros/backend/modules/assets',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/assets')>();return {...actual,migrateStorageRoot:async()=>{throw Error('T1328_MEDIA_MIGRATION_FORBIDDEN');},createLocalFsObjectStorage:(...args:Parameters<typeof actual.createLocalFsObjectStorage>)=>actual.createLocalFsObjectStorage({...args[0],rootPath:path.join(owned.root,'media')},args[1])};});
vi.mock('@/server/activation/client-config.server',async original=>({...await original<typeof import('@/server/activation/client-config.server')>(),readChannelModelAuthority:async()=>({authority:'local'})}));
vi.mock('@creatoros/backend/modules/ai-runtime',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/ai-runtime')>();const status={engine:'codex' as const,installed:true,available:true,version:'0.159.3',defaultModelId:'t1327-fixture-model',availableModels:[{id:'t1327-fixture-model',inputModalities:['text']}],loginStatus:'authenticated' as const,capabilities:{text:true,imageUnderstanding:false,imageGeneration:false,imageEditing:'unavailable' as const}};return {...actual,createLocalCodexStatusService:()=>({read:async()=>structuredClone(status),peek:()=>structuredClone(status),stop:async()=>{}}),createStructuredBusinessExecutionService:(...args:Parameters<typeof actual.createStructuredBusinessExecutionService>)=>{const service=actual.createStructuredBusinessExecutionService(...args);return {...service,async prepare(...input:Parameters<typeof service.prepare>){owned.scheduling.push({kind:'prepare.begin',taskId:input[1]});const result=await service.prepare(...input);owned.scheduling.push({kind:'prepare.complete',taskId:input[1]});return result;}}}};});
vi.mock('@/server/execution-worker-path',async original=>({...await original<typeof import('@/server/execution-worker-path')>(),resolveExecutionWorkerPath:()=>path.resolve('../docs/verification/t1328/runtime/worker-entry.fixture.cjs')}));
vi.mock('@creatoros/backend/modules/execution',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/execution')>();return {...actual,createModelWorkerDispatcher:(...args:Parameters<typeof actual.createModelWorkerDispatcher>)=>{owned.model=actual.createModelWorkerDispatcher(...args);return {...owned.model,start:()=>{owned.scheduling.push({kind:'model.start',at:Date.now()});}};}};});
vi.mock('../../../../backend/src/modules/execution/model-worker-dispatcher',async original=>{const actual=await original<typeof import('../../../../backend/src/modules/execution/model-worker-dispatcher')>();return {...actual,createChatWorkerDispatcher:(...args:Parameters<typeof actual.createChatWorkerDispatcher>)=>{const deps=args[1];const resolveTools='resolveTools' in deps?deps.resolveTools:undefined;const wrapped=resolveTools?{...deps,resolveTools:async(...input:Parameters<NonNullable<typeof resolveTools>>)=>{try{return await resolveTools(...input);}catch(error){const e=error as Error;owned.errors.push({phase:'resolveTools',name:e.name,message:e.message});throw error;}}}:deps;owned.chat=actual.createChatWorkerDispatcher(args[0],wrapped as typeof deps);return {...owned.chat,start:()=>{}};}};});
// 只透传并记录真实host端口；业务准备、父回执、worker及采纳服务没有stub。
vi.mock('../../../../backend/src/modules/execution/worker-supervisor',async original=>{
 const actual=await original<typeof import('../../../../backend/src/modules/execution/worker-supervisor')>();
 return {...actual,createWorkerSupervisor:(options:Parameters<typeof actual.createWorkerSupervisor>[0])=>{
  const supervisor=actual.createWorkerSupervisor({...options,extraEnv:{...options.extraEnv,T1328_FIXTURE_ROOT:owned.root,T1328_RUN_ID:process.env.T1328_RUN_ID!,CODEX_HOME:path.join(owned.root,'empty-codex-home'),TMPDIR:path.join(owned.root,'tmp'),TMP:path.join(owned.root,'tmp'),TEMP:path.join(owned.root,'tmp')},ports:{...options.ports,async invoke(ref,port,input){owned.ports.push({phase:'invoke',port,executionTaskId:ref.executionTaskId,callId:(input as any)?.callId??null});try{return await options.ports.invoke(ref,port,input);}catch(error){const e=error as Error;owned.errors.push({port,executionTaskId:ref.executionTaskId,name:e.name,message:e.message});throw error;}}}});
  return {...supervisor,async start(){try{const capabilities=await supervisor.start();owned.ports.push({phase:'worker.start',capabilities});return capabilities;}catch(error){const e=error as Error;owned.errors.push({phase:'worker.start',name:e.name,message:e.message});throw error;}}};
 }};
});
// TEST ONLY: 精确透传原工具校验，仅保存被dispatcher统一错误码折叠的安全错误。
vi.mock('../../../../backend/src/modules/execution/execution-chat-tool-ports.service',async original=>{
 const actual=await original<typeof import('../../../../backend/src/modules/execution/execution-chat-tool-ports.service')>();
 return {...actual,async readExecutionChatTask(...args:Parameters<typeof actual.readExecutionChatTask>){try{return await actual.readExecutionChatTask(...args);}catch(error){const e=error as Error;owned.errors.push({phase:'readExecutionChatTask',name:e.name,message:e.message});throw error;}},createExecutionChatToolPorts:(...args:Parameters<typeof actual.createExecutionChatToolPorts>)=>{
  const ports=actual.createExecutionChatToolPorts(...args);return {...ports,async validateTask(...input:Parameters<typeof ports.validateTask>){try{return await ports.validateTask(...input);}catch(error){const e=error as Error;owned.errors.push({phase:'validateTask',name:e.name,message:e.message});throw error;}}};
 }};
});
import {compositeTransport,getChatRuntime,getIdentityService,__resetPersistenceForTests} from '@/server/persistence-client';

vi.mock('next/navigation',()=>({useRouter:()=>({refresh(){},push(){},replace(){}})}));
// 仅把浏览器HTTP transport透传到同一compositeTransport；不伪造任何业务响应。
vi.mock('@/lib/contract-client',()=>({client:new Proxy({}, {get(_target,name){return (input:unknown)=>{if(!owned.call)throw Error('T1328_CLIENT_NOT_BOUND');return owned.call(String(name),input);};}})}));
const runtime=path.resolve('../docs/verification/t1328/runtime');
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const save=(name:string,value:unknown)=>fs.writeFileSync(path.join(owned.root,name+'.json'),JSON.stringify(value,null,2)+'\n');
it('原聊天诊断卡真实公共锁定与重新挂载：只能锁原source subject并恢复具体预测',async()=>{
 expect(process.env.T1328_APPROVED).toBe('1');const label=process.env.T1328_RUN_LABEL!;expect(/^(red|green)(-[a-zA-Z0-9]+)*$/.test(label)).toBe(true);
 owned.root=path.join(runtime,'cases',label);expect(fs.existsSync(path.join(owned.root,'START.json'))).toBe(false);
 for(const dir of ['','tmp','media','empty-codex-home'])fs.mkdirSync(path.join(owned.root,dir),{recursive:true});
 save('START',{label,at:new Date().toISOString(),externalModels:0,scope:'真实API/chat→生产worker/host→正式rubric候选→原组件click→确认/预测锁→原组件重挂载；仅外部Codex I/O替身与浏览器transport内存透传'});
 for(const [key,value] of Object.entries({DATABASE_URL:'',PGLITE_DATA_DIR:path.join(owned.root,'db'),CREATOROS_MASTER_KEY_FD:'',CREATOROS_MASTER_KEY_FILE:'',CREATOROS_MASTER_KEY:randomBytes(32).toString('base64'),CREATOROS_STORAGE:'local',CREATOROS_MEDIA_ROOT:path.join(owned.root,'media'),CREATOROS_DISABLE_BACKGROUND_DRIVERS:'1',CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_CLIENT_CONFIG_PULL_ENABLED:'0',CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH:path.join(owned.root,'missing-seed')}))vi.stubEnv(key,value);
 const nonce=randomBytes(32).toString('hex');vi.stubEnv('CREATOROS_SIDECAR_HANDSHAKE_TOKEN',nonce);vi.stubEnv('CREATOROS_HANDSHAKE_REQUIRED','1');
 __resetPersistenceForTests();let ctx:RequestContext={userId:'uninitialized',accountId:null,requestId:'t1328-owned',source:'user'},rootTaskId='',conversationId='',sourceMessageId='',projectId='',outputId='';let dom:any,view:any,testing:any,React:any;const globalBefore=new Map<string,PropertyDescriptor|undefined>();const requests:Array<{name:string;input:unknown}>=[];
 const call=async(endpoint:Endpoint,input:any={})=>(await compositeTransport.request(endpoint,input,ctx) as {data:any}).data;
 const state=async()=>({tasks:await call(ENDPOINTS.listAITasks,{query:{page:1,pageSize:100}}),predictions:await call(ENDPOINTS.listPredictions,{query:{page:1,pageSize:100}}),outputs:await call(ENDPOINTS.listOutputs,{params:{projectId},query:{page:1,pageSize:100}})});
 try{
  const binding=JSON.parse(fs.readFileSync(path.join(runtime,'WORKER_BINDING.json'),'utf8'));expect(sha(fs.readFileSync(binding.executionWorkerPath))).toBe(binding.sha256);
  const actual=await getChatRuntime();ctx={...await(await getIdentityService()).resolveLocalContext(),accountId:null};
  const group=await call(ENDPOINTS.createAccountGroup,{body:{name:'原卡盲预测隔离组',idempotencyKey:'t1328-owned-group'}});ctx={...ctx,groupId:group.id,groupVersion:group.version};
  const routing=await call(ENDPOINTS.getModelRouting);await call(ENDPOINTS.putModelRouting,{body:{schemaVersion:1,expectedRevision:routing.revision,choices:{text:'codex',vision:'official',image:'official',video:'official',audio:'official',embed:'official'}}});
  const project=await call(ENDPOINTS.createProject,{body:{title:'桌面记录',brief:'一只杯子和一本笔记本，留出记录位置。'}});projectId=project.id;
  const master=await call(ENDPOINTS.createArtifact,{params:{projectId},body:{title:'正式母稿',artifactType:'master_script',stage:'script'}});
  const masterVersion=await call(ENDPOINTS.createArtifactVersion,{params:{artifactId:master.id},body:{contentText:'先放稳杯子，再把合上的笔记本移开，给记录留一小块空白。',contentData:{},changeSummary:'用户正式保存'}});
  const output=await call(ENDPOINTS.createOutput,{params:{projectId},body:{title:'原诊断选中的视频',contentType:'video',clientRequestId:'t1328-original-output'}});outputId=output.id;
  const conversation=await call(ENDPOINTS.createConversation,{body:{title:'当前稿盲预测',scope:'project:'+projectId,projectId}});conversationId=conversation.id;
  const instruction='对已选视频及项目中保存的真实稿件做编导诊断，只给候选，不自动锁预测。';save('scenario',{title:output.title,instruction});
  const {POST}=await import('@/app/api/chat/route');
  const response=await POST(new Request('http://127.0.0.1/api/chat',{method:'POST',headers:{'content-type':'application/json','x-creatoros-handshake':nonce,'x-group-id':ctx.groupId!},body:JSON.stringify({executionEngine:'codex',conversationId,chatContext:{surface:'project',functionKey:'calibration.diagnose',projectId,scope:'project:'+projectId,selection:{kind:'content_output',ids:[outputId],label:output.title}},messages:[{id:'local-user-instruction',role:'user',parts:[{type:'text',text:instruction}]}]})}));
  rootTaskId=response.headers.get('x-ai-task-id')??'';sourceMessageId=response.headers.get('x-source-message-id')??'';save('CHAT_HTTP_SUBMISSION',{status:response.status,rootTaskId,sourceMessageId,conversationId,projectId,outputId,master,masterVersion});expect(response.status).toBe(200);expect(rootTaskId).toBeTruthy();expect(sourceMessageId).toBeTruthy();
  const stream=response.text();await owned.chat.drainOnce();save('chat-stream',{text:await stream});
  const original=await call(ENDPOINTS.getTask,{params:{taskId:rootTaskId}});expect(original.status).toBe('succeeded');
  const messages=await call(ENDPOINTS.listMessages,{params:{conversationId}});save('ORIGINAL_SAVED_MESSAGES',messages);
  const parts=messages.flatMap((m:any)=>m.role==='assistant'&&Array.isArray(m.parts)?m.parts:[]);
  const part=parts.find((p:any)=>p.output?.kind==='calibration.diagnosis');expect(part,'必须有真实已保存诊断tool part，不能凭fixture捏卡').toBeTruthy();expect(part.toolCallId).toBeTruthy();
  const source={conversationId,sourceMessageId,toolCallId:part.toolCallId};const before=await state();save('BEFORE_CARD_CLICK',{source,state:before,part});
  const readSource=()=>call(ENDPOINTS.readPredictionLockSource,{params:{conversationId},query:{sourceMessageId,toolCallId:source.toolCallId}});
  const pureBefore={state:await state(),rubrics:await owned.db!.select().from(rubrics),versions:await owned.db!.select().from(rubricVersions),root:await owned.db!.select().from(aiTasks).where(eq(aiTasks.id,rootTaskId)),calls:await owned.db!.select().from(executionCalls)};
  const available=await readSource();save('AVAILABLE_SOURCE',available);
  expect(available.status).toBe('available');expect(available.subjectId).toBe(outputId);expect(available.baseline).toMatchObject({artifactId:master.id,versionId:masterVersion.id});
  expect({state:await state(),rubrics:await owned.db!.select().from(rubrics),versions:await owned.db!.select().from(rubricVersions),root:await owned.db!.select().from(aiTasks).where(eq(aiTasks.id,rootTaskId)),calls:await owned.db!.select().from(executionCalls)}).toEqual(pureBefore);
  await expect(call(ENDPOINTS.createAITask,{body:{taskType:'calibration.diagnose',attemptId:'t1328-forged-public-attempt',inputData:{subjectType:'content_output',subjectId:outputId,predictionLockSource:{policyVersion:1,rootTaskId,toolCallId:source.toolCallId,intentDigest:'forged'}}}})).rejects.toThrow();
  await expect(call(ENDPOINTS.startPredictionLock,{params:{conversationId},body:{sourceMessageId,toolCallId:source.toolCallId,policyVersion:1,expectedBaselineDigest:'sha256:stale'}})).rejects.toThrow();
  await expect(call(ENDPOINTS.readPredictionLockSource,{params:{conversationId},query:{sourceMessageId,toolCallId:'foreign-card'}})).rejects.toThrow();
  expect(await state()).toEqual(pureBefore.state);
  save('PURE_GET_AND_REJECTED_INPUTS',{available,taskCount:pureBefore.state.tasks.length,externalModels:0,sourceWrites:0,forgedPublicInputRejected:true,staleBaselineRejected:true,foreignToolRejected:true});
  const {JSDOM}=await import('jsdom');dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://127.0.0.1/'});
  for(const [k,v] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,MutationObserver:dom.window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true})){globalBefore.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}
  dom.window.localStorage.setItem('creatoros:current-group',ctx.groupId!);
  dom.window.localStorage.setItem('creatoros:current-account','unrelated-platform-filter-must-not-be-sent');
  dom.window.__CREATOROS_HANDSHAKE_TOKEN__=nonce;
  const {POST:dispatchPost}=await import('@/app/api/v1/dispatch/route');
  globalBefore.set('fetch',Object.getOwnPropertyDescriptor(globalThis,'fetch'));
  Object.defineProperty(globalThis,'fetch',{configurable:true,writable:true,value:async(input:RequestInfo|URL,init:RequestInit={})=>{
   const url=new URL(String(input),'http://127.0.0.1');if(url.pathname!=='/api/v1/dispatch')throw Error('T1328_UNEXPECTED_BROWSER_FETCH');
   const headers=new Headers(init.headers),body=JSON.parse(String(init.body)),entry=Object.entries(ENDPOINTS).find(([,endpoint])=>endpoint.id===body.id);
   if(!entry)throw Error('T1328_UNKNOWN_DISPATCH_OPERATION');
   const [name]=entry;requests.push({name,input:body.input});
   expect(headers.get('x-group-id')).toBe(ctx.groupId);expect(headers.has('x-account-id')).toBe(false);expect(headers.get('x-creatoros-handshake')).toBe(nonce);
   // 受控推进明确在GET之前独立发生；GET本体仍走真实HTTP route/nonce/归属/transport，不stub业务值。
   if(['getTask','readPredictionLockSource'].includes(name)&&owned.model){owned.scheduling.push({kind:'controlled-drain.begin',beforeRead:name});await owned.model.drainOnce();owned.scheduling.push({kind:'controlled-drain.complete',beforeRead:name});}
   const response=await dispatchPost(new Request(url,{...init,headers}));
   owned.scheduling.push({kind:'browser-http',operation:body.id,status:response.status,groupId:headers.get('x-group-id'),accountHeaderPresent:headers.has('x-account-id'),handshakePresent:headers.has('x-creatoros-handshake')});
   return response;
  }});
  React=await import('react');testing=await import('@testing-library/react/pure');const {ChatDiagnosisCard}=await import('@/features/copilot/chat-result-cards');
  owned.call=async(name,input)=>{requests.push({name,input});if(['getTask','readPredictionLockSource'].includes(name)&&owned.model){owned.scheduling.push({kind:'controlled-drain.begin',beforeRead:name});await owned.model.drainOnce();owned.scheduling.push({kind:'controlled-drain.complete',beforeRead:name});}const endpoint=(ENDPOINTS as any)[name];if(!endpoint)throw Error('T1328_UNKNOWN_CLIENT_METHOD_'+name);return call(endpoint,input);};
  // 复现原页面VM无output，但原message selection明确outputId；新实现应消费source而非再建output。
  const props={diagnosis:part.output.diagnosis,pollIntervalMs:0,blindPredict:{outputId:null,projectId,projectTitle:project.title,source}};
  view=testing.render(React.createElement(ChatDiagnosisCard,props));
  await testing.waitFor(()=>expect((testing.screen.getByText('锁定为盲预测') as HTMLButtonElement).disabled).toBe(false),{timeout:120000});
  await testing.act(async()=>testing.fireEvent.click(testing.screen.getByText('锁定为盲预测')));
  await testing.waitFor(()=>expect(testing.screen.getByText('已锁定 · 不可改')).toBeTruthy(),{timeout:120000});
  const after=await state();save('AFTER_FIRST_LOCK',{state:after,requests,html:dom.window.document.body.innerHTML});
  expect(after.predictions).toHaveLength(1);expect(after.predictions[0].status).toBe('locked');
  expect.soft(after.predictions[0].subjectId,'原卡不能另建subject偏离原source selection').toBe(outputId);
  expect.soft(after.outputs,'一次盲预测锁定不能额外新建content_output').toEqual(before.outputs);
  const locked=await readSource();expect(locked.status).toBe('locked');expect(locked.predictionId).toBe(after.predictions[0].id);expect(locked.subjectId).toBe(outputId);expect(locked.baseline).toEqual(available.baseline);
  const replayBody={sourceMessageId,toolCallId:source.toolCallId,policyVersion:1,expectedBaselineDigest:available.baselineDigest};
  const replays=await Promise.all([call(ENDPOINTS.startPredictionLock,{params:{conversationId},body:replayBody}),call(ENDPOINTS.startPredictionLock,{params:{conversationId},body:replayBody})]);expect(replays).toEqual([locked,locked]);
  await call(ENDPOINTS.confirmTask,{params:{taskId:locked.diagnoseTaskId}});expect(await readSource()).toEqual(locked);expect(await state()).toEqual(after);
  const child=await call(ENDPOINTS.getTask,{params:{taskId:locked.diagnoseTaskId}});const [frozen]=await owned.db!.select().from(executionTasks).where(eq(executionTasks.id,child.executionTaskId));
  expect((frozen.payload as any).modelInput.facets.script).toBe('先放稳杯子，再把合上的笔记本移开，给记录留一小块空白。');
  expect(owned.scheduling.some(x=>x.kind==='prepare.complete'&&x.taskId===locked.diagnoseTaskId)).toBe(true);expect(owned.scheduling.some(x=>x.kind==='model.start')).toBe(true);
  save('LOCKED_EXACT_RECEIPT',{locked,replays,formalFrozenSubject:JSON.parse((frozen.payload as any).modelInput.facets.__calibrationDiagnosis),formalScript:(frozen.payload as any).modelInput.facets.script,scheduling:owned.scheduling,uiClicks:1,confirmReplays:1,schedulerBoundary:'真实prepare/owner.start记录；start定时器被noop，worker由显式drain受控推进，非自然后台调度证明'});
  view.unmount();const beforeRemount=await state(),writesBefore=requests.filter(x=>!['getTask','getPrediction','listPredictions','readPredictionLockSource'].includes(x.name)).length;
  view=testing.render(React.createElement(ChatDiagnosisCard,props));
  // 确保观察真实重新挂载状态；旧实现静态idle会自然触发目标红，不发第二次锁点击。
  await testing.waitFor(()=>expect(testing.screen.getByText('已锁定 · 不可改')).toBeTruthy(),{timeout:120000});
  const restored=await state();save('RESTORED',{state:restored,requests,html:dom.window.document.body.innerHTML});expect(restored).toEqual(beforeRemount);expect(requests.filter(x=>!['getTask','getPrediction','listPredictions','readPredictionLockSource'].includes(x.name))).toHaveLength(writesBefore);
  // 以下仅隔离库的删除/篡改故障注入，不伪称用户操作或历史旧库恢复。
  view.unmount();view=null;
  const [originalChild]=await owned.db!.select().from(aiTasks).where(eq(aiTasks.id,locked.diagnoseTaskId));
  const originalResults=await owned.db!.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,locked.diagnoseTaskId));
  const originalResult=originalResults.find(row=>row.id===locked.resultId)!;expect(originalResult).toBeTruthy();
  const [originalRoot]=await owned.db!.select().from(aiTasks).where(eq(aiTasks.id,rootTaskId));
  const originalCalls=await owned.db!.select().from(executionCalls);
  await owned.db!.delete(aiTaskResults).where(eq(aiTaskResults.id,locked.resultId));
  const missingResult=await readSource();expect(missingResult).toMatchObject({status:'missing',diagnoseTaskId:locked.diagnoseTaskId,resultId:locked.resultId,predictionId:locked.predictionId});
  expect(await call(ENDPOINTS.startPredictionLock,{params:{conversationId},body:replayBody})).toEqual(missingResult);
  await owned.db!.insert(aiTaskResults).values(originalResult);
  await owned.db!.update(aiTaskResults).set({resultData:{...originalResult.resultData as object,predictionLockReceipt:{...(originalResult.resultData as any).predictionLockReceipt,predictionId:'tampered-prediction'}}}).where(eq(aiTaskResults.id,locked.resultId));
  await expect(readSource()).rejects.toThrow();
  await owned.db!.update(aiTaskResults).set({resultData:originalResult.resultData}).where(eq(aiTaskResults.id,locked.resultId));
  const foreignResultId='t1328-explicit-foreign-result-fixture';
  await owned.db!.insert(aiTaskResults).values({...originalResult,id:foreignResultId,aiTaskId:rootTaskId,executionCallId:null});
  const rootRuntime=originalRoot.runtimeData as any;
  await owned.db!.update(aiTasks).set({runtimeData:{...rootRuntime,predictionLocks:{...rootRuntime.predictionLocks,[source.toolCallId]:{...rootRuntime.predictionLocks[source.toolCallId],resultId:foreignResultId}}}}).where(eq(aiTasks.id,rootTaskId));
  await expect(readSource()).rejects.toThrow();
  await owned.db!.update(aiTasks).set({runtimeData:originalRoot.runtimeData}).where(eq(aiTasks.id,rootTaskId));
  await owned.db!.delete(aiTaskResults).where(eq(aiTaskResults.id,foreignResultId));
  await owned.db!.delete(aiTasks).where(eq(aiTasks.id,locked.diagnoseTaskId));
  const missingChild=await readSource();expect(missingChild).toMatchObject({status:'missing',diagnoseTaskId:locked.diagnoseTaskId,resultId:locked.resultId,predictionId:locked.predictionId});
  expect(await call(ENDPOINTS.startPredictionLock,{params:{conversationId},body:replayBody})).toEqual(missingChild);
  await owned.db!.insert(aiTasks).values(originalChild);
  for(const row of originalResults){if(!(await owned.db!.select({id:aiTaskResults.id}).from(aiTaskResults).where(eq(aiTaskResults.id,row.id))).length)await owned.db!.insert(aiTaskResults).values(row);}
  expect(await readSource()).toEqual(locked);expect(await state()).toEqual(restored);expect(await owned.db!.select().from(executionCalls)).toEqual(originalCalls);
  save('DELETION_AND_TAMPER_BOUNDARIES',{scope:'隔离库故障注入；每个字段/行原样恢复，不是用户操作/旧业务库迁移',missingResult,missingChild,malformedReceiptRejected:true,foreignResultRejected:true,originalReceiptRestored:true,modelCallsUnchanged:true,newTasksSubmitted:0});
  save('RESULT',{status:'CONTROLLED_PUBLIC_SOURCE_LOCK_AND_RESTORE_PASSED',rootTaskId,source,predictionId:after.predictions[0].id,externalModels:0,secondLockClicks:0});
 }catch(error){save('FAILURE',{name:(error as Error).name,message:(error as Error).message,rootTaskId,conversationId,sourceMessageId,projectId,outputId,requests,errors:owned.errors,ports:owned.ports,html:dom?.window.document.body.innerHTML??null});throw error;}
 finally{
  if(owned.db)try{
   const tasks=await owned.db.select({id:aiTasks.id,taskType:aiTasks.taskType,inputData:aiTasks.inputData,status:aiTasks.status,modelKey:aiTasks.modelKey,executionTaskId:aiTasks.executionTaskId}).from(aiTasks);
   const executions=await owned.db.select({id:executionTasks.id,ownerId:executionTasks.ownerId,status:executionTasks.status,payload:executionTasks.payload,lastErrorCode:executionTasks.lastErrorCode}).from(executionTasks);
   const calls=await owned.db.select({id:executionCalls.id,executionTaskId:executionCalls.executionTaskId,parentCallId:executionCalls.parentCallId,kind:executionCalls.kind,operationKey:executionCalls.operationKey,status:executionCalls.status,totalTokens:executionCalls.totalTokens,resultText:executionCalls.resultText}).from(executionCalls);
   save('FINAL_LEDGER_PROJECTION',{tasks,executions,calls,errors:owned.errors,ports:owned.ports});
  }catch(error){save('LEDGER_READ_ERROR',{name:(error as Error).name});}
  const cleanup:any[]=[];const attempt=async(action:string,fn:(()=>unknown)|undefined)=>{if(!fn){cleanup.push({action,status:'NOT_AVAILABLE'});return;}try{await fn();cleanup.push({action,status:'COMPLETED'});}catch(e){cleanup.push({action,status:'REJECTED',name:(e as Error).name});}};
  await attempt('ui.unmount',view?()=>view.unmount():undefined);await attempt('ui.cleanup',testing?()=>testing.cleanup():undefined);owned.call=null;
  await attempt('chat.stop',owned.chat?()=>owned.chat.stop():undefined);await attempt('model.stop',owned.model?()=>owned.model.stop():undefined);const dispose=(globalThis as any).__creatorosDisposePersistence;await attempt('persistence.dispose',typeof dispose==='function'?dispose:undefined);await attempt('persistence.reset',()=>__resetPersistenceForTests());await attempt('environment.unstub',()=>vi.unstubAllEnvs());
  for(const [k,d]of globalBefore){if(d)Object.defineProperty(globalThis,k,d);else delete(globalThis as any)[k];}await attempt('dom.close',dom?()=>dom.window.close():undefined);save('CLEANUP',{actions:cleanup,sharedCandidateTouched:false,externalModels:0});expect.soft(cleanup.filter(x=>x.status==='REJECTED')).toEqual([]);
 }
},28800000);
