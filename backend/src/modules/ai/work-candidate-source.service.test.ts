import {afterEach,expect,it} from 'vitest';
import {createDb,eq,executionCalls,executionTasks,aiTasks,type Db} from '@creatoros/backend';
import {ENDPOINTS,type RequestContext,type WorkCreationTarget,type WorkCreationProposalInput,workCreationProposalResult} from '@creatoros/contract';
import {createProjectRepository,createProjectsService} from '../projects';
import {createArtifactsService} from '../artifacts';
import {createArticlesService,createArticlesTransport} from '../articles';
import {createGraphicPostsService,createGraphicPostsTransport} from '../graphic-posts';
import {createMomentsService} from '../moments';
import {createOutputScriptsService} from '../output-scripts';
import {createProductionService} from '../production';
import {createWorkCompositionsService,createWorkMemberPorts} from '../work-compositions';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createProjectScriptSource} from '../../application/project-script-source';
import {createWorkCreationRoot} from '../../application/generation/work-creation-root';
import {createChatWorkCreationToolHost} from '../ai-runtime/chat-work-creation-tool-host';
import {buildChatTools,type ChatToolDeps} from '../ai-runtime/chat-tools';
import {prepareChatToolDefinitions} from '../ai-runtime/chat-tool-definitions';
import {resolveSkillForSurface} from '../ai-runtime/chat-surface';
import {createAiRepository} from './ai.repository';
import {createChatTurnSubmissionService} from './chat-turn-submission.service';
import {createChatHostContextReader} from './chat-host-context.service';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createExternalChatTurnService} from './external-chat-turn.service';
import {createExternalTaskToolService} from './external-task-tool.service';

