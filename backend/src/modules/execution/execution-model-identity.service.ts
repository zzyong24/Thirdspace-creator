import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, aiTasks, executionTasks, type Db } from "@creatoros/backend";
import {
  workerModelSpecSchema,executionModelSpecSchema,codexModelSpecSchema,projectPreparationGenerationTargetSchema,
  assetProcessingInputSchema,workerTaskInputSchema,agenticWorkerInputSchema,chatWorkerInputSchema,executionRouteSchema,frozenModelRouteSchema,assetGenerationInputSchema,structuredGenerationInputSchema,intelligenceRewriteInputSchema,coverImagePreparationSchema,transcribePostprocessPlanSchema,videoFrozenSchema,readFrozenModelRoute,type FrozenModelRoute,
  type ExecutionRef,
} from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";
import {canonicalJson} from "../ai/canonical-json";
import {executionTaskSpec} from "@creatoros/contract";
import {workspaceFilter} from "../../workspace-scope";
import {generationRequestDigest} from "@creatoros/ai-worker/chat";

const apiModelIdentitySchema = workerModelSpecSchema
  .omit({ token: true, baseUrl: true })
  .extend({
    schemaVersion: z.literal(1),
    capability: z.string().min(1),
    baseUrlDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    customEndpoint: z.boolean(),
  })
  .strict();
export const executionModelIdentitySchema=z.union([apiModelIdentitySchema,codexModelSpecSchema.extend({schemaVersion:z.literal(1),capability:z.string().min(1)}).strict()]);
const payloadSchema = z.record(z.string(), z.json());

/** 统一无秘密身份投影；根模型与聊天子模型使用同一规则。 */
export function prepareExecutionModelIdentity(capability: string, raw: unknown) {
      const credential = executionModelSpecSchema.parse(raw);
      if("engine" in credential)return {credential,identity:executionModelIdentitySchema.parse({...credential,schemaVersion:1,capability})};
      const { token: _token, baseUrl, ...spec } = credential;
      const baseUrlDigest = `sha256:${createHash("sha256").update(JSON.stringify(baseUrl)).digest("hex")}`;
      const identity = executionModelIdentitySchema.parse(
        JSON.parse(
          JSON.stringify({
            schemaVersion: 1,
            capability,
            ...spec,
            baseUrlDigest,
            customEndpoint: Boolean(baseUrl),
          }),
        ),
      );
      return { credential, identity };
}

/** 从真实冻结route投影无秘密身份；没有占位token，不冒充凭据解析。 */
export function identityFromFrozenChatRoute(capability:string,raw:FrozenModelRoute){
 const route=frozenModelRouteSchema.parse(raw);
 if(route.readiness!=="configured")throw new ConflictError(route.reasonCode);
 if(route.capability!==capability)throw new ConflictError("MODEL_ROUTE_NOT_FROZEN");
 if(route.source==='codex')return executionModelIdentitySchema.parse({engine:'codex',...route.identity,schemaVersion:1,capability});
 if(route.source!=='self'&&route.source!=='official')throw new ConflictError("MODEL_ROUTE_UNSUPPORTED");
 const value=route.identity;
 return executionModelIdentitySchema.parse({schemaVersion:1,capability,apiFormat:value.apiFormat,authStyle:value.authStyle,model:value.model,
  baseUrlDigest:`sha256:${createHash('sha256').update(JSON.stringify(value.endpoint)).digest('hex')}`,customEndpoint:Boolean(value.endpoint),
  ...(route.source==='official'?{displayModelKey:'channel-managed'}:{}),
  ...(typeof value.settings.structuredOutputs==='boolean'?{structuredOutputs:value.settings.structuredOutputs}:{})});
}
/** 只读原call的确切route。父工具身份已由pin/reserve写入，不能按main引擎授予子调用权。 */
export function frozenChatModelRouteForCall(payload:Record<string,unknown>,call:{kind:string;parentCallId:string|null}){
 try{
  const input=chatWorkerInputSchema.safeParse(payload.modelInput);
  const route=executionRouteSchema.safeParse(payload.executionRoute);
  if(!input.success||!route.success||route.data.schemaVersion!==2)return null;
  let key:string;
  if(call.parentCallId){
   if(call.kind!=='model')return null;
   const entries=payload.chatModelIdentities as Record<string,unknown>|undefined;
   const entry=entries?.[call.parentCallId] as {routeKey?:unknown;identity?:unknown}|undefined;
   if(typeof entry?.routeKey!=='string')return null;
   const identity=executionModelIdentitySchema.parse(entry.identity);
   key=entry.routeKey;
   const selected=route.data.routes[key];
   if(!selected||!['text','structured'].includes(selected.mode)||selected.capability!==identity.capability||
    !isDeepStrictEqual(identity,identityFromFrozenChatRoute(identity.capability,selected)))return null;
  }else{
   if(!['model','external_agent'].includes(call.kind)||!['text','vision'].includes(String(payload.chatModelMode)))return null;
   key=`${payload.chatModelMode}:${input.data.capability}`;
  }
  const selected=route.data.routes[key];
  return selected?.readiness==='configured'?selected:null;
 }catch{return null;}
}


