import {isAssistantEngineToolAllowed} from "@creatoros/contract";
import {createHash} from "node:crypto";
import {z} from "zod";
import type {executionCalls,executionTasks} from "@creatoros/backend";
import {agenticToolOutcomeSchema,checkpointToolCallSchema,chatWorkerInputSchema,chatToolProviderName,frozenExecutionEngine,externalChatStartSchema,externalChatReceiptSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {ConflictError} from "./execution.errors";
import {explainToolParameterIssues} from "./tool-parameter-recovery";
import {originalCodexReadBinding} from './codex-read-recovery';
type Call=typeof executionCalls.$inferSelect;
type Task=typeof executionTasks.$inferSelect;
type ToolOutcome=z.infer<typeof agenticToolOutcomeSchema>;
export type AgenticBackendTool={version:string;parameters:z.ZodType;effect:"none"|"proposal"|"committed";execution?:"host"|"worker.redfox"|"worker.web-read"|"worker.research"|"worker.script-draft"|"worker.script-hooks"|"worker.structured-node"|"host.task-submit";
 /** 可信宿主策略：false 时新 operation 不复用同参已结算结果；原 operation 回放与未知提交保护仍保留。 */
 reuseSettledResults?:boolean;
 execute?(context:import("@creatoros/contract").RequestContext,input:z.infer<ReturnType<typeof z.json>>,scope:{execution:ExecutionRef;aiTaskId:string;callId:string;toolCallId:string;signal:AbortSignal;executionSignal?:AbortSignal}):Promise<ToolOutcome>;
 commitAndSettle?(context:import("@creatoros/contract").RequestContext,input:z.infer<ReturnType<typeof z.json>>,outcome:ToolOutcome,scope:{execution:ExecutionRef;aiTaskId:string;callId:string;toolCallId:string;claimId:string}):Promise<ToolOutcome>;
 markUnknown?(context:import("@creatoros/contract").RequestContext,scope:{execution:ExecutionRef;aiTaskId:string;callId:string;toolCallId:string;claimId:string;toolName:string}):Promise<void>;
};
const frozenTools=z.object({kind:z.literal("agentic.run"),dryRun:z.boolean().optional(),tools:z.array(z.object({name:z.string().min(1),version:z.string().min(1)})).max(100)});
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const agenticToolOperationKey=(modelCallId:string,toolCallId:string)=>`tool:${hash([modelCallId,toolCallId])}`;

const operationKey=agenticToolOperationKey;

/** 根调用仍是原真实call；外部Codex回合不伪造额外model行。 */
export function latestAgenticRootCall(calls:Call[]){return calls.filter(call=>!call.parentCallId&&(call.kind==='model'||call.kind==='external_agent')).at(-1);}
function nativeSource(task:Task,model:Call|undefined,options?:{readonlyRecovery:true}){
 if(!model||model.parentCallId||(!['started','settled'].includes(model.status)&&!(options?.readonlyRecovery&&model.status==='unknown'&&originalCodexReadBinding(task,model))))return undefined;
 const codex=(task.payload as {codexCalls?:Record<string,{threadId?:string;turnId?:string;tools?:Record<string,unknown>}>}).codexCalls?.[model.id];
 if(!codex?.threadId)return undefined;
 const chat=chatWorkerInputSchema.safeParse((task.payload as Record<string,unknown>).modelInput);
 if(!chat.success)return model.kind==='model'&&frozenExecutionEngine(task.payload)==='codex'&&codex.turnId?codex:undefined;
 if(chat.data.executionEngine!=='codex'||model.kind!=='external_agent')return undefined;
 const parsed=(model.status==='settled'?externalChatReceiptSchema:externalChatStartSchema).safeParse(model.providerResult);
 if(!parsed.success||parsed.data.engine!=='codex'||parsed.data.turnId!==model.id||parsed.data.sessionId!==codex.threadId)return undefined;
 if(parsed.data.protocolKind==='codex-app-server'&&(!parsed.data.providerTurnId||codex.turnId!==parsed.data.providerTurnId))return undefined;
 if(parsed.data.protocolKind!=='acp'&&parsed.data.protocolKind!=='codex-app-server')return undefined;
 if(codex.turnId&&codex.turnId!==parsed.data.providerTurnId)return undefined;
 return codex;
}
/** 原生长回合工具事实只取原线程绑定；Pi只取已结算供应商回执。 */
export function agenticModelToolParts(task:Task,model:Call,options?:{readonlyRecovery:true}):unknown[]{
 const native=nativeSource(task,model,options);
 return native?Object.values(native.tools??{}).map(part=>({type:'tool-call',...part as object})):model.kind==='model'&&model.status==='settled'&&model.providerResult?(model.providerResult as {content:unknown[]}).content:[];
}
/** 冻结工具身份与参数的唯一解析规则，工具执行和证据结算共用。 */
export function createAgenticToolBinding(tools:Record<string,AgenticBackendTool>){
 function binding(task:Task,calls:Call[],request:{modelCallId:string;toolCallId:string},options?:{readonlyRecovery:true}){
  if(task.kind!=="ai_task")throw new ConflictError("当前任务不是Agent执行");
  const rawInput=(task.payload as Record<string,unknown>).modelInput;
  const chat=chatWorkerInputSchema.safeParse(rawInput);
  const frozen=chat.success ? {...chat.data,dryRun:false} : frozenTools.parse(rawInput);
  if(chat.success && (chat.data.userId!==task.userId || chat.data.accountId!==task.accountId))throw new ConflictError("聊天冻结输入归属不符");
  const model=calls.find(call=>call.id===request.modelCallId);
  const source=nativeSource(task,model,options),native=source?.tools?.[request.toolCallId];
  if(!model || model.parentCallId || (!native&&model.kind!=="model") || (!native&&(model.status!=="settled" || !model.providerResult)))throw new ConflictError("工具缺少已确认模型调用");
  const receipt=native?{content:[{type:'tool-call',...native as object}],finishReason:{unified:'tool-calls'}}:model.providerResult as {content:unknown[];finishReason:{unified:string}};
  const matching=receipt.content.filter(part=>part && typeof part==="object" && "toolCallId" in part && part.toolCallId===request.toolCallId);
  const truncated=chat.success && chat.data.executionEngine==="pi" && receipt.finishReason.unified==="length";
  if(matching.length!==1 || (receipt.finishReason.unified!=="tool-calls" && !truncated))throw new ConflictError("模型工具调用不唯一或不完整");
  const proposed=checkpointToolCallSchema.parse(matching[0]);
  const definitions=frozen.tools.filter(tool=>(chat.success ? chatToolProviderName(tool.name) : tool.name)===proposed.toolName);
  const toolName=definitions[0]?.name;
  const definition=toolName ? tools[toolName] : undefined;
  if(definitions.length!==1 || !definition || definitions[0]!.version!==definition.version)throw new ConflictError("工具不在当前冻结白名单或定义版本已改变");
  if(chat.success&&model.kind==='external_agent'&&!isAssistantEngineToolAllowed('codex',chat.data.tools.find(tool=>tool.name===toolName)!,chat.data.workbenchCapabilities?.find(item=>item.name===toolName)))throw new ConflictError('工具不在已审Codex执行目录');
  const execution=chat.success?(chat.data.tools.find(tool=>tool.name===toolName)?.execution??"host"):"host";
  if((definition.execution??"host")!==execution)throw new ConflictError("工具执行位置与冻结声明不符");
  let raw:unknown;let jsonError=false;try{raw=JSON.parse(proposed.input);}catch{raw=proposed.input;jsonError=true;}
  const jsonInput=z.json().safeParse(raw);
  if(!jsonInput.success)jsonError=true;
  const checked=jsonError?null:definition.parameters.safeParse(raw);
  // 错误文本参与原调用摘要；只有后端新提交冻结的格式标记启用具体解释，旧任务字节不变。
  const detailedRecovery=chat.success && (task.payload as Record<string,unknown>).toolValidationRecoveryVersion===1;
  const parameterIssues=checked && !checked.success
   ? detailedRecovery ? explainToolParameterIssues(definitions[0] && "parameters" in definitions[0] ? definitions[0].parameters : undefined,raw,checked.error.issues)
    : checked.error.issues.slice(0,20).map(issue=>`${issue.path.map(String).join(".").slice(0,160) || "根参数"} (${issue.code})`).join("；")
   : "参数格式错误";
  // SEMANTIC_BOUNDARY_ALLOW: 供应商 length 是协议截断事实，不能把表面合法的半成品当作执行授权。
  const validationOutcome:ToolOutcome|undefined=truncated || jsonError || !checked?.success ? agenticToolOutcomeSchema.parse({
   status:"error",summary:truncated?"模型输出达到长度上限，工具提案未执行":"工具参数不符合定义，本次没有执行操作",evidence:[],
   error:{code:"invalid_input",retryable:false,recovery:truncated?"本次截断提案没有执行。请根据已结算结果生成完整参数并发起新调用，不重复已成功操作。":jsonError?"请生成合法JSON参数，修正后发起新的工具调用。":`请按工具schema修正参数后发起新调用：${parameterIssues}`},
   continuation:null,sideEffect:"none",
  }):undefined;
  const input=z.json().parse(checked?.success?checked.data:jsonInput.success?jsonInput.data:proposed.input);
  const identity=[model.id,proposed.toolCallId,proposed.toolName,definition.version,definition.effect,input];
  if(execution!=="host")identity.push({execution});
  if(validationOutcome)identity.push({validationOutcome});
  return {modelCallId:model.id,toolCallId:proposed.toolCallId,toolName:proposed.toolName,executionToolName:toolName!,execution,reuseWithinRound:chat.success,input,validationOutcome,dryRun:frozen.dryRun===true,effect:definition.effect,operationKey:operationKey(model.id,proposed.toolCallId),inputDigest:`sha256:${hash(identity)}`};
 }
 function bindingForCall(task:Task,calls:Call[],call:Call,options?:{readonlyRecovery:true}){
  if(call.kind!=="tool")throw new ConflictError("工具端口不能处理模型调用");
  for(const model of calls.filter(candidate=>!candidate.parentCallId&&(candidate.kind==='model'||candidate.kind==='external_agent'))){
   // SEMANTIC_BOUNDARY_ALLOW: 原生长回合内工具使用已绑定的真实调用事实；不替模型决定工具或内容。
   const parts=agenticModelToolParts(task,model,options);
   for(const part of parts){
    const parsed=checkpointToolCallSchema.safeParse(part);if(!parsed.success || operationKey(model.id,parsed.data.toolCallId)!==call.operationKey)continue;
    const bound=binding(task,calls,{modelCallId:model.id,toolCallId:parsed.data.toolCallId},options);
    if(bound.inputDigest!==call.inputDigest)throw new ConflictError("工具调用与冻结参数不符");return bound;
   }
  }
  throw new ConflictError("工具调用来源缺失");
 }
 return {bind:binding,forCall:bindingForCall};
}
