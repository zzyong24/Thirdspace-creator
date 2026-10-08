import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {createDb,aiTaskResults,executionTasks,executionCalls,eq,sql,type Db} from "@creatoros/backend";
import {creativeCanvases} from "../../schema/creative-canvas";
import {accountGroups} from "../../schema/account-groups";
import {canvasCreateProposalInputSchema,canvasCreateCandidateSchema,emptyCanvasDocument,type RequestContext} from "@creatoros/contract";
import {chatToolProviderName} from "@creatoros/contract/execution-worker";
import {createAiRepository} from "./ai.repository";
import {createChatTurnSubmissionService} from "./chat-turn-submission.service";
import {createChatProposalSourceService,sealChatProposal} from "./chat-proposal-source.service";
import {createAssistantActionAdoptionService} from "./assistant-action-adoption.service";
import {createCreativeCanvasService} from "../creative-canvas/creative-canvas.service";
import {createPersistentTaskService} from "../execution/persistent-task.service";
import {createExecutionCallLedgerService} from "../execution/execution-call-ledger.service";
import {createExecutionGenerationPorts} from "../execution/execution-generation-ports.service";
import {createExecutionChatToolPorts} from "../execution/execution-chat-tool-ports.service";
import {prepareChatToolParameters} from "../ai-runtime/chat-tool-parameters";
import type {ChatHostContext} from "./chat-host-context";

