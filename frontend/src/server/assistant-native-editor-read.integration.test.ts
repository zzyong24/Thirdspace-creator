// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {ENDPOINTS,NATIVE_DOCUMENT_VERSION,NATIVE_SOURCE_REVISION,workEditorTarget,type Endpoint,type RequestContext} from '@creatoros/contract';
import type {Db} from '@creatoros/backend';
import {workerToolResultReceiptSchema,agenticToolOutcomeSchema} from '@creatoros/contract/execution-worker';
import type {ChatWorkbenchCapabilityHost} from '../../../backend/src/modules/ai-runtime/chat-workbench-capability-host';
import {configureModelFixture} from '../test/configure-model-fixture';
const fixture=vi.hoisted(()=>({db:undefined as Db|undefined}));
vi.mock('@creatoros/backend',async original=>{const actual=await original<typeof import('@creatoros/backend')>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const result=await actual.createConfiguredDb(...args);fixture.db=result.db;return result;}};});
vi.mock('@creatoros/backend/modules/assets',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/assets')>();return {...actual,migrateStorageRoot:async()=>{throw Error('本隔离夹具禁止迁移媒体目录');}};});
vi.mock('@creatoros/backend/modules/ai-runtime',async original=>{
 const actual=await original<typeof import('@creatoros/backend/modules/ai-runtime')>();
 return {...actual,createLocalCodexStatusService:()=>{
  const status={engine:'codex' as const,installed:true,available:true,version:'0.159.3',defaultModelId:'native-read-codex-fixture',availableModels:[{id:'native-read-codex-fixture',inputModalities:['text']}],loginStatus:'authenticated' as const,capabilities:{text:true,imageUnderstanding:false,imageGeneration:false,imageEditing:'unavailable' as const}};
  return {read:async()=>structuredClone(status),peek:()=>structuredClone(status),stop:async()=>{}};
 }};
});
import {getChatRuntime,compositeTransport,__resetPersistenceForTests} from './persistence-client';
import {prepareChatReply} from './prepare-chat-reply';

/** 只经原合同/公开transport建夹具和读owner；没有手造返回DTO或模型/凭据。 */
async function publicData(id:string,ctx:RequestContext,params?:unknown,body?:unknown,query?:unknown):Promise<unknown>{
 const endpoint=Object.values(ENDPOINTS).find(operation=>operation.id===id)!;
 if(!endpoint)throw Error(`未知正式合同:${id}`);
 const response=await compositeTransport.request(endpoint,{params:endpoint.params?.parse(params),body:endpoint.body?.parse(body),query:endpoint.query?.parse(query??{})} as never,ctx) as {data:unknown};
 return endpoint.isList?endpoint.response.array().parse(response.data):endpoint.response.parse(response.data);
}
type ReadResult={kind:'system.read';requestKind:string;text:string;complete:boolean;observedRevision?:number};
// 仅校验夹具协议机械字段，业务 DTO 始终使用正式合同。
function parseReadResult(value:unknown):ReadResult{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('不是读取回执');
 const row=value as Record<string,unknown>;
 if(row.kind!=='system.read'||typeof row.requestKind!=='string'||typeof row.text!=='string'||typeof row.complete!=='boolean'||(row.observedRevision!==undefined&&typeof row.observedRevision!=='number'))throw Error('读取回执字段不完整');
 return value as ReadResult;
}
function tryReadResult(value:unknown):ReadResult|null{try{return parseReadResult(value);}catch{return null;}}
/** SEMANTIC_BOUNDARY_ALLOW:仅解包真实供应商tool协议中的JSON；不匹配意图或挑选创作内容。 */
function collectReadResults(value:unknown,result:ReadResult[]=[]){
 if(typeof value==='string'){
  // SEMANTIC_BOUNDARY_ALLOW:仅移除原Worker展示协议固定的operationRef首行，不猜测业务内容或读取旁路。
  const text=value.replace(/^\[原工具调用 ID: [^\n]+；完成计划步骤时引用此 operationRef。\]\n/u,'');
  try{collectReadResults(JSON.parse(text),result);}catch{}return result;
 }
 if(Array.isArray(value)){for(const item of value)collectReadResults(item,result);return result;}
 if(!value||typeof value!=='object')return result;
 const parsed=tryReadResult(value);if(parsed){result.push(parsed);return result;}
 for(const item of Object.values(value))collectReadResults(item,result);return result;
}

it.each(['pure-group','group-account','legacy-registered','legacy-premigration'] as const)('T1086 %s 真实prepareChatReply冻结完整目录，公开owner→Worker/租约/账本只读当前工程和旧稿',{timeout:1200000,retry:0},async scope=>{
 console.info('[T1086-fixture] load-owned-modules',scope);
 const {executionTasks,executionCalls,aiTasks,aiTaskResults,aiMessages,projects,contentOutputs,productions,productionEditVersions,productionRenderRequests,artifacts,artifactVersions,eq}=await import('@creatoros/backend');
 const {accountGroups,accountGroupMemberships}=await import('../../../backend/src/schema/account-groups');
 const {createChatTurnSubmissionService}=await import('../../../backend/src/modules/ai/chat-turn-submission.service');
 const {createAiRepository}=await import('../../../backend/src/modules/ai/ai.repository');
 const {createChatHostContextReader}=await import('../../../backend/src/modules/ai/chat-host-context.service');
 const {createAssistantSystemRoot}=await import('../../../backend/src/application/chat/assistant-system-root');
 const {createCreativeCanvasService}=await import('../../../backend/src/modules/creative-canvas');
 const {createChatSystemToolHost}=await import('../../../backend/src/modules/ai-runtime/chat-system-tool-host');
 const {createChatTaskToolHost}=await import('../../../backend/src/modules/ai-runtime/chat-task-tool-host');
 const {createChatIngestionTaskToolHost}=await import('../../../backend/src/modules/ai-runtime/chat-ingestion-tool-host');
 const {createChatWorkbenchPlanToolHost}=await import('../../../backend/src/modules/ai-runtime/chat-workbench-plan-tool-host');
 const {createChatWorkbenchCapabilityHost}=await import('../../../backend/src/modules/ai-runtime/chat-workbench-capability-host');
 const {createExecutionLeaseService}=await import('../../../backend/src/modules/execution/execution-lease.service');
 const {createExecutionStreamService}=await import('../../../backend/src/modules/execution/execution-stream.service');
 const {createChatWorkerDispatcher}=await import('../../../backend/src/modules/execution/model-worker-dispatcher');
 const {loadPositioningWorksBrief}=await import('../../../backend/src/modules/ai-runtime/creative-context');
 const {workEditorContentDigest}=await import('../../../backend/src/modules/ai-runtime/work-editor-candidate');
 console.info('[T1086-fixture] owned-modules-loaded',scope);
 execFileSync(process.execPath,[resolve('../ai-worker/scripts/build.mjs')],{stdio:'pipe',timeout:1200000});
 vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR','');__resetPersistenceForTests();
 const requests:Array<Record<string,unknown>>=[],errors:string[]=[];let projectId='',fixtureTurn=0;
 const server=createServer(async(req,res)=>{
  try{
   let body='';for await(const chunk of req)body+=chunk.toString();const input=JSON.parse(body);requests.push(input);
   if(!input.tools?.some((tool:{function?:{name?:string}})=>tool.function?.name==='system_read'))throw Error('夹具要求完整冻结根工具，不能用stream猜调用角色');
   const observed=collectReadResults(input.messages),read=(kind:string)=>{const found=observed.find(item=>item.requestKind===kind);if(!found||!found.complete)throw Error(`上一轮真实读取未完整:${kind}`);return JSON.parse(found.text);};
   const outputs=fixtureTurn>=2?ENDPOINTS.listOutputs.response.array().parse(read('projects.outputs.list')):[];
   const oneOutput=(kind:string)=>{const rows=outputs.filter(row=>row.contentType===kind);if(rows.length!==1)throw Error(`真实作品不是唯一:${kind}`);return rows[0]!.id;};
   let name:string|null='system_read',args:unknown;
   switch(fixtureTurn++){
    case 0:name='system_features';args={feature:'video'};break;
    case 1:args={request:{kind:'projects.outputs.list',params:{projectId}}};break;
    case 2:args={request:{kind:'outputs.production.editor.get',params:{outputId:oneOutput('video')}}};break;
    case 3:args={request:{kind:'artifacts.list',params:{projectId}}};break;
    case 4:{const rows=ENDPOINTS.listArtifacts.response.array().parse(read('artifacts.list'));const script=rows.find(row=>row.artifactType==='output_script');if(!script)throw Error('原主脚本未读到');args={request:{kind:'artifacts.versions.list',params:{artifactId:script.id}}};break;}
    case 5:args={request:{kind:'articles.get',params:{outputId:oneOutput('article')}}};break;
    case 6:args={request:{kind:'graphicPosts.get',params:{outputId:oneOutput('image')}}};break;
    case 7:{
     const editor=ENDPOINTS.getProductionEditor.response.parse(read('outputs.production.editor.get'));
     expect(editor).toMatchObject({projectId,state:'editable',revision:1});expect(editor.plan?.editorVersion).toBe(3);
     expect(JSON.stringify(read('artifacts.versions.list'))).toContain('真实主脚本正文');
     expect(ENDPOINTS.getArticle.response.parse(read('articles.get')).current.title).toBe('真实文章');
     expect(ENDPOINTS.getGraphicPost.response.parse(read('graphicPosts.get')).current.title).toBe('真实图文');
     name=null;args=`工程存在：${editor.outputId}，当前revision ${editor.revision}；主脚本、文章、图文均已按真实owner读到。未提出候选、生成或渲染。`;break;
    }
    default:throw Error('夹具不允许额外模型轮次');
   }
   const delta=name?{tool_calls:[{index:0,id:`native-read-${fixtureTurn}`,type:'function',function:{name,arguments:JSON.stringify(args)}}]}:{content:args};
   const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:name?'tool_calls':'stop'}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
   res.writeHead(200,{'content-type':'text/event-stream'});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:'read-fixture',object:'chat.completion.chunk',created:1,model:'fixture',...chunk})}\n\n`).join('')+'data: [DONE]\n\n');
  }catch(error){errors.push(error instanceof Error?error.message:String(error));res.writeHead(500);res.end('FIXTURE_PROTOCOL_ERROR');}
 });
 let worker:ReturnType<typeof createChatWorkerDispatcher>|undefined;let mediaRoot:string|undefined;
 try{
  await new Promise<void>(resolveReady=>server.listen(0,'127.0.0.1',resolveReady));
  console.info('[T1086-fixture] start-runtime',scope);
  const runtime=await getChatRuntime(),db=fixture.db!,now=()=>new Date().toISOString();let seq=0;
  console.info('[T1086-fixture] runtime-ready',scope);
  // 原完整装配对象保留目录，只关闭本夹具自动启动的执行器；下方同原Worker由本地协议夹具驱动。
  await runtime.durable.stop();console.info('[T1086-fixture] original-worker-stopped',scope);
  let ctx:RequestContext={userId:`native-public-${scope}`,accountId:null,source:'user',requestId:`native-public-${scope}`};
  if(scope==='legacy-premigration'){
   // 仅初始化隔离库的迁移前账号行；这不是历史migration实跑，后续业务与读取均走原正式端口。
   const {createPlatformAccountRepository}=await import('@creatoros/backend/modules/platform-account');
   ctx.accountId=(await createPlatformAccountRepository(db,{userId:ctx.userId,now,nextId:p=>`${p}-premigration-${++seq}`}).createAccount({platform:'xiaohongshu',accountHandle:'隔离库迁移前账号'})).id;
   expect(await db.select().from(accountGroups).where(eq(accountGroups.userId,ctx.userId))).toHaveLength(0);
   expect(await db.select().from(accountGroupMemberships).where(eq(accountGroupMemberships.userId,ctx.userId))).toHaveLength(0);
  }
  else if(scope==='legacy-registered')ctx.accountId=ENDPOINTS.createAccount.response.parse(await publicData('accounts.create',ctx,undefined,{platform:'xiaohongshu',accountHandle:'真实已登记账号',idempotencyKey:`native-public-${scope}`})).id;
  else{
   const group=ENDPOINTS.createAccountGroup.response.parse(await publicData('accountGroups.create',ctx,undefined,{name:'中性只读组',idempotencyKey:`native-group-${scope}`}));ctx={...ctx,groupId:group.id};
   if(scope==='group-account')ctx.accountId=ENDPOINTS.createAccount.response.parse(await publicData('accounts.create',ctx,undefined,{platform:'xiaohongshu',accountHandle:'真实组内账号',idempotencyKey:`native-public-${scope}`})).id;
  }
  // 登记后的数据按公开真实组建立；下面仍用原legacy账号入口提交。迁移前group=null数据不由本例代签。
  const submissionCtx={...ctx};
  if(scope==='legacy-registered'){
   const groups=ENDPOINTS.listAccountGroups.response.array().parse(await publicData('accountGroups.list',ctx,undefined,undefined,{page:1,pageSize:100}));
   const owned=groups.filter(group=>group.members.some(member=>member.accountId===ctx.accountId));
   expect(owned).toHaveLength(1);ctx={...ctx,groupId:owned[0]!.id};
  }
  await configureModelFixture((id,params,body)=>publicData(id,ctx,params,body),`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,'fixture');
  const project=ENDPOINTS.createProject.response.parse(await publicData('projects.create',ctx,undefined,{title:'真实当前项目'}));projectId=project.id;
  const script=ENDPOINTS.createArtifact.response.parse(await publicData('artifacts.create',ctx,{projectId},{title:'真实主脚本',artifactType:'output_script',stage:'script'}));
  await publicData('artifacts.versions.create',ctx,{artifactId:script.id},{contentText:'真实主脚本正文，旧内容保持。',changeSummary:'建立只读验收原稿'});
  const video=ENDPOINTS.createOutput.response.parse(await publicData('projects.outputs.create',ctx,{projectId},{title:'真实原生视频',contentType:'video'}));
  const articleOutput=ENDPOINTS.createOutput.response.parse(await publicData('projects.outputs.create',ctx,{projectId},{title:'真实文章',contentType:'article',clientRequestId:`native-article-${scope}`}));
  const graphicOutput=ENDPOINTS.createOutput.response.parse(await publicData('projects.outputs.create',ctx,{projectId},{title:'真实图文',contentType:'image',clientRequestId:`native-graphic-${scope}`}));
  // 作品名称与正式稿标题是不同字段；通过原owner保存真实稿，不把空初稿冒充已保存内容。
  const article=ENDPOINTS.getArticle.response.parse(await publicData('articles.get',ctx,{outputId:articleOutput.id}));
  await publicData('articles.versions.create',ctx,{outputId:articleOutput.id},{expectedCurrentVersionId:article.currentVersionId,document:{...article.current,title:'真实文章',summary:'原文章正文保持'},clientRequestId:`native-article-save-${scope}`});
  const graphic=ENDPOINTS.getGraphicPost.response.parse(await publicData('graphicPosts.get',ctx,{outputId:graphicOutput.id}));
  await publicData('graphicPosts.versions.create',ctx,{outputId:graphicOutput.id},{expectedCurrentVersionId:graphic.currentVersionId,document:{...graphic.current,title:'真实图文',body:'原图文正文保持'},clientRequestId:`native-graphic-save-${scope}`});
  const raw={editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:NATIVE_SOURCE_REVISION,mediaRefs:[],nativeDocument:{version:NATIVE_DOCUMENT_VERSION,metadata:{id:video.id,name:'真实已保存原生工程'},currentSceneId:'scene',settings:{fps:{numerator:30,denominator:1}},scenes:[{id:'scene',name:'真实场景',isMain:true,bookmarks:[],createdAt:now(),updatedAt:now(),tracks:{main:{id:'main',name:'主轨',type:'video',muted:false,hidden:false,elements:[]},overlay:[],audio:[]}}]}}};
  const saved=ENDPOINTS.saveProductionEditor.response.parse(await publicData('outputs.production.editor.save',ctx,{outputId:video.id},{expectedRevision:0,requestId:`native-initial-save-${scope}`,source:'manual',plan:raw}));expect(saved.revision).toBe(1);
  const formal=ENDPOINTS.getProductionEditor.response.parse(await publicData('outputs.production.editor.get',ctx,{outputId:video.id}));expect(formal.plan).toEqual(saved.plan);
  const sourceGroupId=ctx.groupId;
  const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId??null,groupId:sourceGroupId,now,nextId:p=>`${p}-native-public-${++seq}`});
  const conversation=await repo.createConversation({title:'当前项目中性只读',projectId,scope:'project'}),source=await repo.createMessage(conversation.id,{role:'user',content:'只读取当前项目主脚本、文章、图文和视频工程，禁止候选、写入、生成、渲染。',attachments:[],modelMetadata:{}});
  const snapshotBusiness=async()=>({projects:await db.select().from(projects),outputs:await db.select().from(contentOutputs),productions:await db.select().from(productions),versions:await db.select().from(productionEditVersions),renders:await db.select().from(productionRenderRequests),artifacts:await db.select().from(artifacts),artifactVersions:await db.select().from(artifactVersions),groups:await db.select().from(accountGroups),members:await db.select().from(accountGroupMemberships),results:(await db.select().from(aiTaskResults)).filter(row=>row.resultType!=='conversation_reply'),tasks:(await db.select().from(aiTasks)).filter(row=>row.taskType!=='copilot.assist')});
  const before=await snapshotBusiness();console.info('[T1086-fixture] owned-data-ready',scope);
  const submitted=await createChatTurnSubmissionService(db,{assertProject:async(c,id)=>{await publicData('projects.get',c,{projectId:id});},assemble:async(c,snapshot)=>{
   console.info('[T1086-fixture] prepare-start',scope);
   const prepared=await prepareChatReply(runtime,c,snapshot),codex=await prepareChatReply(runtime,c,snapshot,{executionEngine:'codex'});console.info('[T1086-fixture] pi-codex-prepared',scope);
   const readDefinition=prepared.tools.find(tool=>tool.name==='system.read')!;
   expect(JSON.stringify(readDefinition.parameters)).toContain('outputs.production.editor.get');expect(JSON.stringify(readDefinition.parameters)).toContain('expectedRevision');
   expect(codex.tools.find(tool=>tool.name==='system.read')).toEqual(readDefinition);
   expect(prepared.tools.map(tool=>tool.name)).toEqual(expect.arrayContaining(['system.features','system.read','system.action.propose','context.project.lifecycle','context.artifacts','topic.generate','brief.fill']));
   expect(prepared.hostContext.chatContext.editorTarget).toBeUndefined();expect(prepared.tools.some(tool=>tool.name==='work.editor.read'||tool.name==='work.editor.propose')).toBe(false);
   const target=workEditorTarget.parse({schemaVersion:1,projectId,outputId:video.id,owner:'production',contentType:'video',savedBase:{kind:'production',productionId:formal.productionId,revision:formal.revision},documentDigest:workEditorContentDigest(formal.plan),selection:{kind:'native_scene',sceneId:'scene',elementRefs:[],playheadTick:0,contextEpoch:1,editorGeneration:'native-fixture'}});
   const withTarget=await prepareChatReply(runtime,c,snapshot,{chatContext:{surface:'project',projectId,editorTarget:target}});
   expect(withTarget.hostContext.chatContext.editorTarget).toEqual(target);expect(withTarget.tools.map(tool=>tool.name)).toEqual(expect.arrayContaining(['work.editor.read','work.editor.propose']));
   expect(withTarget.tools.find(tool=>tool.name==='work.editor.propose')!.effect).toBe('proposal');
   expect(await snapshotBusiness()).toEqual(before);
   return prepared;
  }}).submit(submissionCtx,{conversationId:conversation.id,sourceMessageId:source.id});
  const [submittedExecution]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
  expect(submittedExecution!.groupId).toBe(sourceGroupId??null);
  expect(conversation.groupId).toBe(submittedExecution!.groupId);
  const deniedCanvas=async()=>{throw Error('只读夹具禁止画布写入、生成或素材动作');};
  console.info('[T1086-fixture] submitted',scope);
  const hostReader=createChatHostContextReader(db),canvas=createCreativeCanvasService(db,{now,assertProject:async(c,id)=>{await publicData('projects.get',c,{projectId:id});},assertMediaAsset:deniedCanvas,assertReferenceAsset:deniedCanvas,getMediaFileDownloadUrl:deniedCanvas,getReference:deniedCanvas,readTask:deniedCanvas,readTaskResults:deniedCanvas,submitTask:deniedCanvas});
  const root=await createAssistantSystemRoot(db,{canvas,actions:{},read:async(c,endpoint,input)=>await compositeTransport.request(endpoint,{params:input.params,query:input.query,body:undefined} as never,c) as {data:unknown;meta?:unknown}},{now});
  const systemTools=createChatSystemToolHost(hostReader,root.host),taskTools=createChatTaskToolHost(hostReader,runtime.contextReaders,{
   webRead:true,research:true,
   cover:{prepareTaskCommit:runtime.ai.prepareTaskCommit,wakeTask:runtime.wakeChatCoverTask},agenticResearch:{prepareTaskCommit:runtime.ai.prepareTaskCommit,wakeTask:runtime.wakeChatResearchTask},material:{prepareTaskCommit:runtime.ai.prepareTaskCommit,wakeTask:runtime.wakeChatMaterialTask},
   publish:{preparePublish:runtime.prepareChatPublishTask,wakeTask:runtime.wakeChatPublishTask},review:{prepareReview:runtime.prepareChatScriptReviewTask,wakeTask:runtime.wakeChatScriptReviewTask},scriptDraft:{readCurrentScript:runtime.readCurrentScript,prepareDraft:runtime.prepareChatScriptDraftTask,wakeTask:runtime.wakeChatScriptDraftTask},
   scriptPatch:{resolveSelection:(c,input)=>runtime.resolveCurrentScriptSelection!(c,input)},videoEdit:{prepareVideoEdit:runtime.prepareVideoEdit},planning:{prepareTaskCommit:runtime.ai.prepareTaskCommit,wakeTask:runtime.wakeChatPlanningTask},local:{detectTools:runtime.detectTools,listAuthorizedDirs:runtime.listAuthorizedDirs},localRead:{readLocalFile:runtime.readLocalFile,decideLocalReadAccess:runtime.decideLocalReadAccess},
   structured:{readCurrentScript:runtime.readCurrentScript,readWorks:(c,limit)=>loadPositioningWorksBrief(c,runtime.context.positioningWorks,limit),getPositioningDiscovery:runtime.getPositioningDiscovery},
  });
  const ingestionTools=createChatIngestionTaskToolHost(hostReader,runtime),planTools=createChatWorkbenchPlanToolHost(db);
  const workbenchHost=(runtime.durable as typeof runtime.durable&{workbenchHost?:ChatWorkbenchCapabilityHost}).workbenchHost,leases=createExecutionLeaseService(db),streams=createExecutionStreamService(db);
  const workbenchTools=workbenchHost?createChatWorkbenchCapabilityHost(workbenchHost,ref=>leases.withLease(ref,'admission',async({task,context})=>({userId:context.userId,accountId:context.accountId!,taskId:task.id,attempt:task.attempt,fenceToken:task.fenceToken!,leaseId:task.leaseOwner!})),(ref,id,progress)=>streams.appendWorkbenchProgress(ref,id,progress)):null;
  const {createAssetsService,createAssetRepository,createLocalFsObjectStorage}=await import('@creatoros/backend/modules/assets');
  const {createBrowserSessionsService}=await import('@creatoros/backend/modules/browser-sessions');
  const {createSettingsRepository,createSettingsService}=await import('@creatoros/backend/modules/settings');
  const {resolveSearchSpec}=await import('@creatoros/backend/modules/ai-runtime');
  mediaRoot=mkdtempSync(resolve(tmpdir(),'native-public-read-'));
  const ids={now,nextId:(prefix:string)=>`${prefix}-native-web-${++seq}`},storage=createLocalFsObjectStorage({rootPath:mediaRoot,publicBaseUrl:'/blob'},{nextKey:()=>`native-web-${++seq}`}),settings=createSettingsService(()=>createSettingsRepository(db,ids),deniedCanvas,deniedCanvas);
  const webRead={assets:createAssetsService(createAssetRepository(db,ids),async()=>storage,ids),objectStorageForCtx:async()=>storage,sessions:createBrowserSessionsService({db,...ids,masterKey:Buffer.alloc(32,17)}),resolveSearch:(c:RequestContext)=>resolveSearchSpec(c,{env:{},getModelConfig:(owner,capability)=>settings.getModelConfig(owner,capability)})};
  const factoryErrors:string[]=[],missingTools:string[]=[];
  worker=createChatWorkerDispatcher(db,{entryPath:resolve('../ai-worker/dist/execution-worker.cjs'),workerId:`native-public-${scope}`,webRead,budget:{maxCalls:32,maxTokens:300000,deadlineMs:1200000},modelConcurrency:1,pollMs:100,resolveTools:async(...args)=>{
   try{const tools=Object.assign({},await taskTools(...args),await ingestionTools(...args),await planTools(...args),await systemTools(...args),workbenchTools?await workbenchTools(...args):{});missingTools.push(...args[1].tools.filter(tool=>!Object.hasOwn(tools,tool.name)).map(tool=>tool.name));return tools;}catch(error){factoryErrors.push(error instanceof Error?error.message:String(error));throw error;}
  },resolveModelCredential:(c,capability,owner)=>runtime.resolveModelSpec(c,capability,owner)});
  worker.start();console.info('[T1086-fixture] verification-worker-started',scope);
  await vi.waitFor(async()=>{const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));expect(task?.status,JSON.stringify({task:task&&{id:task.id,status:task.status,lastErrorCode:task.lastErrorCode},requests:requests.length,errors,factoryErrors,missingTools})).toBe('succeeded');},{timeout:120000});
  expect(errors).toEqual([]);expect(factoryErrors).toEqual([]);expect(missingTools).toEqual([]);expect(requests).toHaveLength(8);
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId)),toolCalls=calls.filter(call=>call.kind==='tool');
  expect(toolCalls).toHaveLength(7);expect(calls.every(call=>call.status==='settled')).toBe(true);
  const outcomes=toolCalls.map(call=>workerToolResultReceiptSchema.parse(JSON.parse(call.resultText!)).output).map(value=>agenticToolOutcomeSchema.parse(value));
  expect(outcomes.every(outcome=>outcome.status==='ok'&&outcome.sideEffect==='none')).toBe(true);
  const reads=outcomes.map(outcome=>tryReadResult(outcome.data)).filter((value):value is ReadResult=>value!==null);
  expect(reads.map(read=>read.requestKind)).toEqual(expect.arrayContaining(['projects.outputs.list','outputs.production.editor.get','artifacts.list','artifacts.versions.list','articles.get','graphicPosts.get']));
  const editor=reads.find(read=>read.requestKind==='outputs.production.editor.get')!;expect(editor.observedRevision).toBe(formal.revision);expect(JSON.parse(editor.text)).toEqual(formal);
  const messages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,conversation.id));expect(messages).toHaveLength(2);expect(messages.find(message=>message.role==='assistant')!.content).toContain(`工程存在：${video.id}，当前revision 1`);
  const tasks=await db.select().from(aiTasks);expect(tasks).toHaveLength(1);expect(tasks[0]).toMatchObject({id:submitted.taskId,taskType:'copilot.assist',status:'succeeded',projectId,groupId:sourceGroupId??null,accountId:ctx.accountId??null});
  const replyResults=await db.select().from(aiTaskResults);expect(replyResults).toHaveLength(1);expect(replyResults[0]!.resultType).toBe('conversation_reply');
  expect(await snapshotBusiness()).toEqual(before);expect(ENDPOINTS.getProductionEditor.response.parse(await publicData('outputs.production.editor.get',ctx,{outputId:video.id}))).toEqual(formal);
  if(scope==='legacy-premigration'){
   expect(ctx.groupId??null).toBeNull();expect(submittedExecution!.groupId).toBeNull();expect(conversation.groupId).toBeNull();
   // 原legacy owner合同允许null及同账号canonical标签；标签不代表已存在组或成员，不能把合法原写入误判为迁移。
   for(const row of [...before.projects,...before.outputs,...before.artifacts])expect([null,`grp_legacy_${ctx.accountId}`]).toContain(row.groupId);
   expect(await db.select().from(accountGroups).where(eq(accountGroups.userId,ctx.userId))).toHaveLength(0);
   expect(await db.select().from(accountGroupMemberships).where(eq(accountGroupMemberships.userId,ctx.userId))).toHaveLength(0);
  }
 }finally{
  await worker?.stop();server.closeAllConnections();if(server.listening)await new Promise<void>(done=>server.close(()=>done()));
  await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();vi.unstubAllEnvs();if(mediaRoot)rmSync(mediaRoot,{recursive:true,force:true});
 }
});
