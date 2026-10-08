import {afterAll,beforeAll,expect,it} from "vitest";
import {z} from "zod";
import {createDb,aiTasks,aiMessages,executionTasks,executionCalls,eq,type Db} from "@creatoros/backend";
import {chatToolProviderName} from "@creatoros/contract/execution-worker";
import {createAiRepository} from "./ai.repository";
import {createChatTurnSubmissionService,chatInputDigest} from "./chat-turn-submission.service";
import {createPersistentTaskService} from "../execution/persistent-task.service";
import {createExecutionGenerationPorts} from "../execution/execution-generation-ports.service";
import {createExecutionCallLedgerService} from "../execution/execution-call-ledger.service";
import {createExecutionAgenticToolPorts} from "../execution/execution-agentic-tool-ports.service";
import {createExecutionChatToolPorts} from "../execution/execution-chat-tool-ports.service";
import {createExternalChatTurnService} from "./external-chat-turn.service";
import {createExternalTaskToolService} from "./external-task-tool.service";
import {createChatProposalSourceService,sealChatProposal} from "./chat-proposal-source.service";
import type {ChatHostContext} from "./chat-host-context";

let db:Db,close:()=>Promise<void>,seq=0;
const now=()=>"2026-10-08T01:00:00.000Z",budget={maxCalls:12,maxTokens:10000,deadlineMs:120000};
const parameters=z.object({kind:z.literal("project.create"),title:z.string().min(1)}).strict();
const parameterSchema={type:"object",properties:{kind:{const:"project.create",type:"string"},title:{type:"string",minLength:1}},required:["kind","title"],additionalProperties:false};
const candidateSchema=z.object({schemaVersion:z.literal(1),kind:z.literal("system.action.proposal"),request:parameters}).strict();
const name="system.action.propose",version="source-test-v1";
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});
afterAll(async()=>close());
async function fixture(engine:"pi"|"codex"="pi"){
 const ctx={userId:"proposal-source-u",accountId:`proposal-source-a-${++seq}`,requestId:"test",source:"user" as const};
 const repo=createAiRepository(db,{...ctx,now,nextId:prefix=>`${prefix}-proposal-${++seq}`});
 const conversation=await repo.createConversation({title:"中性验收",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"创建一个中性项目",attachments:[],modelMetadata:{}});
 const host:ChatHostContext={schemaVersion:1,chatContext:{surface:"topics"},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:now(),platformPolicyVersion:"1",platformPolicy:"仅产候选",skills:[{skillId:"chatbox.topic",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"候选",template:"",tools:[name],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}};
 const submit=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"中性验收",messages:[{role:"user",content:source.content}],maxSteps:8,maxOutputTokens:128,hostContext:host,tools:[{name,version,description:"准备项目候选",parameters:parameterSchema,effect:"proposal"}]})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id,executionEngine:engine});
 const claim=(await createPersistentTaskService(db,{now}).claimTask({taskId:submit.executionTaskId,workerId:"source-test"}))!;
 const ref={executionTaskId:submit.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const tool={version,parameters,parameterSchema,effect:"proposal" as const,approve:async()=>({status:"not-applicable" as const}),execute:async(_ctx:unknown,input:unknown,scope:{aiTaskId:string;callId:string;toolCallId:string})=>({status:"ok" as const,summary:"项目候选待采用",evidence:[],data:sealChatProposal({taskId:scope.aiTaskId,callId:scope.callId,toolCallId:scope.toolCallId},candidateSchema.parse({schemaVersion:1,kind:"system.action.proposal",request:input})),error:null,continuation:null,sideEffect:"proposal" as const})};
 const tools={[name]:tool},reader=createChatProposalSourceService(db,{tools,parseCandidate:(_name,data)=>candidateSchema.parse(data)});
 const ledger=createExecutionCallLedgerService(db,{now,budget}),generation=createExecutionGenerationPorts(db,{now,budget}),ports=createExecutionChatToolPorts(db,{now,budget,tools});
 const request={kind:"project.create" as const,title:"中性验收项目"};
 let modelIndex=0;
 const [executionTask]=await db.select().from(executionTasks).where(eq(executionTasks.id,submit.executionTaskId));
 const operationKey=((executionTask!.payload as {modelInput:{operationKey:string}}).modelInput).operationKey;
 async function propose(toolCallId=`model-tool-${++seq}`){
  if(engine==="codex"){
   const chat=createExternalChatTurnService(db,{now,budget}),turn=await chat.reserve(ref,{});
   await chat.start(ref,{callId:turn.callId,sessionId:`session-${++seq}`,protocolKind:"acp",protocolVersion:1});
   const result=await createExternalTaskToolService(db,{now}).execute(ref,{turnCallId:turn.callId,toolCallId,toolName:name,input:request},tools,new AbortController().signal);
   return {callId:result.callId,data:result.outcome!.data!};
  }
  const model=await generation.reserveGenerationCall(ref,{operationKey:`${operationKey}/model/${++modelIndex}`,request:{maxOutputTokens:128}});
  await ledger.start(ref,model.callId);
  await generation.settleGenerationCall(ref,{callId:model.callId,status:"settled",usage:{inputTokens:2,outputTokens:3},providerResult:{content:[{type:"tool-call",toolCallId,toolName:chatToolProviderName(name),input:JSON.stringify(request)}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
  const reserved=await ports.reserve(ref,{modelCallId:model.callId,toolCallId});
  await ports.start(ref,{callId:reserved.callId});
  const outcome=await ports.execute(ref,{callId:reserved.callId});
  return {callId:reserved.callId,data:outcome.data!};
 }
 const candidate=await propose(),reference=(candidate.data as {source:unknown}).source;
 return {ctx,repo,source,conversation,submit,ref,reader,propose,candidate,reference,tools,ports,generation,ledger,operationKey,request};
}
it.each(["pi","codex"] as const)("%s：只从真实已结算候选恢复原输入，后来聊天和失效租约不废弃合法候选",async engine=>{
 const f=await fixture(engine);
 const result=await f.reader.read(f.ctx,f.reference);
 expect(result).toMatchObject({source:f.reference,toolName:name,input:{kind:"project.create",title:"中性验收项目"},candidate:{kind:"system.action.proposal"},aiTask:{id:f.submit.taskId},executionTask:{id:f.submit.executionTaskId}});
 await f.repo.createMessage(f.conversation.id,{role:"user",content:"另一条问题",attachments:[],modelMetadata:{}});
 await db.update(executionTasks).set({status:"succeeded",leaseOwner:null,leaseExpiresAt:null,fenceToken:null}).where(eq(executionTasks.id,f.ref.executionTaskId));
 expect((await f.reader.read(f.ctx,f.reference)).source).toEqual(f.reference);
});
it("Pi未调用Host execute不能用Worker结算伪造候选采纳证明",async()=>{
 // 此处特意使用generic Agentic ports强化来源验签；生产chat ports另有settle守卫，不冒称生产绕过证据。
 const f=await fixture(),toolCallId=`forged-worker-${++seq}`;
 const model=await f.generation.reserveGenerationCall(f.ref,{operationKey:`${f.operationKey}/model/2`,request:{maxOutputTokens:128}});
 await f.ledger.start(f.ref,model.callId);
 await f.generation.settleGenerationCall(f.ref,{callId:model.callId,status:"settled",usage:{inputTokens:1,outputTokens:1},providerResult:{content:[{type:"tool-call",toolCallId,toolName:chatToolProviderName(name),input:JSON.stringify(f.request)}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]}});
 const generic=createExecutionAgenticToolPorts(db,{now,budget,tools:f.tools});
 const reserved=await generic.reserve(f.ref,{modelCallId:model.callId,toolCallId});await generic.start(f.ref,{callId:reserved.callId});
 const data=sealChatProposal({taskId:f.submit.taskId,callId:reserved.callId,toolCallId},candidateSchema.parse({schemaVersion:1,kind:"system.action.proposal",request:f.request}));
 const output={status:"ok" as const,summary:"未经Host执行的伪造结果",evidence:[],data,error:null,continuation:null,sideEffect:"proposal" as const};
 await expect(f.ports.settle(f.ref,{callId:reserved.callId,status:"settled",output})).rejects.toThrow("宿主实际执行");
 await generic.settle(f.ref,{callId:reserved.callId,status:"settled",output});
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,reserved.callId));
 expect(call!.toolExecutionClaimId).toBeNull();
 await expect(f.reader.read(f.ctx,data.source)).rejects.toThrow("宿主执行");
});
it.each(["unknown","error","blocked","partial","committed","candidate","source","input","schema","history","business","account"])("拒绝%s来源，不接受历史文本或前端重新提交业务正文",async mode=>{
 const f=await fixture(),[call]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.candidate.callId));
 const receipt=JSON.parse(call!.resultText!),outcome=receipt.output;
 if(mode==="unknown")await db.update(executionCalls).set({status:"unknown"}).where(eq(executionCalls.id,call!.id));
 if(["error","blocked","partial"].includes(mode)){outcome.status=mode;outcome.error={code:"permission",retryable:false,recovery:"重新选择账号组"};}
 if(mode==="committed")outcome.sideEffect="committed";
 if(mode==="candidate")outcome.data.request.title="被改写的候选";
 if(mode==="source")outcome.data.source.callId="invented";
 if(mode==="input")await db.update(executionCalls).set({inputDigest:"sha256:"+"0".repeat(64)}).where(eq(executionCalls.id,call!.id));
 if(["error","blocked","partial","committed","candidate","source"].includes(mode))await db.update(executionCalls).set({resultText:JSON.stringify(receipt)}).where(eq(executionCalls.id,call!.id));
 if(mode==="schema")f.tools[name]!.parameterSchema={...parameterSchema,additionalProperties:true};
 if(mode==="history")await db.update(aiMessages).set({content:"原指令已改变"}).where(eq(aiMessages.id,f.source.id));
 if(mode==="business")await db.update(aiTasks).set({inputData:{kind:"chat.run",modelInputDigest:chatInputDigest({})}}).where(eq(aiTasks.id,f.submit.taskId));
 const ctx=mode==="account"?{...f.ctx,accountId:"foreign"}:f.ctx;
 await expect(f.reader.read(ctx,f.reference)).rejects.toThrow();
 await expect(f.reader.read(f.ctx,{...(f.reference as object),body:{title:"伪造正文"}})).rejects.toThrow();
});
it("同参重用结算归一原call和原digest，不能重复采纳同一候选",async()=>{
 const f=await fixture(),second=await f.propose();
 const [row]=await db.select().from(executionCalls).where(eq(executionCalls.id,second.callId));
 expect(JSON.parse(row!.resultText!).reusedCallId).toBe(f.candidate.callId);
 expect((second.data as {source:unknown}).source).toEqual(f.reference);
 expect((await f.reader.read(f.ctx,{...(f.reference as object),callId:second.callId,toolCallId:JSON.parse(row!.resultText!).toolCallId})).source).toEqual(f.reference);
});
it.each(["identity","parent","input","protocol","engine"])("ACP拒绝%s不符的调用，不把普通聊天消息当执行证明",async mode=>{
 const f=await fixture("codex"),[call]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.candidate.callId));
 const identity=call!.providerResult as Record<string,unknown>,[parent]=await db.select().from(executionCalls).where(eq(executionCalls.id,call!.parentCallId!));
 if(mode==="identity")await db.update(executionCalls).set({providerResult:{...identity,toolVersion:"other"}}).where(eq(executionCalls.id,call!.id));
 if(mode==="parent")await db.update(executionCalls).set({parentCallId:null}).where(eq(executionCalls.id,call!.id));
 if(mode==="input")await db.update(executionCalls).set({inputDigest:"sha256:"+"0".repeat(64)}).where(eq(executionCalls.id,call!.id));
 if(mode==="protocol"||mode==="engine")await db.update(executionCalls).set({providerResult:{...parent!.providerResult as object,...(mode==="protocol"?{protocolVersion:2}:{engine:"codebuddy"})}}).where(eq(executionCalls.id,parent!.id));
 await expect(f.reader.read(f.ctx,f.reference)).rejects.toThrow();
});
