import { createHash } from "node:crypto";
import { z } from "zod";
import { executionTasks, executionCalls, type Db } from "@creatoros/backend";
import { checkpointToolCallSchema, workerPortInputSchemas, workerToolResultReceiptSchema, agenticToolReservationSchema, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";
type Call=typeof executionCalls.$inferSelect;
type Task=typeof executionTasks.$inferSelect;
type Tool={version:string;parameters:z.ZodType;effect:"none"|"proposal"|"committed"};
const frozenTools=z.object({kind:z.literal("agentic.run"),dryRun:z.boolean().optional(),tools:z.array(z.object({name:z.string().min(1),version:z.string().min(1)})).max(100)});
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const operationKey=(modelCallId:string,toolCallId:string)=>`tool:${hash([modelCallId,toolCallId])}`;

/** 工具名、参数和允许副作用来自后端冻结定义与已结算模型回执，不接受Worker自报。 */
export function createExecutionAgenticToolPorts(db:Db,deps:Parameters<typeof createExecutionCallLedgerService>[1]&{tools:Record<string,Tool>}){
 const leases=createExecutionLeaseService(db,deps);const ledger=createExecutionCallLedgerService(db,deps);
 function binding(task:Task,calls:Call[],request:{modelCallId:string;toolCallId:string}){
  if(task.kind!=="ai_task")throw new ConflictError("当前任务不是Agent执行");
  const frozen=frozenTools.parse((task.payload as Record<string,unknown>).modelInput);
  const model=calls.find(call=>call.id===request.modelCallId);
  if(!model || model.kind!=="model" || model.status!=="settled" || !model.providerResult)throw new ConflictError("工具缺少已确认模型调用");
  const receipt=model.providerResult as {content:unknown[];finishReason:{unified:string}};
  const matching=receipt.content.filter(part=>part && typeof part==="object" && "toolCallId" in part && part.toolCallId===request.toolCallId);
  if(matching.length!==1 || receipt.finishReason.unified!=="tool-calls")throw new ConflictError("模型工具调用不唯一或不完整");
  const proposed=checkpointToolCallSchema.parse(matching[0]);
  const definitions=frozen.tools.filter(tool=>tool.name===proposed.toolName);const definition=deps.tools[proposed.toolName];
  if(definitions.length!==1 || !definition || definitions[0]!.version!==definition.version)throw new ConflictError("工具不在当前冻结白名单或定义版本已改变");
  let raw:unknown;try{raw=JSON.parse(proposed.input);}catch{throw new ConflictError("模型工具参数不是有效JSON");}
  const input=z.json().parse(definition.parameters.parse(raw));
  return {modelCallId:model.id,toolCallId:proposed.toolCallId,toolName:proposed.toolName,input,dryRun:frozen.dryRun===true,effect:definition.effect,operationKey:operationKey(model.id,proposed.toolCallId),inputDigest:`sha256:${hash([model.id,proposed.toolCallId,proposed.toolName,definition.version,definition.effect,input])}`};
 }
 function bindingForCall(task:Task,calls:Call[],call:Call){
  if(call.kind!=="tool")throw new ConflictError("工具端口不能处理模型调用");
  for(const model of calls.filter(candidate=>candidate.kind==="model" && candidate.status==="settled" && candidate.providerResult)){
   for(const part of (model.providerResult as {content:unknown[]}).content){
    const parsed=checkpointToolCallSchema.safeParse(part);if(!parsed.success || operationKey(model.id,parsed.data.toolCallId)!==call.operationKey)continue;
    const bound=binding(task,calls,{modelCallId:model.id,toolCallId:parsed.data.toolCallId});
    if(bound.inputDigest!==call.inputDigest)throw new ConflictError("工具调用与冻结参数不符");return bound;
   }
  }
  throw new ConflictError("工具调用来源缺失");
 }
 return {
  async reserve(ref:ExecutionRef,raw:unknown){
   const request=workerPortInputSchemas.reserveAgenticTool.parse(raw);
   const state=await ledger.inspect(ref);
   const bound=await leases.withLease(ref,"admission",async({task})=>binding(task,state.calls,request));
   const previous=state.calls.find(call=>call.operationKey===bound.operationKey);
   if(!previous && state.calls.filter(call=>call.kind==="model").at(-1)?.id!==bound.modelCallId)throw new ConflictError("模型回合已被后续决策替代");
   const call=await ledger.reserve(ref,{operationKey:bound.operationKey,inputDigest:bound.inputDigest,kind:"tool",reservedTokens:0},(calls,task)=>{
    const current=binding(task,calls,request);
    if(current.inputDigest!==bound.inputDigest)throw new ConflictError("工具定义在预留期间改变");
    if(!calls.some(call=>call.operationKey===bound.operationKey) && calls.filter(call=>call.kind==="model").at(-1)?.id!==bound.modelCallId)throw new ConflictError("模型回合在预留期间改变");
   });
   return agenticToolReservationSchema.parse({callId:call.id,status:call.status,toolName:bound.toolName,input:bound.input,...(call.status==="settled" && call.resultText?{receipt:JSON.parse(call.resultText)}:{})});
  },
  async start(ref:ExecutionRef,raw:unknown){
   const {callId}=workerPortInputSchemas.startAgenticTool.parse(raw);
   const call=await ledger.start(ref,callId,(call,calls,task)=>{
    const bound=bindingForCall(task,calls,call);
    if(calls.filter(candidate=>candidate.kind==="model").at(-1)?.id!==bound.modelCallId)throw new ConflictError("旧模型回合的工具不能再启动");
   });return {callId:call.id,status:call.status};
  },
  async settle(ref:ExecutionRef,raw:unknown){
   const request=workerPortInputSchemas.settleAgenticTool.parse(raw);
   const state=await ledger.inspect(ref);const original=state.calls.find(call=>call.id===request.callId);if(!original)throw new ConflictError("工具调用不存在");
   const bound=await leases.withLease(ref,"settlement",async({task})=>bindingForCall(task,state.calls,original));
   const unknown=request.status==="unknown" || request.output.sideEffect==="unknown" || request.output.error?.code==="unknown_commit";
   if(request.status==="settled" && !unknown && bound.dryRun && request.output.sideEffect!=="none")throw new ConflictError("预演任务不能结算真实副作用");
   if(request.status==="settled" && !unknown && request.output.sideEffect!=="none" && request.output.sideEffect!==bound.effect)throw new ConflictError("工具回执副作用超出已授权定义");
   const settled=await ledger.settle(ref,request.callId,unknown?{status:"unknown"}:{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify(workerToolResultReceiptSchema.parse({schemaVersion:1,kind:"tool",toolCallId:bound.toolCallId,toolName:bound.toolName,output:request.status==="settled"?request.output:null}))},call=>{
    if(call.kind!=="tool" || (!unknown && call.status==="unknown"))throw new ConflictError("未知工具提交须经独立对账，不能当正常重试结算");
   });return {callId:settled.id,status:settled.status};
  },
 };
}
