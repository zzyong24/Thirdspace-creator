import {codexModelSpecSchema} from './execution-engine';
export * from './execution-engine';
import {assetAsrInput} from './asset-asr';
import {assetAsrPortInputs} from './asset-asr-ports';
export * from './asset-asr';
export * from './asset-asr-ports';
import {redfoxObservationSchema} from "./redfox";
import {workbenchCapabilitySchema,workbenchPlanSchema,workbenchResultSchema,type WorkbenchCapability,type WorkbenchResult} from "./agent-workbench";
export {redfoxInputSchema,redfoxObservationSchema,type RedfoxInput} from "./redfox";
export {transcribeProfileSchema,transcribeSourceFailureSchema} from "./transcribe-workflow";
import {videoPortInputSchemas} from "./execution-video";
export {videoPortInputSchemas,videoFrozenSchema,videoSkillSchema} from "./execution-video";
import {assetProcessingInputSchema,materialExtractionSchema,assetProcessingReadSchema,assetProcessingCompleteSchema} from "./asset-processing";
export {assetProcessingInputSchema,materialExtractionSchema,assetProcessingReadSchema,assetProcessingCompleteSchema} from "./asset-processing";
import {transcribeWorkflowPortSchemas} from "./transcribe-workflow";
export {transcribeWorkflowPortSchemas,transcribeSourceSchema,transcribeItemReceiptSchema} from "./transcribe-workflow";
import {coverPortInputSchemas} from "./execution-cover";
export {coverPortInputSchemas,coverImageReadinessSchema,coverImagePreparationSchema,coverReferenceSchema} from "./execution-cover";
import {transcribeTaskInputSchema} from "./transcribe-task";
export {transcribeLocalFallbackSchema,transcribeAsrPreparationSchema,transcribeTaskInputSchema,transcribeConfigurationSchema,transcribeAsrPlanSchema,type TranscribeConfiguration} from "./transcribe-task";
import {transcribeAudioPortSchemas} from "./execution-transcribe-audio";
export {transcribeAudioReceiptSchema} from "./execution-transcribe-audio";
import {asrPortInputSchemas} from "./execution-asr";
export {asrRequestSchema,asrAudioManifestSchema,asrIdentitySchema,asrTaskInputSchema,asrResultReceiptSchema,type AsrRequest} from "./execution-asr";
import {assetGenerationInputSchema,providerJobReadSchema,providerJobRecordSchema} from "./asset-generation";
export {chatSubmittedTaskType,chatSubmittedTaskResultKind} from "./chat-task-submission";
import {chatWebReadCallSchema,chatWebReadRecordSchema,chatWebReadSessionSaveSchema,chatWebReadFailureSchema} from "./chat-web-read";
export { scriptHooksContextSchema, type ScriptHooksContext } from "./execution-chat-hooks";
export { chatWebReadSearchSpecSchema,type ChatWebReadSearchSpec, chatWebReadObservationSchema, chatWebReadCallSchema, chatWebReadRecordSchema, chatWebReadSessionSaveSchema, chatWebReadFailureSchema } from "./chat-web-read";
import {chatHooksParentRequestSchema,chatHooksReserveRequestSchema} from "./execution-chat-hooks";
export {chatHooksPreparationSchema} from "./execution-chat-hooks";
export { chatProviderNonTextSchema } from "./chat-provider-content";
import { chatWorkerInputSchema } from "./chat-worker";
export { chatWorkerInputSchema, chatToolProviderName, codexAcpBinding, externalAgentBindingSchema } from "./chat-worker";
import {appendExecutionStreamSchema} from "./execution-stream";
export {appendExecutionStreamSchema,readExecutionStreamSchema,executionStreamChunkSchema} from "./execution-stream";
import {topicReadPortInputSchemas} from "./execution-topic-read";
import { agenticWorkerInputSchema, reserveAgenticModelSchema } from "./agentic-worker";
export { agenticWorkerInputSchema, reserveAgenticModelSchema, agenticCommitReceiptSchema } from "./agentic-worker";
import { reserveAgenticToolSchema, settleAgenticToolSchema, agenticToolOutcomeSchema } from "./agentic-tool-call";
export { reserveAgenticToolSchema, settleAgenticToolSchema, agenticToolReservationSchema, agenticToolOutcomeSchema, type AgenticToolOutcome } from "./agentic-tool-call";

/** SEMANTIC_BOUNDARY_ALLOW: 四种原生观察协议不产生外部提交；不能泛化 read（navigate 也声明 read）。 */
export function isWorkbenchBrowserObservation(descriptor:WorkbenchCapability):boolean {
 return ["browser.observe","browser.extract","browser.status","browser.screenshot"].includes(descriptor.name)&&
  descriptor.schemaVersion===1&&descriptor.effects.length===1&&descriptor.effects[0]==="read"&&
  descriptor.requiredCapabilities.length===1&&descriptor.requiredCapabilities[0]==="task.browser";
}
export const browserObservationRecovery="未取得有效的页面观察结果；这不表示页面操作已成功。请用新的工具调用重新观察，或选择提取文本、截图等替代观察；以新结果为准。若 Lane 已失效，先核对状态并按当前租约重新打开。不要重放未知的点击、导航、打开或关闭操作。截图存储可能已留下不可变字节，本回执不声明未写入存储。";

/** 通用能力进入原工具账本时的唯一回执转换；未知提交永不自动重试。 */
export function workbenchToolOutcome(rawResult:WorkbenchResult,rawDescriptor:WorkbenchCapability){
 const descriptor=workbenchCapabilitySchema.parse(rawDescriptor),result=workbenchResultSchema.parse(rawResult);
 if(result.status==="running")throw new Error("GATEWAY_RUNNING_RESULT_NOT_SETTLEABLE");
 const observationUnavailable=isWorkbenchBrowserObservation(descriptor)&&(result.status==="unknown"||(result.status==="failed"&&result.error.dispatched));
 const unknown=!observationUnavailable&&(result.status==="unknown" || (result.status==="failed" && result.error.dispatched && result.error.confirmedNoCommit!==true));
 const sideEffect=unknown?"unknown":result.status==="succeeded"
  ? descriptor.effects.some(effect=>["external_write","process","task_write"].includes(effect))?"committed":descriptor.effects.includes("domain_candidate")?"proposal":"none"
  :"none";
 const summary=result.status==="succeeded"?(result.content.find(part=>part.type==="text")?.text??"工具已完成").slice(0,10000):`工具${unknown?"回执待核对":"调用失败"}：${result.error.code}`;
 const code=result.status==="succeeded"?null:unknown?"unknown_commit":result.error.nextAction==="fix_input"?"invalid_input":result.error.nextAction==="login"?"needs_login":result.error.nextAction==="contact_support"?"no_evidence":"transient";
 return agenticToolOutcomeSchema.parse({status:result.status==="succeeded"?"ok":code==="needs_login"?"blocked":"error",summary,evidence:[],data:{workbench:result},error:code?{code,retryable:false,recovery:unknown?"按原 operationId 核对回执后继续；不要重新执行。":observationUnavailable?browserObservationRecovery:result.status==="failed"&&result.error.recovery?result.error.recovery:`按 ${result.status==="failed"?result.error.nextAction:"reconcile"} 处理`}:null,continuation:null,sideEffect});
}
import { saveExecutionCheckpointSchema } from "./execution-checkpoint";
export { saveExecutionCheckpointSchema, executionCheckpointSchema, checkpointToolCallSchema, workerToolResultReceiptSchema } from "./execution-checkpoint";
import { z } from "zod";
import { executionTimeoutMs } from "../timeout-policy";

