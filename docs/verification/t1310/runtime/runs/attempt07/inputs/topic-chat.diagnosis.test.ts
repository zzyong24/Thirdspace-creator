import {it,expect,vi} from '../../../../backend/node_modules/vitest/dist/index.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createDb,executionTasks,executionCalls,aiTasks,aiTaskResults,aiMessages,eq,asc} from '@creatoros/backend';
import {listOfficialSkillBases} from '@creatoros/ai-worker';
import {createAccountGroupService,createPlatformAccountService} from '../../../../backend/src/modules/platform-account';
import {createAiService} from '../../../../backend/src/modules/ai/ai.service';
import {createChatTurnSubmissionService} from '../../../../backend/src/modules/ai/chat-turn-submission.service';
import {createChatHostContextReader} from '../../../../backend/src/modules/ai/chat-host-context.service';
import {createChatStructuredTaskToolHost} from '../../../../backend/src/modules/ai-runtime/chat-structured-tool-host';
import {buildChatTools,type ChatToolDeps} from '../../../../backend/src/modules/ai-runtime/chat-tools';
import {prepareChatToolDefinitions} from '../../../../backend/src/modules/ai-runtime/chat-tool-definitions';
import {createEffectiveSkillSnapshotResolver} from '../../../../backend/src/modules/ai-runtime/effective-skill-snapshot';
import {freezeSelectedModelRoutes} from '../../../../backend/src/modules/ai-runtime/capability-model-routing';
import {createChatWorkerDispatcher} from '../../../../backend/src/modules/execution/model-worker-dispatcher';
import {createPersistentTaskService} from '../../../../backend/src/modules/execution/persistent-task.service';
import {createExternalChatTurnService} from '../../../../backend/src/modules/ai/external-chat-turn.service';
import {createAgenticToolBinding} from '../../../../backend/src/modules/execution/agentic-tool-binding';
import * as supervisorModule from '../../../../backend/src/modules/execution/worker-supervisor';

const runtime=fileURLToPath(new URL('./',import.meta.url));
const worker=JSON.parse(fs.readFileSync(path.join(runtime,'../WORKER_BINDING.json'),'utf8'));
const sha=(x:unknown)=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const originalSupervisor=supervisorModule.createWorkerSupervisor;
const save=(dir:string,name:string,value:unknown)=>fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(value,null,2)+'\n');
const readRows=(f:string)=>fs.existsSync(f)?fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];
const valid={topics:[{title:'合成选题：把一次尝试记清楚',angle:'区分问题、尝试与观察',contentRole:'trust',source:'demand',predictedScore:60,reason:'仅受控中性材料',sourceComments:[]}]};
const specs=[...['group','legacy'].flatMap(scope=>['normal','repair','partial','missing-usage','recovery-settled','recovery-native'].map(kind=>({scope,kind,engine:'codex'}))),...['group','legacy'].map(scope=>({scope,kind:'normal',engine:'api'}))];

