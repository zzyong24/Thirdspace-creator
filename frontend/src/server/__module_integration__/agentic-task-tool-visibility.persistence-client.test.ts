// @vitest-environment node
import {it, expect, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {createHash, randomBytes} from 'node:crypto';
import {ENDPOINTS, type Endpoint, type RequestContext} from '@creatoros/contract';
import type {ObjectStoragePort} from '@creatoros/backend/modules/assets';
import {aiTasks, executionTasks, executionCalls, intelligenceItems, intelligenceSources, intelligenceSyncRuns, sourceSnapshots, aiTaskResults, executionEvidence, eq, asc, type Db} from '@creatoros/backend';
const owned = vi.hoisted(() => ({root: '', db: null as Db | null, host: null as any, errors: [] as any[], domainErrors: [] as any[], ports: [] as any[], storage: null as ObjectStoragePort | null, beforeInvoke: null as null | ((ref: any, port: any, input: any, invoke: any) => Promise<void>)}));
function observe(event:Record<string,unknown>){try{if(owned.root)fs.appendFileSync(path.join(owned.root,'transparent-host.ndjson'),JSON.stringify({at:new Date().toISOString(),...event})+'\n');}catch{/* 观测不得替换原结果/异常。 */}}
function safeReceipt(value:any){const out:Record<string,unknown>={};if(!value||typeof value!=='object')return out;for(const key of ['id','callId','status','runtimeStatus','outcome','reason','lastModelCallId'])if(typeof value[key]==='string')out[key]=value[key];return out;}
function safeError(error:unknown){return{name:error instanceof Error?error.name:'Other',code:error instanceof Error&&/^[A-Z][A-Z0-9_]{0,95}$/.test(error.message)?error.message:null};}
vi.mock('node:child_process',async original=>{const actual=await original<typeof import('node:child_process')>();return{...actual,fork:(...args:Parameters<typeof actual.fork>)=>{const child=actual.fork(...args);observe({event:'child-fork',pid:child.pid??null});child.on('message',(raw:any)=>observe({event:'child-ipc',pid:child.pid??null,type:raw?.type??null,port:raw?.port??null,requestId:raw?.requestId??null,callSeq:raw?.callSeq??null,taskId:raw?.execution?.executionTaskId??null,attempt:raw?.execution?.attempt??null,reason:raw?.reason??null}));child.once('exit',(code,signal)=>observe({event:'child-exit',pid:child.pid??null,code,signal}));return child;}};});
vi.mock('@creatoros/backend', async original => {
  const actual = await original<typeof import('@creatoros/backend')>();
  return {...actual, createConfiguredDb: async (...args: Parameters<typeof actual.createConfiguredDb>) => {
    const value = await actual.createConfiguredDb(...args); owned.db = value.db; return value;
  }};
});
vi.mock('@creatoros/backend/modules/assets', async original => {
  const actual = await original<typeof import('@creatoros/backend/modules/assets')>();
  return {...actual, createLocalFsObjectStorage: (...args: Parameters<typeof actual.createLocalFsObjectStorage>) => {
    owned.storage = actual.createLocalFsObjectStorage(...args); return owned.storage;
  }};
});
vi.mock('@creatoros/backend/modules/intelligence', async original => {
  const actual = await original<typeof import('@creatoros/backend/modules/intelligence')>();
  return {...actual, createCollectionToolPorts: (...args: Parameters<typeof actual.createCollectionToolPorts>) => {
    const ports = actual.createCollectionToolPorts(...args);
    return {...ports, async runCollection(...input: Parameters<typeof ports.runCollection>) {
      try {return await ports.runCollection(...input);}
      catch (error) {
        const e = error as Error;
        owned.domainErrors.push({port: 'collection.runCollection', context: args[0], parentTaskId: args[1], input: input[0], name: e.name, message: e.message, stack: (e.stack ?? '').split('\n').filter((line, index) => index === 0 || line.includes('/backend/src/')).slice(0, 12)});
        throw error;
      }
    }};
  }};
});
vi.mock('@/server/activation/client-config.server', async original => ({...await original<typeof import('@/server/activation/client-config.server')>(), readChannelModelAuthority: async () => ({authority: 'local'})}));
vi.mock('@creatoros/backend/modules/ai-runtime', async original => {
  const actual = await original<typeof import('@creatoros/backend/modules/ai-runtime')>();
  const status = {engine: 'codex' as const, installed: true, available: true, version: '0.159.3', defaultModelId: 't1334-fixture-model', availableModels: [{id: 't1334-fixture-model', inputModalities: ['text', 'image']}], loginStatus: 'authenticated' as const, capabilities: {text: true, imageUnderstanding: true, imageGeneration: true, imageEditing: 'unverified' as const}};
  return {...actual, createLocalCodexStatusService: () => ({read: async () => structuredClone(status), peek: () => structuredClone(status), stop: async () => {}})};
});
vi.mock('@/server/execution-worker-path', async original => ({...await original<typeof import('@/server/execution-worker-path')>(), resolveAgenticWorkerPath: () => path.resolve('../docs/verification/t1334/runtime/diagnostic-research-v3/worker-entry.fixture.cjs')}));
vi.mock('@creatoros/backend/modules/execution', async original => {
  const actual = await original<typeof import('@creatoros/backend/modules/execution')>();
  return {...actual,
    createAgenticWorkerDispatcher: (...args: Parameters<typeof actual.createAgenticWorkerDispatcher>) => {
      owned.host = actual.createAgenticWorkerDispatcher(...args); return owned.host;
    },
    createModelWorkerDispatcher: (...args: Parameters<typeof actual.createModelWorkerDispatcher>) => {
      return actual.createModelWorkerDispatcher(...args);
    },
  };
});
vi.mock('node:dns/promises', async original => {
  const actual = await original<typeof import('node:dns/promises')>();
  return {...actual, lookup: async (host: string) => {
    if (host !== 't1334-fixture.example') throw Error('OWNED_DNS_ONLY');
    return [{address: '93.184.216.34', family: 4}];
  }};
});
vi.mock('../../../../backend/src/modules/execution/worker-supervisor', async original => {
  const actual = await original<typeof import('../../../../backend/src/modules/execution/worker-supervisor')>();
  return {...actual, createWorkerSupervisor: (options: Parameters<typeof actual.createWorkerSupervisor>[0]) => actual.createWorkerSupervisor({...options,
    extraEnv: {...options.extraEnv, T1334_PHASE_ROOT: process.env.T1334_PHASE_ROOT!, T1334_RUN_ID: process.env.T1334_RUN_ID! , T1334_FIXTURE_ROOT: owned.root, T1334_HTTP_ORIGIN: process.env.T1334_HTTP_ORIGIN!, T1334_CHROMIUM_EXECUTABLE: process.env.T1334_CHROMIUM_EXECUTABLE!, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH!, NODE_PATH: [path.resolve('node_modules'),path.resolve('../ai-worker/node_modules')].join(path.delimiter), CODEX_HOME: path.join(owned.root, 'empty-codex-home'), TMPDIR: path.join(owned.root, 'tmp'), TMP: path.join(owned.root, 'tmp'), TEMP: path.join(owned.root, 'tmp')},
    ports: {...options.ports, async validate(ref,mode){observe({event:'validate-enter',mode,taskId:ref.executionTaskId,attempt:ref.attempt});try{const value=await options.ports.validate(ref,mode);observe({event:'validate-fulfilled',mode,taskId:ref.executionTaskId,attempt:ref.attempt});return value;}catch(error){observe({event:'validate-rejected',mode,taskId:ref.executionTaskId,attempt:ref.attempt,...safeError(error)});throw error;}}, async invoke(ref, port, input) {
      await owned.beforeInvoke?.(ref, port, input, options.ports.invoke);
      owned.ports.push({port, callId: (input as any)?.callId ?? null});
      observe({event:'port-enter',port,taskId:ref.executionTaskId,attempt:ref.attempt,callId:(input as any)?.callId??null,...safeReceipt(input)});
      try {const value=await options.ports.invoke(ref, port, input);observe({event:'port-fulfilled',port,taskId:ref.executionTaskId,attempt:ref.attempt,...(['resolveModelCredential','readTaskContext'].includes(port)?{}:safeReceipt(value))});return value;}
      catch (error) {observe({event:'port-rejected',port,taskId:ref.executionTaskId,attempt:ref.attempt,...safeError(error)});const e = error as Error; owned.errors.push({port, message: e.message, stack: (e.stack ?? '').split('\n').filter((line, index) => index === 0 || line.includes('/backend/src/')).slice(0, 12)}); throw error;}
    }},
  })};
});
import {compositeTransport, getChatRuntime, getIdentityService, __resetPersistenceForTests} from '@/server/persistence-client';
import {assertUrlAllowed} from '@/server/ingestion/url-guard';
const runtime = process.env.T1334_PHASE_ROOT!;
const digest=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const save=(name:string,value:unknown)=>fs.writeFileSync(path.join(owned.root,name+'.json'),JSON.stringify(value,null,2)+'\n');
const selected=(process.env.T1334_CASES??'collect,material,research').split(',');
it.each(selected)('自主任务动态工具可见性完整公共链 %s',async name=>{
 expect(['collect','material','research']).toContain(name);
 if(runtime===undefined)throw new Error('T1334_PHASE_ROOT_REQUIRED');
 const ownedBase=process.env.T1341_MAINTENANCE==='1'?'/Volumes/T7-MacData/CodexBuilds/t1341-asset-real-tags-20261017-b1c02e13':'/Volumes/T7-MacData/CodexBuilds/t1334-tool-visibility-20261017-706cfbe7';expect(runtime.startsWith(ownedBase+path.sep)).toBe(true);expect(fs.lstatSync(ownedBase).isSymbolicLink()).toBe(false);
 owned.root=path.join(runtime,'cases',process.env.T1334_RUN_ID!,name);for(const dir of ['','tmp','media','workspaces','empty-codex-home'])fs.mkdirSync(path.join(owned.root,dir),{recursive:true,mode:0o700});
 owned.db=null;owned.host=null;owned.errors=[];owned.domainErrors=[];owned.ports=[];owned.storage=null;owned.beforeInvoke=null;
 for(const[key,value]of Object.entries({DATABASE_URL:'',PGLITE_DATA_DIR:path.join(owned.root,'db'),CREATOROS_MASTER_KEY:randomBytes(32).toString('base64'),CREATOROS_MASTER_KEY_FD:'',CREATOROS_MASTER_KEY_FILE:'',CREATOROS_STORAGE:'local',CREATOROS_MEDIA_ROOT:path.join(owned.root,'media'),CREATOROS_WORKSPACES_ROOT:path.join(owned.root,'workspaces'),CREATOROS_DISABLE_BACKGROUND_DRIVERS:'1',CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_CLIENT_CONFIG_PULL_ENABLED:'0',CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH:path.join(owned.root,'missing-seed'),TMPDIR:path.join(owned.root,'tmp'),TMP:path.join(owned.root,'tmp'),TEMP:path.join(owned.root,'tmp')}))vi.stubEnv(key,value);
 __resetPersistenceForTests();
 const requests:unknown[]=[],rss='<?xml version="1.0"?><rss version="2.0"><channel><title>受控中性来源</title><link>https://t1334-fixture.example/</link><description>合成HTTP，仅验证业务传输</description><item><guid>t1334-owned-item</guid><title>记录一次桌面整理</title><link>https://t1334-fixture.example/item</link><description>先写下问题，一次只改变一个条件，并把实际观察和解释分开。这是受控来源，不是公网新闻或真实供应商结果。</description><pubDate>Fri, 16 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>';
 const html='<!doctype html><html lang="zh"><head><title>受控来源记录方法</title></head><body><main><article><h1>记录一次尝试</h1>'+Array.from({length:12},(_,i)=>'<p>第'+(i+1)+'段：先写下问题，再确定一次只改变一个条件。把实际看到的结果和自己的解释分开；没有记录时不补造数字，不宣称已经取得成效。单次尝试不是普遍结论。这是明确标记的受控测试来源。</p>').join('')+'</article></main></body></html>';
 const server=createServer((req,res)=>{const content=req.url==='/rss'?rss:req.url==='/article'?html:null;requests.push({method:req.method,path:req.url,status:content?200:404,contentType:req.url==='/rss'?'application/rss+xml':'text/html',bytes:content?Buffer.byteLength(content):0,sha256:content?digest(content):null});req.resume();res.writeHead(content?200:404,{'content-type':req.url==='/rss'?'application/rss+xml':'text/html; charset=utf-8'});res.end(content??'Not found');save('owned-http',requests);});
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const origin=`http://127.0.0.1:${(server.address()as{port:number}).port}`;vi.stubEnv('T1334_HTTP_ORIGIN',origin);
 const feedUrl='https://t1334-fixture.example/rss',researchUrl='https://t1334-fixture.example/article',actualFetch=globalThis.fetch;
 vi.stubGlobal('fetch',async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;if(url!==feedUrl)throw Error('OWNED_FETCH_ONLY');const response=await actualFetch(origin+'/rss',init);save('rss-transport',{requestedUrl:url,actualTransportUrl:response.url,method:init?.method??'GET',signalPreserved:Boolean(init?.signal),status:response.status,contentType:response.headers.get('content-type')});return response;});
 let ctx:RequestContext,taskId='';const start=Date.now(),deadline=start+1800000;const remaining=()=>{const value=deadline-Date.now();if(!Number.isFinite(value)||value<=0)throw Error('ORIGINAL_ROOT_DEADLINE_NO_RESEND');return value;};
 const call=async(endpoint:Endpoint,input:any={},scope=ctx):Promise<any>=>{remaining();const value=await compositeTransport.request(endpoint,input,scope);return(value as{data:any}).data;};
 const snapshot=async(label:string)=>{if(!owned.db)return;save(label,{business:await owned.db.select().from(aiTasks),tasks:(await owned.db.select().from(executionTasks)).map(x=>({...x,fenceToken:x.fenceToken?digest(x.fenceToken):null})),calls:await owned.db.select().from(executionCalls).orderBy(asc(executionCalls.sequence)),results:await owned.db.select().from(aiTaskResults),evidence:await owned.db.select().from(executionEvidence),ports:owned.ports,errors:owned.errors,domainErrors:owned.domainErrors,requests});};
 try{
  const binding=JSON.parse(fs.readFileSync(path.join(runtime,'WORKER_BINDING.json'),'utf8')),worker=fs.readFileSync(binding.executionWorkerPath);expect(worker.length).toBe(binding.bytes);expect(createHash('sha256').update(worker).digest('hex')).toBe(binding.sha256);
  await getChatRuntime();ctx={...await(await getIdentityService()).resolveLocalContext(),accountId:null};const group=await call(ENDPOINTS.createAccountGroup,{body:{name:'T1334受控纯组',idempotencyKey:'t1334-group-'+name}});ctx={...ctx,groupId:group.id,groupVersion:group.version};
  const routing=await call(ENDPOINTS.getModelRouting);await call(ENDPOINTS.putModelRouting,{body:{schemaVersion:1,expectedRevision:routing.revision,choices:{text:'codex',vision:'codex',image:'codex',video:'official',audio:'official',embed:'official'}}});
  const guardProof=[];for(const url of ['http://127.0.0.1/rss','http://10.0.0.1/rss','http://169.254.169.254/latest/meta-data']){let rejected=false;try{await assertUrlAllowed(url);}catch{rejected=true;}expect(rejected).toBe(true);guardProof.push({url,rejected});}await assertUrlAllowed(feedUrl);save('production-url-guard',guardProof);
  const source=await call(ENDPOINTS.createIntelligenceSource,{body:{collectionId:null,type:'rss',config:{type:'rss',url:feedUrl},displayName:'受控RSS',monitorEnabled:false,runInitial:false,idempotencyKey:'t1334-source-'+name}});expect(source.run).toBeNull();expect(source.task).toBeNull();save('source-created',source);
  let asset:any=null;if(name==='material'){const bytes=Buffer.from('受控中性资料：记录一次尝试，不编造成效。');const upload=await call(ENDPOINTS.createUpload,{body:{assetType:'document',mimeType:'text/plain',fileSize:bytes.length,fileName:'t1334-owned.txt'}});await owned.storage!.putObject({storageKey:upload.storageKey,bytes,mimeType:'text/plain',assetType:'document'});asset=await call(ENDPOINTS.completeUpload,{params:{uploadId:upload.uploadId},body:{name:'T1334 中性素材'}});save('asset-created',asset);}
  const tag='受控中性资料',beforeTags=asset?await call(ENDPOINTS.listTagsForEntity,{query:{entityType:'asset',entityId:asset.id}}):[],beforeKnowledge=await call(ENDPOINTS.listKnowledge,{query:{page:1,pageSize:100}});
  const scenario={kind:name,sourceId:source.source.id,assetId:asset?.id??null,tag,researchUrl,externalModels:0,originalDeadlineAt:new Date(deadline).toISOString()};save('scenario',scenario);
  const body={attemptId:'t1334-public-'+name,spec:{taskType:'agentic.'+name,goal:name==='collect'?`受控采集来源${source.source.id}，plan/run/status到真实回执。`:name==='material'?`只为真实素材${asset.id}提出标签，不直接采纳。`:`读取${researchUrl}，沿真实证据提出来源笔记，不直接采纳。`,inputs:[],params:{maxSteps:20,maxTokens:100000,...(name!=='collect'?{dryRun:false}:{})},constraints:{timeoutSec:1800,network:'deny',maxOutputMB:512}}};save('public-submission',{ctx,body,originalDeadlineAt:new Date(deadline).toISOString(),naturalHostStart:true});
  const created=await call(ENDPOINTS.createExecutionTask,{body});taskId=created.id;save('public-created',created);
  let lastObserved=0;let business:any;for(;;){business=await call(ENDPOINTS.getTask,{params:{taskId}});save('public-current',{business,at:new Date().toISOString(),originalDeadlineAt:new Date(deadline).toISOString()});if(Date.now()-lastObserved>=10000){lastObserved=Date.now();try{const tasks=await owned.db!.select().from(executionTasks),calls=await owned.db!.select().from(executionCalls);save('transparent-state',{at:new Date().toISOString(),business:safeReceipt(business),tasks:tasks.map(t=>({id:t.id,status:t.status,attempt:t.attempt,leaseOwner:t.leaseOwner,leaseExpiresAt:t.leaseExpiresAt,heartbeatAt:t.heartbeatAt,deadlineAt:t.deadlineAt,lastErrorCode:t.lastErrorCode})),calls:calls.map(c=>({id:c.id,kind:c.kind,status:c.status,executionTaskId:c.executionTaskId,providerResultPresent:c.providerResult!==null}))});}catch(error){observe({event:'state-observation-error',...safeError(error)});}}if(['succeeded','awaiting_confirmation','failed','cancelled','unknown_result','waiting_user','blocked'].includes(business.status)||['succeeded','awaiting_confirmation','failed','cancelled','unknown_result','waiting_user','blocked'].includes(business.runtimeStatus??''))break;await new Promise(resolve=>setTimeout(resolve,Math.min(500,remaining())));}
  const results=await call(ENDPOINTS.listTaskResults,{params:{taskId}});save('public-results',results);await snapshot('terminal-before-assertions');
  const rawCalls=await owned.db!.select().from(executionCalls).orderBy(asc(executionCalls.sequence));const toolCalls=rawCalls.filter(c=>c.kind==='tool'),models=rawCalls.filter(c=>c.kind==='model');
  const nativePath=path.join(owned.root,'native-rpc.ndjson'),native=fs.existsSync(nativePath)?fs.readFileSync(nativePath,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];save('native-audit-availability',{present:fs.existsSync(nativePath),publicStatus:business.status,publicRuntimeStatus:business.runtimeStatus??null,publicErrorCode:business.errorCode??null});save('visibility-and-ledger',{business,rawCalls,native,expectedBusinessStatus:name==='collect'?'succeeded':'awaiting_confirmation'});
  // 修改前目标RED必须先由原公共业务终态证明，不以argv断言替代业务失败。
  expect(business.status,'目标：实际公共业务必须完成或形成正式可采纳候选').toBe(name==='collect'?'succeeded':'awaiting_confirmation');
  expect(models).toHaveLength(1);expect(models[0]!.status).toBe('settled');expect(toolCalls.length).toBeGreaterThan(0);const configs=native.filter(x=>x.method==='ACTUAL_CLI_CONFIGURATION');expect(configs).toHaveLength(2);for(const x of configs){expect(x.config.features.code_mode).toEqual({enabled:false,direct_only_tool_namespaces:['functions']});expect(x.config.web_search).toBe('disabled');expect(x.config.features.shell_tool).toBe(false);expect(x.config.features.unified_exec).toBe(false);expect(x.config.features.browser_use).toBe(false);expect(x.config.features.image_generation).toBe(false);expect(x.config.mcp_servers).toEqual({});}
  const [execution]=await owned.db!.select().from(executionTasks).where(eq(executionTasks.id,business.executionTaskId));const originalTools=(execution!.payload as any).modelInput.tools;const thread=native.find(x=>x.method==='thread/start');expect(thread.params.dynamicTools).toEqual(originalTools.map((t:any)=>({name:t.name.replace(/[^a-zA-Z0-9_-]/g,'_'),description:t.description,inputSchema:t.parameters})));
  const receipts=toolCalls.map(row=>{expect(row.status).toBe('settled');const value=JSON.parse(row.resultText!);expect(value.output.error).toBeNull();expect(value.output.sideEffect).not.toBe('unknown');return{row,...value};});save('actual-tool-receipts',receipts);
  for(const request of native.filter(x=>x.method==='registered-tool-request')){const original=originalTools.find((t:any)=>t.name.replace(/[^a-zA-Z0-9_-]/g,'_')===request.name);expect(original).toBeTruthy();const receipt=receipts.find(r=>r.toolCallId===request.toolCallId);expect(receipt?.toolName).toBe(original.name);const modelParts=(models[0]!.providerResult as any).content;expect(modelParts).toContainEqual(expect.objectContaining({type:'tool-call',toolCallId:request.toolCallId,toolName:original.name,input:JSON.stringify(request.args)}));}
  if(name==='collect'){const items=await owned.db!.select().from(intelligenceItems),runs=await owned.db!.select().from(intelligenceSyncRuns),snapshots=await owned.db!.select().from(sourceSnapshots);expect(items).toHaveLength(1);expect(runs).toHaveLength(1);expect(snapshots).toHaveLength(1);expect(runs[0]!.status).toBe('succeeded_with_items');expect(runs[0]!.sourceId).toBe(source.source.id);expect(results.find((x:any)=>x.resultType==='execution_manifest')?.resultData.collections).toContainEqual(expect.objectContaining({targetId:source.source.id,ok:true}));save('collection-output',{items,runs,snapshots});}
  else{const candidate=results.find((x:any)=>x.resultType==='agentic_proposals');expect(candidate).toBeTruthy();expect(candidate.resultData.proposals).toHaveLength(1);const proposal=candidate.resultData.proposals[0];expect(proposal.source.taskId).toBe(taskId);const tool=receipts.find(r=>r.toolCallId===proposal.source.toolCallId);expect(tool?.output.data.proposal).toEqual(proposal);
   if(name==='material'){expect(proposal.kind).toBe('asset.tags');expect(proposal.tag).toBe(tag);expect(proposal.targets.map((t:any)=>t.assetId)).toEqual([asset.id]);expect(await call(ENDPOINTS.getAsset,{params:{assetId:asset.id}})).toEqual(asset);expect(await call(ENDPOINTS.listTagsForEntity,{query:{entityType:'asset',entityId:asset.id}})).toEqual(beforeTags);}
   else{expect(proposal.kind).toBe('knowledge.create');expect(await call(ENDPOINTS.listKnowledge,{query:{page:1,pageSize:100}})).toEqual(beforeKnowledge);const evidence=await owned.db!.select().from(executionEvidence);expect(evidence).toHaveLength(1);expect(proposal.source.evidenceRefs).toEqual([evidence[0]!.id]);expect(proposal.content.sourceNote).toBe(evidence[0]!.sourceUrl);expect(evidence[0]!.sourceUrl).toBe(researchUrl);expect(evidence[0]!.fullText).toContain('把实际看到的结果和自己的解释分开');save('real-research-evidence',evidence);const reads=receipts.filter(r=>r.toolName==='web.read');expect(reads[0].output.data.offset).toBe(0);expect(reads.at(-1).output.data.nextOffset).toBeNull();}
   await call(ENDPOINTS.confirmExecutionTask,{params:{taskId}});const adopted=await call(ENDPOINTS.listTaskResults,{params:{taskId}}),final=await call(ENDPOINTS.getTask,{params:{taskId}});expect(final.status).toBe('succeeded');const receipt=adopted.find((x:any)=>x.id===candidate.id).resultData.adoptionReceipts;expect(receipt).toHaveLength(1);expect(receipt[0].proposalId).toBe(proposal.proposalId);
   if(name==='material'){
    const tags=await call(ENDPOINTS.listTagsForEntity,{query:{entityType:'asset',entityId:asset.id}}),approved=[...beforeTags.map((x:any)=>({id:x.id,name:x.name})),{id:receipt[0].result.tagId,name:proposal.tag}],sort=(rows:any[])=>rows.map(({id,name}:any)=>({id,name})).sort((a,b)=>a.id.localeCompare(b.id));
    expect(sort(tags)).toEqual(sort(approved));expect(receipt[0].result.assetIds).toEqual([asset.id]);
    const afterAsset=await call(ENDPOINTS.getAsset,{params:{assetId:asset.id}});expect(sort(afterAsset.tags)).toEqual(sort(approved));expect(afterAsset).toEqual({...asset,tags:afterAsset.tags});
    await call(ENDPOINTS.confirmExecutionTask,{params:{taskId}});const repeatedAsset=await call(ENDPOINTS.getAsset,{params:{assetId:asset.id}}),repeatedTags=await call(ENDPOINTS.listTagsForEntity,{query:{entityType:'asset',entityId:asset.id}});expect(repeatedAsset).toEqual(afterAsset);expect(repeatedTags).toEqual(tags);expect(await call(ENDPOINTS.listTaskResults,{params:{taskId}})).toEqual(adopted);
    save('adopted-tags',tags);save('material-projection-and-replay',{approved,afterAsset,repeatedAsset,tags,repeatedTags,allOtherAssetFieldsUnchanged:true});
   }
   else{const knowledge=await call(ENDPOINTS.getKnowledge,{params:{knowledgeId:proposal.target.knowledgeId}}),versions=await call(ENDPOINTS.listKnowledgeRevisions,{params:{knowledgeId:proposal.target.knowledgeId}});expect(knowledge.title).toBe(proposal.content.title);expect(knowledge.sourceNote).toBe(researchUrl);expect(knowledge.sourceMetadata.proposalId).toBe(proposal.proposalId);expect(knowledge.sourceMetadata.evidenceRefs).toEqual(proposal.source.evidenceRefs);expect(versions.find((x:any)=>x.id===knowledge.currentRevisionId)?.content).toBe(proposal.content.note);save('adopted-knowledge',{knowledge,versions});}save('adoption',{proposal,results:adopted,final});
  }
  expect(owned.errors).toEqual([]);expect(owned.domainErrors).toEqual([]);await snapshot('after-full-public-chain');save('RESULT',{state:'CONTROLLED_PUBLIC_CHAIN_PASS',kind:name,taskId,executionTaskId:business.executionTaskId,actualExternalModels:0,realSupplierModelViewProven:false,naturalDriver:true});
 }finally{
  const cleanup:any={host:owned.host?'NOT_CLOSED':'NOT_CREATED',persistence:'NOT_OBSERVED',reset:false,http:false,globals:false,envs:false,errors:[],originalTaskId:taskId||null,externalModels:0,oldDatabasesTouched:false};const step=async(label:string,fn:()=>Promise<unknown>|unknown)=>{try{await fn();return true;}catch(e){cleanup.errors.push({label,name:e instanceof Error?e.name:'Other'});return false;}};
  await step('snapshot',()=>snapshot('before-cleanup'));if(owned.host&&await step('host',()=>owned.host.stop()))cleanup.host='STOPPED';const dispose=(globalThis as{__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence;if(typeof dispose==='function'&&await step('persistence',()=>dispose()))cleanup.persistence='DISPOSED';else if(typeof dispose!=='function')cleanup.persistence='NOT_CREATED';cleanup.reset=await step('reset',()=>__resetPersistenceForTests());cleanup.http=await step('http',async()=>{server.closeAllConnections();if(server.listening)await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));expect(server.listening).toBe(false);});cleanup.globals=await step('globals',()=>vi.unstubAllGlobals());cleanup.envs=await step('envs',()=>vi.unstubAllEnvs());save('cleanup',cleanup);expect(cleanup.errors).toEqual([]);
 }
},28800000);