/** 项目来源只携带真实持久锚；宿主另核正文 hash、工件归属及导入回执。 */
const preparationSourceFields={projectId:z.string().min(1),contentHash:z.string().regex(/^sha256:[a-f0-9]{64}$/),title:z.string().nullable(),authorName:z.string().nullable(),url:z.string().url().nullable()};
export const projectPreparationGenerationSourceSchema=z.discriminatedUnion('kind',[
 z.object({...preparationSourceFields,kind:z.literal('project_artifact'),artifactId:z.string().min(1),artifactVersion:z.number().int().positive()}).strict(),
 z.object({...preparationSourceFields,kind:z.literal('imported_text'),intakeId:z.string().min(1),contentText:z.string().min(1).max(2_000_000)}).strict(),
]);
export const projectPreparationGenerationTargetSchema=z.object({
 ownerType:z.literal('project'),projectId:z.string().min(1),source:projectPreparationGenerationSourceSchema,
 generationMode:z.enum(['rewrite_only','strategy_backed']),positioning:z.unknown().nullable().optional(),positioningVersionId:z.string().nullable().optional(),personalizationStatus:z.enum(['applied','not_applied']).optional(),
 transcript:z.object({text:z.string().min(1).max(2_000_000),hash:z.string().regex(/^sha256:[a-f0-9]{64}$/)}).strict(),
}).strict().refine(value=>value.projectId===value.source.projectId&&value.transcript.hash===value.source.contentHash&&(value.source.kind!=='imported_text'||value.source.contentText===value.transcript.text),'项目来源与正文锚不一致');
export type ProjectPreparationGenerationTarget=z.infer<typeof projectPreparationGenerationTargetSchema>;
export type ProjectPreparationGenerationSource=z.infer<typeof projectPreparationGenerationSourceSchema>;

/** 后端冻结的任务总预算；null 仅由 continuous 策略显式授权，单次请求仍独立限时。 */
export const executionBudgetSchema = z.union([
  z.object({maxCalls:z.number().int().positive().max(10000),maxTokens:z.number().int().positive().max(2_000_000_000),deadlineMs:z.number().int().positive().max(2_000_000_000)}).strict(),
  z.object({policy:z.literal("continuous"),maxAttempts:z.number().int().positive().optional(),maxCalls:z.number().int().positive().max(10000).nullable(),maxTokens:z.number().int().positive().max(2_000_000_000).nullable(),deadlineMs:z.number().int().positive().max(2_000_000_000).nullable()}).strict(),
]);
export type BoundedExecutionBudget = {maxCalls:number;maxTokens:number;deadlineMs:number};
export type ExecutionBudget = z.infer<typeof executionBudgetSchema>;
export function createContinuousExecutionBudget(limits:Partial<{maxCalls:number;maxTokens:number;deadlineMs:number;maxAttempts:number}> = {}):ExecutionBudget {
  return executionBudgetSchema.parse({policy:"continuous",...(limits.maxAttempts===undefined?{}:{maxAttempts:limits.maxAttempts}),maxCalls:limits.maxCalls??null,maxTokens:limits.maxTokens??null,deadlineMs:limits.deadlineMs??null});
}
export function isContinuousExecutionBudget(value:unknown):boolean {
  const parsed=executionBudgetSchema.safeParse(value);
  return parsed.success && "policy" in parsed.data && parsed.data.policy === "continuous";
}
/** attempt 是租约代数；持续策略只执行显式的恢复次数限制。 */
export function executionAttemptAvailable(value:unknown,attempt:number,legacyMaxAttempts:number):boolean {
  const parsed=executionBudgetSchema.safeParse(value);
  if(parsed.success && "policy" in parsed.data) return parsed.data.maxAttempts === undefined || attempt < parsed.data.maxAttempts;
  return attempt < legacyMaxAttempts;
}
export function executionBudgetDeadline(budget:ExecutionBudget,startedAt:string):string|null {
  return budget.deadlineMs === null ? null : new Date(Date.parse(startedAt)+budget.deadlineMs).toISOString();
}

/** 仅用于新执行首次冻结期限；历史回退使用 executionBudgetDeadline，不能延长旧总预算。 */
export function newExecutionBudgetDeadline(budget:ExecutionBudget,startedAt:string):string|null {
  return budget.deadlineMs === null ? null : new Date(Date.parse(startedAt)+executionTimeoutMs(budget.deadlineMs)).toISOString();
}

