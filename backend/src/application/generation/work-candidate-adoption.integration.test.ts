import {createWorkWritingContext} from './work-writing-context';
import {afterEach,expect,it} from 'vitest';
import {createDb,eq,executionCalls,executionTasks,aiTasks,type Db} from '@creatoros/backend';
import {ENDPOINTS,type RequestContext,type WorkCreationTarget,type WorkCreationProposalInput,workCreationProposalResult} from '@creatoros/contract';
import {createProjectRepository,createProjectsService} from '../../modules/projects';
import {createArtifactsService} from '../../modules/artifacts';
import {createArticlesService,createArticlesTransport} from '../../modules/articles';
import {createGraphicPostsService,createGraphicPostsTransport} from '../../modules/graphic-posts';
import {createMomentsService} from '../../modules/moments';
import {createOutputScriptsService} from '../../modules/output-scripts';
import {createProductionService} from '../../modules/production';
import {createWorkCompositionsService,createWorkMemberPorts} from '../../modules/work-compositions';
import {createAccountGroupService} from '../../modules/platform-account/account-group.service';
import {createProjectScriptSource} from '../project-script-source';
import {createWorkCreationRoot} from './work-creation-root';
import {createChatWorkCreationToolHost} from '../../modules/ai-runtime/chat-work-creation-tool-host';
import {buildChatTools,type ChatToolDeps} from '../../modules/ai-runtime/chat-tools';
import {prepareChatToolDefinitions} from '../../modules/ai-runtime/chat-tool-definitions';
import {resolveSkillForSurface} from '../../modules/ai-runtime/chat-surface';
import {createAiRepository} from '../../modules/ai/ai.repository';
import {createChatTurnSubmissionService} from '../../modules/ai/chat-turn-submission.service';
import {createChatHostContextReader} from '../../modules/ai/chat-host-context.service';
import {createPersistentTaskService} from '../../modules/execution/persistent-task.service';
import {createExternalChatTurnService} from '../../modules/ai/external-chat-turn.service';
import {createExternalTaskToolService} from '../../modules/ai/external-task-tool.service';

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
  return {projects,articles,graphicPosts,production:createProductionService({db:store,...deps}),outputScripts:createOutputScriptsService({projects,artifacts,submitScriptDraft:unavailable,readTask:unavailable}),moments:createMomentsService({db:store,...deps,ports:{artifacts:artifactsFor,assertProjectOwned:async(c,id,tx,lock)=>projectsFor(tx).getProject(c,id,lock),assertFile:unavailable,assertSource:unavailable}})};
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
async function frozen(f:Awaited<ReturnType<typeof fixture>>,v2=false){
 const resolvedWritingContext=v2?await createWorkWritingContext({assertProject:(c,id)=>f.owned.projects.getProject(c,id),readDocument:unavailable,readCenter:unavailable,readStatement:unavailable}).resolve(f.ctx,f.project.id,{schemaVersion:1,brandProfileVersionId:null,sourceAssets:[]}):undefined;
 if(resolvedWritingContext)f.target.writingContext=resolvedWritingContext.selection;
 const prototypes=buildChatTools(['work.creation.read','work.creation.propose'],{humanizeError:()=>null,creationTarget:f.target,readWorkCreation:()=>f.root.read(f.ctx,f.target),proposeWorkCreation:(input:WorkCreationProposalInput)=>f.root.propose(f.ctx,f.target,input)} as unknown as ChatToolDeps);
 const definitions=(await prepareChatToolDefinitions(prototypes,{workWritingContext:v2})).definitions;
 const repo=createAiRepository(f.db,{...f,userId:f.ctx.userId,accountId:f.ctx.accountId??null,groupId:f.ctx.groupId});
 const conversation=await repo.createConversation({title:'共同脚本编导',projectId:f.project.id,scope:`project:${f.project.id}`});
 const source=await repo.createMessage(conversation.id,{role:'user',content:'联合生成文章和图文候选',attachments:[],modelMetadata:{}});
 const hostContext={schemaVersion:1,...(resolvedWritingContext?{resolvedWritingContext}:{}),chatContext:{surface:'project',projectId:f.project.id,creationTarget:f.target},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1,userId:f.ctx.userId,accountId:f.ctx.accountId??null,groupId:f.ctx.groupId??null,resolvedAt:f.now(),platformPolicyVersion:'1',platformPolicy:'中性测试方法',skills:[{skillId:resolveSkillForSurface('project'),baseVersion:'neutral-test-1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'读取原保存脚本，产两份候选',template:'',tools:['work.creation.read','work.creation.propose'],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}};
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

import {createWorkCandidateSourceService} from '../../modules/ai/work-candidate-source.service';
import {createWorkCandidateAdoption} from './work-candidate-adoption';
import {workAdoptionDigest} from './work-candidate-projection';
async function proposeFixture(v2=false){const f=await fixture(),chat=await frozen(f,v2),read=await f.root.read(f.ctx,f.target),input=candidate(f,read);input.article.factItems=[{id:'candidate-fact',text:'预算200元',sourceRefs:[f.target.scriptSourceRef],reviewState:'confirmed'}] as never;
 const request={turnCallId:chat.turn.callId,toolCallId:'original-proposal',toolName:'work.creation.propose',input};
 const result=await chat.external.execute(chat.ref,request,chat.tools,chat.signal);expect(result.status).toBe('settled');
 const reader=createWorkCandidateSourceService(f.db),query={conversationId:chat.conversation.id,sourceMessageId:chat.input.sourceMessageId,toolCallId:request.toolCallId};
 const source=await reader.read(f.ctx,query);return {f,chat,input,request,result,reader,query,source};}
it.each([false,true])('写作v2=%s 原source→assisted公共运输→两个原owner独立版本与receipt，采纳model delta0',async v2=>{const p=await proposeFixture(v2),f=p.f;const adapter=createWorkCandidateAdoption(f.db,{source:p.reader,articles:store=>f.ownersFor(store).articles,graphic:store=>f.ownersFor(store).graphicPosts,lockArtifact:(ctx,id,store)=>f.artifactsFor(store).getArtifact(ctx,id,true)});
 const articleBody={adoptionMode:'assistant' as const,expectedCurrentVersionId:f.target.articleMember.baseVersionId,assistantSource:p.source.assistantSource,fieldSelection:[],policyVersion:1 as const,clientRequestId:'article-user-adopt',factSelection:{mode:'keep' as const}};
 const graphicBody={adoptionMode:'assistant' as const,expectedCurrentVersionId:f.target.graphicMember.baseVersionId,assistantSource:p.source.assistantSource,fieldSelection:[],policyVersion:1 as const,clientRequestId:'graphic-user-adopt'};
 const before=await f.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,p.chat.ref.executionTaskId));
 const articleTransport=createArticlesTransport(()=>f.owned.articles,(ctx,id,body)=>adapter.adopt(ctx,'article',id,body)),graphicTransport=createGraphicPostsTransport(()=>f.owned.graphicPosts,(ctx,id,body)=>adapter.adopt(ctx,'graphic',id,body));
 const a=await articleTransport.request(ENDPOINTS.createArticleVersion,{params:{outputId:f.target.articleMember.outputId},query:undefined,body:articleBody},f.ctx) as any;
 const g=await graphicTransport.request(ENDPOINTS.createGraphicPostVersion,{params:{outputId:f.target.graphicMember.outputId},query:undefined,body:graphicBody},f.ctx) as any;
 expect(a.data.document.sections).toEqual(p.input.article.sections);expect(a.data.document.title).toBe('');expect(a.data.document.factItems).toEqual([]);expect(g.data.document.body).toBe(p.input.graphic.body);expect(g.data.document.title).toBe('');
 expect(await adapter.adopt(f.ctx,'article',f.target.articleMember.outputId,articleBody)).toEqual(a.data);
 await expect(adapter.adopt(f.ctx,'article',f.target.articleMember.outputId,{...articleBody,fieldSelection:['title']})).rejects.toThrow();
 const current=await f.owned.articles.getArticle(f.ctx,f.target.articleMember.outputId);await f.owned.articles.createVersion(f.ctx,f.target.articleMember.outputId,{expectedCurrentVersionId:current.currentVersionId,document:{...current.current,title:'后来手工修改'},clientRequestId:'later-manual-change'});
 expect(await adapter.adopt(f.ctx,'article',f.target.articleMember.outputId,articleBody)).toEqual(a.data);expect((await f.owned.articles.getArticle(f.ctx,f.target.articleMember.outputId)).current.title).toBe('后来手工修改');
 const after=await f.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,p.chat.ref.executionTaskId));expect(after).toEqual(before);
});