const frozenObject=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** SEMANTIC_BOUNDARY_ALLOW: 仅按冻结协议的kind/skill/capability/taskType选目录键，不判断图片内容或赋予素材权限。 */
function frozenRootModelMode(payload:Record<string,unknown>,input:ReturnType<typeof workerTaskInputSchema.parse>):'text'|'vision'|'structured'{
 if(input.kind==='chat.run')return payload.chatModelMode==='vision'?'vision':'text';
 if(input.kind!=='model.structured')return 'capability' in input&&input.capability==='asset.classify'?'vision':'text';
 // 无route及v1沿原null兼容路径，不能把新facet门施加到旧任务。
 if(frozenObject(payload.executionRoute).schemaVersion!==2)return 'structured';
 let target:unknown;
 try{target=JSON.parse(input.facets.__assetProcessing??'null');}catch{/* 非分类族仍沿原消费者校验。 */}
 if(input.skillId!=='asset.classify'&&input.capability!=='asset.classify'&&frozenObject(target).taskType!=='asset.classify')return 'structured';
 const frozen=assetProcessingInputSchema.parse(target);
 if(input.skillId!=='asset.classify'||input.capability!=='asset.classify'||frozen.taskType!=='asset.classify')throw new ConflictError('MODEL_ROUTE_NOT_FROZEN');
 return 'vision';
}
type PreparationGenerationOwner={groupVersion?:number|null;membershipVersion?:number|null;id:string;kind:string;ownerType:string;ownerId:string;userId:string;accountId:string|null;groupId:string|null;payload:unknown};
// 与原bridge相同的稳定字段和顺序；列表状态变化不改变原模型输入的来源证明。
export const stableIntelligenceTopicTargetSchema=z.object({generationMode:z.enum(['rewrite_only','strategy_backed']).optional(),transformId:z.string(),item:z.object({title:z.string().nullable().optional(),authorName:z.string().nullable().optional(),platform:z.string().optional(),canonicalUrl:z.string()}),positioning:z.unknown().nullable().optional(),positioningVersionId:z.string().nullable().optional(),personalizationStatus:z.enum(['applied','not_applied']).optional(),transcript:z.object({hash:z.string(),text:z.string()})});
/** SEMANTIC_BOUNDARY_ALLOW: 仅校验原雷达任务冻结来源与归属；不选择内容，也不授予新模型提交。 */
export function frozenIntelligenceTopicGenerationBinding(task:PreparationGenerationOwner){
 try{
  const payload=frozenObject(task.payload),saved=frozenObject(payload.intelligenceGeneration),input=z.union([structuredGenerationInputSchema,intelligenceRewriteInputSchema]).parse(saved.input);
  if(task.kind!=='topic_preview'||task.ownerType!=='transform'||payload.itemId!==task.ownerId||input.operationKey!==`intelligence:${task.id}`||input.capability!=='topic.generate'||input.facets.mode!=='topic_preview'||input.skillSnapshot.userId!==task.userId||input.skillSnapshot.accountId!==task.accountId||(input.skillSnapshot.groupId??null)!==task.groupId||(input.skillSnapshot.groupVersion??null)!==(task.groupVersion??null)||(input.skillSnapshot.membershipVersion??null)!==(task.membershipVersion??null))return null;
  const raw=JSON.parse(input.facets.target??'null'),target=stableIntelligenceTopicTargetSchema.parse(raw);
  if(raw.item?.id!==task.ownerId||typeof payload.sourceSnapshotId!=='string'||raw.snapshot?.id!==payload.sourceSnapshotId||(payload.generationMode==='rewrite_only'&&target.transformId!==payload.transformId)||target.transcript.hash!==`sha256:${createHash('sha256').update(target.transcript.text).digest('hex')}`||saved.sourceDigest!==createHash('sha256').update(JSON.stringify(target)).digest('hex'))return null;
  return {target,input};
 }catch{return null;}
}
/** SEMANTIC_BOUNDARY_ALLOW: 校验持久输入与来源 hash，不理解或选择创作内容。 */
export function projectPreparationGenerationTargetForTask(task:PreparationGenerationOwner,raw:unknown){
 const parsed=projectPreparationGenerationTargetSchema.safeParse(raw),payload=frozenObject(task.payload);
 if(!parsed.success||task.kind!=='topic_preview'||task.ownerType!=='project'||payload.projectId!==task.ownerId||parsed.data.projectId!==task.ownerId||!isDeepStrictEqual(payload.source,parsed.data.source)||parsed.data.transcript.hash!==`sha256:${createHash('sha256').update(parsed.data.transcript.text).digest('hex')}`)return null;
 return parsed.data;
}
export function frozenProjectPreparationGenerationBinding(task:PreparationGenerationOwner){
 try{
  const saved=frozenObject(frozenObject(task.payload).intelligenceGeneration),input=z.union([structuredGenerationInputSchema,intelligenceRewriteInputSchema]).parse(saved.input);
  if(input.operationKey!==`intelligence:${task.id}`||input.capability!=='topic.generate'||input.facets.mode!=='topic_preview'||input.skillSnapshot.userId!==task.userId||input.skillSnapshot.accountId!==task.accountId||(input.skillSnapshot.groupId??null)!==task.groupId||(input.skillSnapshot.groupVersion??null)!==(task.groupVersion??null)||(input.skillSnapshot.membershipVersion??null)!==(task.membershipVersion??null))return null;
  const raw=JSON.parse(input.facets.target??'null'),target=projectPreparationGenerationTargetForTask(task,raw);
  if(!target||saved.sourceDigest!==createHash('sha256').update(JSON.stringify(raw)).digest('hex'))return null;
  return {target,input};
 }catch{return null;}
}
/** SEMANTIC_BOUNDARY_ALLOW: 只核原调用键、存档输入与无秘密身份，不从Worker声明或业务内容选择来源。 */
export function frozenNonChatModelBindingForCall(task:{id:string;kind:string;ownerType:string;ownerId:string;userId:string;accountId:string|null;groupId:string|null;payload:unknown},call:{executionTaskId:string;kind:string;parentCallId:string|null;operationKey:string;inputDigest:string;toolExecutionClaimId?:string|null}){
 try{
  const payload=frozenObject(task.payload),routes=executionRouteSchema.parse(payload.executionRoute);
  if(routes.schemaVersion!==2||call.executionTaskId!==task.id||call.kind!=='model'||call.parentCallId!==null||call.toolExecutionClaimId)return null;
  const visual=payload.stageKind==='video.visual-review',rawInput=visual?payload.reviewInput:payload.modelInput;
  const top=workerTaskInputSchema.safeParse(rawInput);
  const projectPreview=task.kind==='topic_preview'&&task.ownerType==='project'&&!!frozenProjectPreparationGenerationBinding(task);
  const intelligence=projectPreview||(task.kind==='topic_preview'&&task.ownerType==='transform')||(task.kind==='script_candidate'&&task.ownerType==='project');
  if(!intelligence&&(task.kind!=='ai_task'||task.ownerType!=='ai_task'||(!visual&&payload.aiTaskId!==task.ownerId)||!top.success))return null;
  if(visual&&(payload.parentAiTaskId!==task.ownerId||typeof payload.parentInputDigest!=='string'||typeof payload.requestDigest!=='string'))return null;
  const sameScope=(input:ReturnType<typeof structuredGenerationInputSchema.parse>)=>input.skillSnapshot.userId===task.userId&&input.skillSnapshot.accountId===task.accountId&&(input.skillSnapshot.groupId??null)===task.groupId;
  const selected=(mode:'text'|'structured'|'vision'|'image'|'video',capability:string,identity?:unknown,assetInput?:ReturnType<typeof assetGenerationInputSchema.parse>)=>{
   const route=routes.routes[`${mode}:${capability}`];
   if(!route||route.readiness!=='configured'||route.mode!==mode||route.capability!==capability)return null;
   if(assetInput){
    if('engine' in assetInput){
     if(route.source!=='codex'||assetInput.protocolKind!==route.identity.protocolKind||assetInput.runtimeVersion!==route.identity.runtimeVersion||(assetInput.requestedModel!==undefined&&assetInput.requestedModel!==route.identity.requestedModel))return null;
    }else if((route.source!=='official'&&route.source!=='self')||assetInput.provider!==route.identity.provider||assetInput.model!==route.identity.model||assetInput.baseUrl!==route.identity.endpoint||(route.source==='official'?assetInput.serviceId!==route.identity.serviceId:assetInput.serviceId!==undefined))return null;
   }else if(!identity||!isDeepStrictEqual(executionModelIdentitySchema.parse(identity),identityFromFrozenChatRoute(capability,route)))return null;
   return {route,mode,capability,identity,assetInput};
  };
  const matches=(operationKey:string)=>{const prefix=`${operationKey}/model/`;return call.operationKey.startsWith(prefix)&&/^[1-9][0-9]*$/.test(call.operationKey.slice(prefix.length));};
  const stage=(raw:unknown)=>{
   const saved=frozenObject(raw),parsed=z.union([structuredGenerationInputSchema,intelligenceRewriteInputSchema]).safeParse(saved.input);
   if(!parsed.success||!sameScope(parsed.data)||!matches(parsed.data.operationKey))return null;
   return selected('intelligenceText' in parsed.data?'text':'structured',parsed.data.capability,saved.identity);
  };
  if(intelligence){
   const saved=frozenObject(payload.intelligenceGeneration),parsed=z.union([structuredGenerationInputSchema,intelligenceRewriteInputSchema]).safeParse(saved.input);
   if(!parsed.success||parsed.data.operationKey!==`intelligence:${task.id}`||parsed.data.capability!==(task.kind==='topic_preview'?'topic.generate':'script.draft'))return null;
   return stage(saved);
  }
  if(!top.success)return null;
  const input=top.data;
  if(input.kind==='agentic.run'){
   // 原宿主reserveAgenticModel的唯一键，摘要来自真实call，不由Worker选择路由。
   if(!/^agentic:[a-f0-9]{64}$/.test(input.operationKey)||!/^sha256:[a-f0-9]{64}$/.test(call.inputDigest)||
    call.operationKey!==`agentic-model:${createHash('sha256').update(JSON.stringify([input.operationKey,call.inputDigest])).digest('hex')}`)return null;
   return selected('text',input.capability,payload.modelIdentity);
  }
  if(input.kind==='scheduled.flywheel'){
   const allowed:Record<string,readonly string[]>={benchmark:['benchmark.teardown'],'self.detail':['topic.attribution'],'self.metrics':['topic.attribution'],favorites:['favorites.triage','knowledge.distill']};
   const candidates=Object.entries(frozenObject(payload.flywheelStages)).map(([key,raw])=>{
    const parsed=structuredGenerationInputSchema.safeParse(frozenObject(raw).input);
    if(!parsed.success||!allowed[input.sourceKind]?.includes(parsed.data.capability)||!key.startsWith(`${parsed.data.capability==='benchmark.teardown'?'benchmark':parsed.data.capability}:`)||parsed.data.operationKey!==`flywheel:${createHash('sha256').update(JSON.stringify(key)).digest('hex')}`)return null;
    return stage(raw);
   }).filter(x=>x!==null);return candidates.length===1?candidates[0]:null;
  }
  if(input.kind==='transcribe.douyin'){
   const plans=Object.entries(frozenObject(payload.transcribePostprocess)).map(([awemeId,x])=>{
    const parsed=transcribePostprocessPlanSchema.safeParse(frozenObject(x).plan);
    if(!parsed.success||!input.awemeIds.includes(awemeId))return null;
    const {operationKey,...body}=parsed.data;
    return operationKey===`transcribe:${awemeId}/postprocess:${generationRequestDigest(body).slice(7)}`&&matches(operationKey)?parsed:null;
   }).filter((x):x is Extract<ReturnType<typeof transcribePostprocessPlanSchema.safeParse>,{success:true}>=>x!==null);
   return plans.length===1&&plans[0]!.success?selected('structured','video.subtitles',plans[0]!.data.identity):null;
  }
  if(input.kind==='model.structured'&&input.facets.__videoDecisions!==undefined){
   const frozen=videoFrozenSchema.parse(JSON.parse(input.facets.__videoDecisions));
   if(frozen.task.id!==task.ownerId||!sameScope(input))return null;
   const entries=Object.entries(frozen.modelIdentities).filter(([skill])=>{const prefix=`${input.operationKey}/video/${skill}/`;return call.operationKey.startsWith(prefix)&&/^[1-9][0-9]*\/model\/[1-9][0-9]*$/.test(call.operationKey.slice(prefix.length));});
   return entries.length===1?selected('structured',entries[0]![0],entries[0]![1]):null;
  }
  let asset=assetGenerationInputSchema.safeParse(input);
  if(input.kind==='model.structured'&&['cover.brief','graphic.card-brief'].includes(input.skillId)){
   if(input.capability!=='copy.generate'||!sameScope(input))return null;
   // 文案先于图片准备；只按已冻结的文案原调用绑定，不借用未来图片身份。
   if(matches(input.operationKey))return selected('structured',input.capability,payload.modelIdentity);
   if(call.operationKey!==`${input.operationKey}/image`)return null;
   const saved=frozenObject(payload.coverImage),value=coverImagePreparationSchema.parse(saved.value);
   if(!sameScope(input)||saved.sourceDigest!==generationRequestDigest({input})||value.input.operationKey!==`${input.operationKey}/image`||value.input.mediaKind!=='image'||value.input.capability!==(value.reference?'image.edit':'image.generate'))return null;
   if(call.operationKey===value.input.operationKey)asset={success:true,data:value.input};
  }
  if(asset.success){
   if(call.operationKey!==asset.data.operationKey||call.inputDigest!==`sha256:${createHash('sha256').update(canonicalJson(asset.data)).digest('hex')}`)return null;
   return selected(asset.data.mediaKind,asset.data.capability,undefined,asset.data);
  }
  if(input.kind==='model.generate'){
   const digest=visual?`sha256:${payload.requestDigest}`:`sha256:${createHash('sha256').update(JSON.stringify(input)).digest('hex')}`;
   if(call.operationKey!==input.operationKey||call.inputDigest!==digest)return null;
   return selected(visual||input.capability==='asset.classify'?'vision':'text',input.capability,payload.modelIdentity);
  }
  if(input.kind==='model.structured'&&sameScope(input)&&matches(input.operationKey))return selected(frozenRootModelMode(payload,input),input.capability,payload.modelIdentity);
  return null;
 }catch{return null;}
}