let db:Db,close:()=>Promise<void>,seq=0;
const now=()=>"2026-10-08T02:00:00.000Z",budget={maxCalls:12,maxTokens:10000,deadlineMs:120000};
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});
afterAll(async()=>close());
async function fixture(group=false){
 const ctx:RequestContext={userId:"adoption-user",accountId:group?null:`adoption-account-${++seq}`,...(group?{groupId:`adoption-group-${++seq}`,groupVersion:1}:{}),requestId:"adopt-test",source:"user"};
 if(ctx.groupId)await db.insert(accountGroups).values({id:ctx.groupId,userId:ctx.userId,name:"中性验收组",status:"active",version:1,createdAt:now(),updatedAt:now()});
 const failPort=async()=>{throw Error("本验收夹具没有项目或媒体引用");};
 const canvas=createCreativeCanvasService(db,{now,assertProject:failPort,assertMediaAsset:failPort,assertReferenceAsset:failPort,getMediaFileDownloadUrl:failPort,getReference:failPort,readTask:failPort,readTaskResults:failPort,submitTask:failPort});
 const parameters=canvasCreateProposalInputSchema,parameterSchema=(await prepareChatToolParameters(parameters)).schema,name="canvas.create.propose",version="canvas-source-integration-v1";
 const request={title:"AI中性画布",document:{...emptyCanvasDocument,nodes:[{id:"note-1",type:"text" as const,label:"主旨",text:"中性验收说明",position:{x:0,y:0}}]}};
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId,now,nextId:prefix=>`${prefix}-adopt-${++seq}`});
 const conversation=await repo.createConversation({title:"创建画布",projectId:null,scope:"global"});
 const message=await repo.createMessage(conversation.id,{role:"user",content:"为我建立一个中性画布",attachments:[],modelMetadata:{}});
 const host:ChatHostContext={schemaVersion:1,chatContext:{surface:"topics"},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId??null,...(ctx.groupId?{groupId:ctx.groupId}:{}),resolvedAt:now(),platformPolicyVersion:"1",platformPolicy:"用户采用",skills:[{skillId:"chatbox.topic",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"产候选",template:"",tools:[name],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}};
 const submitted=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"中性候选",messages:[{role:"user",content:message.content}],maxSteps:8,maxOutputTokens:128,hostContext:host,tools:[{name,version,parameters:parameterSchema,description:"创建画布候选",effect:"proposal"}]})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:message.id});
 const claim=(await createPersistentTaskService(db,{now}).claimTask({taskId:submitted.executionTaskId,workerId:"adoption-worker"}))!;
 const ref={executionTaskId:submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const tool={parameters,parameterSchema,version,effect:"proposal" as const,approve:async()=>({status:"not-applicable" as const}),execute:async(c:RequestContext,input:unknown,scope:{aiTaskId:string;callId:string;toolCallId:string})=>{
  const request=parameters.parse(input),prepared=await canvas.prepareCreateProposal(c,request);
  return {status:"ok" as const,summary:"完整画布候选待采用",evidence:[],data:sealChatProposal({taskId:scope.aiTaskId,callId:scope.callId,toolCallId:scope.toolCallId},{schemaVersion:1 as const,kind:"canvas.create.proposal",request,document:prepared.document}),error:null,continuation:null,sideEffect:"proposal" as const};
 }};
 const tools={[name]:tool},source=createChatProposalSourceService(db,{tools,parseCandidate:(_name,data)=>canvasCreateCandidateSchema.omit({source:true}).parse(data)});
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
 const input=task!.payload as {modelInput:{operationKey:string}},ledger=createExecutionCallLedgerService(db,{now,budget}),generation=createExecutionGenerationPorts(db,{now,budget});
 const model=await generation.reserveGenerationCall(ref,{operationKey:`${input.modelInput.operationKey}/model/1`,request:{maxOutputTokens:128}});await ledger.start(ref,model.callId);
 await generation.settleGenerationCall(ref,{callId:model.callId,status:"settled",usage:{inputTokens:1,outputTokens:1},providerResult:{content:[{type:"tool-call",toolName:chatToolProviderName(name),toolCallId:"canvas-create",input:JSON.stringify(request)}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]}});
 const ports=createExecutionChatToolPorts(db,{now,budget,tools}),call=await ports.reserve(ref,{modelCallId:model.callId,toolCallId:"canvas-create"});await ports.start(ref,{callId:call.callId});
 const output=await ports.execute(ref,{callId:call.callId}),reference=(output.data as {source:unknown}).source;
 const apply=vi.fn(async(c:RequestContext,restored:Awaited<ReturnType<typeof source.read>>,tx:Parameters<Parameters<Db["transaction"]>[0]>[0])=>{
  const candidate=canvasCreateCandidateSchema.omit({source:true}).parse(restored.candidate);
  const result=await canvas.createWithDocumentInTransaction(c,{...candidate.request,document:candidate.document},tx as unknown as Db);
  return {status:"adopted" as const,operationId:"canvas.create",result};
 });
 const adoption=createAssistantActionAdoptionService(db,{now,source,apply});
 const state=async()=>({canvases:await canvas.list(ctx),results:await db.select().from(aiTaskResults).where(eq(aiTaskResults.executionCallId,call.callId)),call:(await db.select().from(executionCalls).where(eq(executionCalls.id,call.callId)))[0]!});
 return {ctx,canvas,adoption,source,reference,apply,state,call,submitted};
}
it.each([false,true])("完整画布同源并发采用组范围=%s：正式对象与来源回执一起提交，回放保留后来的编辑",async group=>{
 const f=await fixture(group),original=(await f.state()).call;
 expect(await f.adoption.receipt(f.ctx,f.reference)).toEqual({receipt:null});
 const [a,b]=await Promise.all([f.adoption.adopt(f.ctx,f.reference),f.adoption.adopt(f.ctx,f.reference)]);
 expect(a).toEqual(b);expect(a).toMatchObject({source:f.reference,status:"adopted",operationId:"canvas.create",result:{revision:1,document:{nodes:[{text:"中性验收说明"}]}}});
 expect(f.apply).toHaveBeenCalledTimes(1);
 const state=await f.state();expect(state.canvases).toHaveLength(1);expect(state.results).toHaveLength(1);expect(state.call).toEqual(original);
 const created=state.canvases[0]!;
 await f.canvas.save(f.ctx,created.id,{expectedRevision:created.revision,title:"用户后续编辑",document:emptyCanvasDocument});
 expect(await f.adoption.adopt(f.ctx,f.reference)).toEqual(a);
 expect((await f.canvas.get(f.ctx,created.id)).title).toBe("用户后续编辑");
 expect(await f.adoption.receipt(f.ctx,f.reference)).toEqual({receipt:a});
});
it("来源回执写失败回滚完整画布，沿原source重试只留下一个正式结果",async()=>{
 const f=await fixture(),original=(await f.state()).call;
 await db.execute(sql.raw(`CREATE FUNCTION fail_adoption_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.execution_call_id='${f.call.callId}' THEN RAISE EXCEPTION 'adoption receipt failed'; END IF; RETURN NEW; END $$;`));
 await db.execute(sql.raw("CREATE TRIGGER fail_adoption_receipt BEFORE INSERT ON ai_task_results FOR EACH ROW EXECUTE FUNCTION fail_adoption_receipt();"));
 try{await expect(f.adoption.adopt(f.ctx,f.reference)).rejects.toThrow();const state=await f.state();expect(state.canvases).toHaveLength(0);expect(state.results).toHaveLength(0);expect(state.call).toEqual(original);}
 finally{await db.execute(sql.raw("DROP TRIGGER fail_adoption_receipt ON ai_task_results;"));await db.execute(sql.raw("DROP FUNCTION fail_adoption_receipt();"));}
 const result=await f.adoption.adopt(f.ctx,f.reference);
 expect(await f.adoption.receipt(f.ctx,f.reference)).toEqual({receipt:result});expect((await f.state()).canvases).toHaveLength(1);
});
it("错误来源、跨组和AI自行采用被拒绝，归档组不能采用旧候选",async()=>{
 const f=await fixture(true);
 await expect(f.adoption.adopt({...f.ctx,source:"ai"},f.reference)).rejects.toThrow("用户");
 await expect(f.adoption.adopt({...f.ctx,groupId:"foreign"},f.reference)).rejects.toThrow();
 await expect(f.adoption.adopt(f.ctx,{...f.reference as object,candidateDigest:"sha256:"+"0".repeat(64)})).rejects.toThrow();
 await db.update(accountGroups).set({status:"archived"}).where(eq(accountGroups.id,f.ctx.groupId!));
 await expect(f.adoption.adopt(f.ctx,f.reference)).rejects.toThrow("账号组不可用");
 expect((await db.select().from(creativeCanvases).where(eq(creativeCanvases.groupId,f.ctx.groupId!)))).toHaveLength(0);
 expect((await f.state()).results).toHaveLength(0);
});
