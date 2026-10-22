// @vitest-environment node
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ENDPOINTS,NATIVE_DOCUMENT_VERSION,NATIVE_SOURCE_REVISION,workEditorTarget,workCreationTarget,type RequestContext,type WorkEditorTarget} from '@creatoros/contract';
import {chatWorkerInputSchema,executionRouteSchema} from '@creatoros/contract/execution-worker';
import type {Db} from '@creatoros/backend';
import {configureModelFixture} from '../test/configure-model-fixture';

const fixture=vi.hoisted(()=>({db:undefined as Db|undefined,start:vi.fn()}));
vi.mock('@creatoros/backend',async original=>{const actual=await original<typeof import('@creatoros/backend')>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const opened=await actual.createConfiguredDb(...args);fixture.db=opened.db;return opened;}};});
vi.mock('@creatoros/backend/modules/assets',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/assets')>();return {...actual,migrateStorageRoot:async()=>{throw Error('本隔离夹具禁止访问或迁移真实媒体根');}};});
vi.mock('@creatoros/backend/modules/ai-runtime',async original=>{
 const actual=await original<typeof import('@creatoros/backend/modules/ai-runtime')>();
 return {...actual,
  // 仅本机安装状态元数据替身；真实设置、身份冻结、prepare和目标reader仍执行。
  createLocalCodexStatusService:()=>{
   const status={engine:'codex' as const,installed:true,available:true,version:'0.159.3',defaultModelId:'t1091-codex-fixture',availableModels:[{id:'t1091-codex-fixture',inputModalities:['text']}],loginStatus:'authenticated' as const,capabilities:{text:true,imageUnderstanding:false,imageGeneration:false,imageEditing:'unavailable' as const}};
   return {read:async()=>structuredClone(status),peek:()=>structuredClone(status),stop:async()=>{}};
  },
  composeChatProduction:(...args:Parameters<typeof actual.composeChatProduction>)=>{const durable=actual.composeChatProduction(...args);return {...durable,start:fixture.start};},
 };
});
import {getChatRuntime,compositeTransport,__resetPersistenceForTests} from './persistence-client';

let directory:string,runtime:Awaited<ReturnType<typeof getChatRuntime>>,ctx:RequestContext,sequence=0;
const key=(prefix:string)=>`${prefix}-t1091-${++sequence}`;
const owned=async(operation:string,params?:unknown,body?:unknown,query?:unknown):Promise<unknown>=>{
 const endpoint=Object.values(ENDPOINTS).find(e=>e.id===operation);
 if(!endpoint)throw Error('不存在的正式公开operation:'+operation);
 const response=await compositeTransport.request(endpoint,{params:endpoint.params?.parse(params),body:endpoint.body?.parse(body),query:endpoint.query?.parse(query??{})} as never,ctx) as {data:unknown};
 return endpoint.isList?endpoint.response.array().parse(response.data):endpoint.response.parse(response.data);
};
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),'t1091-public-context-'));
 vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR',join(directory,'db'));vi.stubEnv('CREATOROS_DISABLE_SCHEDULER','1');__resetPersistenceForTests();
 runtime=await getChatRuntime();
 ctx={userId:'t1091-public-options-user',accountId:null,source:'user',requestId:'t1091-public-options'};
 const group=ENDPOINTS.createAccountGroup.response.parse(await owned('accountGroups.create',undefined,{name:'公开编导隔离组',idempotencyKey:key('group')}));ctx={...ctx,groupId:group.id};
 await configureModelFixture(owned,'http://127.0.0.1:1/v1','isolated-no-network');
},180000);
afterAll(async()=>{
 await (globalThis as typeof globalThis&{__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();vi.unstubAllEnvs();if(directory)await rm(directory,{recursive:true,force:true});
},180000);

async function businessRows(){
 const {sql}=await import('@creatoros/backend');const rows:Record<string,unknown[]>={};
 // SEMANTIC_BOUNDARY_ALLOW:固定实体清单/主键顺序只用于验证准备未写正式业务，不选择创作内容。
 for(const table of ['projects','content_outputs','artifacts','artifact_versions','article_anchors','graphic_post_anchors','productions','production_edit_versions','production_render_requests','work_compositions','work_composition_versions'])rows[table]=(await fixture.db!.execute(sql.raw('SELECT * FROM '+table+' ORDER BY 1,2'))).rows;
 return rows;
}
async function nativeTarget(projectId:string){
 const output=ENDPOINTS.createOutput.response.parse(await owned('projects.outputs.create',{projectId},{title:'隔离v3原生工程',contentType:'video',clientRequestId:key('native-output')}));
 const stamp=new Date().toISOString();
 const plan={editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:NATIVE_SOURCE_REVISION,mediaRefs:[],nativeDocument:{version:NATIVE_DOCUMENT_VERSION,metadata:{id:output.id,name:'公开编导v3原生工程'},currentSceneId:'scene',settings:{fps:{numerator:30,denominator:1}},scenes:[{id:'scene',name:'原场景',isMain:true,bookmarks:[],createdAt:stamp,updatedAt:stamp,tracks:{main:{id:'main',name:'主轨',type:'video',muted:false,hidden:false,elements:[]},overlay:[],audio:[]}}]}}};
 const saved=ENDPOINTS.saveProductionEditor.response.parse(await owned('outputs.production.editor.save',{outputId:output.id},{expectedRevision:0,requestId:key('native-save'),source:'manual',plan}));
 const current=ENDPOINTS.getProductionEditor.response.parse(await owned('outputs.production.editor.get',{outputId:output.id}));expect(current.plan).toEqual(saved.plan);expect(current.plan?.editorVersion).toBe(3);expect(current.revision).toBe(1);
 const {workEditorContentDigest}=await import('../../../backend/src/modules/ai-runtime/work-editor-candidate');
 return workEditorTarget.parse({schemaVersion:1,projectId,outputId:output.id,owner:'production',contentType:'video',savedBase:{kind:'production',productionId:current.productionId,revision:current.revision},documentDigest:workEditorContentDigest(current.plan),selection:{kind:'native_scene',sceneId:'scene',elementRefs:[],playheadTick:120000,timeRange:{startTick:0,endTick:240000,ticksPerSecond:120000},contextEpoch:1,editorGeneration:key('native-generation')}});
}
async function articleTarget(projectId:string){
 const output=ENDPOINTS.createOutput.response.parse(await owned('projects.outputs.create',{projectId},{title:'真实隔离文章',contentType:'article',clientRequestId:key('article-output')}));
 const initial=ENDPOINTS.getArticle.response.parse(await owned('articles.get',{outputId:output.id}));
 await owned('articles.versions.create',{outputId:output.id},{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:key('article-save'),document:{...initial.current,title:'真实保存文章',summary:'准备不写正文',sections:[{sectionId:'section',order:0,heading:'原段落',headingLevel:2,body:'这是已保存的原文章正文。',sourceRefs:[]}]}});
 const current=ENDPOINTS.getArticle.response.parse(await owned('articles.get',{outputId:output.id}));
 const {workEditorContentDigest}=await import('../../../backend/src/modules/ai-runtime/work-editor-candidate');
 return workEditorTarget.parse({schemaVersion:1,projectId,outputId:output.id,owner:'wechat_article',contentType:'article',savedBase:{kind:'artifact',artifactId:current.artifactId,versionId:current.currentVersionId},documentDigest:workEditorContentDigest(current.current),selection:{kind:'article_sections',sectionIds:['section'],field:'body',textRange:{startUtf16:0,endUtf16:2,expectedFieldDigest:workEditorContentDigest(current.current.sections[0]!.body)}}});
}
async function graphicTarget(projectId:string){
 const output=ENDPOINTS.createOutput.response.parse(await owned('projects.outputs.create',{projectId},{title:'真实隔离图文',contentType:'image',clientRequestId:key('graphic-output')}));
 const initial=ENDPOINTS.getGraphicPost.response.parse(await owned('graphicPosts.get',{outputId:output.id}));
 await owned('graphicPosts.versions.create',{outputId:output.id},{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:key('graphic-save'),document:{...initial.current,title:'真实保存图文',body:'准备不修改图文正文',cardBriefs:[{cardId:'card',title:'原卡片',body:'已保存图卡正文',sourceRefs:[]}]}});
 const current=ENDPOINTS.getGraphicPost.response.parse(await owned('graphicPosts.get',{outputId:output.id}));
 const {workEditorContentDigest}=await import('../../../backend/src/modules/ai-runtime/work-editor-candidate');
 return workEditorTarget.parse({schemaVersion:1,projectId,outputId:output.id,owner:'graphic_post',contentType:'image',savedBase:{kind:'artifact',artifactId:current.artifactId,versionId:current.currentVersionId},documentDigest:workEditorContentDigest(current.current),selection:{kind:'graphic_cards',cardIds:['card'],field:'body'}});
}
async function creationTarget(projectId:string){
 const script=ENDPOINTS.createArtifact.response.parse(await owned('artifacts.create',{projectId},{title:'共同已保存主脚本',artifactType:'master_script',stage:'script'}));
 const version=ENDPOINTS.createArtifactVersion.response.parse(await owned('artifacts.versions.create',{artifactId:script.id},{expectedCurrentVersionId:script.currentVersionId,contentText:'先展示真实操作，再说明方法。预算200元；最后总结适用场景。',changeSummary:'隔离fixture保存共同脚本'}));
 let composition=ENDPOINTS.createWorkComposition.response.parse(await owned('workCompositions.create',undefined,{projectId,title:'共同脚本的两份作品',clientRequestId:key('composition-create')})).composition;
 for(const kind of ['article','image'] as const)composition=ENDPOINTS.createWorkCompositionMember.response.parse(await owned('workCompositions.members.create',{compositionId:composition.compositionId},{expectedRevision:composition.currentRevision,clientRequestId:key('composition-member'),memberInput:kind==='article'?{kind,title:'文章成员',targetPlatform:null,contentRole:null}:{kind,title:'图文成员',targetPlatform:null}})).composition;
 const articleMember=composition.current.members.find(row=>row.member.kind==='article')!.member,graphicMember=composition.current.members.find(row=>row.member.kind==='image')!.member;
 if(articleMember.kind!=='article'||graphicMember.kind!=='image')throw Error('真实composition成员类型不符');
 const article=ENDPOINTS.getArticle.response.parse(await owned('articles.get',{outputId:articleMember.outputId})),graphic=ENDPOINTS.getGraphicPost.response.parse(await owned('graphicPosts.get',{outputId:graphicMember.outputId}));
 const internal=workCreationTarget.parse({schemaVersion:1,clientRequestId:key('creation-request'),projectId,compositionId:composition.compositionId,compositionRevision:composition.currentRevision,scriptSourceRef:{kind:'project_script',id:script.id,versionId:version.id},scriptConfirmation:{confirmedBy:'user',source:'current-click'},articleMember:{...articleMember,artifactId:article.artifactId,baseVersionId:article.currentVersionId},graphicMember:{...graphicMember,artifactId:graphic.artifactId,baseVersionId:graphic.currentVersionId}});
 expect(await runtime.readCreationTarget!(ctx,internal)).toEqual(internal);
 const {scriptConfirmation:_,...wire}=internal;expect(Object.hasOwn(wire,'scriptConfirmation')).toBe(false);return wire;
}
async function projectConversation(){const project=ENDPOINTS.createProject.response.parse(await owned('projects.create',undefined,{title:key('真实项目')}));const conversation=ENDPOINTS.createConversation.response.parse(await owned('ai.conversations.create',undefined,{title:'当前项目编导',projectId:project.id,scope:'project:'+project.id}));return {project,conversation};}
async function freeze(message:{id:string;modelMetadata:Record<string,unknown>}){
 const {aiTasks,executionTasks,eq}=await import('@creatoros/backend');
 const [task]=await fixture.db!.select().from(aiTasks).where(eq(aiTasks.id,String(message.modelMetadata.chatTaskId))),[execution]=await fixture.db!.select().from(executionTasks).where(eq(executionTasks.id,task!.executionTaskId!));
 const payload=execution!.payload as Record<string,unknown>,input=chatWorkerInputSchema.parse(payload.modelInput);
 const {chatHostContextSchema,chatHostContextDigest}=await import('../../../backend/src/modules/ai/chat-host-context');const host=chatHostContextSchema.parse(payload.hostContext);
 const {chatInputDigest}=await import('../../../backend/src/modules/ai/chat-turn-submission.service');
 expect(task!.inputData).toMatchObject({kind:'chat.run',sourceMessageId:message.id,modelInputDigest:chatInputDigest(input),hostContextDigest:chatHostContextDigest(host)});
 expect(task).toMatchObject({status:'queued',groupId:ctx.groupId});expect(execution).toMatchObject({status:'queued',ownerId:task!.id,groupId:ctx.groupId});
 const route=executionRouteSchema.parse(payload.executionRoute);
 expect((task!.runtimeData as Record<string,unknown>).executionRoute).toEqual(route);
 return {task:task!,execution:execution!,input,host,route};
}

it.each((['article','graphic','native','creation'] as const).flatMap(family=>(['pi','codex'] as const).map(executionEngine=>({family,executionEngine}))))('公开 $executionEngine / $family 消息经原prepare和真实reader冻结当前目标，仅产候选权限',{timeout:180000,retry:0},async({family,executionEngine})=>{
 const {project,conversation}=await projectConversation();
 const editorTarget:WorkEditorTarget|undefined=family==='article'?await articleTarget(project.id):family==='graphic'?await graphicTarget(project.id):family==='native'?await nativeTarget(project.id):undefined;
 const creation=family==='creation'?await creationTarget(project.id):undefined;
 if(editorTarget)expect(await runtime.readEditorTarget!(ctx,editorTarget)).toEqual(editorTarget);
 const reader=vi.spyOn(runtime,editorTarget?'readEditorTarget':'readCreationTarget');
 const before=await businessRows();fixture.start.mockClear();
 const input={content:'只基于这个真实已保存目标提出候选，等待用户采用',executionEngine,chatContext:editorTarget?{editorTarget}:{creationTarget:creation}};
 try{
  const message=ENDPOINTS.createMessage.response.parse(await owned('ai.conversations.messages.create',{conversationId:conversation.id},input)),frozen=await freeze(message);
  expect(frozen.input.executionEngine).toBe(executionEngine);
  expect(frozen.route.schemaVersion).toBe(2);
  if(frozen.route.schemaVersion!==2)throw Error('公开准备必须冻结当前模型路由');
  expect(frozen.route.orchestrator).toMatchObject({engine:executionEngine,protocolKind:executionEngine==='codex'?'codex-app-server':'pi',source:'chat-explicit'});
  expect(frozen.input.modelRoutingVersion).toBe(2);expect(frozen.input.externalAgentBinding).toBeUndefined();
  expect(frozen.route.routes[`text:${frozen.input.capability}`]).toMatchObject({source:executionEngine==='codex'?'codex':'self',readiness:'configured',identity:executionEngine==='codex'?{protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'t1091-codex-fixture'}:{provider:'openai',model:'isolated-no-network',endpoint:'http://127.0.0.1:1/v1',configuration:{kind:'row',capability:'default'}}});
  expect(frozen.input.requestedModel).toBe(executionEngine==='codex'?'t1091-codex-fixture':undefined);
  const expected=editorTarget??{...creation,scriptConfirmation:{confirmedBy:'user',source:'public-request'}};
  expect(reader).toHaveBeenCalledWith(ctx,expected);
  expect(frozen.host.chatContext).toEqual({surface:'project',projectId:project.id,...(editorTarget?{editorTarget}:{creationTarget:expected})});
  expect(frozen.input.tools.map(t=>t.name)).toEqual(expect.arrayContaining([family==='creation'?'work.creation.read':'work.editor.read',family==='creation'?'work.creation.propose':'work.editor.propose','skill.read','history.read','system.read']));
  expect(frozen.input.tools.find(t=>t.name===(family==='creation'?'work.creation.propose':'work.editor.propose'))!.effect).toBe('proposal');
  expect(frozen.input.maxOutputTokens).toBe(family==='creation'?32768:8192);
  expect(fixture.start).toHaveBeenCalledTimes(1);expect(await businessRows()).toEqual(before);expect(input.chatContext).toEqual(editorTarget?{editorTarget}:{creationTarget:creation});
 }finally{reader.mockRestore();}
});
it('原无目标公开消息默认Pi且仍冻结原完整目录',{timeout:180000,retry:0},async()=>{
 const {project,conversation}=await projectConversation(),before=await businessRows();fixture.start.mockClear();
 const message=ENDPOINTS.createMessage.response.parse(await owned('ai.conversations.messages.create',{conversationId:conversation.id},{content:'只读原项目'})),frozen=await freeze(message);
 expect(frozen.input.executionEngine).toBe('pi');expect(frozen.host.chatContext).toEqual({surface:'project',projectId:project.id});expect(frozen.input.tools.map(t=>t.name)).toEqual(expect.arrayContaining(['system.read','history.read','skill.read']));expect(fixture.start).toHaveBeenCalledOnce();expect(await businessRows()).toEqual(before);
});
it.each(['article-version','graphic-version','native-revision','creation-revision'] as const)('公开 %s 漂移由原目标reader拒绝，零消息/task/业务写',{timeout:180000,retry:0},async mode=>{
 const {conversation,project}=await projectConversation();
 const original=mode==='article-version'?await articleTarget(project.id):mode==='graphic-version'?await graphicTarget(project.id):mode==='native-revision'?await nativeTarget(project.id):undefined;
 const creation=mode==='creation-revision'?await creationTarget(project.id):undefined;
 const target=original?{...original,savedBase:original.savedBase.kind==='production'?{...original.savedBase,revision:original.savedBase.revision+1}:{...original.savedBase,versionId:'nonexistent-version'}}:undefined;
 const {aiTasks,executionTasks}=await import('@creatoros/backend');const before={business:await businessRows(),tasks:await fixture.db!.select().from(aiTasks),executions:await fixture.db!.select().from(executionTasks)};fixture.start.mockClear();
 await expect(owned('ai.conversations.messages.create',{conversationId:conversation.id},{content:'漂移目标不能冻结',executionEngine:'codex',chatContext:target?{editorTarget:target}:{creationTarget:{...creation,compositionRevision:creation!.compositionRevision+1}}})).rejects.toThrow();
 expect(await owned('ai.conversations.messages.list',{conversationId:conversation.id})).toEqual([]);expect(await fixture.db!.select().from(aiTasks)).toEqual(before.tasks);expect(await fixture.db!.select().from(executionTasks)).toEqual(before.executions);expect(await businessRows()).toEqual(before.business);expect(fixture.start).not.toHaveBeenCalled();
});
