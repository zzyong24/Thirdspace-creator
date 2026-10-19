// @vitest-environment node
import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ENDPOINTS,type Endpoint,type RequestContext} from '@creatoros/contract';
import {aiTasks,aiTaskResults,aiMessages,executionTasks,executionCalls,executionStreamEvents,eq,asc,type Db} from '@creatoros/backend';
const owned=vi.hoisted(()=>({root:'',db:null as Db|null,host:null as any,errors:[] as any[],ports:[] as any[],tools:null as any,makeHost:null as any,stopExecution:null as any,observe:null as any,lastRef:null as any,caseName:'',crashed:false,directInvoke:null as any}));
vi.mock('@creatoros/backend',async original=>{const actual=await original<typeof import('@creatoros/backend')>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const opened=await actual.createConfiguredDb(...args);owned.db=opened.db;return opened;}};});
vi.mock('@creatoros/backend/modules/assets',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/assets')>();return {...actual,migrateStorageRoot:async()=>{throw Error('T1323_USER_MEDIA_MIGRATION_FORBIDDEN');},createLocalFsObjectStorage:(...args:Parameters<typeof actual.createLocalFsObjectStorage>)=>actual.createLocalFsObjectStorage({...args[0],rootPath:path.join(owned.root,'media')},args[1])};});
vi.mock('@/server/activation/client-config.server',async original=>({...await original<typeof import('@/server/activation/client-config.server')>(),readChannelModelAuthority:async()=>({authority:'local'})}));
// 唯一供应商可用性边界是合成Codex安装/模型列表；不访问用户认证。
vi.mock('@creatoros/backend/modules/ai-runtime',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/ai-runtime')>();const status={engine:'codex' as const,installed:true,available:true,version:'0.159.3',defaultModelId:'t1323-fixture-model',availableModels:[{id:'t1323-fixture-model',inputModalities:['text']}],loginStatus:'authenticated' as const,capabilities:{text:true,imageUnderstanding:false,imageGeneration:false,imageEditing:'unavailable' as const}};return {...actual,createLocalCodexStatusService:()=>({read:async()=>structuredClone(status),peek:()=>structuredClone(status),stop:async()=>{}})};});
vi.mock('@/server/execution-worker-path',async original=>({...await original<typeof import('@/server/execution-worker-path')>(),resolveExecutionWorkerPath:()=>path.resolve('../docs/verification/t1323/runtime/round3/worker-entry.fixture.cjs')}));
vi.mock('../../../../backend/src/modules/execution/model-worker-dispatcher',async original=>{const actual=await original<typeof import('../../../../backend/src/modules/execution/model-worker-dispatcher')>();return {...actual,createChatWorkerDispatcher:(...args:Parameters<typeof actual.createChatWorkerDispatcher>)=>{const original=args[1] as any;const deps={...original,resolveTools:async(...input:any[])=>{const tools=await original.resolveTools(...input);owned.tools=tools;return tools;}};owned.makeHost=()=>actual.createChatWorkerDispatcher(args[0],deps);const host=owned.makeHost();owned.host=host;return {...host,start:()=>{}};}};});
// 透明观察原host invoke，原validate/节点/账本/投影均不替换。
vi.mock('../../../../backend/src/modules/execution/worker-supervisor',async original=>{const actual=await original<typeof import('../../../../backend/src/modules/execution/worker-supervisor')>();return {...actual,createWorkerSupervisor:(options:Parameters<typeof actual.createWorkerSupervisor>[0])=>{owned.directInvoke=options.ports.invoke.bind(options.ports);const supervisor=actual.createWorkerSupervisor({...options,extraEnv:{...options.extraEnv,T1323_FIXTURE_ROOT:owned.root,CODEX_HOME:path.join(owned.root,'empty-codex-home'),TMPDIR:path.join(owned.root,'tmp'),TEMP:path.join(owned.root,'tmp'),TMP:path.join(owned.root,'tmp')},ports:{...options.ports,async invoke(ref,port,input){owned.ports.push({phase:'invoke',port,attempt:ref.attempt,callId:(input as any)?.callId??null});try{owned.lastRef=ref;await owned.observe?.('before',ref,port);if(owned.caseName.startsWith('recovery')&&port==='settleExternalChatTurn'&&!owned.crashed){owned.crashed=true;await owned.stopExecution(ref);return undefined;}const result=await options.ports.invoke(ref,port,input);await owned.observe?.('after',ref,port);owned.ports.push({phase:'receipt',port,attempt:ref.attempt,callId:(result as any)?.callId??null,status:(result as any)?.status??null});return result;}catch(error){const e=error as Error;owned.errors.push({port,attempt:ref.attempt,callId:(input as any)?.callId??null,name:e.name,message:e.message,stack:(e.stack??'').split('\n').filter((x,i)=>i===0||x.includes('/backend/src/')).slice(0,12)});throw error;}}}});owned.stopExecution=(ref:any)=>supervisor.stopExecutionTree(ref);return supervisor;}};});
import {compositeTransport,getChatRuntime,__resetPersistenceForTests} from '@/server/persistence-client';
import {createChatToolStreamProjection} from '../../../../backend/src/modules/execution/chat-tool-stream-projection.service';
import {createExternalChatTurnService} from '../../../../backend/src/modules/ai/external-chat-turn.service';
import {createAgenticToolBinding} from '../../../../backend/src/modules/execution/agentic-tool-binding';
import {canonicalDataset} from '@/fixtures/canonical';
const runtime=path.resolve('../docs/verification/t1323/runtime/round3');
const hash=(x:unknown)=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const save=(name:string,value:unknown)=>fs.writeFileSync(path.join(owned.root,name+'.json'),JSON.stringify(value,null,2)+'\n');
const scenarios:Record<string,string[]>={main:['system_features','topic_generate'],reverse:['topic_generate','system_features'],interleaved:['system_features','topic_generate','system_features','topic_generate'],'proposal-before':['system_action_propose','system_features','topic_generate'],'proposal-after':['system_features','topic_generate','system_action_propose'],duplicate:['system_features','topic_generate','system_features','topic_generate'],integrity:['system_features','topic_generate','system_features','topic_generate'],recovery:['system_features','topic_generate'],'recovery-ordinary':['topic_generate']};
const selected=(process.env.T1323_CASES??'recovery').split(',');
it.each(selected)('完整公开v2混流 %s',async name=>{
 const sequence=scenarios[name];expect(sequence).toBeDefined();
 owned.root=path.join(runtime,'cases',process.env.T1323_RUN_ID??'unbound',name);fs.mkdirSync(owned.root,{recursive:true});fs.mkdirSync(path.join(owned.root,'tmp'),{recursive:true});fs.mkdirSync(path.join(owned.root,'empty-codex-home'),{recursive:true});
 owned.errors=[];owned.ports=[];owned.host=null;owned.db=null;owned.tools=null;owned.observe=null;owned.caseName=name;owned.crashed=false;
 const binding=JSON.parse(fs.readFileSync(path.join(runtime,'WORKER_BINDING.json'),'utf8')),bytes=fs.readFileSync(binding.executionWorkerPath);expect(bytes.length).toBe(binding.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(binding.sha256);
 const callIds=name==='duplicate'?['same-host','same-topic','same-host','same-topic']:sequence.map((_,i)=>'fixture-tool-'+i);save('scenario',{name,sequence,callIds,kind:'normal',realExternalModels:0});
 for(const [key,value] of Object.entries({DATABASE_URL:'',PGLITE_DATA_DIR:path.join(owned.root,'db'),CREATOROS_STORAGE:'local',CREATOROS_MEDIA_ROOT:path.join(owned.root,'media'),CREATOROS_DISABLE_BACKGROUND_DRIVERS:'1',CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_CLIENT_CONFIG_PULL_ENABLED:'0',CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH:path.join(owned.root,'missing-seed')}))vi.stubEnv(key,value);
 __resetPersistenceForTests();let ctx:RequestContext={userId:canonicalDataset.user.id,accountId:null,requestId:'t1323-owned',source:'user'};let taskId='';
 async function call(endpoint:Endpoint,body?:unknown,params?:unknown,query?:unknown){return (await compositeTransport.request(endpoint,{body,params,query} as never,ctx) as {data:any}).data;}
 const snapshot=async(label:string)=>{if(!owned.db||!taskId)return;const db=owned.db;const [business]=await db.select().from(aiTasks).where(eq(aiTasks.id,taskId));const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,business!.executionTaskId!));const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task!.id)).orderBy(asc(executionCalls.sequence));const events=await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,task!.id)).orderBy(asc(executionStreamEvents.sequence));const messages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,(business!.inputData as any).conversationId));const results=await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,taskId));const value={label,business,task:{...task,fenceToken:task?.fenceToken?hash(task.fenceToken):null},calls,events,messages,results,firstThrow:owned.errors[0]??null,errors:owned.errors,ports:owned.ports};save(label,value);return value;};
 let integrityDone=false,checkpointGuardsDone=false;
 owned.observe=async(phase:string,ref:any,port:string)=>{
  if(name.startsWith('recovery')&&phase==='before'&&port==='readCheckpoint'&&ref.attempt===2&&process.env.T1323_GUARDS==='1'&&!checkpointGuardsDone){
   checkpointGuardsDone=true;
   const before=(await snapshot('attempt2-before-checkpoint-guards'))!;
   expect(before.task.status).toBe('running');expect(before.task.attempt).toBe(2);
   expect(Date.parse(before.task.leaseExpiresAt!)).toBeGreaterThan(Date.now());
   const db=owned.db!,root=before.calls.find(c=>c.kind==='external_agent')!,host=before.calls.find(c=>c.kind==='external_tool')!,ordinary=before.calls.find(c=>c.kind==='tool')!,child=before.calls.find(c=>c.kind==='model')!;
   expect(root.status).toBe('unknown');expect(host.accountingBasis).toBe('requests');expect(host.totalTokens).toBeNull();
   const read=()=>owned.directInvoke(ref,'readCheckpoint',{}),sequence=before.calls.at(-1)!.sequence;
   const baseline=await read();save('checkpoint-valid-unknown-baseline',baseline);
   expect(baseline.spentTokens).toBeNull();expect(baseline.recovery).toBe('requires_reconciliation');
   expect(baseline.knownSpentTokens).toBe(before.calls.reduce((n,c)=>n+(c.totalTokens??0),0));
   expect(baseline.childCalls).toHaveLength(before.calls.filter(c=>c.parentCallId!==null).length);
   expect(baseline.pendingCalls.some((c:any)=>c.callId===root.id&&c.status==='unknown')).toBe(true);
   expect(baseline.messages).toEqual([]);
   expect(await owned.directInvoke(ref,'saveCheckpoint',{expectedRevision:0,expectedLedgerSequence:sequence,messages:[]})).toEqual({revision:1});
   const taskAfterSave=(await db.select().from(executionTasks).where(eq(executionTasks.id,before.task.id)))[0]!;
   const originalPayload=taskAfterSave.payload,proofs=structuredClone((originalPayload as any).externalToolInputs),hostProof=proofs[host.id];
   const mutatePayload=async(change:(payload:any)=>void)=>{const payload=structuredClone(originalPayload);change(payload);await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,before.task.id));};
   const mutateCall=(id:string,values:any)=>db.update(executionCalls).set(values).where(eq(executionCalls.id,id));
   const restores=async()=>{
    await db.delete(executionCalls).where(eq(executionCalls.id,'t1323-controlled-second-root'));
    for(const call of before.calls)await db.update(executionCalls).set(call).where(eq(executionCalls.id,call.id));
    await db.update(executionTasks).set({payload:originalPayload,checkpoint:taskAfterSave.checkpoint}).where(eq(executionTasks.id,before.task.id));
   };
   const cases:Array<[string,string,()=>Promise<unknown>]>=[
    ['wrong-root-parent','外部聊天回执引用无效',()=>mutateCall(root.id,{parentCallId:root.id})],
    ['unknown-kind','外部聊天混入未授权调用树',()=>mutateCall(host.id,{kind:'t1323-unknown-kind'})],
    ['host-wrong-parent','外部短读工具归属无效',()=>mutateCall(host.id,{parentCallId:ordinary.id})],
    ['child-wrong-parent','外部聊天子模型缺少原工具',()=>mutateCall(child.id,{parentCallId:root.id})],
    ['missing-native-turn','混合工具账本缺少真实Codex回合',()=>mutatePayload(p=>{delete p.codexCalls[root.id].turnId;})],
    ['missing-host-proof','原生检查点Host参数证明缺失',()=>mutatePayload(p=>{delete p.externalToolInputs[host.id];})],
    ['host-proof-call','原生检查点Host冻结定义或参数证明不符',()=>mutatePayload(p=>{p.externalToolInputs[host.id].callId='foreign-call';})],
    ['host-version','原生检查点Host冻结定义或参数证明不符',()=>mutateCall(host.id,{providerResult:{...(host.providerResult as any),toolVersion:'t1323-foreign-version'}})],
    ['host-digest','原生检查点Host冻结定义或参数证明不符',()=>mutateCall(host.id,{inputDigest:'sha256:'+'f'.repeat(64)})],
    ['host-original-input','原生检查点Host摘要或调用键不符',()=>mutatePayload(p=>{p.externalToolInputs[host.id].input={unexpected:1};})],
    ['host-operation-key','原生检查点Host摘要或调用键不符',()=>mutateCall(host.id,{operationKey:'t1323-wrong-key'})],
    ['host-receipt-effect','原生检查点Host回执效果不符',async()=>{const outcome=JSON.parse(host.resultText!);outcome.sideEffect='committed';await mutateCall(host.id,{resultText:JSON.stringify(outcome)});}],
    ['root-original-digest','原生检查点缺少原线程只读恢复证明',()=>mutateCall(root.id,{inputDigest:'f'.repeat(64)})],
    ['ordinary-original-digest','外部聊天子模型没有冻结Codex身份',()=>mutateCall(ordinary.id,{inputDigest:'sha256:'+'f'.repeat(64)})],
    ['child-native-receipt','子模型已结算回执缺少真实Codex线程回合',async()=>{const receipt=structuredClone(child.providerResult) as any;receipt.providerMetadata.codex.turnId='wrong-native-turn';await mutateCall(child.id,{providerResult:receipt});}],
    ['duplicate-native-root','原生检查点缺少唯一外部根',()=>db.insert(executionCalls).values({...root,id:'t1323-controlled-second-root',sequence:sequence+1,operationKey:'t1323-second-root'})],
    ['duplicate-tool-id','原生检查点工具调用ID重复',async()=>{
     const native=(originalPayload as any).codexCalls[root.id],part=Object.values(native.tools)[0] as any,id=part.toolCallId;
     const identity={...(host.providerResult as any),toolCallId:id},proof={...hostProof,toolCallId:id};
     const {chatInputDigest}=await import('../../../../backend/src/modules/ai/chat-turn-submission.service');
     const digest='sha256:'+chatInputDigest({turnCallId:root.id,toolCallId:id,toolName:identity.toolName,version:identity.toolVersion,input:proof.input});
     proof.inputDigest=digest;
     await mutateCall(host.id,{providerResult:identity,inputDigest:digest,operationKey:'external-tool:'+createHash('sha256').update(JSON.stringify([root.id,id])).digest('hex')});
     await mutatePayload(p=>{p.externalToolInputs[host.id]=proof;});
    }],
   ];
   if(process.env.T1323_ORDINARY_INPUT==='1'){
    cases.splice(0,cases.length,['ordinary-source-input','工具调用与冻结参数不符',()=>mutatePayload(p=>{const part=Object.values(p.codexCalls[root.id].tools)[0] as any;part.input=JSON.stringify({basis:'comments'});})]);
   }
   const observed=[];
   for(const [label,message,mutate]of cases){
    try{
     await mutate();const polluted=(await snapshot('guard-'+label+'-polluted'))!;
     expect(polluted.task.status).toBe('running');expect(Date.parse(polluted.task.leaseExpiresAt!)).toBeGreaterThan(Date.now());
     const seq=polluted.calls.at(-1)!.sequence;
     const entries=process.env.T1323_ORDINARY_INPUT==='1'?['readCheckpoint','firstSave','idempotentSave']:['readCheckpoint','saveCheckpoint'];
     const observedPorts=[];
     for(const entry of entries){
      const portName=entry==='readCheckpoint'?'readCheckpoint':'saveCheckpoint';
      if(entry==='firstSave')await db.update(executionTasks).set({checkpoint:before.task.checkpoint}).where(eq(executionTasks.id,before.task.id));
      const data=portName==='readCheckpoint'?{}:{expectedRevision:entry==='firstSave'||entry==='idempotentSave'?0:1,expectedLedgerSequence:seq,messages:[]};
      let caught:unknown;try{await owned.directInvoke(ref,portName,data);}catch(error){caught=error;}
      observedPorts.push({case:label,entry,port:portName,outcome:caught?'rejected':'fulfilled',error:caught?{name:(caught as Error).name,message:(caught as Error).message}:null});
      if(entry==='firstSave')await db.update(executionTasks).set({checkpoint:taskAfterSave.checkpoint}).where(eq(executionTasks.id,before.task.id));
      if(process.env.T1323_ORDINARY_INPUT==='1')save('ordinary-input-target-observation',{case:label,ports:observedPorts,window:{status:polluted.task.status,attempt:ref.attempt,rootStatus:root.status},onlyNativeInputChanged:true,originalCallDigestUnchanged:polluted.calls.find(c=>c.id===ordinary.id)!.inputDigest===ordinary.inputDigest,chatModelIdentitiesUnchanged:JSON.stringify((polluted.task.payload as any).chatModelIdentities)===JSON.stringify((originalPayload as any).chatModelIdentities)});
     }
     for(const actual of observedPorts){expect(actual.outcome,label+':'+actual.entry).toBe('rejected');expect(actual.error,label+':'+actual.entry).toEqual({name:'ConflictError',message});observed.push({...actual,attempt:ref.attempt,taskStatus:polluted.task.status,leaseValid:true});}
     const rejected=(await snapshot('guard-'+label+'-rejected'))!;expect(rejected.calls).toEqual(polluted.calls);expect(rejected.task.payload).toEqual(polluted.task.payload);
    }finally{await restores();}
    const restored=(await snapshot('guard-'+label+'-restored'))!;expect(restored.calls).toEqual(before.calls);expect(restored.task.payload).toEqual(originalPayload);
    expect((await read()).knownSpentTokens).toBe(baseline.knownSpentTokens);
   }
   for(const [label,data,message]of [
    ['native-fake-messages',{expectedRevision:1,expectedLedgerSequence:sequence,messages:[{role:'tool',callId:ordinary.id}]},'原生聊天检查点不能合成消息引用'],
    ['foreign-message-ref',{expectedRevision:1,expectedLedgerSequence:sequence,messages:[{role:'assistant',callId:'foreign-call'}]},'原生聊天检查点不能合成消息引用'],
   ]as const){let caught:unknown;try{await owned.directInvoke(ref,'saveCheckpoint',data);}catch(error){caught=error;}expect(caught,label).toMatchObject({name:'ConflictError',message});observed.push({case:label,port:'saveCheckpoint',message,attempt:2,taskStatus:'running',leaseValid:true});}
   let wrongFence:unknown;try{await owned.directInvoke({...ref,fenceToken:'t1323-wrong-fence'},'readCheckpoint',{});}catch(error){wrongFence=error;}expect(wrongFence).toMatchObject({name:'ConflictError',message:'执行凭证已失效'});
   save('checkpoint-guard-proof',{cases:observed,wrongFence:{name:(wrongFence as Error).name,message:(wrongFence as Error).message},readCalls:baseline.pendingCalls,fullBudgetFacts:baseline,firstRealReadBaselineSucceeded:true,exactRowsRestored:true,rootStatusUnchanged:'unknown',taskWindow:'attempt2 running/admission before original readCheckpoint',fixturePollutionOnly:true});
  }
  if(name.startsWith('recovery')&&phase==='before'&&port==='settleExternalChatTurn'&&!owned.crashed)await snapshot('before-root-read-recovery-stop');
  if(phase!=='before'||port!=='commitExternalChatResult')return;
  const before=await snapshot('before-terminal-commit');if(!before)return;
  for(const call of before.calls.filter(row=>row.kind==='external_tool'&&(row.providerResult as any)?.toolName==='system.action.propose')){
   const toolCallId=(call.providerResult as any).toolCallId;
   expect(before.events.some(event=>event.callId===call.id||event.chunk.toolCallId===toolCallId)).toBe(false);
  }
  if(name!=='integrity'||integrityDone)return;integrityDone=true;
  const db=owned.db!,root=before.calls.find(row=>row.kind==='external_agent')!,ordinary=before.calls.filter(row=>row.kind==='tool'),external=before.calls.find(row=>row.kind==='external_tool')!;
  const hostInput=before.events.find(event=>event.chunk.type==='tool-input-available'&&event.chunk.toolCallId==='fixture-tool-0')!;
  const project=createChatToolStreamProjection(db,{tools:owned.tools});
  const errors:Array<{case:string;name:string;message:string}>=[];
  const restore=async()=>{
   await db.delete(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,root.executionTaskId));
   await db.delete(executionCalls).where(eq(executionCalls.id,'t1323-duplicate-external'));
   await db.update(executionCalls).set({inputDigest:external.inputDigest}).where(eq(executionCalls.id,external.id));
   await db.update(executionTasks).set({payload:before.task.payload}).where(eq(executionTasks.id,before.task.id));
   await db.insert(executionStreamEvents).values(before.events);
  };
  const replaceEvents=async(events:typeof before.events)=>{await db.delete(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,root.executionTaskId));await db.insert(executionStreamEvents).values(events);};
  const mutations:Array<[string,()=>Promise<unknown>]>=[
   ['external参数字节变化',async()=>{const events=structuredClone(before.events);events.find(event=>event.sequence===hostInput.sequence)!.chunk={...hostInput.chunk,input:{offset:999,limit:14}};await replaceEvents(events);}],
   ['external toolCallId变化',async()=>{const events=structuredClone(before.events);events.find(event=>event.sequence===hostInput.sequence)!.chunk={...hostInput.chunk,toolCallId:'foreign-tool'};await replaceEvents(events);}],
   ['other-root输入污染',async()=>{const events=structuredClone(before.events);const changed=events.find(event=>event.sequence===hostInput.sequence)!;changed.callId=external.id;changed.callIndex=Math.max(...before.events.filter(event=>event.callId===external.id).map(event=>event.callIndex))+1;await replaceEvents(events);}],
   ['重复external输入',async()=>{const nextSequence=Math.max(...before.events.map(event=>event.sequence))+1,nextIndex=Math.max(...before.events.filter(event=>event.callId===root.id).map(event=>event.callIndex))+1;await db.insert(executionStreamEvents).values({...hostInput,sequence:nextSequence,callIndex:nextIndex});}],
   ['陌生已存输入',async()=>{const nextSequence=Math.max(...before.events.map(event=>event.sequence))+1,nextIndex=Math.max(...before.events.filter(event=>event.callId===root.id).map(event=>event.callIndex))+1;await db.insert(executionStreamEvents).values({...hostInput,sequence:nextSequence,callIndex:nextIndex,chunk:{...hostInput.chunk,toolCallId:'unknown-input'}});}],
   ['external call归属重复',async()=>{await db.insert(executionCalls).values({...external,id:'t1323-duplicate-external',sequence:Math.max(...before.calls.map(call=>call.sequence))+1,operationKey:'t1323-controlled-duplicate'});}],
   ['external原digest变化',async()=>{await db.update(executionCalls).set({inputDigest:'sha256:'+'f'.repeat(64)}).where(eq(executionCalls.id,external.id));}],
   ['external原proof.callId变化',async()=>{const payload=structuredClone(before.task.payload) as any;payload.externalToolInputs[external.id].callId='foreign-call';await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,before.task.id));}],
   ['ordinary前缀顺序变化',async()=>{const events=structuredClone(before.events),inputs=events.filter(event=>event.chunk.type==='tool-input-available'&&['fixture-tool-1','fixture-tool-3'].includes(String(event.chunk.toolCallId)));expect(inputs).toHaveLength(2);const first=inputs[0]!.chunk;inputs[0]!.chunk=inputs[1]!.chunk;inputs[1]!.chunk=first;await replaceEvents(events);}],
  ];
  await project(ref,ordinary[0]!.id);
  for(const [label,mutate] of mutations){try{await mutate();let caught:unknown;try{await project(ref,ordinary[0]!.id);}catch(error){caught=error;}expect(caught,label).toBeInstanceOf(Error);expect((caught as Error).name,label).toBe('ConflictError');errors.push({case:label,name:(caught as Error).name,message:(caught as Error).message});}finally{await restore();}}
  let badFence:unknown;try{await project({...ref,fenceToken:'t1323-foreign-fence'},ordinary[0]!.id);}catch(error){badFence=error;}expect(badFence).toBeInstanceOf(Error);errors.push({case:'错误fence',name:(badFence as Error).name,message:(badFence as Error).message});
  await project(ref,ordinary[0]!.id);const restored=await snapshot('after-integrity-fixture-restored');expect(restored?.events).toEqual(before.events);expect(restored?.calls).toEqual(before.calls);save('integrity-proof',{errors,fixtureMutationOnly:true,originalRowsRestored:true,noNewModelOrTurnRequested:true});
 };
 try{
  await getChatRuntime();const group=await call(ENDPOINTS.createAccountGroup,{name:'混流受控组',idempotencyKey:'t1323-'+name});ctx={...ctx,groupId:group.id,groupVersion:group.version};
  const routing=await call(ENDPOINTS.getModelRouting);await call(ENDPOINTS.putModelRouting,{schemaVersion:1,expectedRevision:routing.revision,choices:{text:'codex',vision:'official',image:'official',video:'official',audio:'official',embed:'official'}});
  const conversation=await call(ENDPOINTS.createConversation,{title:'受控混流回合',scope:'global'});const message=await call(ENDPOINTS.createMessage,{content:'先查看真实系统能力，再生成一条基于定位的工作记录选题；只准备候选，不自动采纳。',executionEngine:'codex'},{conversationId:conversation.id});taskId=message.modelMetadata.chatTaskId;save('public-submission',{group,routing,conversation,message});expect(taskId).toBeTruthy();expect(owned.host).toBeTruthy();
  await owned.host.drainOnce();if(name.startsWith('recovery')){await snapshot('after-controlled-stop');expect(owned.crashed).toBe(true);await owned.host.stop();const original=(await owned.db!.select().from(aiTasks).where(eq(aiTasks.id,taskId)))[0]!;save('public-readonly-resume',await call(ENDPOINTS.commandExecutionTasks,{taskIds:[original.executionTaskId],command:'resume',idempotencyKey:'t1323-original-native-readonly-resume'}));owned.host=owned.makeHost();await owned.host.drainOnce();}const final=await snapshot('after-drain');
  expect(final?.task?.status,JSON.stringify({firstThrow:owned.errors[0],status:final?.task?.status})).toBe('succeeded');
  expect(final?.business.status).toBe('succeeded');expect(final?.messages.filter(m=>m.role==='assistant')).toHaveLength(1);expect(final?.events.filter(e=>e.chunk.type==='finish')).toHaveLength(1);expect(owned.errors).toEqual([]);
  const uniqueIds=[...new Set(callIds)],inputs=final!.events.filter(event=>['tool-input-available','tool-input-start'].includes(String(event.chunk.type))),outputs=final!.events.filter(event=>event.chunk.type==='tool-output-available');
  expect(inputs.map(event=>event.chunk.toolCallId).sort()).toEqual([...uniqueIds].sort());expect(outputs.map(event=>event.chunk.toolCallId).sort()).toEqual([...uniqueIds].sort());
  const assistant=final!.messages.find(message=>message.role==='assistant')!,parts=assistant.parts as any[];
  expect(parts.filter(part=>part.output?.kind==='topic.candidates').every(part=>part.output.items.length>0)).toBe(true);expect(parts.filter(part=>part.output?.kind==='system.features').every(part=>part.output.rows.length>0)).toBe(true);
  const rawTask=(await owned.db!.select().from(executionTasks).where(eq(executionTasks.id,final!.task!.id)))[0]!,root=final!.calls.find(call=>call.kind==='external_agent')!,beforeDuplicate=hash({calls:final!.calls,events:final!.events});
  const duplicate=await createExternalChatTurnService(owned.db!,{budget:{maxCalls:48,maxTokens:1000000,deadlineMs:600000}}).commit(owned.lastRef,{callId:root.id},createAgenticToolBinding(owned.tools).forCall);save('duplicate-terminal',duplicate);
  const afterDuplicate=await snapshot('after-duplicate-terminal');expect(hash({calls:afterDuplicate!.calls,events:afterDuplicate!.events})).toBe(beforeDuplicate);
  const rpc=fs.readFileSync(path.join(owned.root,'native-rpc.ndjson'),'utf8').trim().split('\n').map(line=>JSON.parse(line)),expectedChildren=new Set(sequence.map((tool,index)=>tool==='topic_generate'?callIds[index]:null).filter(Boolean)).size;
  expect(rpc.filter(event=>event.method==='turn/start')).toHaveLength(expectedChildren+1);expect(final!.calls.filter(call=>call.kind==='model')).toHaveLength(expectedChildren);
  if(name.startsWith('recovery')){expect(rpc.some(event=>event.method==='fixture-read-original-turn'&&event.role==='root')).toBe(true);expect(rawTask.attempt).toBe(2);save('recovery-proof',{nativeReads:rpc.filter(event=>event.method==='fixture-read-original-turn'),turnStarts:expectedChildren+1,actualTurnStarts:rpc.filter(event=>event.method==='turn/start').length,finalStatus:rawTask.status,attempt:rawTask.attempt,controlledStopBeforeSettle:true,clockAdvancedMs:0,publicOriginalResume:true});}
 }finally{
  await snapshot('before-cleanup').catch(()=>{});await owned.host?.stop();await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();vi.useRealTimers();vi.unstubAllEnvs();save('cleanup',{ownChatHostStopped:true,ownPersistenceDisposed:true,liveCandidateTouched:false,realExternalModels:0});
 }
},3600000);
