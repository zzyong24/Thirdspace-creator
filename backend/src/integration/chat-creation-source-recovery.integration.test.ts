import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {workCreationProposalResult,workCreationTarget,type RequestContext,type WorkCreationReadResult,type WorkCreationProposalInput} from '@creatoros/contract';
import {createDb,eq,executionTasks,executionCalls,executionStreamEvents,aiTasks,aiTaskResults,projects,type Db} from '@creatoros/backend';
import {createAiService} from '../modules/ai';
import {createChatTurnSubmissionService} from '../modules/ai/chat-turn-submission.service';
import {createChatHostContextReader} from '../modules/ai/chat-host-context.service';
import {createChatWorkerDispatcher} from '../modules/execution/model-worker-dispatcher';
import {createChatWorkCreationToolHost} from '../modules/ai-runtime/chat-work-creation-tool-host';
import {buildChatTools,type ChatToolDeps} from '../modules/ai-runtime/chat-tools';
import {prepareChatToolDefinitions} from '../modules/ai-runtime/chat-tool-definitions';
import {buildAssistantFunctionalPrompt} from '../modules/ai-runtime/assistant-functional-prompt';
import {createWorkCreationRoot} from '../application/generation/work-creation-root';
import {createExecutionAgenticToolPorts} from '../modules/execution/execution-agentic-tool-ports.service';

let db:Db,close:()=>Promise<void>,sequence=0;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();},180000);
afterAll(async()=>close?.(),180000);

