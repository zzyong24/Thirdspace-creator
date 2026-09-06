import {createHash} from "node:crypto";
import {z} from "zod";
import type {executionCalls,executionTasks} from "@creatoros/backend";
import {agenticToolOutcomeSchema,checkpointToolCallSchema,chatWorkerInputSchema,chatToolProviderName,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {ConflictError} from "./execution.errors";
type Call=typeof executionCalls.$inferSelect;
type Task=typeof executionTasks.$inferSelect;
type ToolOutcome=z.infer<typeof agenticToolOutcomeSchema>;
export type AgenticBackendTool={version:string;parameters:z.ZodType;effect:"none"|"proposal"|"committed";
 execute?(context:import("@creatoros/contract").RequestContext,input:z.infer<ReturnType<typeof z.json>>,scope:{execution:ExecutionRef;aiTaskId:string;callId:string;toolCallId:string;signal:AbortSignal}):Promise<ToolOutcome>;
};
const frozenTools=z.object({kind:z.literal("agentic.run"),dryRun:z.boolean().optional(),tools:z.array(z.object({name:z.string().min(1),version:z.string().min(1)})).max(100)});
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const operationKey=(modelCallId:string,toolCallId:string)=>`tool:${hash([modelCallId,toolCallId])}`;

/** 冻结工具身份与参数的唯一解析规则，工具执行和证据结算共用。 */
export function createAgenticToolBinding(tools:Record<string,AgenticBackendTool>){
 function binding(task:Task,calls:Call[],request:{modelCallId:string;toolCallId:string}){
  if(task.kind!=="ai_task")throw new ConflictError("当前任务不是Agent执行");
  const rawInput=(task.payload as Record<string,unknown>).modelInput;
  const chat=chatWorkerInputSchema.safeParse(rawInput);
  const frozen=chat.success ? {...chat.data,dryRun:false} : frozenTools.parse(rawInput);
  if(chat.success && (chat.data.userId!==task.userId || chat.data.accountId!==task.accountId))throw new ConflictError("聊天冻结输入归属不符");
  const model=calls.find(call=>call.id===request.modelCallId);
  if(!model || model.kind!=="model" || model.status!=="settled" || !model.providerResult)throw new ConflictError("工具缺少已确认模型调用");
  const receipt=model.providerResult as {content:unknown[];finishReason:{unified:string}};
  const matching=receipt.content.filter(part=>part && typeof part==="object" && "toolCallId" in part && part.toolCallId===request.toolCallId);
  if(matching.length!==1 || receipt.finishReason.unified!=="tool-calls")throw new ConflictError("模型工具调用不唯一或不完整");
  const proposed=checkpointToolCallSchema.parse(matching[0]);
  const definitions=frozen.tools.filter(tool=>(chat.success ? chatToolProviderName(tool.name) : tool.name)===proposed.toolName);
  const toolName=definitions[0]?.name;
  const definition=toolName ? tools[toolName] : undefined;
  if(definitions.length!==1 || !definition || definitions[0]!.version!==definition.version)throw new ConflictError("工具不在当前冻结白名单或定义版本已改变");
  let raw:unknown;let jsonError=false;try{raw=JSON.parse(proposed.input);}catch{raw=proposed.input;jsonError=true;}
  const jsonInput=z.json().safeParse(raw);
  if(!jsonInput.success)jsonError=true;
  const checked=jsonError?null:definition.parameters.safeParse(raw);
  const validationOutcome:ToolOutcome|undefined=jsonError || !checked?.success ? agenticToolOutcomeSchema.parse({
   status:"error",summary:"工具参数不符合定义，本次没有执行操作",evidence:[],
   error:{code:"invalid_input",retryable:false,recovery:jsonError?"请生成合法JSON参数，修正后发起新的工具调用。":`请按工具schema修正参数后发起新调用：${checked && !checked.success?checked.error.issues.slice(0,20).map(issue=>`${issue.path.map(String).join(".").slice(0,160) || "根参数"} (${issue.code})`).join("；"):"参数格式错误"}`},
   continuation:null,sideEffect:"none",
  }):undefined;
  const input=z.json().parse(checked?.success?checked.data:jsonInput.success?jsonInput.data:proposed.input);
  const identity=[model.id,proposed.toolCallId,proposed.toolName,definition.version,definition.effect,input];
  if(validationOutcome)identity.push({validationOutcome});
  return {modelCallId:model.id,toolCallId:proposed.toolCallId,toolName:proposed.toolName,executionToolName:toolName!,input,validationOutcome,dryRun:frozen.dryRun===true,effect:definition.effect,operationKey:operationKey(model.id,proposed.toolCallId),inputDigest:`sha256:${hash(identity)}`};
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
 return {bind:binding,forCall:bindingForCall};
}
