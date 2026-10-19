// @vitest-environment node
import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {createServer,type Server} from 'node:http';
import {ENDPOINTS,type Endpoint,type RequestContext} from '@creatoros/contract';
import {executionTasks,executionCalls,projects,projectActivities,eq,asc,type Db} from '@creatoros/backend';

const owned=vi.hoisted(()=>({root:'',db:null as Db|null,ports:[] as any[],boundary:[] as any[],forks:[] as any[]}));
vi.mock('@creatoros/backend',async original=>{
 const actual=await original<typeof import('@creatoros/backend')>();
 return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{
  const planned=actual.resolveDbDriver(args[0]);
  if(planned.kind!=='file-pglite'||planned.target!==path.join(owned.root,'db'))throw Error('T1332_OWNED_DB_REQUIRED');
  const value=await actual.createConfiguredDb(...args);owned.db=value.db;return value;
 }};
});
vi.mock('@creatoros/backend/modules/assets',async original=>{
 const actual=await original<typeof import('@creatoros/backend/modules/assets')>();
 return {...actual,migrateStorageRoot:async()=>{throw Error('T1332_USER_MEDIA_MIGRATION_FORBIDDEN');},createLocalFsObjectStorage:(...args:Parameters<typeof actual.createLocalFsObjectStorage>)=>actual.createLocalFsObjectStorage({...args[0],rootPath:path.join(owned.root,'media')},args[1])};
});
// 新隔离实例没有渠道授权；不访问真实配置/密钥/认证。模型只从本次公开self设置读取。
vi.mock('@/server/activation/client-config.server',async original=>({...await original<typeof import('@/server/activation/client-config.server')>(),readChannelModelAuthority:async()=>({authority:'local'})}));
// 透明观察真正末端；原参数、返回值与异常均原样透传，不代写候选或项目。
vi.mock('@creatoros/backend/modules/projects',async original=>{
 const actual=await original<typeof import('@creatoros/backend/modules/projects')>();
 return {...actual,createRadarProjectService:(...args:Parameters<typeof actual.createRadarProjectService>)=>{
  const service=actual.createRadarProjectService(...args);
  return {...service,async ensureRadarProject(...input:Parameters<typeof service.ensureRadarProject>){
   const row:any={queueTaskId:input[1].queueTaskId,userId:input[0].userId,groupId:input[0].groupId??null,accountId:input[0].accountId??null,startedAt:new Date().toISOString()};owned.boundary.push(row);
   try{const result=await service.ensureRadarProject(...input);row.resultProjectId=result.id;return result;}
   catch(error){row.errorName=error instanceof Error?error.name:'UnknownError';throw error;}
   finally{row.finishedAt=new Date().toISOString();}
  }};
 }};
});
vi.mock('node:child_process',async original=>{
 const actual=await original<typeof import('node:child_process')>();
 return {...actual,fork:(...args:Parameters<typeof actual.fork>)=>{
  const child=actual.fork(...args);const row={pid:child.pid??null,entryPath:String(args[0]),startedAt:new Date().toISOString(),exitCode:null as number|null,exitSignal:null as string|null,exited:false};
  owned.forks.push(row);
  if(owned.root&&child.pid){
   const identity=actual.execFileSync('/bin/ps',['-p',String(child.pid),'-o','pgid=,lstart=,comm='],{encoding:'utf8'}).trim();
   const match=identity.match(/^(\d+)\s+(.+)$/);if(!match)throw Error('T1332_FORK_IDENTITY_UNAVAILABLE');
   fs.appendFileSync(path.join(owned.root,'owned-processes.ndjson'),JSON.stringify({pid:child.pid,pgid:Number(match[1]),identity:match[2],runId:process.env.T1332_RUN_ID,entryPath:String(args[0])})+'\n');
  }
  child.once('exit',(code,signal)=>{row.exited=true;row.exitCode=code;row.exitSignal=signal;});return child;
 }};
});
vi.mock('../../../../backend/src/modules/execution/worker-supervisor',async original=>{
 const actual=await original<typeof import('../../../../backend/src/modules/execution/worker-supervisor')>();
 return {...actual,createWorkerSupervisor:(options:Parameters<typeof actual.createWorkerSupervisor>[0])=>actual.createWorkerSupervisor({...options,
  extraEnv:{...options.extraEnv,CODEX_HOME:path.join(owned.root,'empty-codex-home'),TMPDIR:path.join(owned.root,'tmp'),TMP:path.join(owned.root,'tmp'),TEMP:path.join(owned.root,'tmp'),HTTP_PROXY:'',HTTPS_PROXY:'',NO_PROXY:'127.0.0.1,localhost'},
  ports:{...options.ports,async invoke(ref,port,input){
   const result=await options.ports.invoke(ref,port,input);
   const row:any={executionTaskId:ref.executionTaskId,attempt:ref.attempt,port,at:new Date().toISOString()};
   if(port==='readTaskContext'){
    const value=result as any;row.kind=value?.kind;row.capability=value?.capability;row.operationKey=value?.operationKey;
    row.skillIds=value?.skillSnapshot?.skills?.map((s:any)=>s.skillId??s.id);row.facets=value?.facets;
   }
   if(port==='saveGenerationResult'){const value=JSON.parse((input as any).text);row.callId=(input as any).callId;row.resultKind=value.kind;row.stage=value.stage??null;}
   owned.ports.push(row);return result;
  }},
 })};
});
import {compositeTransport,getChatRuntime,getIdentityService,__resetPersistenceForTests} from '@/server/persistence-client';

