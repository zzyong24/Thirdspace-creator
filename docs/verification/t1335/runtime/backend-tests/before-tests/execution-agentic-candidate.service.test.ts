import {afterAll,beforeAll,describe,it,expect} from "vitest";
import {z} from "zod";
import {aiTasks,aiTaskResults,executionTasks,executionCalls,createDb,eq,and,type Db} from "@creatoros/backend";
import {createExecutionAuthorityService} from "../execution/execution-authority.service";
import {createPersistentTaskService} from "../execution/persistent-task.service";
import {createExecutionCallLedgerService} from "../execution/execution-call-ledger.service";
import {createExecutionCheckpointService} from "../execution/execution-checkpoint.service";
import {workerProviderReceiptSchema} from "@creatoros/contract/execution-worker";
import {prepareKnowledgeProposal} from "../knowledge";
import {createExecutionAgenticCandidateService} from "./execution-agentic-candidate.service";
import {createExecutionResearchEvidenceService} from "../execution/execution-research-evidence.service";
import {createExecutionAgenticToolPorts} from "../execution/execution-agentic-tool-ports.service";
const ctx={userId:"agent-candidate-u",accountId:"agent-candidate-a",requestId:"test",source:"user" as const};
const stamp="2026-09-05T00:00:00.000Z";const now=()=>stamp;
describe("Agent持久候选提交",()=>{
 let db:Db;let close:()=>Promise<void>;
 beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close?.());
 async function fixture(id:string,options:{dryRun?:boolean;noProposal?:boolean;partial?:boolean;unread?:boolean}={}){
  await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"exec.agentic.research",idempotencyKey:id,requestedAt:stamp});
  const mapped=await createExecutionAuthorityService(db,{now}).bindAiTask(ctx,id);
  const tasks=createPersistentTaskService(db,{now});const claim=await tasks.claimTask({taskId:mapped.executionTaskId,workerId:"worker"});if(!claim)throw new Error("missing claim");
  const ref={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  await db.update(executionTasks).set({payload:{modelInput:{kind:"agentic.run",operationKey:"agent",taskType:"agentic.research",goal:"研究",systemPrompt:"冻结",capability:"research",maxOutputTokens:100,dryRun:options.dryRun===true,tools:[{name:"web.read",version:"1",label:"阅读",description:"阅读",parameters:{type:"object"},effect:"none"},{name:"knowledge.write",version:"1",label:"候选",description:"候选",parameters:{type:"object"},effect:"proposal"}]}}}).where(eq(executionTasks.id,mapped.executionTaskId));
  const budget={maxCalls:8,maxTokens:1000,deadlineMs:60000};
  const ledger=createExecutionCallLedgerService(db,{now,budget});
  const reserve=async(kind:"model"|"tool",key:string)=>{const c=await ledger.reserve(ref,{operationKey:key,kind,inputDigest:"sha256:"+"a".repeat(64),reservedTokens:kind==="model"?100:0});await ledger.start(ref,c.id);return c;};
  const provider=(content:unknown[],finishReason="stop")=>workerProviderReceiptSchema.parse({content,finishReason:{unified:finishReason,raw:finishReason},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]});
  const messages:Array<{role:"assistant"|"tool";callId:string}>=[];const toolCallIds:string[]=[];
  let evidenceRef="https://example.com";
  if(!options.unread){
   const readModel=await reserve("model","read-model");await ledger.settle(ref,readModel.id,{status:"settled",usage:{totalTokens:5},providerResult:provider([{type:"tool-call",toolCallId:"read-tool",toolName:"web.read",input:JSON.stringify({url:"https://example.com"})}],"tool-calls")});
   const tools={"web.read":{version:"1",effect:"none" as const,parameters:z.object({url:z.string(),offset:z.number().default(0)})}};
   const ports=createExecutionAgenticToolPorts(db,{now,budget,tools});const read=await ports.reserve(ref,{modelCallId:readModel.id,toolCallId:"read-tool"});await ports.start(ref,{callId:read.callId});
   const observed=await createExecutionResearchEvidenceService(db,{now,budget,tools}).settleRead(ref,{callId:read.callId,observation:{sourceUrl:"https://example.com",title:"已读取",fullText:"真实来源正文"}});
   evidenceRef=(observed.data as {evidenceRef:string}).evidenceRef;messages.push({role:"assistant",callId:readModel.id},{role:"tool",callId:read.callId});toolCallIds.push(read.callId);
  }
  const params={title:" 真实保存标题 ",note:" 真实完整正文 ",sourceNote:"https://example.com",evidenceRefs:[evidenceRef]};
  const model=await reserve("model","m1");await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:5},providerResult:provider([{type:"tool-call",toolCallId:"pi-tool",toolName:"knowledge.write",input:JSON.stringify(params)}],"tool-calls")});
  const proposal=prepareKnowledgeProposal(ctx,{proposalId:`proposal:${id}`,...params,source:{taskId:id,toolCallId:"pi-tool",evidenceRefs:params.evidenceRefs}});
  const tool=await reserve("tool","tool");
  const output={status:"ok",summary:"已产生回执",evidence:[],data:options.dryRun?{plan:{toolName:"knowledge.write",input:{title:"预演"}}}:options.noProposal?{}:{proposal},error:null,continuation:null,sideEffect:options.dryRun || options.noProposal?"none":"proposal"};
  await ledger.settle(ref,tool.id,{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify({schemaVersion:1,kind:"tool",toolCallId:"pi-tool",toolName:"knowledge.write",output})});
  if(!options.dryRun && !options.noProposal)await db.insert(aiTaskResults).values({id:proposal.proposalId,aiTaskId:id,resultType:"agentic_proposal_staged",resultData:{proposal}});
  let last=model;messages.push({role:"assistant",callId:model.id},{role:"tool",callId:tool.id});toolCallIds.push(tool.id);
  if(!options.partial){last=await reserve("model","m2");await ledger.settle(ref,last.id,{status:"settled",usage:{totalTokens:5},providerResult:provider([{type:"text",text:"账本中的总结"}])});messages.push({role:"assistant",callId:last.id});}
  await createExecutionCheckpointService(db,{now}).save(ref,{expectedRevision:0,expectedLedgerSequence:messages.length,messages});
  return {ref,tasks,ledger,last,tool,proposal,service:createExecutionAgenticCandidateService(db,{now}),commit:{actualEngine:"pi",summary:"Worker伪造总结",stopReason:options.partial?"max_steps":"completed",lastModelCallId:last.id,toolCallIds}};
 }
 const results=(id:string)=>db.select().from(aiTaskResults).where(and(eq(aiTaskResults.aiTaskId,id),eq(aiTaskResults.resultType,"agentic_proposals")));
 it("暂存和工具回执一致仍不足以证明阅读，缺失真实阅读证据不能提交知识候选",async()=>{
  const f=await fixture("unread",{unread:true});await expect(f.service.commitAgenticResult(f.ref,f.commit)).rejects.toThrow();expect(await results("unread")).toHaveLength(0);
 });
 it("同时篡改暂存与工具回执也不能替换模型候选正文",async()=>{
  const f=await fixture("consistent-forgery");const forged={...f.proposal,content:{...f.proposal.content,note:"并非模型产生的正文"}};
  await db.update(aiTaskResults).set({resultData:{proposal:forged}}).where(eq(aiTaskResults.id,f.proposal.proposalId));
  const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.tool.id));
  const receipt=JSON.parse(call!.resultText!);receipt.output.data.proposal=forged;
  await db.update(executionCalls).set({resultText:JSON.stringify(receipt)}).where(eq(executionCalls.id,f.tool.id));
  await expect(f.service.commitAgenticResult(f.ref,f.commit)).rejects.toThrow("模型工具参数");expect(await results("consistent-forgery")).toHaveLength(0);
 });
 it("快照仍存在但阅读回执已不包含它时，汇总提交再次拒绝",async()=>{
  const f=await fixture("lost-read-receipt");
  const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.commit.toolCallIds[0]!));
  const receipt=JSON.parse(call!.resultText!);receipt.output={status:"error",summary:"未读",evidence:[],error:{code:"no_evidence",retryable:false,recovery:"重新读取"},continuation:null,sideEffect:"none"};
  await db.update(executionCalls).set({resultText:JSON.stringify(receipt)}).where(eq(executionCalls.id,call!.id));
  await expect(f.service.commitAgenticResult(f.ref,f.commit)).rejects.toThrow();expect(await results("lost-read-receipt")).toHaveLength(0);
 });
 it("并发提交只聚合DB提案，采纳后重投不回退状态",async()=>{
  const f=await fixture("once");const receipts=await Promise.all(Array.from({length:6},()=>f.service.commitAgenticResult(f.ref,f.commit)));expect(receipts.every(r=>r.resultId===receipts[0]!.resultId)).toBe(true);
  const rows=await results("once");expect(rows).toHaveLength(1);expect(rows[0]!.resultData).toMatchObject({taskType:"agentic.research",summary:"账本中的总结",proposals:[f.proposal],meta:{engine:"pi",actualEngine:"pi",completeness:"completed",checkpointRef:expect.any(String),usageRef:expect.any(String)}});expect(JSON.stringify(rows)).not.toContain("Worker伪造总结");
  await db.update(aiTasks).set({status:"succeeded"}).where(eq(aiTasks.id,"once"));expect(await f.service.commitAgenticResult(f.ref,f.commit)).toEqual(receipts[0]);expect((await db.select().from(aiTasks).where(eq(aiTasks.id,"once")))[0]!.status).toBe("succeeded");
 });
 it("预算终止保留真实提案为partial，业务仍可采纳",async()=>{const f=await fixture("partial",{partial:true});await f.service.commitAgenticResult(f.ref,f.commit);expect((await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId)))[0]!.status).toBe("partial");expect((await db.select().from(aiTasks).where(eq(aiTasks.id,"partial")))[0]!.status).toBe("awaiting_confirmation");expect((await results("partial"))[0]!.resultData).toMatchObject({proposals:[f.proposal]});});
 it("纯诊断无提案不能伪成功，预演只生成计划",async()=>{
  const f=await fixture("empty",{noProposal:true});
  const receipts=await Promise.all([f.service.commitAgenticResult(f.ref,f.commit),f.service.commitAgenticResult(f.ref,f.commit)]);
  expect(receipts[0]).toMatchObject({outcome:"failed",errorCode:"AGENT_NO_PROPOSALS",aiTaskId:"empty"});expect(receipts[1]).toEqual(receipts[0]);
  expect(await results("empty")).toHaveLength(0);expect((await f.tasks.get(ctx,f.ref.executionTaskId)).status).toBe("failed");
  const [business]=await db.select().from(aiTasks).where(eq(aiTasks.id,"empty"));expect(business).toMatchObject({status:"failed",errorMessage:"本次自主任务未产生可采纳的业务建议，请调整任务后重试。"});
  const diagnostics=await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"empty"));expect(diagnostics).toHaveLength(1);expect(diagnostics[0]!.resultType).toBe("execution_diagnostic");
  expect(await f.service.commitAgenticResult(f.ref,f.commit)).toEqual(receipts[0]);
  await expect(f.service.commitAgenticResult({...f.ref,fenceToken:"old"},f.commit)).rejects.toThrow();
  await expect(f.service.commitAgenticResult(f.ref,{...f.commit,stopReason:"max_steps"})).rejects.toThrow();
  const dry=await fixture("dry",{dryRun:true});await dry.service.commitAgenticResult(dry.ref,dry.commit);const rows=await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"dry"));expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({resultType:"execution_plan",resultData:{summary:"账本中的总结",dryRun:true,output:{plans:[{toolName:"knowledge.write"}]}}});
 });
 it("旧fence、取消和跨账号拒绝且不生成候选",async()=>{
  const f=await fixture("cancel");await expect(f.service.commitAgenticResult({...f.ref,fenceToken:"old"},f.commit)).rejects.toThrow();await f.tasks.command(ctx,{taskIds:[f.ref.executionTaskId],command:"cancel",idempotencyKey:"cancel"});await expect(f.service.commitAgenticResult(f.ref,f.commit)).rejects.toThrow();expect(await results("cancel")).toHaveLength(0);
  const other=await fixture("other");await db.update(executionTasks).set({accountId:"foreign"}).where(eq(executionTasks.id,other.ref.executionTaskId));await expect(other.service.commitAgenticResult(other.ref,other.commit)).rejects.toThrow();
 });
 it("工具清单缺失、最后模型伪造与检查点缺项拒绝",async()=>{
  const f=await fixture("refs");await expect(f.service.commitAgenticResult(f.ref,{...f.commit,toolCallIds:[]})).rejects.toThrow();await expect(f.service.commitAgenticResult(f.ref,{...f.commit,lastModelCallId:f.tool.id})).rejects.toThrow();
  await db.update(executionTasks).set({checkpoint:null}).where(eq(executionTasks.id,f.ref.executionTaskId));await expect(f.service.commitAgenticResult(f.ref,f.commit)).rejects.toThrow();expect(await results("refs")).toHaveLength(0);
 });
 it("DB提案篡改或来源伪造不被Worker回执覆盖",async()=>{
  const f=await fixture("mismatch");await db.update(aiTaskResults).set({resultData:{proposal:{...f.proposal,note:"被改写"}}}).where(eq(aiTaskResults.id,f.proposal.proposalId));await expect(f.service.commitAgenticResult(f.ref,f.commit)).rejects.toThrow();expect(await results("mismatch")).toHaveLength(0);
 });
 it("新增在途调用阻止候选提交，不越过未确认结果",async()=>{
  const f=await fixture("pending");await f.ledger.reserve(f.ref,{operationKey:"pending",kind:"tool",inputDigest:"sha256:"+"b".repeat(64),reservedTokens:0});await expect(f.service.commitAgenticResult(f.ref,f.commit)).rejects.toThrow();expect(await results("pending")).toHaveLength(0);
 });
});