it.each(['repair','failure','legacy'] as const)('真实公共Pi Worker %s：原严格root、宿主回执、原任务完成与同键回放',async mode=>{
 const nextId=(prefix:string)=>`${prefix}-source-recovery-${++sequence}`,stamp=new Date().toISOString();
 const ctx:RequestContext={userId:'source-recovery-user',accountId:nextId('account'),requestId:'test',source:'user'},projectId=nextId('project');
 // 合成父实体只在隔离库；领域只读端口夹具逐项给出该父的已保存版本，不代表供应商或用户库验收。
 await db.insert(projects).values({id:projectId,userId:ctx.userId,accountId:ctx.accountId,title:'隔离共同来源',creationMode:'manual',status:'active',currentStage:'script',startedAt:stamp,createdAt:stamp,updatedAt:stamp});
 const sourceRef={kind:'project_script' as const,id:nextId('script'),versionId:nextId('script-version')};
 const target=workCreationTarget.parse({schemaVersion:1,clientRequestId:nextId('request'),projectId,compositionId:nextId('composition'),compositionRevision:1,scriptSourceRef:sourceRef,scriptConfirmation:{confirmedBy:'user',source:'public-request'},articleMember:{kind:'article',outputId:nextId('article'),artifactId:nextId('article-artifact'),baseVersionId:nextId('article-version')},graphicMember:{kind:'image',outputId:nextId('graphic'),artifactId:nextId('graphic-artifact'),baseVersionId:nextId('graphic-version')}});
 const article={schemaVersion:1 as const,title:'原稿标题',summary:'原稿摘要',titleSourceRefs:[],summarySourceRefs:[],sections:[{sectionId:'section-1',order:0,heading:'原段落',headingLevel:2,body:'原稿未改正文',sourceRefs:[]}],factItems:[{id:'fact-1',text:'确认脚本事实',reviewState:'confirmed' as const,sourceRefs:[]}],visualBriefs:[],imageUses:[]};
 const graphic={schemaVersion:1 as const,title:'原稿图文',body:'原稿图文正文',summary:'原摘要',tags:[],imageUses:[],cardBriefs:[{cardId:'card-1',title:'原卡',body:'原卡内容',sourceRefs:[]}],sourceRefs:[],ruleSnapshotRef:null};
 const originalDocuments=JSON.stringify({article,graphic});
 const assertScope=(owner:RequestContext)=>{if(owner.userId!==ctx.userId||owner.accountId!==ctx.accountId)throw Error('隔离属主拒绝');};
 const root=createWorkCreationRoot({
  compositions:{get:async(owner:RequestContext)=>{assertScope(owner);return {compositionId:target.compositionId,projectId,currentRevision:1,current:{members:[{member:{kind:'article',outputId:target.articleMember.outputId}},{member:{kind:'image',outputId:target.graphicMember.outputId}}]},memberCurrent:[{availability:'available',member:{kind:'article',outputId:target.articleMember.outputId},currentVersion:{kind:'artifact',artifactId:target.articleMember.artifactId,versionId:target.articleMember.baseVersionId}},{availability:'available',member:{kind:'image',outputId:target.graphicMember.outputId},currentVersion:{kind:'artifact',artifactId:target.graphicMember.artifactId,versionId:target.graphicMember.baseVersionId}}]};}},
  articles:{getArticle:async(owner:RequestContext)=>{assertScope(owner);return {projectId,outputId:target.articleMember.outputId,artifactId:target.articleMember.artifactId,currentVersionId:target.articleMember.baseVersionId,current:article};},getVersion:async(owner:RequestContext)=>{assertScope(owner);return {versionId:target.articleMember.baseVersionId,document:article};}},
  graphicPosts:{getGraphicPost:async(owner:RequestContext)=>{assertScope(owner);return {projectId,outputId:target.graphicMember.outputId,artifactId:target.graphicMember.artifactId,currentVersionId:target.graphicMember.baseVersionId,current:graphic};},getVersion:async(owner:RequestContext)=>{assertScope(owner);return {versionId:target.graphicMember.baseVersionId,document:graphic};}},
  script:{readVersion:async(owner:RequestContext,ref:typeof sourceRef,parent:string)=>{assertScope(owner);expect(ref).toEqual(sourceRef);expect(parent).toBe(projectId);return {ref:sourceRef,label:'合成确认脚本',text:'已经确认的中性脚本内容'};},readImages:async(owner:RequestContext)=>{assertScope(owner);return {state:'empty',images:[]};}},
 } as unknown as Parameters<typeof createWorkCreationRoot>[0]);
 const proposeSpy=vi.spyOn(root,'propose');
 const forbidden=async():Promise<never>=>{throw Error('验收候选不得自动采用');};
 const ai=createAiService({db,nextId,now:()=>new Date().toISOString(),artifacts:{createVersion:forbidden},knowledge:{createKnowledge:forbidden},positioning:{upsertProfile:forbidden,createStatementVersion:forbidden},candidate:{createFromAIResult:forbidden,enrichCard:forbidden},learnings:{createLearning:forbidden},publishing:{createPublicationFromDraft:forbidden},materialLinks:{link:forbidden},calibration:{createDraftPrediction:forbidden}});
 const conversation=await ai.createConversation(ctx,{title:'真实Worker来源纠错',projectId,scope:`project:${projectId}`}),source=await ai.createMessage(ctx,conversation.id,{content:'根据确认脚本提出文章和图文候选，尚未采用',attachments:[]});
 const names=['work.creation.read','work.creation.propose'];
 const definitions=(await prepareChatToolDefinitions(buildChatTools(names,{humanizeError:()=>null,creationTarget:target,readWorkCreation:()=>root.read(ctx,target),proposeWorkCreation:(input:WorkCreationProposalInput)=>root.propose(ctx,target,input)} as unknown as ChatToolDeps))).definitions;
 const hostContext={schemaVersion:1 as const,chatContext:{surface:'project',projectId,creationTarget:target},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1 as const,userId:ctx.userId,accountId:ctx.accountId??null,resolvedAt:stamp,platformPolicyVersion:'1',platformPolicy:'候选',skills:[{skillId:'chatbox.topic',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'固定策略',template:'模板',tools:names,requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}};
 const submitter=createChatTurnSubmissionService(db,{assemble:async()=>({capability:'copilot.assist',system:buildAssistantFunctionalPrompt(names),messages:[{role:'user' as const,content:source.content}],maxSteps:6,maxOutputTokens:4096,tools:definitions,hostContext}),assertProject:async(owner,parent)=>{assertScope(owner);expect(parent).toBe(projectId);}});
 const request={conversationId:conversation.id,sourceMessageId:source.id},submitted=await submitter.submit(ctx,request);
 if(mode==='legacy'){
  const [before]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
  const legacy={...before!.payload as Record<string,unknown>};delete legacy.toolFailureReceiptVersion;
  await db.update(executionTasks).set({payload:legacy}).where(eq(executionTasks.id,submitted.executionTaskId));
 }
 const [frozen]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId)),originalPayload=JSON.stringify(frozen!.payload),originalBudget=JSON.stringify(frozen!.executionBudget);
 const requests:Array<{messages:Array<{role:string;content:unknown}>}>=[],failures:string[]=[];
 let currentRead:WorkCreationReadResult|undefined,settledMarkerReplayVerified=false;
 function toolData(messages:typeof requests[number]['messages'],kind:string){
  for(const message of messages.filter(m=>m.role==='tool').reverse()){
   let value:unknown=message.content;
   // 原Pi投影在JSON前保留真实operationRef说明；按实际传输协议读取，不从夹具猜摘要。
   if(typeof value==='string')try{value=JSON.parse(value.startsWith('[原工具调用 ID: ')?value.slice(value.indexOf('\n')+1):value);}catch{}
   const record=value as {data?:{kind?:string};kind?:string};
   if(record?.data?.kind===kind)return record.data;
   if(record?.kind===kind)return record;
  }
  throw Error(`下一模型请求缺少真实 ${kind} 回执`);
 }
 const server=createServer(async(req,res)=>{
  try{
   let body='';for await(const chunk of req)body+=chunk;const parsed=JSON.parse(body);requests.push(parsed);const ordinal=requests.length;
   if(ordinal===2)currentRead=toolData(parsed.messages,'work.creation.read') as WorkCreationReadResult;
   if(ordinal===3){
    const text=JSON.stringify(parsed.messages.filter((m:{role:string})=>m.role==='tool'));
    if(mode==='legacy'){
     if(!text.includes('读取未完成，可检查权限与目标状态后继续'))throw Error('旧任务错误改变');
     // 只在隔离库模拟旧调用结算后的标记改变，真实端口必须仍回放原回执，不能再执行或覆写。
     const [live]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
     if(!live?.fenceToken)throw Error('原任务执行凭证缺失');
     const execution={executionTaskId:live.id,attempt:live.attempt,fenceToken:live.fenceToken};
     const beforeCalls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,live.id)).orderBy(executionCalls.sequence);
     const failed=beforeCalls.filter(c=>c.kind==='tool').at(-1)!;
     expect(failed.status).toBe('settled');
     const originalOutcome=JSON.parse(failed.resultText!).output,beforeProposals=proposeSpy.mock.calls.length;
     await db.update(executionTasks).set({payload:{...live.payload as Record<string,unknown>,toolFailureReceiptVersion:1}}).where(eq(executionTasks.id,live.id));
     try{
      const reader=createChatHostContextReader(db),frozen=await reader.read(execution);
      expect(frozen.toolFailureReceiptVersion).toBe(1);
      const modernTools=await createChatWorkCreationToolHost(reader,root)(frozen.context,{} as never,execution,new AbortController().signal);
      const ports=createExecutionAgenticToolPorts(db,{budget:{maxCalls:12,maxTokens:100000,deadlineMs:120000},tools:modernTools});
      expect(await ports.execute(execution,{callId:failed.id},new AbortController().signal)).toEqual(originalOutcome);
      expect(proposeSpy.mock.calls).toHaveLength(beforeProposals);
      await expect(ports.settle(execution,{callId:failed.id,status:'settled',output:{...originalOutcome,error:{...originalOutcome.error,code:'invalid_input'}}})).rejects.toMatchObject({name:'ConflictError'});
      expect(JSON.stringify(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,live.id)).orderBy(executionCalls.sequence))).toBe(JSON.stringify(beforeCalls));
      settledMarkerReplayVerified=true;
     }finally{await db.update(executionTasks).set({payload:live.payload}).where(eq(executionTasks.id,live.id));}
    }
    else for(const field of ['article.titleSourceRefs','article.summarySourceRefs','sections[*].sourceRefs','factItems[*].sourceRefs','graphic.sourceRefs','cardBriefs[*].sourceRefs','scriptSourceRef'])if(!text.includes(field))throw Error(`实际下一模型请求缺少 ${field}`);
   }
   let delta:Record<string,unknown>,finish:string;
   if(ordinal===1){delta={tool_calls:[{index:0,id:'read-original',type:'function',function:{name:'work_creation_read',arguments:'{}'}}]};finish='tool_calls';}
   else if(ordinal===2 || (ordinal===3&&mode==='repair')){
    if(!currentRead)throw Error('不得猜read摘要或来源');
    const a=structuredClone(currentRead.article),g=structuredClone(currentRead.graphic);
    if(ordinal===3){const refs=[structuredClone(currentRead.scriptSourceRef)];a.titleSourceRefs=refs;a.summarySourceRefs=refs;a.sections.forEach(s=>s.sourceRefs=refs);a.factItems.forEach(f=>f.sourceRefs=refs);g.sourceRefs=refs;g.cardBriefs!.forEach(c=>c.sourceRefs=refs);g.ruleSnapshotRef=currentRead.graphic.ruleSnapshotRef;}
    delta={tool_calls:[{index:0,id:`proposal-${ordinal}`,type:'function',function:{name:'work_creation_propose',arguments:JSON.stringify({targetDigest:currentRead.targetDigest,article:a,graphic:g})}}]};finish='tool_calls';
   }else{if(ordinal!==(mode==='repair'?4:3))throw Error('不能增加模型调用');delta={content:mode==='repair'?'候选已准备，等用户采用。':'本轮尚未生成候选，保留真实错误。'};finish='stop';}
   const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:finish}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
   res.writeHead(200,{'content-type':'text/event-stream'});res.end(chunks.map(c=>`data: ${JSON.stringify({id:'source-fixture',object:'chat.completion.chunk',created:1,model:'fixture',...c})}\n\n`).join('')+'data: [DONE]\n\n');
  }catch(error){failures.push(String(error));console.error('隔离模型夹具协议失败',String(error));res.writeHead(500);res.end('来源纠错模型夹具失败');}
 });
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 const worker=createChatWorkerDispatcher(db,{entryPath:resolve('../ai-worker/dist/execution-worker.cjs'),workerId:`source-recovery-${mode}`,budget:{maxCalls:12,maxTokens:100000,deadlineMs:120000},pollMs:100,modelConcurrency:1,resolveTools:createChatWorkCreationToolHost(createChatHostContextReader(db),root),resolveModelCredential:async()=>({apiFormat:'openai_chat',baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:'fixture',token:'fixture'})});
 try{
  worker.start();const expected=mode==='failure'?'partial':'succeeded';
  await expect.poll(async()=>(await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId)))[0]?.status,{timeout:120000}).toBe(expected);
  expect(failures).toEqual([]);expect(requests).toHaveLength(mode==='repair'?4:3);
  expect(settledMarkerReplayVerified).toBe(mode==='legacy');
  const calls=(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId))).sort((a,b)=>a.sequence-b.sequence),tools=calls.filter(c=>c.kind==='tool');
  expect(calls.every(c=>c.status==='settled')).toBe(true);expect(tools).toHaveLength(mode==='repair'?3:2);
  const failed=JSON.parse(tools[1]!.resultText!).output;
  expect(failed).toMatchObject({status:'error',sideEffect:'none',error:{code:mode==='legacy'?'no_evidence':'invalid_input',retryable:false}});
  if(mode==='repair'){
   const success=JSON.parse(tools[2]!.resultText!).output;expect(success).toMatchObject({status:'ok',sideEffect:'proposal'});
   const candidate=workCreationProposalResult.parse(success.data);expect(candidate.scriptSourceRef).toEqual(currentRead!.scriptSourceRef);expect(candidate.article.titleSourceRefs).toEqual([sourceRef]);expect(candidate.article.sections[0]!.sourceRefs).toEqual([sourceRef]);expect(candidate.graphic.ruleSnapshotRef).toBeNull();
  }
  expect(await ai.getTask(ctx,submitted.taskId)).toMatchObject({id:submitted.taskId,status:expected,runtimeStatus:expected});
  const messages=await ai.listMessages(ctx,conversation.id),reply=messages.at(-1)!;
  expect(reply.modelMetadata).toMatchObject({completeness:expected==='partial'?'partial':'completed',actualEngine:'pi'});
  if(mode==='failure')expect(reply.content).toContain('最后一次工具操作未成功');else expect(reply.content).not.toContain('最后一次工具操作未成功');
  expect(JSON.stringify({article,graphic})).toBe(originalDocuments);
  const after=(await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId)))[0]!,{modelIdentity,...payload}=after.payload as Record<string,unknown>;
  expect(modelIdentity).toMatchObject({model:'fixture'});expect(JSON.stringify(payload)).toBe(originalPayload);expect(JSON.stringify(after.executionBudget)).toBe(originalBudget);
  const snapshot=JSON.stringify({calls,messages,events:await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,submitted.executionTaskId)),results:await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,submitted.taskId))});
  expect(await submitter.submit(ctx,request)).toEqual({...submitted,replayed:true});
  expect(JSON.stringify({calls:await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId)).orderBy(executionCalls.sequence),messages:await ai.listMessages(ctx,conversation.id),events:await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,submitted.executionTaskId)),results:await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,submitted.taskId))})).toBe(snapshot);
  expect(await db.select().from(aiTasks).where(eq(aiTasks.accountId,ctx.accountId!))).toHaveLength(1);
 }finally{await worker.stop();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
},180000);