const runtime=path.resolve('../docs/verification/t1332/runtime');
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const text='这是一段人工提供的中性来源摘要。桌面上有一只杯子和一本合上的笔记本。先把杯子放稳，再把笔记本移到一旁，给记录想法留出一点空白。这里只描述整理顺序，不声称效率或效果数字。';
const decomposition={hook:'先给桌面留一点记录空间',structureSteps:['确认桌面上的物品','按顺序留出空白'],coreClaims:['一次只移动一件物品，描述真实过程'],reusablePattern:'观察已有物品，再说明操作顺序',factRisks:['不得补造整理效果数字']};
const topic={title:'先留一个记录想法的位置',angle:'从一只杯子和一本笔记本说明整理顺序',differentiation:'用中性桌面动作说明记录前的准备',sourceSummary:'人工来源摘要描述杯子、笔记本与桌面空白',targetAudience:'希望记录想法的人',audiencePain:'不知道从哪一步开始整理',coreConflict:'物品占用与记录空间之间的取舍',format:'中性口播',contentRole:null,contentRoleReason:'测试没有业务目标，目的留空',adaptationStrategy:{keep:['按顺序操作的结构'],replace:['重新组织表达'],add:['先观察再移动'],avoid:['效果数字与来源外事实']}};
const draft='先看看桌面上现有的东西：一只杯子，一本合上的笔记本。把杯子放稳，再把笔记本移到一旁。留出的这点空白，可以用来写下一句想法。这里只演示一个顺序，不用一次改变所有东西。';