it.each(specs)('T1310 $engine/$scope/$kind 完整topic.generate诊断',async({scope,kind,engine})=>{
 const id=engine+'-'+scope+'-'+kind,dir=path.join(runtime,'cases',process.env.T1310_CASES_SUBDIR??'unbound',id);fs.mkdirSync(dir,{recursive:true});
 expect(createHash('sha256').update(fs.readFileSync(worker.executionWorkerPath)).digest('hex')).toBe(worker.sha256);
 save(dir,'scenario',{kind,engine,scope});fs.mkdirSync(path.join(dir,'tmp'),{recursive:true,mode:0o700});fs.mkdirSync(path.join(dir,'empty-codex-home'),{recursive:true,mode:0o700});
 const opened=await createDb();const db=opened.db;let seq=0,offset=0;const now=()=>new Date(Date.now()+offset).toISOString(),nextId=(prefix:string)=>'t1310-'+id+'-'+prefix+'-'+(++seq);
 let host:ReturnType<typeof createChatWorkerDispatcher>|undefined,server:ReturnType<typeof createServer>|undefined,submitted:any,tools:any,ctx:any,stopExecution:any;
 const trace:any[]=[],errors:any[]=[],snapshots:any[]=[];let crashed=false;
 const snapshot=async(label:string)=>{
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId)).orderBy(asc(executionCalls.sequence));
  const [business]=await db.select().from(aiTasks).where(eq(aiTasks.id,submitted.taskId));
  const results=await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,submitted.taskId));
  const messages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,submitted.conversationId));
  const value={label,task:{...task,payload:undefined,fenceToken:task?.fenceToken?sha(task.fenceToken):null},businessStatus:business?.status,budget:task?.executionBudget,payloadHashes:{modelInput:sha((task?.payload as any)?.modelInput),nodePreparations:sha((task?.payload as any)?.nodePreparations??{}),codexCalls:sha((task?.payload as any)?.codexCalls??{})},calls:calls.map(c=>({...c,providerResult:c.providerResult?{sha256:sha(c.providerResult),usage:(c.providerResult as any).usage??null,providerMetadata:(c.providerResult as any).providerMetadata??null}:null})),results,messages};snapshots.push(value);save(dir,'snapshots',snapshots);return {task,calls,results};
 };
 const spy=vi.spyOn(supervisorModule,'createWorkerSupervisor').mockImplementation(options=>{
  const wrapped=originalSupervisor({...options,extraEnv:{...options.extraEnv,T1310_FIXTURE_ROOT:dir,CODEX_HOME:path.join(dir,'empty-codex-home'),TMPDIR:path.join(dir,'tmp'),TEMP:path.join(dir,'tmp'),TMP:path.join(dir,'tmp')},ports:{...options.ports,async invoke(ref,port,data){
   trace.push({phase:'invoke',port,attempt:ref.attempt,executionTaskId:ref.executionTaskId,callId:(data as any)?.callId??null,typeKeys:Object.keys((data??{}) as object),inputHash:sha(data)});save(dir,'ports',trace);
   try{if(kind==='recovery-native'&&port==='settleChatGenerationModel'&&!crashed){crashed=true;await snapshot('before-unsettled-child-process-stop');await stopExecution(ref);return undefined;}const out=await options.ports.invoke(ref,port,data);trace.push({phase:'receipt',port,attempt:ref.attempt,callId:(out as any)?.callId??null,status:(out as any)?.status??null,outputKeys:out&&typeof out==='object'?Object.keys(out):[],outputHash:sha(out)});save(dir,'ports',trace);
    if(kind==='recovery-settled'&&port==='settleChatGenerationModel'&&!crashed){crashed=true;await snapshot('before-controlled-process-stop');await stopExecution(ref);}
    return out;
   }catch(error){const e=error as Error;errors.push({port,attempt:ref.attempt,callId:(data as any)?.callId??null,name:e.name,message:e.message,stack:(e.stack??'').split('\n').filter((l,i)=>i===0||l.includes('/backend/src/')||l.includes('/ai-worker/src/')).slice(0,14)});save(dir,'first-throws',errors);throw error;}
  }}});stopExecution=ref=>wrapped.stopExecutionTree(ref);return wrapped;
 });
 try{
  const base={userId:'t1310-owned-'+id,accountId:null,requestId:'t1310',source:'user' as const};
  if(scope==='group'){const g=await createAccountGroupService({db,now,nextId}).create(base,{name:'受控空组',idempotencyKey:'owned-group'});ctx={...base,groupId:g.id,groupVersion:g.version};}
  else{const accountId='t1310-account-'+id;await createPlatformAccountService({db,now,nextId:p=>p==='acct'?accountId:nextId(p)}).createAccount({...base,accountId},{platform:'douyin',accountHandle:'合成账号',idempotencyKey:'owned-account'});ctx={...base,accountId};}
  const forbidden=async():Promise<never>=>{throw Error('T1310_DOMAIN_ADOPTION_FORBIDDEN');};
  const ai=createAiService({db,now,nextId,artifacts:{createVersion:forbidden},knowledge:{createKnowledge:forbidden},candidate:{createFromAIResult:forbidden,enrichCard:forbidden},learnings:{createLearning:forbidden},publishing:{createPublicationFromDraft:forbidden},materialLinks:{link:forbidden},positioning:{upsertProfile:forbidden,createStatementVersion:forbidden},calibration:{createDraftPrediction:forbidden}});
  const conversation=await ai.createConversation(ctx,{title:'合成选题对话',projectId:null,scope:'global'}),source=await ai.createMessage(ctx,conversation.id,{content:'请基于当前定位生成一条工作记录方法选题，不联网。',attachments:[]});
  const bases=listOfficialSkillBases();const snapshotResolver=createEffectiveSkillSnapshotResolver({officialSkills:{get:id=>bases.find(b=>b.skillId===id)??null,list:()=>bases,platformPolicy:()=>({version:'1',text:'仅受控候选，不自动采纳'})},accountOverlays:{listBySkillIds:async()=>[]},groupOverlays:{listBySkillIds:async()=>[]},now});
  const skillSnapshot=await snapshotResolver(ctx,['chatbox.topic','topic.generate']);save(dir,'skill-snapshot',skillSnapshot);
  const definitions=(await prepareChatToolDefinitions(buildChatTools(['topic.generate'],{} as ChatToolDeps),{workerStructuredNodes:true})).definitions;
  const hostContext={schemaVersion:1 as const,chatContext:{surface:'topics'},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],structuredContext:{positioningBrief:'只依据工作记录中的问题、尝试和观察。',accountsBrief:'',learningsBrief:'',signalsBrief:'',knowledgeBrief:''},structuredGeneration:{version:1,maxOutputTokens:2048},skillSnapshot};
  let httpRequests=0;
  if(engine==='api'){
   server=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const input=JSON.parse(Buffer.concat(chunks).toString());const n=++httpRequests;save(dir,'api-request-count',{count:n});
    if(input.stream){const first=n===1,delta=first?{tool_calls:[{index:0,id:'fixture-topic-tool',type:'function',function:{name:'topic_generate',arguments:'{"basis":"positioning"}'}}]}:{content:'受控候选已生成。'};res.writeHead(200,{'content-type':'text/event-stream'});res.end([{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:first?'tool_calls':'stop'}],usage:{prompt_tokens:7,completion_tokens:5,total_tokens:12}}].map(x=>'data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:'t1310-api',...x})+'\n\n').join('')+'data: [DONE]\n\n');}
    else{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'fixture-child',object:'chat.completion',created:1,model:'t1310-api',choices:[{index:0,message:{role:'assistant',content:JSON.stringify(valid)},finish_reason:'stop'}],usage:{prompt_tokens:7,completion_tokens:5,total_tokens:12}}));}
   });await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
  }
  const credential=engine==='codex'?{engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'t1310-fixture-model'}:{apiFormat:'openai_chat',baseUrl:'http://127.0.0.1:'+((server!.address() as any).port)+'/v1',model:'t1310-api',token:'owned-synthetic-not-a-secret'};
  const route=await freezeSelectedModelRoutes({choices:{text:'codex',vision:'codex',image:'codex',video:'official',audio:'official',embed:'official'},revision:1,main:{mode:'text',capability:'copilot.assist'},read:async(_entry,source)=>source==='codex'?({status:'ready',identity:{protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'t1310-fixture-model'}}):({status:'not_configured',reasonCode:'MODEL_NOT_CONFIGURED'})});
  // API control keeps the original API protocol, separate from the v2 Codex target.
  const submittedBase=await createChatTurnSubmissionService(db,{now,nextId,assemble:async()=>({capability:'copilot.assist',system:'仅调用topic.generate生成受控候选。',messages:[{role:'user',content:source.content}],maxSteps:6,maxOutputTokens:2048,tools:definitions,hostContext,...(engine==='codex'?{executionRoute:route,chatModelMode:'text'}:{})})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id,executionEngine:engine==='codex'?'codex':'pi'});submitted={...submittedBase,conversationId:conversation.id};save(dir,'submission',submitted);
  const reader=createChatHostContextReader(db,{now}),resolver=createChatStructuredTaskToolHost(reader,{readWorks:async()=>'',getPositioningDiscovery:async()=>null,business:{prepareTopic:async()=>({facets:{positioning:'只依据真实记录',basisHint:'基于定位',basisContext:'',knowledgeRef:'',learningsConstraint:'',signalQuality:'',audienceTaskContext:'',sourceReads:''},trendNote:null}),prepareReview:forbidden}});
  const makeHost=()=>createChatWorkerDispatcher(db,{now,entryPath:path.join(runtime,'worker-entry.fixture.cjs'),workerId:'t1310-owned-worker',budget:{maxCalls:12,maxTokens:200000,deadlineMs:600000},modelConcurrency:1,resolveTools:async(...args)=>{tools=await resolver(...args);return tools;},resolveModelCredential:async()=>credential});
  host=makeHost();await host.drainOnce();const first=await snapshot('after-first-drain');
  if(kind.startsWith('recovery-')&&crashed){await host.stop();host=undefined;offset=Date.parse(first.task!.leaseExpiresAt??now())-Date.now()+1;host=makeHost();await host.drainOnce();await snapshot('after-native-read-recovery');}
  if(kind==='missing-usage'&&process.env.T1310_OBSERVE_DRAIN==='1'){const before=await snapshot('before-one-normal-observation');const rpcBefore=readRows(path.join(dir,'native-rpc.ndjson'));offset+=121000;const claimed=await host.drainOnce();const after=await snapshot('after-one-normal-observation');const rpcAfter=readRows(path.join(dir,'native-rpc.ndjson'));save(dir,'one-normal-observation',{clockAdvancedMs:121000,claimed,before:{status:before.task?.status,attempt:before.task?.attempt,lastErrorCode:before.task?.lastErrorCode},after:{status:after.task?.status,attempt:after.task?.attempt,lastErrorCode:after.task?.lastErrorCode},newTurnStarts:rpcAfter.filter(x=>x.method==='turn/start').length-rpcBefore.filter(x=>x.method==='turn/start').length,newCalls:after.calls.length-before.calls.length,errors});}const final=await snapshot('final');const rpc=readRows(path.join(dir,'native-rpc.ndjson'));
  const result={id,engine,scope,kind,workerSha256:worker.sha256,firstThrow:errors[0]??null,status:final.task?.status,attempt:final.task?.attempt,crashed,callCount:final.calls.length,modelCalls:final.calls.filter(c=>c.kind==='model').length,externalRoots:final.calls.filter(c=>c.kind==='external_agent').length,childCalls:final.calls.filter(c=>c.parentCallId).length,rpcCounts:rpc.reduce((v,r)=>(v[r.method]=(v[r.method]??0)+1,v),{} as Record<string,number>),httpRequests,diagnosisOnly:true,originalTaskTouched:false};save(dir,'result',result);
  expect(trace.some(x=>x.port==='completeChatGeneration')).toBe(true);
  // Do not assert product PASS: a captured real consumer conflict is a valid diagnostic outcome.
  expect(final.calls.some(c=>c.kind==='tool')).toBe(true);
  if(final.task?.status==='succeeded'){
   const before=final.calls.map(c=>({id:c.id,status:c.status,totalTokens:c.totalTokens}));const tasks=createPersistentTaskService(db,{now});expect(await tasks.claimTask({taskId:submitted.executionTaskId,workerId:'no-repeat'})).toBeNull();
   const root=final.calls.find(c=>c.kind==='external_agent');if(root){const saved=await new Promise<any>(async(resolve,reject)=>{try{const task=final.task!;const ref={executionTaskId:task.id,attempt:task.attempt,fenceToken:task.fenceToken!};resolve(await createExternalChatTurnService(db,{now,budget:{maxCalls:12,maxTokens:200000,deadlineMs:600000}}).commit(ref,{callId:root.id},createAgenticToolBinding(tools).forCall));}catch(e){reject(e);}});save(dir,'duplicate-receipt',saved);}
   const same=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId)).orderBy(asc(executionCalls.sequence));expect(same.map(c=>({id:c.id,status:c.status,totalTokens:c.totalTokens}))).toEqual(before);
  }
 }finally{
  if(submitted)await snapshot('before-cleanup').catch(e=>save(dir,'snapshot-error',{message:String(e)}));
  await host?.stop();if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}spy.mockRestore();await opened.client.close();save(dir,'cleanup',{workerStopped:true,dbClosed:true,apiServerClosed:!server?.listening,realModels:0,liveCandidateRequests:0});
 }
},540000);