/** SEMANTIC_BOUNDARY_ALLOW: agentic旧strict输入没有workspace字段，只核真实业务owner/映射与原spec摘要，不做内容或能力选择。 */
export async function assertFrozenAgenticModelOwner(scope:Parameters<Parameters<ReturnType<typeof createExecutionLeaseService>["withLease"]>[2]>[0]){
 const {tx,task,context}=scope,payload=frozenObject(task.payload),input=agenticWorkerInputSchema.parse(payload.modelInput);
 const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),workspaceFilter(aiTasks,context)));
 const spec=executionTaskSpec.safeParse(frozenObject(business?.inputData).spec);
 if(task.kind!=="ai_task"||task.ownerType!=="ai_task"||!business||payload.aiTaskId!==business.id||
  business.taskType!==`exec.${input.taskType}`||business.accountId!==task.accountId||business.groupId!==task.groupId||business.groupVersion!==task.groupVersion||business.membershipVersion!==task.membershipVersion||
  !spec.success||spec.data.taskType!==input.taskType||spec.data.goal!==input.goal||
  input.operationKey!==`agentic:${createHash("sha256").update(JSON.stringify(spec.data)).digest("hex")}`)
  throw new ConflictError("Agent执行与原业务owner或冻结输入不符");
 return input;
}