/** 私有父子进程协议；用户身份由后端任务记录恢复，不在 Worker 消息中指定。 */
export const executionRefSchema = z.object({
  executionTaskId: z.string().min(1),
  attempt: z.number().int().positive(),
  fenceToken: z.string().min(1),
}).strict();
export type ExecutionRef = z.infer<typeof executionRefSchema>;
export const workerPortSchema = z.enum([
  "readCodexCall","bindCodexCall","recordCodexToolCall",
 ...Object.keys(assetAsrPortInputs) as Array<keyof typeof assetAsrPortInputs>,
  "settleCoverModel",
  ...Object.keys(transcribeWorkflowPortSchemas) as Array<keyof typeof transcribeWorkflowPortSchemas>,
  ...Object.keys(coverPortInputSchemas) as Array<keyof typeof coverPortInputSchemas>,
  "resolveVideoModel","reserveVideoModel","recordVideoStep","saveVideoCheckpoint","saveVideoResult",
  "readProcessingAsset", "saveMaterialExtraction", "completeAssetProcessing",
  "prepareTranscribePostprocess", "readTranscribePostprocess", "reserveTranscribePostprocess", "startTranscribePostprocess", "settleTranscribePostprocess", "saveTranscribePostprocess",
  "selectTranscribeLocalFallback", "prepareTranscribeAsr", "readTranscribeAudio", "saveTranscribeAudio",
  "reserveAsrRequest", "startAsrRequest", "settleAsrRequest",
  "resolveAssetCredential", "readAssetReference", "settleAssetCall", "reserveAssetCall", "startAssetCall", "saveAssetResult", "recoverAssetResult", "readAssetProviderJob", "recordAssetProviderJob",
  "resolveChatWebReadSearch", "readChatWebReadCache", "failChatWebRead", "prepareChatWebRead", "observeChatWebRead", "restoreChatWebRead", "completeChatWebRead", "readChatWebReadSession", "saveChatWebReadSession",
  "prepareChatRedfox", "settleChatRedfox",
  "prepareChatResearch", "settleChatResearch",
  "failChatGeneration", "restoreChatGeneration", "resolveChatGenerationCredential", "prepareChatGeneration", "reserveChatGenerationModel", "startChatGenerationModel", "settleChatGenerationModel", "completeChatGeneration",
  "failChatScriptDraft", "restoreChatScriptDraft", "prepareChatScriptDraft", "reserveChatScriptDraftModel", "startChatScriptDraftModel", "settleChatScriptDraftModel", "completeChatScriptDraft",
  "failChatHooks", "restoreChatHooks", "prepareChatHooks", "reserveChatHooksModel", "startChatHooksModel", "settleChatHooksModel", "completeChatHooks",
  "reserveExternalChatTurn", "prepareExternalChatThread", "startExternalChatTurn", "recordExternalChatProviderTurn", "saveExternalChatImage", "recoverExternalChatImage", "settleExternalChatTurn", "commitExternalChatResult", "listExternalTaskTools", "executeExternalTaskTool",
  "appendStreamEvents", "commitChatResult", "checkChatToolApproval", "readWorkbenchPlan", "saveWorkbenchPlan", "resolveWorkbenchScreenshot",

  "completeDailyTopicSkip", "commitDailyTopicResult",
  "reserveTopicRead", "startTopicRead", "settleTopicRead", "readTopicRead", "readTopicBrowserSession", "saveTopicBrowserSession",
  "readTaskContext", "resolveModelCredential", "resolveChatFallbackCredential", "reserveCall", "startCall", "settleCall",
  "prepareScriptImport", "saveScriptFallback", "saveScriptVoiceover",
  "settleBrowserObservation", "prepareBrowserAction", "readBrowserSession", "saveBrowserSession", "settleResearchRead", "executeEvidenceRead", "reserveAgenticModel", "executeAgenticTool", "commitAgenticResult", "reserveAgenticTool", "startAgenticTool", "settleAgenticTool", "reserveGenerationCall", "settleGenerationCall", "saveGenerationResult", "readCheckpoint", "saveCheckpoint", "commitResult", "heartbeat", "acknowledgeControl",
]);
export type WorkerPort = z.infer<typeof workerPortSchema>;
const emptyPortInput = z.object({}).strict();
const operationKeySchema = z.string().min(1).max(256);
const externalChatEngineSchema=z.enum(["codex","codebuddy"]);
export const externalChatUsageSchema=z.object({
  inputTokens:z.number().int().nonnegative().nullable(),
  outputTokens:z.number().int().nonnegative().nullable(),
  totalTokens:z.number().int().nonnegative().nullable(),
  thoughtTokens:z.number().int().nonnegative().nullable().optional(),
  cachedReadTokens:z.number().int().nonnegative().nullable().optional(),
  cachedWriteTokens:z.number().int().nonnegative().nullable().optional(),
}).strict().nullable();
export const externalChatImageIdentitySchema=z.object({callId:operationKeySchema,sessionId:z.string().min(1).max(512),toolCallId:operationKeySchema,imageIndex:z.number().int().min(0).max(15),nativeSource:z.object({providerTurnId:z.string().min(1).max(512),itemId:operationKeySchema,checksum:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional()}).strict();
export const externalChatImageReceiptSchema=externalChatImageIdentitySchema.omit({callId:true,sessionId:true}).extend({assetId:z.string().min(1),fileId:z.string().min(1),assetType:z.literal("image"),name:z.string().min(1).max(1000),checksum:z.string().regex(/^[a-f0-9]{64}$/),byteLength:z.number().int().positive().max(30*1024*1024),committedAt:z.string().min(1)}).strict();
export const externalChatReceiptSchema=z.object({schemaVersion:z.literal(1),engine:externalChatEngineSchema,protocolKind:z.enum(["acp","codex-app-server"]).optional(),providerTurnId:z.string().min(1).max(512).optional(),protocolVersion:z.number().int().positive(),sessionId:z.string().min(1).max(512),turnId:operationKeySchema,stopReason:z.enum(["end_turn","max_tokens","max_turn_requests","refusal","cancelled"]),text:z.string().max(2_000_000),images:z.array(externalChatImageReceiptSchema).max(16).optional(),imageFailures:z.array(z.object({toolCallId:operationKeySchema,imageIndex:z.number().int().min(0).max(15),code:z.string().min(1).max(128)}).strict()).max(16).optional(),usage:externalChatUsageSchema}).strict().refine(value=>Boolean(value.text.trim()||value.images?.length),"外部 Agent 未返回可保存正文或图片");
export const externalChatStartSchema=z.object({schemaVersion:z.literal(1),engine:externalChatEngineSchema,protocolKind:z.enum(["acp","codex-app-server"]).optional(),providerTurnId:z.string().min(1).max(512).optional(),protocolVersion:z.number().int().positive(),sessionId:z.string().min(1).max(512),turnId:operationKeySchema,status:z.literal("started")}).strict();
export const externalChatTurnStateSchema=z.object({callId:operationKeySchema,status:z.enum(["reserved","started","settled","unknown","rejected"]),sessionId:z.string().min(1).max(512).optional(),protocolVersion:z.number().int().positive().optional(),protocolKind:z.enum(["acp","codex-app-server"]).optional(),providerTurnId:z.string().min(1).max(512).optional(),receipt:externalChatReceiptSchema.optional()}).strict();
export const externalTaskToolDefinitionSchema=z.object({name:z.string().min(1).max(256),version:z.string().min(1).max(128),description:z.string(),inputSchema:z.record(z.string(),z.json())}).strict();
export const externalTaskToolCallSchema=z.object({schemaVersion:z.literal(1),kind:z.literal("external_tool"),turnCallId:operationKeySchema,toolCallId:operationKeySchema,toolName:z.string().min(1).max(256),toolVersion:z.string().min(1).max(128)}).strict();
export const externalTaskToolListSchema=z.object({tools:z.array(externalTaskToolDefinitionSchema).max(100)}).strict();
export const externalTaskToolResultSchema=z.object({turnCallId:operationKeySchema,toolCallId:operationKeySchema,callId:operationKeySchema,status:z.enum(["settled","unknown"]),outcome:agenticToolOutcomeSchema.optional()}).strict();
/** 仅由 owned checkpoint 返回；无正文/凭据，不能替代 reserve 的完整身份校验。 */
export const chatModelReplayFingerprintsSchema = z.array(z.object({
  callId: operationKeySchema,
  operationKey: operationKeySchema,
  inputDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  status: z.enum(["settled", "reserved"]),
}).strict()).max(10000);
export type ChatModelReplayFingerprint = z.infer<typeof chatModelReplayFingerprintsSchema>[number];

const tokenCountSchema = z.number().int().nonnegative().optional();
export const workerUsageSchema = z.object({
  inputTokens: tokenCountSchema, outputTokens: tokenCountSchema, totalTokens: tokenCountSchema,
  inputTokenDetails: z.object({noCacheTokens: tokenCountSchema, cacheReadTokens: tokenCountSchema, cacheWriteTokens: tokenCountSchema}).optional(),
  outputTokenDetails: z.object({textTokens: tokenCountSchema, reasoningTokens: tokenCountSchema}).optional(),
});
/** 仅保存可恢复的模型结果，不保留请求正文、HTTP头或原始响应日志。 */
export const workerProviderReceiptSchema = z.object({
  content: z.array(z.json()),
  stream: z.object({schemaVersion:z.literal(1),parts:z.array(z.json())}).strict().optional(),
  finishReason: z.object({unified:z.string(),raw:z.string().optional()}).strict(),
  usage: z.object({
    inputTokens:z.object({total:tokenCountSchema,noCache:tokenCountSchema,cacheRead:tokenCountSchema,cacheWrite:tokenCountSchema}),
    outputTokens:z.object({total:tokenCountSchema,text:tokenCountSchema,reasoning:tokenCountSchema}),
  }),
  warnings:z.array(z.json()),
  providerMetadata:z.record(z.string(),z.json()).optional(),
}).strict().refine(value=>JSON.stringify(value).length<=4_000_000,"模型回执超过持久化上限");
export type WorkerProviderReceipt = z.infer<typeof workerProviderReceiptSchema>;
const generationSettlementSchema=z.discriminatedUnion("status", [
 z.object({callId:operationKeySchema,status:z.literal("settled"),providerResult:workerProviderReceiptSchema,usage:workerUsageSchema}).strict(),
 z.object({callId:operationKeySchema,status:z.literal("rejected"),rejectionCode:z.enum(["STRUCTURED_PROTOCOL_UNSUPPORTED","CHAT_MODEL_RETRYABLE_REJECTION"]).optional(),errorDetail:z.string().max(512).optional()}).strict(),
 z.object({callId:operationKeySchema,status:z.literal("superseded")}).strict(),
 z.object({callId:operationKeySchema,status:z.literal("unknown")}).strict(),
]);

const publicSearchUrl=z.string().url().refine(value=>{const url=new URL(value);return ["http:","https:"].includes(url.protocol) && !url.username && !url.password;},"搜索结果必须为公开网页地址");
export const chatResearchObservationSchema=z.discriminatedUnion("status",[
 z.object({status:z.literal("ok"),results:z.array(z.object({title:z.string().max(10000),url:publicSearchUrl,snippet:z.string().max(100000),siteName:z.string().max(1000).optional(),publishedAt:z.string().max(100).optional()}).strict()).max(10)}).strict(),
 z.object({status:z.enum(["error","blocked"]),recoveryState:z.literal("browser_runtime_unavailable").optional(),summary:z.string().min(1).max(4000),error:z.object({code:z.enum(["transient","permission","needs_login","captcha","cancelled","no_evidence"]),retryable:z.boolean(),recovery:z.string().max(4000)}).strict()}).strict(),
]);
export const chatResearchPreparationSchema=z.object({available:z.boolean(),query:z.string().max(100000),count:z.literal(10)}).strict();

/** 每个命名端口都有单独的载荷边界；身份字段不得从 Worker 注入。 */
export const workerPortInputSchemas = {
  recordCodexToolCall:z.object({callId:operationKeySchema,toolCallId:operationKeySchema,toolName:z.string().min(1).max(256),input:z.string().max(1000000)}).strict(),
  readCodexCall:z.object({callId:operationKeySchema}).strict(),
  bindCodexCall:z.object({callId:operationKeySchema,threadId:z.string().min(1).max(512).optional(),turnId:z.string().min(1).max(512).optional(),modelFacts:z.object({model:z.string().max(512).nullable(),modelProvider:z.string().max(512).nullable()}).strict().optional(),observedUsage:workerUsageSchema.optional(),nativeResult:z.object({itemId:z.string().min(1).max(512),checksum:z.string().regex(/^sha256:[a-f0-9]{64}$/),model:z.string().max(512).nullable(),usage:z.object({inputTokens:z.number().int().nonnegative().nullable(),outputTokens:z.number().int().nonnegative().nullable(),totalTokens:z.number().int().nonnegative().nullable(),cachedReadTokens:z.number().int().nonnegative().nullable(),thoughtTokens:z.number().int().nonnegative().nullable()}).strict().nullable()}).strict().optional()}).strict(),
 ...assetAsrPortInputs,
  ...videoPortInputSchemas,
  readWorkbenchPlan:z.object({modelCallId:operationKeySchema}).strict(),
  saveWorkbenchPlan:z.object({expectedRevision:z.number().int().nonnegative(),steps:workbenchPlanSchema.shape.steps}).strict(),
  resolveWorkbenchScreenshot:z.object({callId:operationKeySchema,dataRef:z.string().regex(/^wm1-[a-f0-9]{64}$/)}).strict(),
  readProcessingAsset:emptyPortInput,saveMaterialExtraction:materialExtractionSchema,completeAssetProcessing:assetProcessingCompleteSchema,
  ...transcribeWorkflowPortSchemas,
  ...coverPortInputSchemas,
  settleCoverModel:generationSettlementSchema,
  prepareTranscribePostprocess:z.object({awemeId:z.string().min(1).max(128)}).strict(),
  readTranscribePostprocess:z.object({awemeId:z.string().min(1).max(128)}).strict(),
  saveTranscribePostprocess:z.object({awemeId:z.string().min(1).max(128)}).strict(),
  reserveTranscribePostprocess:z.object({awemeId:z.string().min(1).max(128),operationKey:operationKeySchema,request:z.record(z.string(),z.json()).refine(value=>JSON.stringify(value).length<=4_000_000)}).strict(),
  startTranscribePostprocess:z.object({awemeId:z.string().min(1).max(128),callId:operationKeySchema}).strict(),
  settleTranscribePostprocess:z.discriminatedUnion("status", [
    generationSettlementSchema.options[0].extend({awemeId:z.string().min(1).max(128)}).strict(),
    generationSettlementSchema.options[1].extend({awemeId:z.string().min(1).max(128)}).strict(),
    generationSettlementSchema.options[2].extend({awemeId:z.string().min(1).max(128)}).strict(),
    generationSettlementSchema.options[3].extend({awemeId:z.string().min(1).max(128)}).strict(),
  ]),
  selectTranscribeLocalFallback:z.object({awemeId:z.string().min(1).max(128)}).strict(),
  prepareTranscribeAsr:z.object({awemeId:z.string().min(1).max(128)}).strict(),
  ...transcribeAudioPortSchemas,
  ...asrPortInputSchemas,
  resolveAssetCredential:providerJobReadSchema,
  readAssetReference:providerJobReadSchema,
  settleAssetCall:providerJobReadSchema.extend({status:z.enum(["unknown","rejected"])}).strict(),
  reserveAssetCall:emptyPortInput,
  startAssetCall:providerJobReadSchema,
  recoverAssetResult:providerJobReadSchema,
  readAssetProviderJob:providerJobReadSchema,
  recordAssetProviderJob:providerJobRecordSchema,
  saveAssetResult:z.object({callId:z.string().min(1).max(512),bytes:z.instanceof(Uint8Array).refine(bytes=>bytes.byteLength>0 && bytes.byteLength<=2147483647,"素材字节超出原存储范围")}).strict(),
  resolveChatWebReadSearch:chatWebReadCallSchema,
  readChatWebReadCache:chatWebReadCallSchema,
  failChatWebRead:chatWebReadFailureSchema,
  prepareChatWebRead:chatWebReadCallSchema,
  observeChatWebRead:chatWebReadRecordSchema,
  restoreChatWebRead:chatWebReadCallSchema,
  completeChatWebRead:chatWebReadCallSchema,
  readChatWebReadSession:chatWebReadCallSchema,
  saveChatWebReadSession:chatWebReadSessionSaveSchema,
  prepareChatRedfox:z.object({callId:operationKeySchema}).strict(),
  settleChatRedfox:z.object({callId:operationKeySchema,observation:redfoxObservationSchema}).strict(),
  prepareChatResearch:z.object({callId:operationKeySchema}).strict(),
  settleChatResearch:z.object({callId:operationKeySchema,observation:chatResearchObservationSchema}).strict(),
  failChatGeneration:z.object({callId:operationKeySchema,outcome:z.enum(["retry_wait","waiting_user","failed"]),errorCode:z.string().min(1).max(128),retryAfterMs:z.number().finite().nonnegative().optional()}).strict(),
  restoreChatGeneration:chatHooksParentRequestSchema,
  resolveChatGenerationCredential:chatHooksParentRequestSchema,
  prepareChatGeneration:chatHooksParentRequestSchema,
  reserveChatGenerationModel:chatHooksReserveRequestSchema,
  startChatGenerationModel:chatHooksParentRequestSchema,
  settleChatGenerationModel:generationSettlementSchema,
  completeChatGeneration:chatHooksParentRequestSchema,
  failChatScriptDraft:z.object({callId:operationKeySchema,outcome:z.enum(["retry_wait","waiting_user","failed"]),errorCode:z.string().min(1).max(128),retryAfterMs:z.number().finite().nonnegative().optional()}).strict(),
  restoreChatScriptDraft:chatHooksParentRequestSchema,
  prepareChatScriptDraft:chatHooksParentRequestSchema,
  reserveChatScriptDraftModel:chatHooksReserveRequestSchema,
  startChatScriptDraftModel:chatHooksParentRequestSchema,
  settleChatScriptDraftModel:generationSettlementSchema,
  completeChatScriptDraft:chatHooksParentRequestSchema,
  failChatHooks:z.object({callId:operationKeySchema,outcome:z.enum(["retry_wait","waiting_user","failed"]),errorCode:z.string().min(1).max(128),retryAfterMs:z.number().finite().nonnegative().optional()}).strict(),
  restoreChatHooks:chatHooksParentRequestSchema,
  prepareChatHooks:chatHooksParentRequestSchema,
  reserveChatHooksModel:chatHooksReserveRequestSchema,
  startChatHooksModel:chatHooksParentRequestSchema,
  settleChatHooksModel:generationSettlementSchema,
  completeChatHooks:chatHooksParentRequestSchema,
  appendStreamEvents:appendExecutionStreamSchema,
  checkChatToolApproval:reserveAgenticToolSchema,
  commitChatResult:z.object({lastModelCallId:operationKeySchema,toolCallIds:z.array(operationKeySchema).max(10000).refine(ids=>new Set(ids).size===ids.length,"工具引用不能重复"),partialPlanFailureStepIds:z.array(operationKeySchema).min(1).max(10000).refine(ids=>new Set(ids).size===ids.length,"未成功步骤引用不能重复").optional(),terminalToolFailureCallIds:z.array(operationKeySchema).min(2).max(10000).refine(ids=>new Set(ids).size===ids.length,"终态工具失败回执不能重复").optional()}).strict(),
  reserveExternalChatTurn:emptyPortInput,
  prepareExternalChatThread:z.object({callId:operationKeySchema,sessionId:z.string().min(1).max(512),protocolKind:z.literal("codex-app-server"),protocolVersion:z.literal(1)}).strict(),
  recordExternalChatProviderTurn:z.object({callId:operationKeySchema,providerTurnId:z.string().min(1).max(512)}).strict(),
  startExternalChatTurn:z.object({callId:operationKeySchema,sessionId:z.string().min(1).max(512),protocolKind:z.enum(["acp","codex-app-server"]).optional(),protocolVersion:z.number().int().positive()}).strict(),
  saveExternalChatImage:externalChatImageIdentitySchema.extend({mimeType:z.enum(["image/png","image/jpeg","image/webp"]),bytes:z.instanceof(Uint8Array).refine(bytes=>bytes.byteLength>0&&bytes.byteLength<=30*1024*1024)}).strict(),
  recoverExternalChatImage:externalChatImageIdentitySchema,
  settleExternalChatTurn:z.discriminatedUnion("status",[
    z.object({callId:operationKeySchema,status:z.literal("settled"),receipt:externalChatReceiptSchema}).strict(),
    z.object({callId:operationKeySchema,status:z.literal("unknown")}).strict(),
    z.object({callId:operationKeySchema,status:z.literal("rejected"),rejectionCode:z.string().min(1).max(128)}).strict(),
  ]),
  commitExternalChatResult:z.object({callId:operationKeySchema}).strict(),
  listExternalTaskTools:emptyPortInput,
  executeExternalTaskTool:z.object({turnCallId:operationKeySchema,toolCallId:operationKeySchema,toolName:z.string().min(1).max(256),input:z.json().refine(value=>JSON.stringify(value).length<=1_000_000,"工具参数过大")}).strict(),

  completeDailyTopicSkip: emptyPortInput,
  commitDailyTopicResult: z.object({outcome:z.literal("succeeded"),callId:operationKeySchema,text:z.string().min(1).max(2_000_000)}).strict(),
  ...topicReadPortInputSchemas,
  readTaskContext: emptyPortInput,
  prepareScriptImport: emptyPortInput,
  saveScriptFallback: z.object({text:z.string().min(1).max(2_000_000)}).strict(),
  saveScriptVoiceover: z.object({callId:operationKeySchema,voiceover:z.string().min(1).max(200000),centralClaim:z.string(),audienceOldBelief:z.string(),generation:z.json()}).strict(),
  readBrowserSession:z.object({callId:operationKeySchema}).strict(),
  prepareBrowserAction:z.object({callId:operationKeySchema}).strict(),
  settleBrowserObservation:z.object({callId:operationKeySchema,output:agenticToolOutcomeSchema}).strict(),
  saveBrowserSession:z.object({callId:operationKeySchema,revision:z.string().min(1).nullable(),stateJson:z.string().max(2_100_000)}).strict(),
  settleResearchRead:z.object({callId:operationKeySchema,observation:z.object({sourceUrl:z.string().url().max(8192),title:z.string().max(10000),fullText:z.string().max(8_000_000),needLogin:z.boolean().optional()}).strict()}).strict(),
  executeEvidenceRead:z.object({callId:operationKeySchema}).strict(),
  reserveAgenticModel: reserveAgenticModelSchema,
  executeAgenticTool:z.object({callId:operationKeySchema}).strict(),
  commitAgenticResult:z.object({actualEngine:z.enum(["pi","codex"]),summary:z.string().max(10000),stopReason:z.enum(["completed","max_steps","budget_exhausted","aborted","llm_error"]),lastModelCallId:operationKeySchema,toolCallIds:z.array(operationKeySchema).max(10000)}).strict(),
  reserveAgenticTool: reserveAgenticToolSchema,
  settleAgenticTool: settleAgenticToolSchema,
  resolveChatFallbackCredential: z.object({operationKey:operationKeySchema}).strict(),
  resolveModelCredential: z.object({capability: z.string().min(1).max(128)}).strict(),
  reserveCall: z.object({operationKey: operationKeySchema, maxOutputTokens: z.number().int().positive().max(65536)}).strict(),
  reserveGenerationCall: z.object({operationKey:operationKeySchema,request:z.record(z.string(),z.json()).refine(value=>JSON.stringify(value).length<=46_000_000)}).strict(),
  settleGenerationCall: generationSettlementSchema,
  saveGenerationResult:z.object({callId:operationKeySchema,text:z.string().min(1).max(2_000_000)}).strict(),
  startAgenticTool: z.object({callId: operationKeySchema}).strict(),
  startCall: z.object({callId: operationKeySchema}).strict(),
  settleCall: z.discriminatedUnion("status", [
    z.object({callId: operationKeySchema, status: z.literal("settled"), usage: workerUsageSchema, text: z.string().min(1).max(2_000_000)}).strict(),
    z.object({callId: operationKeySchema, status: z.enum(["unknown", "rejected", "superseded"])}).strict(),
  ]),
  readCheckpoint: emptyPortInput,
  saveCheckpoint: saveExecutionCheckpointSchema,
  commitResult: z.discriminatedUnion("outcome", [
    z.object({outcome: z.literal("succeeded"), callId: operationKeySchema, text: z.string().min(1).max(2_000_000)}).strict(),
    z.object({outcome: z.enum(["failed", "unknown_result", "retry_wait", "waiting_user"]), errorCode: z.string().min(1).max(128), errorMessage:z.string().max(512).optional(), retryAfterMs: z.number().finite().nonnegative().optional()}).strict(),
  ]),
  heartbeat: emptyPortInput,
  acknowledgeControl: emptyPortInput,
} satisfies Record<WorkerPort, z.ZodType>;
export const workerReservationSchema = z.object({
  callId: operationKeySchema,
  status: z.enum(["reserved", "started", "settled", "unknown", "rejected", "superseded"]),
  providerResult:workerProviderReceiptSchema.optional(),
  rejectionCode:z.enum(["STRUCTURED_PROTOCOL_UNSUPPORTED","CHAT_MODEL_RETRYABLE_REJECTION"]).optional(),
  resultText: z.string().min(1).max(2_000_000).optional(),
}).strict();
export const workerStartReceiptSchema = z.object({callId: operationKeySchema, status: z.literal("started")}).strict();
const envelope = { version: z.literal(1), requestId: z.string().min(1) };
/** 可选私有协议；旧宿主/Worker 未协商时维持原 requestId 重投语义。 */
const receiptProtocol = z.literal('consumed-v1');
const callSeq = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const consumedRange = z.object({fromSeq:callSeq,toSeq:callSeq}).strict().refine(range=>range.fromSeq<=range.toSeq,'确认区间顺序错误');
export const workerStopReasonSchema = z.enum(["completed", "cancelled", "failed", "unknown_result", "retry_wait", "waiting_user"]);
export type WorkerStopReason = z.infer<typeof workerStopReasonSchema>;
export const hostMessageSchema = z.discriminatedUnion("type", [
  z.object({...envelope, type: z.literal("run"), execution: executionRefSchema, deadlineAt: z.number().finite().nullable(), receiptProtocol: receiptProtocol.optional()}),
  z.object({...envelope, type: z.literal("cancel"), execution: executionRefSchema}),
  z.object({...envelope, type: z.literal("reply"), ok: z.boolean(), data: z.unknown().optional(), errorCode: z.string().optional(), execution: executionRefSchema.optional(), callSeq: callSeq.optional()}),
]);
export type HostMessage = z.infer<typeof hostMessageSchema>;
export const workerMessageSchema = z.discriminatedUnion("type", [
  z.object({...envelope, type: z.literal("ready"), capabilities: z.array(z.string()), receiptProtocol: receiptProtocol.optional()}),
  z.object({...envelope, type: z.literal("call"), execution: executionRefSchema, port: workerPortSchema, data: z.unknown(), callSeq: callSeq.optional()}),
  z.object({...envelope, type: z.literal("consumed"), execution: executionRefSchema, throughSeq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), consumedRanges:z.array(consumedRange).optional()}),
  z.object({...envelope, type: z.literal("progress"), execution: executionRefSchema, seq: z.number().int().nonnegative(), text: z.string()}),
  z.object({...envelope, type: z.literal("stopped"), execution: executionRefSchema, reason: workerStopReasonSchema}),
]);
export type WorkerMessage = z.infer<typeof workerMessageSchema>;
export const modelGenerationInputSchema = z.object({
  kind: z.literal("model.generate"),
  operationKey: z.string().min(1),
  prompt: z.string().min(1),
  system: z.string().optional(),
  capability: z.string().min(1),
  maxOutputTokens: z.number().int().positive().max(65536),
});
export const workerModelSpecSchema = z.object({
  apiFormat: z.enum(["anthropic", "openai_chat", "openai_responses"]),
  authStyle: z.enum(["bearer", "x-api-key"]).optional(),
  baseUrl: z.string().nullable(), model: z.string().min(1), token: z.string().min(1),
  displayModelKey: z.literal("channel-managed").optional(),
  structuredOutputs: z.boolean().optional(),
});
export const executionModelSpecSchema=z.union([workerModelSpecSchema,codexModelSpecSchema]);
/** 后处理只消费已确认的 ASR 原文；固定输入与回执不含凭据。 */
export const transcribePostprocessResultSchema=z.discriminatedUnion("applied",[
  z.object({applied:z.literal(true),transcript:z.string().min(1).max(2_000_000)}).strict(),
  z.object({applied:z.literal(false),transcript:z.string().max(2_000_000),reason:z.string().min(1).max(1000)}).strict(),
]);
const apiTranscribePostprocessIdentitySchema=workerModelSpecSchema.omit({token:true,baseUrl:true}).extend({
  schemaVersion:z.literal(1),capability:z.literal("video.subtitles"),baseUrlDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/),customEndpoint:z.boolean(),
}).strict();
export const transcribePostprocessIdentitySchema=z.union([apiTranscribePostprocessIdentitySchema,codexModelSpecSchema.extend({schemaVersion:z.literal(1),capability:z.literal('video.subtitles')}).strict()]);
export const transcribePostprocessPlanSchema=z.object({
  schemaVersion:z.literal(1),sourceDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/),
  transcript:z.string().max(2_000_000),accountPositioning:z.string().max(200000).optional(),title:z.string().max(10000).optional(),
  templateVersion:z.string().min(1).max(128),templateDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/),
  maxOutputTokens:z.number().int().positive().max(65536),identity:transcribePostprocessIdentitySchema.nullable(),operationKey:operationKeySchema,
}).strict();
export const transcribePostprocessPreparationSchema=z.discriminatedUnion("status",[
  z.object({status:z.literal("prepared"),plan:transcribePostprocessPlanSchema,spec:executionModelSpecSchema}).strict(),
  z.object({status:z.literal("restored"),result:transcribePostprocessResultSchema}).strict(),
]);
export const transcribePostprocessReservationSchema=z.union([
  workerReservationSchema,
  z.object({status:z.literal("skipped"),result:transcribePostprocessResultSchema}).strict(),
]);
export type TranscribePostprocessPlan=z.infer<typeof transcribePostprocessPlanSchema>;
export type TranscribePostprocessResult=z.infer<typeof transcribePostprocessResultSchema>;

