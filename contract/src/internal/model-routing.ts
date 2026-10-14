import {z} from 'zod';

export const modelRoutingChoicesSchema=z.object({
  text:z.enum(['official','self','codex']),
  vision:z.enum(['official','self','codex']),
  image:z.enum(['official','self','codex']),
  video:z.enum(['official','self']),
  audio:z.enum(['official','self','local']),
  embed:z.enum(['official','self']),
}).strict();
export type ModelRoutingChoices=z.infer<typeof modelRoutingChoicesSchema>;
export const modelRoutingPutSchema=z.object({
  schemaVersion:z.literal(1),choices:modelRoutingChoicesSchema,
  expectedRevision:z.number().int().nonnegative().max(2_147_483_646),
}).strict();
export type ModelRoutingPut=z.infer<typeof modelRoutingPutSchema>;
export const modelRoutingCapabilitySchema=z.object({
  capability:z.string().min(1),
  mode:z.enum(['text','structured','vision','image','video','asr','embedding']),
  source:z.enum(['official','self','codex','local']).nullable(),
  status:z.enum(['ready','not_configured','unverified','unavailable']),
  reasonCode:z.string().min(1).max(128).nullable(),
}).strict();
export const modelRoutingResourceSchema=z.object({
  schemaVersion:z.literal(1),revision:z.number().int().nonnegative(),
  choices:modelRoutingChoicesSchema.nullable(),
  legacyExecutionEngine:z.enum(['pi','codex']).nullable(),
  effectiveChoices:modelRoutingChoicesSchema.partial(),
  capabilities:z.array(modelRoutingCapabilitySchema),
}).strict();
export type ModelRoutingResource=z.infer<typeof modelRoutingResourceSchema>;

export const modelRouteModeSchema=z.enum(['text','structured','vision','image','video','asr','embedding']);
export type ModelRouteMode=z.infer<typeof modelRouteModeSchema>;
export type ModelRoutingFamily=keyof ModelRoutingChoices;
export type ModelRouteCatalogEntry={routeKey:string;capability:string;mode:ModelRouteMode;family:ModelRoutingFamily};
const chatCapabilities=['topic.generate','calibration.diagnose','positioning.generate','review.insights','knowledge.distill','copilot.assist'] as const;
const structuredCapabilities=[
  'script.draft','script.hooks','planning.thesis','planning.contract','planning.outline','script.rewrite','copy.generate',
  'review.insights','review.analyze','topic.generate','topic.enrich','topic.preference','research.gather','copilot.assist',
  'calibration.diagnose','calibration.score','positioning.generate','material.match','reconstruct.project','default',
  'knowledge.classify','knowledge.distill','knowledge.relate','comment.qa-sift','video.scenes','video.cards','video.broll',
  'video.subtitles','video.director','benchmark.teardown','topic.attribution','favorites.triage',
] as const;
/** SEMANTIC_BOUNDARY_ALLOW: 登记真实消费者协议键，不按业务内容判断能力或模型来源。 */
function entries(mode:ModelRouteMode,family:ModelRoutingFamily,capabilities:readonly string[]):ModelRouteCatalogEntry[]{
  return capabilities.map(capability=>({routeKey:`${mode}:${capability}`,capability,mode,family}));
}
export const modelRouteCatalog:readonly ModelRouteCatalogEntry[]=Object.freeze([
  ...entries('text','text',[...chatCapabilities,'script.hooks','script.draft','agentic.collect','agentic.material','agentic.research','chat.fallback']),
  ...entries('structured','text',structuredCapabilities),
  ...entries('vision','vision',[...chatCapabilities,'asset.classify']),
  ...entries('image','image',['image.generate','image.edit']),
  ...entries('video','video',['video.generate']),...entries('asr','audio',['transcribe.audio']),
  ...entries('embedding','embed',['knowledge.search.embed']),
].map(entry=>Object.freeze(entry)));
const digest=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const nonempty=z.string().min(1).max(2048);
const endpoint=z.string().url().refine(value=>{
  const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash;
},'模型地址不能包含凭据或查询参数').nullable();
const positiveNumber=z.number().finite().positive().max(2_000_000_000);
const imageSize=z.string().refine(value=>{
  if(value==='auto')return true;
  const pair=/^(\d{2,5})x(\d{2,5})$/.exec(value);
  return !!pair&&Number(pair[1])>=256&&Number(pair[1])<=4096&&Number(pair[2])>=256&&Number(pair[2])<=4096;
});
// 与实际openai-images/omnihi/ASR/agentic消费者一致；没有任意嵌套对象或HTTP头通道。
export const modelRoutingSettingsSchema=z.object({
  size:imageSize.optional(),resolution:z.enum(['480p','720p','1080p']).optional(),
  aspect_ratio:z.enum(['1:1','9:16','16:9','3:4','4:3']).optional(),
  duration:z.number().finite().optional(),durationSeconds:z.number().finite().optional(),
  generate_audio:z.boolean().optional(),audio:z.boolean().optional(),prompt_max_length:z.number().finite().optional(),
  reasoning:z.boolean().optional(),contextWindow:positiveNumber.optional(),maxTokens:positiveNumber.optional(),
  maxDurationSeconds:positiveNumber.optional(),maxBytes:positiveNumber.optional(),chargeUnits:positiveNumber.optional(),
}).strict();
/** SEMANTIC_BOUNDARY_ALLOW: 只投影真实协议消费的参数类型，不判断创作内容；未知参数按原适配器忽略。 */
export function projectFrozenModelSettings(raw:unknown):z.infer<typeof modelRoutingSettingsSchema>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
  const result:Record<string,unknown>={};
  for(const [key,schema] of Object.entries(modelRoutingSettingsSchema.shape)){
    const parsed=schema.safeParse((raw as Record<string,unknown>)[key]);
    if(parsed.success&&parsed.data!==undefined)result[key]=parsed.data;
  }
  return modelRoutingSettingsSchema.parse(result);
}
const apiIdentity={provider:nonempty,model:nonempty,apiFormat:nonempty,authStyle:z.enum(['bearer','x-api-key']),endpoint,
  settings:modelRoutingSettingsSchema,configIdentityDigest:digest};