/** 凭据仅在当前租约中返回；任务只保存第一次解析的无秘密模型规格。 */
export function createExecutionModelIdentityService(
  db: Db,
  deps: { now?: () => string } = {},
) {
  const leases = createExecutionLeaseService(db, deps);
  return {
    async pin(ref: ExecutionRef, capability: string, raw: unknown) {
      const { credential, identity } = prepareExecutionModelIdentity(capability, raw);
      await leases.withLease(ref, "admission", async scope => {
        const {tx,task}=scope;
        const payload = payloadSchema.parse(task.payload),
          input = workerTaskInputSchema.parse(payload.modelInput);
        if(input.kind==='agentic.run'&&frozenObject(payload.executionRoute).schemaVersion===2)await assertFrozenAgenticModelOwner(scope);
        if (task.kind !== "ai_task" || !("capability" in input) || input.capability !== capability)
          throw new ConflictError("模型能力与原任务不符");
        const own=readFrozenModelRoute(payload,frozenRootModelMode(payload,input),capability);
        if(own&&!isDeepStrictEqual(identity,identityFromFrozenChatRoute(capability,own)))throw new ConflictError('MODEL_ROUTE_IDENTITY_CHANGED');
        if (payload.modelIdentity !== undefined) {
          const existing = executionModelIdentitySchema.parse(payload.modelIdentity);
          if (!isDeepStrictEqual(existing, identity))
            throw new ConflictError("模型配置与原执行身份不符");
          return;
        }
        // 仅补充宿主执行元数据；原 modelInput 与 hostContext 及其摘要均保持原样。
        await tx
          .update(executionTasks)
          .set({ payload: { ...payload, modelIdentity: identity } })
          .where(eq(executionTasks.id, task.id));
      });
      return credential;
    },
    read(ref: ExecutionRef) {
      return leases.withLease(ref, "admission", async scope => {
        const {task}=scope;
        const payload = payloadSchema.parse(task.payload),
          input = workerTaskInputSchema.parse(payload.modelInput);
        if(input.kind==='agentic.run'&&frozenObject(payload.executionRoute).schemaVersion===2)await assertFrozenAgenticModelOwner(scope);
        if (task.kind !== "ai_task" || payload.modelIdentity === undefined)
          throw new ConflictError("任务尚未绑定真实模型身份");
        const identity = executionModelIdentitySchema.parse(payload.modelIdentity);
        if (!("capability" in input) || identity.capability !== input.capability)
          throw new ConflictError("模型身份与原任务能力不符");
        const own=readFrozenModelRoute(payload,frozenRootModelMode(payload,input),identity.capability);
        if(own&&!isDeepStrictEqual(identity,identityFromFrozenChatRoute(identity.capability,own)))throw new ConflictError('MODEL_ROUTE_IDENTITY_CHANGED');
        return identity;
      });
    },
  };
}