export function sameExecution(a: ExecutionRef, b: ExecutionRef): boolean {
  return a.executionTaskId === b.executionTaskId && a.attempt === b.attempt && a.fenceToken === b.fenceToken;
}
/** SEMANTIC_BOUNDARY_ALLOW: 私有协议身份绑定，不解释内容或作创作选择。 */
export function workerCallRequestId(execution:ExecutionRef,callSeq:number):string{
  return JSON.stringify([execution.executionTaskId,execution.attempt,execution.fenceToken,callSeq]);
}

const completionPolicySchema=z.object({schemaVersion:z.literal(1),minSegments:z.number().int().nonnegative(),maxSegments:z.number().int().positive().nullable(),requiredSequence:z.array(z.string()),repairAttempts:z.number().int().nonnegative()}).strict();
export const workerSkillSnapshotSchema=z.object({
  snapshotVersion:z.literal(1),userId:z.string().min(1),accountId:z.string().min(1).nullable(),groupId:z.string().min(1).nullable().optional(),groupVersion:z.number().int().positive().nullable().optional(),membershipVersion:z.number().int().positive().nullable().optional(),resolvedAt:z.string().min(1),platformPolicyVersion:z.string().min(1),platformPolicy:z.string().min(1),
  skills:z.array(z.object({skillId:z.string().min(1),baseVersion:z.string().min(1),overlayRevision:z.number().int().nonnegative().nullable(),overlayVersion:z.string().nullable(),effective:z.object({
    methodSystem:z.string(),template:z.string(),tools:z.array(z.string()),requiredFacets:z.array(z.string()),contextRequirements:z.array(z.string()),outputSchema:z.record(z.string(),z.json()).nullable(),completionPolicy:completionPolicySchema.nullable(),completionPolicyAdapter:z.object({id:z.string().min(1),version:z.string().min(1)}).strict().nullable(),
  }).strict()}).strict()).min(1),
}).strict();
export const chatStructuredNodeSchema=z.discriminatedUnion("capability",[
 z.object({capability:z.literal("topic.generate"),facets:z.record(z.string(),z.string()),trendNote:z.string().nullable()}).strict(),
 z.object({capability:z.literal("review.analyze"),facets:z.record(z.string(),z.string())}).strict(),
 z.object({capability:z.literal("knowledge.distill"),facets:z.record(z.string(),z.string()),chunks:z.array(z.string().min(1).max(7002)).min(1).max(64),originalText:z.string().max(200000),coverage:z.object({inputChars:z.number().int().nonnegative(),submittedChars:z.number().int().nonnegative(),truncatedChars:z.number().int().nonnegative()}).strict()}).strict(),
 z.object({capability:z.literal("calibration.diagnose"),facets:z.record(z.string(),z.string())}).strict(),
 z.object({capability:z.literal("topic.enrich"),facets:z.record(z.string(),z.string()),candidateId:z.string().min(1).nullable()}).strict(),
 z.object({capability:z.literal("positioning.generate"),facets:z.record(z.string(),z.string())}).strict(),
]);
export const chatGenerationPreparationSchema=z.object({node:chatStructuredNodeSchema,skillSnapshot:workerSkillSnapshotSchema,maxOutputTokens:z.number().int().positive().max(65536),operationKey:z.string().min(1).max(256),retryOfCallId:z.string().min(1).optional(),retryOperationKey:z.string().min(1).optional()}).strict();
export const structuredGenerationInputSchema=z.object({
  kind:z.literal("model.structured"),operationKey:z.string().min(1).max(200),capability:z.string().min(1),maxOutputTokens:z.number().int().positive().max(65536),
  skillId:z.string().min(1),skillSnapshot:workerSkillSnapshotSchema,facets:z.record(z.string(),z.string()),timeoutMs:z.number().int().positive().optional(),
}).strict().refine(value=>value.skillSnapshot.skills.some(skill=>skill.skillId===value.skillId && skill.effective.outputSchema!==null),"结构化任务缺少冻结输出契约");
/** SEMANTIC_BOUNDARY_ALLOW: 已选正文模式的私有机械协议，不推断内容、不授予执行权。 */
export const intelligenceRewriteInputSchema=z.object(structuredGenerationInputSchema.shape).extend({
  intelligenceText:z.literal("rewrite_only"),capability:z.literal("topic.generate"),skillId:z.literal("intelligence.topic-adapted-draft"),
}).strict().refine(value=>value.skillSnapshot.skills.length===1 && value.skillSnapshot.skills[0]?.skillId===value.skillId,"正文任务必须冻结唯一正文 Skill")
 .refine(value=>{if(value.facets.mode!=="topic_preview")return false;try{const target=JSON.parse(value.facets.target??"null");return target!==null && typeof target==="object" && !Array.isArray(target) && target.generationMode==="rewrite_only";}catch{return false;}},"正文任务模式与冻结目标不符");