export const frozenSelfModelIdentitySchema=z.object({...apiIdentity,
  configuration:z.discriminatedUnion('kind',[
    z.object({kind:z.literal('row'),id:nonempty,capability:nonempty}).strict(),
    z.object({kind:z.literal('env'),slot:nonempty}).strict(),
  ]),
}).strict();
export const frozenOfficialModelIdentitySchema=z.object({...apiIdentity,scopeId:nonempty,serviceId:nonempty,optionId:nonempty,
  credentialLifecycle:z.enum(['persistent','per_request']),authorityRouteDigest:digest,freezeBundleDigest:digest}).strict();
export const frozenCodexModelIdentitySchema=z.object({protocolKind:z.literal('codex-app-server'),runtimeVersion:z.literal('0.159.3'),requestedModel:nonempty}).strict();
export const frozenLocalModelIdentitySchema=z.object({provider:z.literal('whisper-local'),level:nonempty,runtimeVersion:nonempty}).strict();
const frozenCommon={routeKey:nonempty,capability:nonempty,mode:modelRouteModeSchema,
  fallbackPolicy:z.literal('existing-local-asr').optional(),localFallbackIdentity:frozenLocalModelIdentitySchema.optional()};
export const frozenModelRouteSchema=z.union([
  z.object({...frozenCommon,source:z.enum(['official','self','codex','local']),readiness:z.literal('unavailable'),reasonCode:nonempty}).strict(),
  z.object({...frozenCommon,source:z.literal('official'),readiness:z.literal('configured'),identity:frozenOfficialModelIdentitySchema}).strict(),
  z.object({...frozenCommon,source:z.literal('self'),readiness:z.literal('configured'),identity:frozenSelfModelIdentitySchema}).strict(),
  z.object({...frozenCommon,source:z.literal('codex'),readiness:z.literal('configured'),identity:frozenCodexModelIdentitySchema}).strict(),
  z.object({...frozenCommon,source:z.literal('local'),readiness:z.literal('configured'),identity:frozenLocalModelIdentitySchema}).strict(),
]).superRefine((route,ctx)=>{
  const entry=modelRouteCatalog.find(item=>item.routeKey===route.routeKey);
  if(!entry||entry.mode!==route.mode||entry.capability!==route.capability){ctx.addIssue({code:'custom',message:'MODEL_ROUTE_NOT_FROZEN'});return;}
  if(!modelRoutingChoicesSchema.shape[entry.family].safeParse(route.source).success)ctx.addIssue({code:'custom',message:'MODEL_ROUTE_UNSUPPORTED'});
  if(route.fallbackPolicy!==undefined&&(route.mode!=='asr'||!route.localFallbackIdentity))ctx.addIssue({code:'custom',message:'本地回退只能绑定原ASR模型身份'});
  if(route.localFallbackIdentity!==undefined&&route.fallbackPolicy===undefined)ctx.addIssue({code:'custom',message:'本地回退身份缺策略'});
});
export type FrozenModelRoute=z.infer<typeof frozenModelRouteSchema>;
export const executionOrchestratorSchema=z.object({engine:z.enum(['pi','codex']),source:z.enum(['preference','chat-explicit','parent','legacy']),
  protocolKind:z.enum(['pi','codex-app-server']),runtimeVersion:z.string().min(1).optional(),
}).strict().refine(value=>value.protocolKind===(value.engine==='codex'?'codex-app-server':'pi'),'编排引擎与协议不符');
export const executionRouteV2Schema=z.object({schemaVersion:z.literal(2),orchestrator:executionOrchestratorSchema,
  selectionRevision:z.number().int().nonnegative(),catalogVersion:z.literal(1),rootRouteDigest:digest,
  routes:z.record(z.string(),frozenModelRouteSchema),
}).strict().superRefine((value,ctx)=>{
  const expected=new Set(modelRouteCatalog.map(item=>item.routeKey));
  if(Object.keys(value.routes).length!==expected.size||Object.entries(value.routes).some(([key,route])=>!expected.has(key)||key!==route.routeKey)||modelRouteCatalog.some(item=>!Object.hasOwn(value.routes,item.routeKey)))
    ctx.addIssue({code:'custom',message:'MODEL_ROUTE_NOT_FROZEN：能力目录必须完整且不含未知键'});
});
export type ExecutionRouteV2=z.infer<typeof executionRouteV2Schema>;
