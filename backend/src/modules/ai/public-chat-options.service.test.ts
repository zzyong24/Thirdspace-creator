import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createDb,aiMessages,aiTasks,aiTaskResults,executionTasks,eq,type Db} from '@creatoros/backend';
import {ENDPOINTS,workEditorTarget,type RequestContext,type WorkEditorTarget,type WorkCreationTarget} from '@creatoros/contract';
import {chatWorkerInputSchema,codexAcpBinding} from '@creatoros/contract/execution-worker';
import {createAiService,type ServiceDeps} from './ai.service';
import {createProjectsService,createProjectRepository} from '../projects';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createPlatformAccountService} from '../platform-account';
import {resolveSkillForSurface} from '../ai-runtime/chat-surface';
import {chatInputDigest,type ChatTurnAssembly} from './chat-turn-submission.service';
import {chatHostContextDigest,chatHostContextSchema} from './chat-host-context';

let db:Db,close:()=>Promise<void>,sequence=0;
const now=()=>new Date(Date.UTC(2026,9,9,1,0,0,sequence++)).toISOString();
const nextId=(prefix:string)=>`${prefix}-t1091-${++sequence}`;
const unused=async():Promise<never>=>{throw Error('本服务端口夹具禁止模型、素材、正式业务写入和采纳');};
type Options={executionEngine:'pi'|'codex';chatContext?:{editorTarget?:WorkEditorTarget;creationTarget?:WorkCreationTarget}};
type PublicBody=Parameters<ReturnType<typeof createAiService>['createMessageWithReplyTask']>[2];
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();},180000);
afterAll(async()=>close?.(),180000);

/** 与原copilot-message-task夹具相同：真实owner/事务/submit，准备端口仅模拟明确assembly，不声称真实Worker。 */
function fixture(ctx:RequestContext,failTask=false){
 const projects=createProjectsService(createProjectRepository(db),{now,nextId});
 const prepare=vi.fn(async(c:RequestContext,snapshot:Parameters<NonNullable<ServiceDeps['prepareChatReply']>>[1],options:Options):Promise<ChatTurnAssembly>=>{
  // 真正事务外PGlite读取，若把准备搬进原单连接事务，本例不会安全完成。
  await db.select().from(aiTasks);
  const surface=snapshot.conversation.projectId?'project':'topics';
  return {capability:'copilot.assist',system:'明确合成的服务端口assembly；未执行模型',messages:snapshot.messages.map(m=>({role:m.role as 'user'|'assistant'|'system'|'tool',content:m.content})),tools:[],maxSteps:6,maxOutputTokens:128,
   hostContext:{schemaVersion:1 as const,chatContext:{surface,projectId:snapshot.conversation.projectId,...options.chatContext},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1 as const,userId:c.userId,accountId:c.accountId??null,groupId:c.groupId??null,resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'合成策略',skills:[{skillId:resolveSkillForSurface(surface),baseVersion:'t1091-service-fixture',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'只验证公开选项与冻结端口',template:'',tools:[],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}}};
 });
 const assertProject=vi.fn((c:RequestContext,id:string)=>projects.getProject(c,id));
 const service=createAiService({db,now,nextId:p=>{if(failTask&&p==='ai-task')throw Error('T1091_TASK_INSERT_FAILURE');return nextId(p);},prepareChatReply:prepare,assertChatProject:assertProject,
  artifacts:{createVersion:unused},knowledge:{createKnowledge:unused},candidate:{createFromAIResult:unused,enrichCard:unused},learnings:{createLearning:unused},publishing:{createPublicationFromDraft:unused},materialLinks:{link:unused},positioning:{upsertProfile:unused,createStatementVersion:unused},calibration:{createDraftPrediction:unused}});
 return {ctx,projects,service,prepare,assertProject};
}
function legacy(){return {userId:nextId('user'),accountId:nextId('unregistered-legacy-account'),source:'user' as const,requestId:nextId('request')};}
async function grouped(){const base:RequestContext={userId:nextId('user'),accountId:null,source:'user',requestId:nextId('request')};const groups=createAccountGroupService({db,now,nextId});const a=await groups.create(base,{name:'当前创作者',idempotencyKey:nextId('create-group')});const b=await groups.create(base,{name:'另一个创作者',idempotencyKey:nextId('other-group')});return {ctx:{...base,groupId:a.id},other:{...base,groupId:b.id}};}
async function persisted(message:{id:string;modelMetadata:Record<string,unknown>}){
 const [business]=await db.select().from(aiTasks).where(eq(aiTasks.id,String(message.modelMetadata.chatTaskId)));
 const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,business!.executionTaskId!));
 const payload=execution!.payload as Record<string,unknown>,frozen=chatWorkerInputSchema.parse(payload.modelInput),host=chatHostContextSchema.parse(payload.hostContext);
 expect((business!.inputData as Record<string,unknown>).modelInputDigest).toBe(chatInputDigest(frozen));
 expect((business!.inputData as Record<string,unknown>).hostContextDigest).toBe(chatHostContextDigest(host));
 expect(business).toMatchObject({status:'queued',taskType:'copilot.assist',inputData:{sourceMessageId:message.id}});
 expect(execution).toMatchObject({status:'queued',ownerId:business!.id,groupId:business!.groupId,accountId:business!.accountId});
 return {business:business!,execution:execution!,frozen,host};
}
async function noOrphan(f:ReturnType<typeof fixture>,conversationId:string,contents:string[]=[]){
 expect((await f.service.listMessages(f.ctx,conversationId)).map(m=>m.content)).toEqual(contents);
 expect(await db.select().from(aiTasks).where(eq(aiTasks.userId,f.ctx.userId))).toHaveLength(0);
 expect(await db.select().from(executionTasks).where(eq(executionTasks.userId,f.ctx.userId))).toHaveLength(0);
 expect(await db.select().from(aiTaskResults)).toHaveLength(0);
}