it('公共assistant严格拒绝前端document与错digest，事实显式替换才落实且新改项待确认；CAS不换base',async()=>{
 const p=await proposeFixture(),f=p.f,adapter=createWorkCandidateAdoption(f.db,{source:p.reader,articles:store=>f.ownersFor(store).articles,graphic:store=>f.ownersFor(store).graphicPosts,lockArtifact:(ctx,id,store)=>f.artifactsFor(store).getArtifact(ctx,id,true)});
 const base=await f.owned.articles.getVersion(f.ctx,f.target.articleMember.outputId,f.target.articleMember.baseVersionId);
 const body={adoptionMode:'assistant' as const,expectedCurrentVersionId:f.target.articleMember.baseVersionId,assistantSource:p.source.assistantSource,fieldSelection:['title'],policyVersion:1 as const,clientRequestId:'facts-explicit-adopt',factSelection:{mode:'replace' as const,expectedBeforeDigest:workAdoptionDigest(base.document.factItems),proposedFactsDigest:workAdoptionDigest(p.input.article.factItems)}};
 await expect(adapter.adopt(f.ctx,'article',f.target.articleMember.outputId,{...body,document:p.input.article})).rejects.toThrow();
 await expect(adapter.adopt(f.ctx,'article',f.target.articleMember.outputId,{...body,factSelection:{...body.factSelection,expectedBeforeDigest:'sha256:'+'0'.repeat(64)}})).rejects.toThrow('事实');
 await expect(adapter.adopt({...f.ctx,source:'ai'},'article',f.target.articleMember.outputId,body)).rejects.toThrow('用户');
 const saved=await adapter.adopt(f.ctx,'article',f.target.articleMember.outputId,body);expect(saved.document.title).toBe(p.input.article.title);expect((saved.document as any).factItems).toEqual(p.input.article.factItems.map(fact=>({...fact,reviewState:'needs_confirmation'})));
 await expect(adapter.adopt(f.ctx,'article',f.target.articleMember.outputId,{...body,clientRequestId:'different-request-new'})).rejects.toThrow();
 expect(await adapter.adopt(f.ctx,'article',f.target.articleMember.outputId,body)).toEqual(saved);
 expect((await f.db.select().from(executionCalls)).filter(c=>c.kind==='model')).toEqual([]);
});