const closes:Array<()=>Promise<void>>=[];
const signal=new AbortController().signal;
afterEach(async()=>{for(const close of closes.splice(0))await close();});
const unavailable=async():Promise<never>=>{throw Error('本验收不启动模型、另一个任务或素材写入');};
async function fixture(groupOnly=true){
 const opened=await createDb();closes.push(()=>opened.client.close());const db=opened.db;let sequence=0;
 const now=()=>new Date(Date.UTC(2026,9,7,5,0,0,sequence++)).toISOString(),nextId=(prefix:string)=>`${prefix}-${++sequence}`;
 const base:RequestContext={userId:'creation-neutral-user',requestId:'creation-neutral-request',source:'user'};
 const group=await createAccountGroupService({db,now,nextId}).create(base,{name:'联合创作中性验收',idempotencyKey:'creation-neutral-group'});
 const ctx:RequestContext=groupOnly?{...base,accountId:null,groupId:group.id,groupVersion:group.version}:{...base,accountId:'creation-legacy-account'};
 const deps={now,nextId};
 const projectsFor=(store:Db)=>createProjectsService(createProjectRepository(store),deps);
 const artifactsFor=(store:Db)=>createArtifactsService({db:store,...deps,assertProjectOwned:(c,id)=>projectsFor(store).getProject(c,id),resolveOutputProjectId:(c,id)=>projectsFor(store).getProjectIdByOutput(c,id)});
 const scriptFor=(store:Db)=>createProjectScriptSource({projects:projectsFor(store),artifacts:artifactsFor(store)});
 const peers={...deps,projects:projectsFor,artifacts:artifactsFor,assertAssetFile:unavailable,assertProjectScriptSource:(c:RequestContext,ref:WorkCreationTarget['scriptSourceRef'],projectId:string)=>scriptFor(db).assert(c,ref,projectId)};
 const ownersFor=(store:Db=db)=>{
  const projects=projectsFor(store),artifacts=artifactsFor(store);
  const articles=createArticlesService(store,{...peers,assertProjectScriptSource:(c,ref,id)=>scriptFor(store).assert(c,ref,id),resolveDocumentSource:unavailable,resolveSelectedBrand:unavailable,submitGeneration:unavailable,readGeneration:unavailable});
  const graphicPosts=createGraphicPostsService(store,{...peers,assertProjectScriptSource:(c,ref,id)=>scriptFor(store).assert(c,ref,id),submitTextGeneration:unavailable,readTextGeneration:unavailable});
  return {projects,articles,graphicPosts,production:createProductionService({db:store,...deps}),outputScripts:createOutputScriptsService({projects,artifacts,submitScriptDraft:unavailable,readTask:unavailable}),moments:createMomentsService({db:store,...deps,ports:{artifacts:artifactsFor,assertProjectOwned:async(c,id,tx,lock)=>{await projectsFor(tx).getProject(c,id,lock);},assertFile:unavailable,assertSource:unavailable}})};
 };
 const owned=ownersFor();const project=await owned.projects.createProject(ctx,{title:'同一脚本的两份真实作品',brief:'中性验收'});
 const script=await artifactsFor(db).createArtifact(ctx,{projectId:project.id,title:'明确确认的保存脚本',artifactType:'master_script',stage:'script',initialContentText:'先展示操作，再说明方法。预算是200元。最后总结适用场景。'});
 const compositions=createWorkCompositionsService({db,...deps,ports:{...createWorkMemberPorts(ownersFor),artifacts:artifactsFor,assertSource:unavailable,assertRule:unavailable}});
 let composition=await compositions.create(ctx,{projectId:project.id,title:'文章和图文',clientRequestId:'neutral-composition-create'});
 for(const kind of ['article','image'] as const)composition=await compositions.createMember(ctx,composition.compositionId,{expectedRevision:composition.currentRevision,clientRequestId:`neutral-${kind}-member`,memberInput:kind==='article'?{kind,title:'文章',targetPlatform:null,contentRole:null}:{kind,title:'图文',targetPlatform:null}});
 const articleMember=composition.current.members.find(row=>row.member.kind==='article')!.member;
 const graphicMember=composition.current.members.find(row=>row.member.kind==='image')!.member;
 if(articleMember.kind!=='article'||graphicMember.kind!=='image')throw Error('真实成员类型不符');
 const article=await owned.articles.getArticle(ctx,articleMember.outputId),graphic=await owned.graphicPosts.getGraphicPost(ctx,graphicMember.outputId);
 const target:WorkCreationTarget={schemaVersion:1,clientRequestId:'neutral-creation-click',projectId:project.id,compositionId:composition.compositionId,compositionRevision:composition.currentRevision,scriptSourceRef:{kind:'project_script',id:script.id,versionId:script.currentVersionId!},scriptConfirmation:{confirmedBy:'user',source:'current-click'},articleMember:{...articleMember,artifactId:article.artifactId,baseVersionId:article.currentVersionId},graphicMember:{...graphicMember,artifactId:graphic.artifactId,baseVersionId:graphic.currentVersionId}};
 const root=createWorkCreationRoot({compositions,articles:owned.articles,graphicPosts:owned.graphicPosts,script:scriptFor(db)});
 return {db,ctx,owned,ownersFor,compositions,root,target,now,nextId,scriptFor,artifactsFor,project};
}
function candidate(f:Awaited<ReturnType<typeof fixture>>,read:Awaited<ReturnType<typeof f.root.read>>,long=false){
 const refs=[f.target.scriptSourceRef];
 return {targetDigest:read.targetDigest,article:{...read.article,title:'先展示操作',titleSourceRefs:refs,summary:'从真实操作说明方法',summarySourceRefs:refs,sections:[{sectionId:'neutral-section',order:0,heading:'先做再解释',headingLevel:2,body:long?'完整原稿。'.repeat(18000):'预算200元，先展示操作，再说明方法。',sourceRefs:refs}]},graphic:{...read.graphic,title:'先做再解释',body:'预算200元。',summary:'一步步说明',sourceRefs:refs,cardBriefs:[{cardId:'neutral-card-1',title:'操作',body:'先展示操作',sourceRefs:refs},{cardId:'neutral-card-2',title:'方法',body:'再说明方法',sourceRefs:refs}]}};
}
async function frozen(f:Awaited<ReturnType<typeof fixture>>){
 const prototypes=buildChatTools(['work.creation.read','work.creation.propose'],{humanizeError:()=>null,creationTarget:f.target,readWorkCreation:()=>f.root.read(f.ctx,f.target),proposeWorkCreation:(input:WorkCreationProposalInput)=>f.root.propose(f.ctx,f.target,input)} as unknown as ChatToolDeps);
 const definitions=(await prepareChatToolDefinitions(prototypes)).definitions;
 const repo=createAiRepository(f.db,{...f,userId:f.ctx.userId,accountId:f.ctx.accountId??null,groupId:f.ctx.groupId});
 const conversation=await repo.createConversation({title:'共同脚本编导',projectId:f.project.id,scope:`project:${f.project.id}`});
 const source=await repo.createMessage(conversation.id,{role:'user',content:'联合生成文章和图文候选',attachments:[],modelMetadata:{}});
 const hostContext={schemaVersion:1,chatContext:{surface:'project',projectId:f.project.id,creationTarget:f.target},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1,userId:f.ctx.userId,accountId:f.ctx.accountId??null,groupId:f.ctx.groupId??null,resolvedAt:f.now(),platformPolicyVersion:'1',platformPolicy:'中性测试方法',skills:[{skillId:resolveSkillForSurface('project'),baseVersion:'neutral-test-1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'读取原保存脚本，产两份候选',template:'',tools:['work.creation.read','work.creation.propose'],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}};
 const submitter=createChatTurnSubmissionService(f.db,{now:f.now,nextId:f.nextId,assertProject:(c,id)=>f.owned.projects.getProject(c,id),assemble:async()=>({capability:'copilot.assist',system:'中性协议验收，无真实供应商',messages:[{role:'user',content:source.content}],tools:definitions,maxSteps:4,maxOutputTokens:32768,hostContext} as never)});
 const input={conversationId:conversation.id,sourceMessageId:source.id,executionEngine:'codex' as const};
 const submitted=await submitter.submit(f.ctx,input);
 const claim=(await createPersistentTaskService(f.db,{now:f.now}).claimTask({taskId:submitted.executionTaskId,workerId:'creation-neutral-worker'}))!;
 const ref={executionTaskId:submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const reader=createChatHostContextReader(f.db,{now:f.now});
 const tools=await createChatWorkCreationToolHost(reader,f.root)(f.ctx,{} as never,ref,signal);
 const budget={maxCalls:12,maxTokens:1000000,deadlineMs:120000};
 const external=createExternalTaskToolService(f.db,{now:f.now}),turns=createExternalChatTurnService(f.db,{now:f.now,budget});
 const turn=await turns.reserve(ref,{});
 await turns.start(ref,{callId:turn.callId,sessionId:'creation-session',protocolKind:'acp',protocolVersion:1});
 await turns.recordProviderTurn(ref,{callId:turn.callId,providerTurnId:'creation-provider-turn'});
 return {repo,conversation,submitted,submitter,input,ref,reader,tools,external,turns,turn,signal:new AbortController().signal};
}

import {createWorkCandidateSourceService} from './work-candidate-source.service';
import {createWorkCandidateAdoption} from '../../application/generation/work-candidate-adoption';
import {workAdoptionDigest} from '../../application/generation/work-candidate-projection';
async function proposeFixture(){const f=await fixture(),chat=await frozen(f),read=await f.root.read(f.ctx,f.target),input=candidate(f,read);input.article.factItems=[{id:'candidate-fact',text:'预算200元',sourceRefs:[f.target.scriptSourceRef],reviewState:'confirmed'}] as never;
 const request={turnCallId:chat.turn.callId,toolCallId:'original-proposal',toolName:'work.creation.propose',input};
 const result=await chat.external.execute(chat.ref,request,chat.tools,chat.signal);expect(result.status).toBe('settled');
 const reader=createWorkCandidateSourceService(f.db),query={conversationId:chat.conversation.id,sourceMessageId:chat.input.sourceMessageId,toolCallId:request.toolCallId};
 const source=await reader.read(f.ctx,query);return {f,chat,input,request,result,reader,query,source};}
it('真实公共来源读回原host/工具参数；未知、跨组、参数被改均不能补造',async()=>{const p=await proposeFixture();expect(p.source.candidate).toEqual(p.result.outcome!.data);expect(p.source.assistantSource).toMatchObject({taskId:p.chat.submitted.taskId,callId:p.result.callId,toolCallId:p.request.toolCallId});
 await expect(p.reader.read({...p.f.ctx,groupId:'foreign'},p.query)).rejects.toThrow();
 await p.f.db.update(executionCalls).set({status:'unknown'}).where(eq(executionCalls.id,p.result.callId));await expect(p.reader.read(p.f.ctx,p.query)).rejects.toThrow();
 await p.f.db.update(executionCalls).set({status:'settled'}).where(eq(executionCalls.id,p.result.callId));
 const [task]=await p.f.db.select().from(executionTasks).where(eq(executionTasks.id,p.chat.ref.executionTaskId));const payload=structuredClone(task!.payload) as any;payload.externalToolInputs[p.result.callId].input.article.title='篡改同结果原参数';await p.f.db.update(executionTasks).set({payload}).where(eq(executionTasks.id,task!.id));await expect(p.reader.read(p.f.ctx,p.query)).rejects.toThrow();
});
it('原legacy联合候选能严格重建原输入；新namespace不改provider身份或call预算',async()=>{const p=await proposeFixture();const [task]=await p.f.db.select().from(executionTasks).where(eq(executionTasks.id,p.chat.ref.executionTaskId));const [call]=await p.f.db.select().from(executionCalls).where(eq(executionCalls.id,p.result.callId));const payload=structuredClone(task!.payload) as any;expect(payload.externalToolInputs[call!.id]).toMatchObject({input:p.input,inputDigest:call!.inputDigest,toolVersion:(call!.providerResult as any).toolVersion});expect(call!.reservedTokens).toBe(0);delete payload.externalToolInputs;await p.f.db.update(executionTasks).set({payload}).where(eq(executionTasks.id,task!.id));expect(await p.reader.read(p.f.ctx,p.query)).toEqual(p.source);});