it.each([undefined,'pi','codex'] as const)('默认/显式 %s 同一engine交准备和原submit，冻结摘要一致',{timeout:180000,retry:0},async executionEngine=>{
 const f=fixture(legacy()),conversation=await f.service.createConversation(f.ctx,{title:'公开引擎'});
 const body=ENDPOINTS.createMessage.body!.parse({content:'保持原消息和任务入口',...(executionEngine?{executionEngine}:{})});
 const message=await f.service.createMessageWithReplyTask(f.ctx,conversation.id,body),rows=await persisted(message);
 expect(f.prepare).toHaveBeenCalledTimes(1);expect(f.prepare.mock.calls[0]![2]).toEqual({executionEngine:executionEngine??'pi'});
 expect(rows.frozen.executionEngine).toBe(executionEngine??'pi');
 expect(rows.host.chatContext).toEqual({surface:'topics',projectId:null});
 if(executionEngine==='codex')expect(rows.frozen.externalAgentBinding).toEqual(codexAcpBinding);else expect(rows.frozen.externalAgentBinding).toBeUndefined();
 expect((await f.service.listMessages(f.ctx,conversation.id)).map(m=>m.id)).toEqual([message.id]);
});
it.each(['wechat_article','graphic_post','production'] as const)('公开 %s 目标沿准备端口进入同一可信冻结宿主',{timeout:180000,retry:0},async owner=>{
 const f=fixture(legacy()),project=await f.projects.createProject(f.ctx,{title:'真实归属项目'}),conversation=await f.service.createConversation(f.ctx,{title:'真实项目会话',projectId:project.id});
 // 此处是严格wire目标，不假造reader DTO；四族真实稿件reader由frontend公共集成覆盖。
 const editorTarget=workEditorTarget.parse({schemaVersion:1,projectId:project.id,outputId:'target-output',owner,contentType:owner==='production'?'video':owner==='graphic_post'?'image':'article',documentDigest:'sha256:'+'b'.repeat(64),savedBase:owner==='production'?{kind:'production',productionId:'target-production',revision:7}:{kind:'artifact',artifactId:'target-artifact',versionId:'target-version'},selection:owner==='production'?{kind:'native_scene',sceneId:'scene',elementRefs:[],playheadTick:120000,contextEpoch:1,editorGeneration:'generation'}:owner==='graphic_post'?{kind:'graphic_cards',cardIds:['card']}:{kind:'article_sections',sectionIds:['section']}});
 const body=ENDPOINTS.createMessage.body!.parse({content:'对明确目标提出候选',executionEngine:'codex',chatContext:{editorTarget}});
 const message=await f.service.createMessageWithReplyTask(f.ctx,conversation.id,body),rows=await persisted(message);
 expect(f.prepare.mock.calls[0]![2]).toEqual({executionEngine:'codex',chatContext:{editorTarget}});expect(rows.host.chatContext.editorTarget).toEqual(editorTarget);expect(rows.frozen.executionEngine).toBe('codex');
});
it('公开creation由原AI owner补public-request，wire从未携带内部声明',{timeout:180000,retry:0},async()=>{
 const f=fixture(legacy()),project=await f.projects.createProject(f.ctx,{title:'同一已保存脚本'}),conversation=await f.service.createConversation(f.ctx,{title:'联合候选',projectId:project.id});
 const creationTarget={schemaVersion:1,clientRequestId:'t1091-public-creation',projectId:project.id,compositionId:'composition',compositionRevision:3,scriptSourceRef:{kind:'project_script',id:'script',versionId:'script-version'},articleMember:{kind:'article',outputId:'article',artifactId:'article-artifact',baseVersionId:'article-version'},graphicMember:{kind:'image',outputId:'graphic',artifactId:'graphic-artifact',baseVersionId:'graphic-version'}};
 const body=ENDPOINTS.createMessage.body!.parse({content:'基于同一保存脚本生成两个候选',executionEngine:'codex',chatContext:{creationTarget}}),before=structuredClone(body);
 const message=await f.service.createMessageWithReplyTask(f.ctx,conversation.id,body),rows=await persisted(message);
 const internal={...creationTarget,scriptConfirmation:{confirmedBy:'user',source:'public-request'}};
 expect(f.prepare.mock.calls[0]![2]).toEqual({executionEngine:'codex',chatContext:{creationTarget:internal}});expect(rows.host.chatContext.creationTarget).toEqual(internal);expect(body).toEqual(before);
});
it.each(['other-user','other-account','other-group'] as const)('会话 %s 越权在prepare前拒绝且零孤儿',{timeout:180000,retry:0},async mode=>{
 const groups=mode==='other-group'?await grouped():null,ctx=groups?.ctx??legacy(),f=fixture(ctx),conversation=await f.service.createConversation(ctx,{title:'原归属'});
 const denied=mode==='other-user'?{...ctx,userId:'foreign-user'}:mode==='other-account'?{...ctx,accountId:'foreign-account'}:groups!.other;
 await expect(f.service.createMessageWithReplyTask(denied,conversation.id,{content:'拒绝越权'})).rejects.toThrow();expect(f.prepare).not.toHaveBeenCalled();await noOrphan(f,conversation.id);
});
it('纯组不需要账号；真实组内不同平台筛选不改变共享稿owner',{timeout:180000,retry:0},async()=>{
 const {ctx}=await grouped(),f=fixture(ctx),project=await f.projects.createProject(ctx,{title:'纯组共享项目'}),conversation=await f.service.createConversation(ctx,{title:'纯组共享会话',projectId:project.id});
 const message=await f.service.createMessageWithReplyTask(ctx,conversation.id,ENDPOINTS.createMessage.body!.parse({content:'原纯组合法消息',executionEngine:'pi'})),rows=await persisted(message);
 expect(rows.execution.accountId).toBeNull();expect(rows.execution.groupId).toBe(ctx.groupId);expect((await f.service.getConversation({...ctx,accountId:'platform-filter-only'},conversation.id)).id).toBe(conversation.id);
});
it('真实同组两个已登记账号可共享会话；提交仍冻结当前实际membership',{timeout:180000,retry:0},async()=>{
 const {ctx}=await grouped(),accounts=createPlatformAccountService({db,now,nextId});
 const first=await accounts.createAccount(ctx,{platform:'xiaohongshu',accountHandle:nextId('first-account')}),second=await accounts.createAccount(ctx,{platform:'douyin',accountHandle:nextId('second-account')});
 const f=fixture({...ctx,accountId:first.id}),project=await f.projects.createProject(f.ctx,{title:'原同组项目'}),conversation=await f.service.createConversation(f.ctx,{title:'原共享会话',projectId:project.id});
 const current={...ctx,accountId:second.id};
 const message=await f.service.createMessageWithReplyTask(current,conversation.id,{content:'切同组真实平台仍共享'}),rows=await persisted(message);
 expect(rows.execution.accountId).toBe(second.id);expect(rows.execution.groupId).toBe(ctx.groupId);expect(rows.frozen.accountId).toBe(second.id);expect(rows.frozen.membershipVersion).toBe(1);expect(f.prepare.mock.calls[0]![0]).toEqual(current);
});
it.each(['other-project','global-conversation'] as const)('显式目标 %s 在prepare前拒绝，不能借目标更换会话project',{timeout:180000,retry:0},async mode=>{
 const f=fixture(legacy()),project=await f.projects.createProject(f.ctx,{title:'当前项目'}),other=await f.projects.createProject(f.ctx,{title:'另一个真实项目'}),conversation=await f.service.createConversation(f.ctx,{title:'会话',projectId:mode==='global-conversation'?null:project.id});
 const editorTarget=workEditorTarget.parse({schemaVersion:1,projectId:other.id,outputId:'article-output',owner:'wechat_article',contentType:'article',savedBase:{kind:'artifact',artifactId:'artifact',versionId:'version'},documentDigest:'sha256:'+'c'.repeat(64),selection:{kind:'article',sectionIds:[]}});
 const body=ENDPOINTS.createMessage.body!.parse({content:'目标不属于会话project',chatContext:{editorTarget}});
 await expect(f.service.createMessageWithReplyTask(f.ctx,conversation.id,body as unknown as PublicBody)).rejects.toThrow();expect(f.prepare).not.toHaveBeenCalled();await noOrphan(f,conversation.id);
});
it('真实项目归属错误由原project owner拒绝，不读取准备配置',{timeout:180000,retry:0},async()=>{
 const f=fixture(legacy()),project=await f.projects.createProject(f.ctx,{title:'真实项目'}),conversation=await f.service.createConversation(f.ctx,{title:'合法项目会话',projectId:project.id});
 await db.update((await import('@creatoros/backend')).projects).set({userId:'project-transferred-user'}).where(eq((await import('@creatoros/backend')).projects.id,project.id));
 await expect(f.service.createMessageWithReplyTask(f.ctx,conversation.id,{content:'项目归属已变化'})).rejects.toThrow();expect(f.assertProject).toHaveBeenCalledOnce();expect(f.prepare).not.toHaveBeenCalled();await noOrphan(f,conversation.id);
});
it.each(['bad-engine','client-confirmation','extra-tools'] as const)('直接service亦严格拒绝 %s，不以transport代替owner边界',{timeout:180000,retry:0},async mode=>{
 const f=fixture(legacy()),conversation=await f.service.createConversation(f.ctx,{title:'直接非法输入'});
 const body={content:'非法选项',...(mode==='bad-engine'?{executionEngine:'not-an-engine'}:mode==='extra-tools'?{tools:[]}:{chatContext:{creationTarget:{scriptConfirmation:{confirmedBy:'user',source:'public-request'}}}})};
 await expect(f.service.createMessageWithReplyTask(f.ctx,conversation.id,body as unknown as PublicBody)).rejects.toThrow();expect(f.prepare).not.toHaveBeenCalled();await noOrphan(f,conversation.id);
});
it.each(['prepare','history','task','submit'] as const)('%s 失败沿原事务保持零孤儿；历史并发只保留原并发消息',{timeout:180000,retry:0},async mode=>{
 const f=fixture(legacy(),mode==='task'),conversation=await f.service.createConversation(f.ctx,{title:'原子失败'});
 if(mode==='prepare')f.prepare.mockRejectedValueOnce(Error('T1091_PREPARE_FAILURE'));
 if(mode==='history')f.prepare.mockImplementationOnce(async()=>{await f.service.createMessage(f.ctx,conversation.id,{content:'并发原消息'});return {capability:'copilot.assist',system:'合成',messages:[],tools:[],maxSteps:6,maxOutputTokens:128};});
 if(mode==='submit')f.prepare.mockImplementationOnce(async()=>({capability:'copilot.assist',system:'非法assembly仅触发原submit严格schema',messages:[],tools:[],maxSteps:0,maxOutputTokens:128}));
 await expect(f.service.createMessageWithReplyTask(f.ctx,conversation.id,{content:'失败意图不保存'})).rejects.toThrow();await noOrphan(f,conversation.id,mode==='history'?['并发原消息']:[]);
});
it.each(['ai','ingestion'] as const)('source:%s 不能借creation伪造user/public-request确认',{timeout:180000,retry:0},async source=>{
 const f=fixture(legacy()),project=await f.projects.createProject(f.ctx,{title:'当前真实项目'}),conversation=await f.service.createConversation(f.ctx,{title:'确认来源',projectId:project.id});
 const creationTarget={schemaVersion:1,clientRequestId:'t1091-source-confirmation',projectId:project.id,compositionId:'composition',compositionRevision:3,scriptSourceRef:{kind:'project_script',id:'script',versionId:'script-version'},articleMember:{kind:'article',outputId:'article',artifactId:'article-artifact',baseVersionId:'article-version'},graphicMember:{kind:'image',outputId:'graphic',artifactId:'graphic-artifact',baseVersionId:'graphic-version'}};
 const body=ENDPOINTS.createMessage.body!.parse({content:'不能伪造本次用户确认',chatContext:{creationTarget},executionEngine:'codex'});
 await expect(f.service.createMessageWithReplyTask({...f.ctx,source},conversation.id,body)).rejects.toThrow();expect(f.prepare).not.toHaveBeenCalled();await noOrphan(f,conversation.id);
});
it.each(['ai','ingestion'] as const)('source:%s 原无creation普通消息不受新增确认守卫阻断',{timeout:180000,retry:0},async source=>{
 const f=fixture(legacy()),conversation=await f.service.createConversation(f.ctx,{title:'原普通消息'});
 const message=await f.service.createMessageWithReplyTask({...f.ctx,source},conversation.id,{content:'原合法普通消息'}),rows=await persisted(message);
 expect(rows.frozen.executionEngine).toBe('pi');expect(f.prepare).toHaveBeenCalledOnce();expect(rows.host.chatContext.creationTarget).toBeUndefined();
});