/** 原调度业务任务的执行标记；模型阶段只由后端固定能力端口准备。 */
// 纯浏览器流量/评论采集没有模型阶段；仅这些显式 sourceKind 允许真实 resolver 的空 Skill 清单。
// 其他调度/结构化/聊天路径继续使用 workerSkillSnapshotSchema 的 min(1)。
const trafficSkillSnapshotSchema=workerSkillSnapshotSchema.extend({skills:z.array(workerSkillSnapshotSchema.shape.skills.element)});
export const scheduledFlywheelSnapshotSchema=z.discriminatedUnion("sourceKind",[
 z.object({sourceKind:z.enum(["self.traffic","comments"]),skillSnapshot:trafficSkillSnapshotSchema}).strict(),
 z.object({sourceKind:z.enum(["benchmark","self.detail","self.metrics","favorites"]),skillSnapshot:workerSkillSnapshotSchema}).strict(),
]);
const scheduledFlywheelTaskBaseSchema=z.object({kind:z.literal("scheduled.flywheel"),jobId:z.string().min(1),jobRunId:z.string().min(1),target:z.record(z.string(),z.json())}).strict();
export const scheduledFlywheelTaskInputSchema=z.discriminatedUnion("sourceKind",[
 scheduledFlywheelTaskBaseSchema.extend(scheduledFlywheelSnapshotSchema.options[0].shape),
 scheduledFlywheelTaskBaseSchema.extend(scheduledFlywheelSnapshotSchema.options[1].shape),
]);
/** 用户单条对标转写的真实业务执行标记，不进入项目转写工作流。 */
export const benchmarkTranscribeTaskInputSchema=z.object({kind:z.literal("benchmark.transcribe"),workId:z.string().min(1),awemeId:z.string().min(1).max(128),sourceId:z.string().min(1),sourceExternalAccountId:z.string(),configuration:transcribeTaskInputSchema.shape.configuration}).strict();
export const workerTaskInputSchema=z.union([assetAsrInput,benchmarkTranscribeTaskInputSchema,scheduledFlywheelTaskInputSchema,transcribeTaskInputSchema,assetGenerationInputSchema,modelGenerationInputSchema,structuredGenerationInputSchema,intelligenceRewriteInputSchema,agenticWorkerInputSchema,chatWorkerInputSchema]);
const structuredUsageSchema=z.object({inputTokens:z.number().nonnegative().nullable(),outputTokens:z.number().nonnegative().nullable(),cachedTokens:z.number().nonnegative().nullable(),totalTokens:z.number().nonnegative().nullable()});
const completionViolationSchema=z.object({code:z.string(),path:z.string(),message:z.string()});
export const workerStructuredResultSchema=z.object({
  object:z.json(),
  modelLabel:z.string().min(1).optional(),
  generation:z.object({finishReason:z.string(),usage:structuredUsageSchema,attempts:z.array(z.object({finishReason:z.string(),usage:structuredUsageSchema,kind:z.enum(["initial","repair"])}))}),
  validation:z.object({status:z.enum(["valid","partial"]),errors:z.array(completionViolationSchema),policySnapshot:z.object({policy:completionPolicySchema,adapter:z.object({id:z.string(),version:z.string()})}),originalSegmentCount:z.number().int().nonnegative(),finalSegmentCount:z.number().int().nonnegative(),repairAttemptsUsed:z.number().int().nonnegative(),repairReasons:z.array(completionViolationSchema)}).optional(),
}).strict();
export type WorkerStructuredResult=z.infer<typeof workerStructuredResultSchema>;