it('纯组公开雷达升级：真实父队列→原策略worker与账本→真实项目末端',async()=>{
 expect(process.env.T1332_APPROVED).toBe('1');
 const phase=process.env.T1332_PHASE;expect(['red','green']).toContain(phase);
 const label=process.env.T1332_RUN_LABEL??phase!;expect(/^(red|green)(-[A-Za-z0-9]+)*$/.test(label)).toBe(true);
 owned.root=path.join(runtime,'cases',label);fs.mkdirSync(owned.root,{recursive:true});
 const save=(name:string,value:unknown)=>fs.writeFileSync(path.join(owned.root,name+'.json'),JSON.stringify(value,null,2)+'\n');
 fs.writeFileSync(path.join(owned.root,'START.json'),JSON.stringify({phase,startedAt:new Date().toISOString(),runId:process.env.T1332_RUN_ID,externalPaidModels:0})+'\n',{flag:'wx'});
 const start=Date.now();let deadline=start+28_800_000;
 const remaining=()=>{if(!Number.isFinite(deadline))throw Error('T1332_INVALID_DEADLINE');const value=deadline-Date.now();if(value<=0)throw Error('T1332_OBSERVATION_EXPIRED');return value;};
 owned.db=null;owned.ports=[];owned.boundary=[];owned.forks=[];
 for(const dir of ['tmp','media','empty-codex-home','profiles','browser','workspaces'])fs.mkdirSync(path.join(owned.root,dir),{recursive:true});
 for(const [key,value] of Object.entries({DATABASE_URL:'',PGLITE_DATA_DIR:path.join(owned.root,'db'),CREATOROS_MASTER_KEY_FD:'',CREATOROS_MASTER_KEY_FILE:'',CREATOROS_MASTER_KEY:randomBytes(32).toString('base64'),CREATOROS_STORAGE:'local',CREATOROS_MEDIA_ROOT:path.join(owned.root,'media'),CREATOROS_DISABLE_BACKGROUND_DRIVERS:'1',CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_CLIENT_CONFIG_PULL_ENABLED:'0',CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH:path.join(owned.root,'missing-seed'),CREATOROS_DOUYIN_AUTH_DIR:path.join(owned.root,'profiles','douyin'),CREATOROS_WEB_AUTH_DIR:path.join(owned.root,'profiles','web'),CREATOROS_OFFLINE:'1',CREATOROS_DESKTOP:'0',CODEX_HOME:path.join(owned.root,'empty-codex-home')}))vi.stubEnv(key,value);
 // 文档保留IP仅作被fetch替身截获的来源标识；真实URL守卫保留，避免测试发DNS请求。
 const feedUrl='https://203.0.113.10/t1332-controlled-feed.xml';
 const feed=`<?xml version="1.0"?><rss version="2.0"><channel><title>隔离人工来源</title><link>https://example.test/t1332</link><description>受控中性来源，不是新闻或全文采集</description><item><guid>t1332-neutral-source</guid><title>杯子和笔记本</title><link>https://example.test/t1332-neutral-source</link><description>${text}</description></item></channel></rss>`;
 const network:any[]=[],modelRequests:any[]=[],protocolErrors:string[]=[];
 let server:Server|null=null,serverClosed=false,hostDisposed=false,disposeAvailable=false,hostInitializationStarted=false,hostInitialized=false,primaryFailed=false,primaryFailure:unknown,ctx:RequestContext={userId:'uninitialized',accountId:null,requestId:'t1332-owned-public',source:'user'},parentId='',sourceId='',itemId='',topicTaskId='',transformId='',projectId='';
 const publicCalls:any[]=[];
 const request=async(endpoint:Endpoint,input:any={})=>{
  remaining();for(const key of ['params','query','body'] as const)if(endpoint[key])input[key]=endpoint[key]!.parse(input[key]);
  publicCalls.push({operation:endpoint.id,method:endpoint.method,params:input.params??null,at:new Date().toISOString(),groupId:ctx.groupId??null,accountId:ctx.accountId??null});
  return await compositeTransport.request(endpoint,input,ctx) as {data:any};
 };
 const call=async(endpoint:Endpoint,input:any={})=>(await request(endpoint,input)).data;
 const poll=async<T>(read:()=>Promise<T>,done:(value:T)=>boolean):Promise<T>=>{
  for(;;){remaining();if(protocolErrors.length)throw Error('T1332_SUPPLIER_PROTOCOL_FIXTURE_ERROR');const value=await read();if(done(value))return value;await new Promise(resolve=>setTimeout(resolve,Math.min(500,remaining())));}
 };
 const parent=async()=>{
  const rows:any[]=await call(ENDPOINTS.listExecutionTasks,{query:{kind:'radar_project_upgrade',ownerId:itemId,page:1,pageSize:100}});
  const row=rows.find(x=>x.id===parentId);if(!row)throw Error('T1332_ORIGINAL_PARENT_NOT_FOUND');
  if(owned.db){const [raw]=await owned.db.select({deadlineAt:executionTasks.deadlineAt}).from(executionTasks).where(eq(executionTasks.id,parentId));if(raw?.deadlineAt!==null&&raw?.deadlineAt!==undefined){const value=Date.parse(raw.deadlineAt);if(!Number.isFinite(value))throw Error('T1332_INVALID_PERSISTED_DEADLINE');deadline=Math.min(deadline,value);}}
  return row;
 };
 const snapshot=async(name:string)=>{
  if(!owned.db)return;
  const rows=await owned.db.select().from(executionTasks).orderBy(asc(executionTasks.createdAt));
  const tasks=rows.map(row=>({id:row.id,userId:row.userId,groupId:row.groupId,accountId:row.accountId,kind:row.kind,ownerType:row.ownerType,ownerId:row.ownerId,status:row.status,attempt:row.attempt,leaseOwner:row.leaseOwner,leaseExpiresAt:row.leaseExpiresAt,fenceSha256:row.fenceToken?hash(row.fenceToken):null,deadlineAt:row.deadlineAt,checkpoint:row.checkpoint,errorCode:row.lastErrorCode,errorMessage:row.lastErrorMessage,executionRoute:(row.payload as any)?.executionRoute,intelligenceInput:(row.payload as any)?.intelligenceGeneration?.input}));
  const calls=await owned.db.select().from(executionCalls).orderBy(asc(executionCalls.sequence));
  save(name,{tasks,calls:calls.map(row=>({id:row.id,executionTaskId:row.executionTaskId,parentCallId:row.parentCallId,kind:row.kind,operationKey:row.operationKey,status:row.status,rejectionCode:row.rejectionCode,inputDigest:row.inputDigest,usage:row.usage,providerResultPresent:row.providerResult!==null,resultText:row.resultText})),ports:owned.ports,boundary:owned.boundary,modelRequests,network,protocolErrors});
  return {rows,calls};
 };
 try{
  const supplementalBinding=path.join(runtime,'implementation','WORKER_BINDING_CURRENT.json');
  if(process.env.T1332_WORKER_BINDING_FILE!==undefined)expect(process.env.T1332_WORKER_BINDING_FILE).toBe(supplementalBinding);
  const bindingPath=process.env.T1332_WORKER_BINDING_FILE??path.join(runtime,'WORKER_BINDING.json');
  const bindingBytes=fs.readFileSync(bindingPath),binding=JSON.parse(bindingBytes.toString('utf8'));
  const workerBytes=fs.readFileSync(binding.intelligenceWorkerPath),nodeBytes=fs.readFileSync(process.execPath);
  save('binding-preflight',{binding:{path:bindingPath,bytes:bindingBytes.length,sha256:hash(bindingBytes),supplemental:bindingPath===supplementalBinding,meaning:binding.meaning},worker:{path:binding.intelligenceWorkerPath,bytes:workerBytes.length,sha256:hash(workerBytes),expectedBytes:binding.intelligenceWorkerBytes,expectedSha256:binding.intelligenceWorkerSha256},node:{path:process.execPath,bytes:nodeBytes.length,sha256:hash(nodeBytes),expectedBytes:binding.nodeBytes,expectedSha256:binding.nodeSha256}});
  expect(hash(workerBytes)).toBe(binding.intelligenceWorkerSha256);
  expect(hash(nodeBytes)).toBe(binding.nodeSha256);
  vi.stubGlobal('fetch',async(input:any,init:any)=>{
   const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
   network.push({url,method:init?.method??input?.method??'GET',boundary:url===feedUrl?'controlled-rss-fetch':'FORBIDDEN',at:new Date().toISOString()});
   if(url!==feedUrl)throw Error('T1332_EXTERNAL_NETWORK_FORBIDDEN');
   init?.signal?.throwIfAborted();return new Response(feed,{status:200,headers:{'content-type':'application/rss+xml; charset=utf-8'}});
  });
  server=createServer((req,res)=>{
   let raw='';req.on('data',chunk=>{raw+=chunk;if(raw.length>4_000_000)req.destroy();});req.on('end',()=>{
    try{
     const body=JSON.parse(raw),sequence=modelRequests.length+1;
     const row={sequence,method:req.method,url:req.url,model:body.model,stream:body.stream===true,responseFormatType:body.response_format?.type??null,requestBytes:Buffer.byteLength(raw),requestSha256:hash(raw),at:new Date().toISOString()};modelRequests.push(row);
     if(req.method!=='POST'||req.url!=='/v1/chat/completions'||body.model!=='t1332-loopback-model'||sequence>3)throw Error('T1332_UNEXPECTED_MODEL_REQUEST');
     const content=sequence===1?JSON.stringify(decomposition):sequence===2?JSON.stringify(topic):draft;
     const common={id:`t1332-controlled-${sequence}`,created:1,model:'t1332-loopback-model'},usage={prompt_tokens:12,completion_tokens:24,total_tokens:36};
     if(body.stream){res.writeHead(200,{'content-type':'text/event-stream'});res.end(`data: ${JSON.stringify({...common,object:'chat.completion.chunk',choices:[{index:0,delta:{role:'assistant',content},finish_reason:null}]})}\n\ndata: ${JSON.stringify({...common,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}],usage})}\n\ndata: [DONE]\n\n`);}
     else{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({...common,object:'chat.completion',choices:[{index:0,message:{role:'assistant',content},finish_reason:'stop'}],usage}));}
    }catch(error){protocolErrors.push(error instanceof Error?error.name:'UnknownError');res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'controlled fixture rejected request',type:'invalid_request_error'}}));}
   });
  });server.requestTimeout=28_800_000;server.headersTimeout=120_000;
  await new Promise<void>((resolve,reject)=>{server!.once('error',reject);server!.listen(0,'127.0.0.1',resolve);});
  const baseUrl=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
  save('scenario',{text,sourceMeaning:'本次受控RSS摘要，经公开人工稿保存；非ASR/全文抓取/新近新闻',feedUrl,feedSha256:hash(feed),decomposition,topic,draft,baseUrl,externalPaidModels:0,appKey:'RANDOM_TEST_KEY_MEMORY_ONLY_NOT_RECORDED',deadlineAt:new Date(deadline).toISOString()});
  __resetPersistenceForTests();hostInitializationStarted=true;await getChatRuntime();hostInitialized=true;ctx={...await(await getIdentityService()).resolveLocalContext(),accountId:null};
  const group=await call(ENDPOINTS.createAccountGroup,{body:{name:'纯组雷达策略隔离验收',idempotencyKey:'t1332-owned-group'}});ctx={...ctx,groupId:group.id,groupVersion:group.version};
  await call(ENDPOINTS.putModel,{params:{capability:'default'},body:{provider:'openai',modelName:'t1332-loopback-model',apiFormat:'openai_chat',baseUrl,secret:'controlled-loopback-only-not-real-credential',settings:{structuredOutputs:true}}});
  const routing=await call(ENDPOINTS.getModelRouting);await call(ENDPOINTS.putModelRouting,{body:{schemaVersion:1,expectedRevision:routing.revision,choices:{text:'self',vision:'official',image:'official',video:'official',audio:'official',embed:'official'}}});
  const profile=await call(ENDPOINTS.upsertProfile,{body:{persona:'隔离测试的人工资料',field:'中性桌面整理说明',audience:'希望记录想法的人',differentiation:'只说明本次杯子和笔记本的实际顺序',capabilities:['按顺序描述动作'],facets:{contentScope:'本次中性物品与整理顺序',avoid:'来源之外的案例和效果数字'},downstreamRules:{forbidRule:'不补造效果或平台指标'}}});
  expect(await call(ENDPOINTS.getProfile)).toEqual(profile);expect(profile.userId).toBe(ctx.userId);
  const statement=await call(ENDPOINTS.createStatement,{body:{oneLiner:'用中性桌面动作说明记录想法前的准备',keywords:['桌面','记录','顺序'],productAnchorIds:[],changeReason:'隔离测试用户输入，不是AI候选'}});
  expect(statement.profileId).toBe(profile.id);expect(statement.aiTaskId).toBeNull();expect(statement.masterSnapshot.persona).toBe(profile.persona);
  const source=await call(ENDPOINTS.createIntelligenceSource,{body:{collectionId:null,type:'rss',config:{type:'rss',url:feedUrl},displayName:'受控人工摘要来源',monitorEnabled:false,runInitial:true,idempotencyKey:'t1332-owned-feed'}});sourceId=source.source.id;
  expect(source.run?.id).toBeTruthy();expect(source.task?.id).toBeTruthy();
  const sourceTerminal=await poll(()=>call(ENDPOINTS.getIntelligenceRun,{params:{runId:source.run.id}}),(value:any)=>['succeeded_with_items','succeeded_no_change','partial','blocked','failed'].includes(value.run.status));
  save('source-terminal',sourceTerminal);expect(sourceTerminal.run.status).toBe('succeeded_with_items');
  const listing:any[]=await poll(()=>call(ENDPOINTS.listIntelligenceItems,{query:{sourceId,page:1,pageSize:100,sort:'newest'}}),(rows:any[])=>rows.length>0);expect(listing).toHaveLength(1);itemId=listing[0].item.id;
  await call(ENDPOINTS.uploadManualIntelligenceTranscript,{body:{itemId,inputMode:'paste',text}});
  const beforeDetail=await call(ENDPOINTS.getIntelligenceItem,{params:{itemId}}),beforeProjects=await call(ENDPOINTS.listProjects,{query:{page:1,pageSize:100}});
  expect(beforeDetail.transcript).toMatchObject({status:'done',source:'manual',text});expect(beforeDetail.transforms).toHaveLength(0);expect(beforeDetail.snapshots).toHaveLength(1);
  save('before',{ctx,group,profile,statement,source,beforeDetail,beforeProjects,routing:await call(ENDPOINTS.getModelRouting)});
  const submitted=await call(ENDPOINTS.enqueueIntelligenceProjectUpgrades,{body:{itemIds:[itemId],positioningVersionId:statement.id,idempotencyKey:'t1332-owned-upgrade-once'}});expect(submitted.tasks).toHaveLength(1);parentId=submitted.tasks[0].id;save('public-submission',{submitted,parentId,at:new Date().toISOString()});
  const settled=await poll(parent,row=>['succeeded','blocked','failed','cancelled','paused'].includes(row.status)&&!['retry_wait'].includes(row.runtimeStatus??''));
  save('parent-terminal',settled);topicTaskId=settled.checkpoint?.topicTaskId??'';transformId=settled.checkpoint?.transformId??'';
  const detail=await call(ENDPOINTS.getIntelligenceItem,{params:{itemId}});save('item-after',detail);
  const evidence=await snapshot('formal-chain');expect(evidence).toBeTruthy();
  const child=evidence!.rows.find(row=>row.id===topicTaskId);expect(child).toMatchObject({kind:'topic_preview',ownerType:'transform',ownerId:itemId,status:'succeeded',groupId:ctx.groupId,accountId:null});
  const transform=detail.transforms.find((row:any)=>row.id===transformId);expect(transform).toBeTruthy();expect(transform.aiTaskId).toBe(topicTaskId);expect(transform.outputSnapshot).toMatchObject({...decomposition,...topic,adaptedDraft:{contentText:draft},generationProgress:{decomposition:{status:'completed'},topic:{status:'completed'},draft:{status:'completed'}}});
  const modelCalls=evidence!.calls.filter(row=>row.executionTaskId===topicTaskId&&row.kind==='model');expect(modelCalls).toHaveLength(3);expect(modelCalls.every(row=>row.status==='settled'&&row.rejectionCode===null)).toBe(true);expect(modelRequests).toHaveLength(3);
  const modelInput=(child!.payload as any).intelligenceGeneration.input;expect(modelInput).toMatchObject({kind:'model.structured',capability:'topic.generate',facets:{mode:'topic_preview'}});expect(JSON.parse(modelInput.facets.target)).toMatchObject({generationMode:'strategy_backed',transformId,positioningVersionId:statement.id});
  expect(owned.boundary).toHaveLength(1);expect(owned.boundary[0]).toMatchObject({queueTaskId:parentId,groupId:ctx.groupId,accountId:null});
  const projectsAfter=await call(ENDPOINTS.listProjects,{query:{page:1,pageSize:100}});save('projects-after',{before:beforeProjects,after:projectsAfter});
  save('RESULT',{status:settled.status==='succeeded'?'CONTROLLED_CHAIN_REACHED_SUCCESS_ASSERTIONS':'CONTROLLED_CHAIN_REACHED_TERMINAL_FAILURE',parentId,topicTaskId,transformId,boundary:owned.boundary,actualRequests:modelRequests.length,modelCalls:modelCalls.length,externalPaidModels:0,expected:'真实原父成功且同组项目创建',meaning:'Vitest原始断言是最终受控结果；blocked不是PASS/新包模型验收'});
  // 改前必须自然失败于真实账号门；不得把预期错误写成通过。
  if(settled.status!=='succeeded'){expect(owned.boundary[0].errorName,'目标RED必须是真实末端账号门，不是其它准备失败').toBe('AccountRequiredError');expect(projectsAfter,'失败不能有项目/子资料孤儿').toEqual(beforeProjects);}
  expect(settled.status,JSON.stringify({status:settled.status,errorCode:settled.errorCode,boundary:owned.boundary})).toBe('succeeded');
  projectId=settled.checkpoint?.projectId??'';expect(projectId).toBeTruthy();
  const project=await call(ENDPOINTS.getProject,{params:{projectId}}),stages=await call(ENDPOINTS.listStages,{params:{projectId}});
  const [projectRow]=await owned.db!.select().from(projects).where(eq(projects.id,projectId));
  expect(projectRow).toMatchObject({id:projectId,userId:ctx.userId,groupId:ctx.groupId,accountId:null});
  expect(project).toMatchObject({title:topic.title,briefDetail:{targetAudience:topic.targetAudience,coreMessage:topic.angle,contentFormat:topic.format,contentRadarEvidence:{decomposition, strategy:topic.adaptationStrategy,adaptedDraftSeed:{contentText:draft}}}});expect(stages).toHaveLength(7);
  const activities=await owned.db!.select().from(projectActivities).where(eq(projectActivities.projectId,projectId));expect(activities.filter(row=>row.eventType==='project_created')).toHaveLength(1);
  expect(projectsAfter.filter((row:any)=>!beforeProjects.some((old:any)=>old.id===row.id))).toHaveLength(1);
  const repeat=await call(ENDPOINTS.enqueueIntelligenceProjectUpgrades,{body:{itemIds:[itemId],positioningVersionId:statement.id,idempotencyKey:'t1332-owned-upgrade-public-idempotent-readback'}});expect(repeat.tasks[0].id).toBe(parentId);expect(repeat.tasks[0].checkpoint.projectId).toBe(projectId);expect(modelRequests).toHaveLength(3);
  expect(await call(ENDPOINTS.getProject,{params:{projectId}})).toEqual(project);expect(await call(ENDPOINTS.getIntelligenceItem,{params:{itemId}})).toEqual(detail);
  save('green-public-readback',{project,stages,activities,repeat,originalItemAndSourcesUntouched:true});
 }catch(error){primaryFailed=true;primaryFailure=error;}finally{
  let finalSnapshotErrorName:string|null=null;
  try{await snapshot('finally-before-dispose');}catch(error){finalSnapshotErrorName=error instanceof Error?error.name:'NonErrorThrown';if(!primaryFailed){primaryFailed=true;primaryFailure=error;}}
  finally{
   const errors:string[]=finalSnapshotErrorName?[`SNAPSHOT_${finalSnapshotErrorName}`]:[];
   try{const dispose=(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence;disposeAvailable=typeof dispose==='function';if(disposeAvailable){await dispose!();hostDisposed=true;}}catch(error){errors.push(error instanceof Error?error.name:'UnknownError');}
   try{if(server){server.closeAllConnections();await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));serverClosed=true;}}catch(error){errors.push(error instanceof Error?error.name:'UnknownError');}
   save('public-calls',publicCalls);save('supplier-requests',{network,modelRequests,protocolErrors});save('cleanup',{hostDisposed,disposeAvailable,hostInitializationStarted,hostInitialized,hostState:hostDisposed?'DISPOSED':disposeAvailable?'DISPOSE_FAILED':hostInitializationStarted?'INITIALIZATION_FAILED':'NOT_CREATED',primaryFailed,primaryFailureName:primaryFailure instanceof Error?primaryFailure.name:primaryFailed?'NonErrorThrown':null,serverCreated:server!==null,serverClosed,errors,forks:owned.forks,sourceId,itemId,parentId,topicTaskId,transformId,projectId,elapsedMs:Date.now()-start,dbRetainedForEvidence:true});
   __resetPersistenceForTests();vi.unstubAllGlobals();vi.unstubAllEnvs();
   if(!primaryFailed){expect(errors,'清理异常保留').toEqual([]);expect(hostInitialized,'业务通过必须真实创建host').toBe(true);expect(hostDisposed,'真实host必须正常dispose').toBe(true);expect(owned.forks.every(row=>row.exited),'所有实际fork均已退出').toBe(true);}
  }
 }
 if(primaryFailed)throw primaryFailure;
},28_800_000);