export {browserActionPreparationSchema,browserAuthorizationSnapshotSchema,type BrowserAuthorizationSnapshot,browserObserveInputSchema,browserActInputSchema,browserObservationSchema,type BrowserObserveInput,type BrowserActInput,type BrowserObservation} from "./execution-browser";

export {topicReadTargetSchema,topicReadRequestSchema,topicReadReceiptSchema,topicReadStoredReceiptSchema,topicReadReservationSchema,topicReadErrorCodeSchema,type TopicReadTarget,type TopicReadRequest,type TopicReadReceipt} from "./execution-topic-read";

export const chatToolApprovalReceiptSchema=z.discriminatedUnion("status",[
 z.object({status:z.enum(["not-applicable","user-approval","unavailable"])}).strict(),
 z.object({status:z.literal("denied"),reason:z.string().max(10000)}).strict(),
]);
export const chatCommitReceiptSchema=z.object({resultId:z.string().min(1),aiTaskId:z.string().min(1),messageId:z.string().min(1),outcome:z.enum(["succeeded","partial"])}).strict();
export {assetGenerationInputSchema,providerJobSchema,providerJobReadSchema,providerJobRecordSchema} from "./asset-generation";

export {assetCredentialSchema,assetRuntimeOptionsSchema,assetResultReceiptSchema,executionAssetCredentialSchema,codexAssetCredentialSchema} from "./asset-generation";

export {codexCapabilityReasonSchema,localCodexStatusSchema,localCodexStatusRequestSchema,localCodexStatusResponseSchema} from "./local-codex-status";

export {momentsModelTaskInput,momentsModelOutput,momentsFrozenProof,momentsRetryReservation,momentsFrozenLineage} from "./moments-model";

export {productionRoughCutTaskInput,type ProductionRoughCutTaskInput} from './production-rough-cut';

export * from "./asset-asr-timing";

export {asrTranscriptSchema} from "./execution-asr";

/** 原外部宿主调用的受控原参数证明，不更改providerResult身份。 */
export const externalToolInputProofSchema=z.object({schemaVersion:z.literal(1),callId:z.string().min(1),turnCallId:z.string().min(1),toolCallId:z.string().min(1),toolName:z.string().min(1),toolVersion:z.string().min(1),inputDigest:z.string().min(1),input:z.json()}).strict().superRefine((value,ctx)=>{if(JSON.stringify(value.input).length>1_000_000)ctx.addIssue({code:'custom',message:'外部工具参数过大'});});
