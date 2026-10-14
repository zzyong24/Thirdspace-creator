import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {
  ErrorCode,executionRouteV2Schema,frozenModelRouteSchema,frozenSelfModelIdentitySchema,frozenOfficialModelIdentitySchema,modelRoutingChoicesSchema,modelRouteCatalog,projectFrozenModelSettings,
  type ModelRoutingChoices,type ModelRouteCatalogEntry,type ModelRouteMode,type ExecutionRouteV2,type FrozenModelRoute,
} from '@creatoros/contract';
import type {CodexModelSpec} from '@creatoros/contract/execution-worker';
import {canonicalJson} from '../ai/canonical-json';

export class CapabilityModelRoutingError extends Error {
  readonly code=ErrorCode.ConflictError;
  readonly details:{domainCode:string;routeKey:string};
  constructor(domainCode:string,routeKey:string){super(`${domainCode}：所选模型暂不可执行，请检查该用途的模型设置。`);this.details={domainCode,routeKey};}
}
export type SelectedModelMetadata={
  status:'ready'|'not_configured'|'unverified'|'unavailable';
  reasonCode?:string|null;
  identity?:unknown;
  fallbackPolicy?:'existing-local-asr';
  localFallbackIdentity?:unknown;
};
/** 输入必须是宿主同一配置快照的元数据读端口；不得领取按次凭据、开户或探针调用模型。 */
export type SelectedModelMetadataReader=(entry:ModelRouteCatalogEntry,source:ModelRoutingChoices[ModelRouteCatalogEntry['family']])=>Promise<SelectedModelMetadata>;
function cleanIdentity(source:string,raw:unknown):unknown{
  if(!['official','self'].includes(source)||!raw||typeof raw!=='object'||Array.isArray(raw))return raw;
  const sanitized={...raw,settings:projectFrozenModelSettings((raw as Record<string,unknown>).settings)};
  const parsed=(source==='self'?frozenSelfModelIdentitySchema:frozenOfficialModelIdentitySchema).safeParse(sanitized);
  if(!parsed.success)return sanitized; // 外层strict schema给出真实错误，不能吞成合法身份。
  const {configIdentityDigest:_previous,...fields}=parsed.data;
  const selected={...fields} as Record<string,unknown>;
  if(source==='official')delete selected.freezeBundleDigest;
  return {...fields,configIdentityDigest:`sha256:${createHash('sha256').update(canonicalJson({source,...selected})).digest('hex')}`};
}


/** 无秘密配置摘要；调用者只能传入白名单配置身份，不传凭据。 */
export function selectedModelIdentityDigest(identity:unknown):string{
 return `sha256:${createHash('sha256').update(canonicalJson(identity)).digest('hex')}`;
}
/** 私有无任务生命周期（例如向量查询）与持久根复用同一严格身份投影。 */
export function prepareSelectedModelRoute(entry:ModelRouteCatalogEntry,source:ModelRoutingChoices[ModelRouteCatalogEntry['family']],metadata:SelectedModelMetadata){
 const fallback=metadata.fallbackPolicy===undefined?{}:{fallbackPolicy:metadata.fallbackPolicy,localFallbackIdentity:metadata.localFallbackIdentity};
 return frozenModelRouteSchema.parse({routeKey:entry.routeKey,capability:entry.capability,mode:entry.mode,source,...fallback,
  ...((metadata.status==='ready'||metadata.status==='unverified')&&metadata.identity!==undefined
   ?{readiness:'configured',identity:cleanIdentity(source,metadata.identity)}
   :{readiness:'unavailable',reasonCode:metadata.reasonCode??(metadata.status==='unverified'?'MODEL_CAPABILITY_UNVERIFIED':'MODEL_NOT_CONFIGURED')})});
}

/** SEMANTIC_BOUNDARY_ALLOW: 只实现用户显式来源、真实mode/能力键与不可变配置身份，不推断创作意图。 */
export async function freezeSelectedModelRoutes(input:{
  choices:ModelRoutingChoices;revision:number;
  main?:{mode:ModelRouteMode;capability:string};
  explicitEngine?:'pi'|'codex';
  read:SelectedModelMetadataReader;
}):Promise<ExecutionRouteV2>{
  const choices=modelRoutingChoicesSchema.parse(input.choices),key=input.main?`${input.main.mode}:${input.main.capability}`:null;
  const main=modelRouteCatalog.find(entry=>entry.routeKey===key);
  if(input.main&&!main)throw new CapabilityModelRoutingError('MODEL_ROUTE_NOT_FROZEN',key!);
  if(input.explicitEngine==='pi'&&main&&choices[main.family]==='codex')throw new CapabilityModelRoutingError('MODEL_ROUTING_CONFLICT',key!);
  if(input.explicitEngine!==undefined&&(!main||!['text','vision'].includes(main.mode)))throw new CapabilityModelRoutingError('MODEL_ROUTE_UNSUPPORTED',key??'root');
  const routes:ExecutionRouteV2['routes']={};
  for(const entry of modelRouteCatalog){
    const source=entry.routeKey===key&&input.explicitEngine==='codex'?'codex':choices[entry.family];
    const metadata=await input.read(entry,source);
    routes[entry.routeKey]=prepareSelectedModelRoute(entry,source,metadata);
  }
  const selected=key?routes[key]:undefined;
  if(selected?.readiness==='unavailable')throw new CapabilityModelRoutingError(selected.reasonCode,key!);
  const engine=(selected?.source??choices.text)==='codex'?'codex':'pi';
  const rootRouteDigest=`sha256:${createHash('sha256').update(canonicalJson({choices,selectionRevision:input.revision,catalogVersion:1,routes})).digest('hex')}`;
  return executionRouteV2Schema.parse({schemaVersion:2,orchestrator:{engine,source:input.explicitEngine===undefined?'preference':'chat-explicit',protocolKind:engine==='codex'?'codex-app-server':'pi',...(engine==='codex'?{runtimeVersion:'0.159.3'}:{})},selectionRevision:input.revision,catalogVersion:1,rootRouteDigest,routes});
}

/** 同一选中配置只旋转凭据不改变identity；官方整个bundle摘要仅作原冻结审计。 */
export function assertFrozenRouteIdentity(rawRoute:unknown,liveIdentity:unknown):void{
  const route=frozenModelRouteSchema.parse(rawRoute);
  if(route.readiness!=='configured')throw new CapabilityModelRoutingError(route.reasonCode,route.routeKey);
  const live=frozenModelRouteSchema.safeParse({...route,identity:cleanIdentity(route.source,liveIdentity)});
  if(!live.success||live.data.readiness!=='configured')throw new CapabilityModelRoutingError('MODEL_ROUTE_IDENTITY_CHANGED',route.routeKey);
  const comparable=(identity:unknown)=>{
    if(route.source!=='official')return identity;
    const {freezeBundleDigest:_audit,...selected}=identity as Record<string,unknown>;
    return selected;
  };
  if(!isDeepStrictEqual(comparable(cleanIdentity(route.source,route.identity)),comparable(live.data.identity)))throw new CapabilityModelRoutingError('MODEL_ROUTE_IDENTITY_CHANGED',route.routeKey);
}

import type {RequestContext} from '@creatoros/contract';
import {SECRET_DECRYPT_FAIL_SENTINEL,type ModelConfigInternal} from '../settings';
import {resolveLlmConfig,resolveDedicatedLlmConfig} from './llm/resolve';
import {resolveMultimodalSpec,resolveTranscribeSpec,type MultimodalSpec} from './multimodal/resolve';
import {resolveChannelCapabilityRoute,type ChannelModelPayload} from './channel-model-config';
import {asrExecutionIdentity} from '@creatoros/ai-worker/asr-identity';
type CapturedModelRow=Omit<ModelConfigInternal,'apiFormat'>&{id:string;capability:string;apiFormat:string};
export interface SelectedModelSnapshot {
 ctx:RequestContext;rows:readonly CapturedModelRow[];env:Record<string,string|undefined>;
 official:null|{scopeId:string;bundleDigest:string;payload:ChannelModelPayload;selections:Record<string,string|null>;credentialAvailable:Record<string,boolean>;selectionErrors?:Record<string,boolean>};
 codex:null|{available:boolean;version:string|null;errorCode?:string;defaultModelId?:string;availableModels?:Array<{id:string;inputModalities:string[]}>;capabilities?:{text:boolean;imageUnderstanding:boolean;imageGeneration:boolean;imageEditing?:'ready'|'unverified'|'unavailable'}};
}
/** SEMANTIC_BOUNDARY_ALLOW: 只复用原resolver配置优先级/真实行引用，绝不按内容或模型名称判断用途。 */
export function createSelectedModelSnapshotReader(input:SelectedModelSnapshot):SelectedModelMetadataReader{
 const snapshot=structuredClone(input),rows=new Map(snapshot.rows.map(row=>[row.capability,row]));
 const secret=(row:Pick<ModelConfigInternal,'secretValue'|'secretReference'>|null)=>{
  if(!row||row.secretValue===SECRET_DECRYPT_FAIL_SENTINEL)return '';
  const ref=/^env:(.+)$/.exec(row.secretReference.trim());
  return row.secretValue?.trim()||(ref?snapshot.env[ref[1]!]?.trim():'')||'';
 };
 const local=async()=>{
  const spec=await resolveTranscribeSpec(snapshot.ctx,{env:snapshot.env,getModelConfig:async()=>null},'local');
  return {provider:'whisper-local' as const,level:spec.model,runtimeVersion:asrExecutionIdentity(spec,null).protocol};
 };
 return async(entry,source)=>{
  let fallback:Pick<SelectedModelMetadata,'fallbackPolicy'|'localFallbackIdentity'>={};
  if(entry.mode==='asr'&&source!=='local')fallback={fallbackPolicy:'existing-local-asr',localFallbackIdentity:await local()};
  const unavailable=(reasonCode='MODEL_NOT_CONFIGURED',status:SelectedModelMetadata['status']='not_configured'):SelectedModelMetadata=>({...fallback,status,reasonCode});
  try{
   if(source==='codex'){
    // SEMANTIC_BOUNDARY_ALLOW: 原可选备用消费者只支持stream；Codex原生turn不能冒充该协议。
    if(entry.capability==='chat.fallback')return unavailable('MODEL_ROUTE_UNSUPPORTED','unavailable');
    const status=snapshot.codex;
    if(!status?.available)return unavailable(status?.errorCode??(status?'CODEX_LOGIN_REQUIRED':'CODEX_STATUS_UNAVAILABLE'),'unavailable');
    if(status.version!=='0.159.3')return unavailable('CODEX_VERSION_UNSUPPORTED','unavailable');
    if(!status.defaultModelId)return unavailable('CODEX_CAPABILITY_UNVERIFIED','unverified');
    const supported=entry.mode==='vision'?status.capabilities?.imageUnderstanding:entry.mode==='image'?status.capabilities?.imageGeneration:status.capabilities?.text;
    if(supported!==true)return unavailable('CODEX_CAPABILITY_UNAVAILABLE','unavailable');
    if(entry.capability==='image.edit'&&status.capabilities?.imageEditing==='unavailable')return unavailable('CODEX_IMAGE_CAPABILITY_UNAVAILABLE','unavailable');
    return {status:entry.capability==='image.edit'&&status.capabilities?.imageEditing!=='ready'?'unverified':'ready',identity:{protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:status.defaultModelId}};
   }
   if(source==='local')return entry.mode==='asr'?{status:'unverified',reasonCode:'LOCAL_ASR_CAPABILITY_UNVERIFIED',identity:await local()}:unavailable('MODEL_ROUTE_UNSUPPORTED','unavailable');
   const capability=entry.mode==='vision'?'asset.classify':entry.capability==='review.analyze'?'review.insights':entry.capability;
   if(source==='official'){
    const official=snapshot.official;if(!official)return unavailable();
    const allowDefaultFallback=(entry.mode==='text'||entry.mode==='structured')&&capability!=='chat.fallback';
    const models=official.payload.models;
    const selectionCapability=models&&typeof models==='object'&&!Array.isArray(models)&&Object.hasOwn(models,capability)?capability:allowDefaultFallback?'default':capability;
    if(official.selectionErrors?.[selectionCapability])return unavailable('MODEL_CREDENTIAL_UNAVAILABLE');
    const route=resolveChannelCapabilityRoute(official.payload,capability,{allowDefaultFallback,selectedOptionId:official.selections[selectionCapability]??null});
    if(!route?.serviceId||!route.optionId||!route.credentialLifecycle)return unavailable();
    if(route.credentialLifecycle==='persistent'&&!route.inlineToken&&!official.credentialAvailable[route.serviceId])return unavailable('MODEL_CREDENTIAL_UNAVAILABLE');
    const classifier=entry.mode==='vision'&&entry.capability==='asset.classify',apiFormat=classifier?'openai_chat':route.apiFormat,endpoint=classifier?(route.baseUrl??'https://api.siliconflow.cn/v1'):route.baseUrl;
    const fields={provider:route.provider,model:route.model,apiFormat,authStyle:apiFormat==='anthropic'&&!endpoint?'x-api-key':'bearer',endpoint,settings:projectFrozenModelSettings(route.settings),scopeId:official.scopeId,serviceId:route.serviceId,optionId:route.optionId,credentialLifecycle:route.credentialLifecycle};
    const metadata={...fallback,status:route.credentialLifecycle==='per_request'?'unverified' as const:'ready' as const,identity:{...fields,authorityRouteDigest:selectedModelIdentityDigest(fields),freezeBundleDigest:official.bundleDigest,configIdentityDigest:selectedModelIdentityDigest({})}};
    const checked=prepareSelectedModelRoute(entry,source,metadata);
    return checked.readiness==='configured'?{...metadata,identity:checked.identity}:unavailable();
   }
   const access={last:null as CapturedModelRow|null,key:''};
   const getModelConfig=async(_ctx:RequestContext,key:string):Promise<ModelConfigInternal|null>=>{
    access.key=key;access.last=rows.get(key)??null;if(!access.last)return null;
    // 解密失败不是可派发的token；沿同源原优先级继续，身份只记录真正可用的命中。
    if(entry.mode!=='text'&&entry.mode!=='structured'&&access.last.secretValue===SECRET_DECRYPT_FAIL_SENTINEL){access.last=null;return null;}
    if((entry.mode==='text'||entry.mode==='structured')&&!['anthropic','openai_chat','openai_responses'].includes(access.last.apiFormat))throw new Error('MODEL_ROUTE_UNSUPPORTED');
    // 原多模态resolver不读取apiFormat；原行值仍保留在无秘密identity，不编默认协议。
    return {...access.last,apiFormat:access.last.apiFormat as ModelConfigInternal['apiFormat']};
   };
   let config:{provider?:string;model:string;apiFormat?:string;baseUrl?:string|null;authStyle?:'bearer'|'x-api-key';settings?:Record<string,unknown>;token:string}|null;
   if(entry.mode==='text'||entry.mode==='structured')config=await(capability==='chat.fallback'?resolveDedicatedLlmConfig:resolveLlmConfig)(snapshot.ctx,capability,{getModelConfig,env:snapshot.env},'self');
   else if(entry.mode==='embedding'){
    const row=await getModelConfig(snapshot.ctx,capability);
    config=row&&secret(row)?{provider:row.provider,model:row.modelName,apiFormat:row.apiFormat,baseUrl:row.baseUrl,settings:row.settings,authStyle:'bearer',token:secret(row)}:null;
   }else config=await resolveMultimodalSpec(snapshot.ctx,capability as 'asset.classify'|'image.generate'|'image.edit'|'video.generate'|'transcribe.audio',{getModelConfig,env:snapshot.env},'self');
   if(!config)return unavailable();
   const row=secret(access.last)?access.last:null;
   let slot:string;
   if(entry.mode==='text'||entry.mode==='structured'){
    const ref=/^env:(.+)$/.exec(snapshot.env.CREATOROS_LLM_SECRET_REF?.trim()??'');
    slot=ref&&snapshot.env[ref[1]!]?.trim()?'CREATOROS_LLM_SECRET_REF':'ANTHROPIC_API_KEY';
   }else{
    const envSlots:Record<string,string>={'image.generate':'CREATOROS_IMAGE_SECRET_REF','image.edit':'CREATOROS_IMAGE_EDIT_SECRET_REF','video.generate':'CREATOROS_VIDEO_SECRET_REF','transcribe.audio':'CREATOROS_ASR_SECRET_REF','asset.classify':'CREATOROS_VISION_SECRET_REF'};
    slot=capability==='image.edit'&&access.key==='image.default'?'CREATOROS_IMAGE_SECRET_REF':envSlots[capability]??capability;
   }
   // SEMANTIC_BOUNDARY_ALLOW: 素材分类的既有Worker固定OpenAI协议/默认地址；带图聊天使用明确配置协议。
   const classifier=entry.mode==='vision'&&entry.capability==='asset.classify';
   const apiFormat=classifier?'openai_chat':config.apiFormat??row?.apiFormat??(entry.mode==='vision'?'openai_chat':config.provider);
   const endpoint=classifier?(config.baseUrl??'https://api.siliconflow.cn/v1'):config.baseUrl??null;
   const authStyle=entry.mode==='vision'?(apiFormat==='anthropic'&&endpoint===null?'x-api-key':'bearer'):config.authStyle??'bearer';
   const identity={provider:config.provider??row?.provider??config.apiFormat,model:config.model,apiFormat,authStyle,endpoint,settings:projectFrozenModelSettings(config.settings??row?.settings),configuration:row?{kind:'row',id:row.id,capability:row.capability}:{kind:'env',slot},configIdentityDigest:selectedModelIdentityDigest({})};
   const metadata={...fallback,status:'ready' as const,identity};
   const checked=prepareSelectedModelRoute(entry,source,metadata);
   return checked.readiness==='configured'?{...metadata,identity:checked.identity}:unavailable();
  }catch{return unavailable('MODEL_CONFIGURATION_UNAVAILABLE');}
 };
}


/** 只在可信宿主实际派发前调用；返回值含秘密，不得写runtimeData/任务/日志或跨队列持有。 */
export interface FrozenModelCredentialPorts {
  /** 仅ASR原prepareSpec拿到音频/intent后领取短效Key；前面的配置捕获不产生付费租约。 */
  deferAsrPerRequest?:true;
  readSnapshot(ctx:RequestContext,route:Extract<FrozenModelRoute,{readiness:'configured'}>,signal?:AbortSignal):Promise<SelectedModelSnapshot>;
  readOfficialPersistent(ctx:RequestContext,identity:Extract<FrozenModelRoute,{source:'official';readiness:'configured'}>['identity'],signal?:AbortSignal):Promise<string|null>;
  /** 由owner绑定原intent/audioBytes/idempotencyKey/deadline；不得隐式创建新任务或本地回退。 */
  acquireOfficialPerRequest(ctx:RequestContext,identity:Extract<FrozenModelRoute,{source:'official';readiness:'configured'}>['identity'],signal?:AbortSignal):Promise<{token:string;model:string;baseUrl:string}>;
}
/** canonical私有凭据：消费者按实际协议投影，不从模型名猜格式。 */
export type FrozenModelCredential =
 |{kind:'codex';spec:CodexModelSpec&{requestedModel:string}}
 |{kind:'local';spec:MultimodalSpec}
 |{kind:'asr-pending-lease';spec:{provider:string;apiFormat:string;authStyle:'bearer'|'x-api-key';model:string;baseUrl:string|null;token:'';settings:Record<string,unknown>;displayModelKey:'channel-managed';credentialLifecycle:'per_request';serviceId:string}}
 |{kind:'api';mode:ModelRouteMode;spec:{provider:string;apiFormat:string;authStyle:'bearer'|'x-api-key';model:string;baseUrl:string|null;token:string;settings:Record<string,unknown>;displayModelKey?:'channel-managed';credentialLifecycle?:'persistent'|'per_request';serviceId?:string}};

function frozenCredentialError(route:FrozenModelRoute,code:string):never{
 throw new CapabilityModelRoutingError(code,route.routeKey);
}
function referencedEnvironment(route:Extract<FrozenModelRoute,{source:'self';readiness:'configured'}>,snapshot:SelectedModelSnapshot):Record<string,string|undefined>{
 const reference=route.identity.configuration;
 if(reference.kind==='row'){
  const row=snapshot.rows.find(value=>value.id===reference.id&&value.capability===reference.capability);
  if(!row)return frozenCredentialError(route,'MODEL_ROUTE_IDENTITY_CHANGED');
  const name=/^env:(.+)$/.exec(row.secretReference.trim())?.[1];
  // DB身份固定；仅带回该行凭据引用，不让全局env替代失效的冻结行。
  return name?{[name]:snapshot.env[name]}:{};
 }
 const allowed:Record<string,readonly ModelRouteMode[]>={
  CREATOROS_LLM_SECRET_REF:['text','structured'],ANTHROPIC_API_KEY:['text','structured'],
  CREATOROS_IMAGE_SECRET_REF:['image'],CREATOROS_IMAGE_EDIT_SECRET_REF:['image'],
  CREATOROS_VIDEO_SECRET_REF:['video'],CREATOROS_ASR_SECRET_REF:['asr'],CREATOROS_VISION_SECRET_REF:['vision'],
 };
 if(!allowed[reference.slot]?.includes(route.mode))return frozenCredentialError(route,'MODEL_ROUTE_UNSUPPORTED');
 if(reference.slot==='ANTHROPIC_API_KEY')return {ANTHROPIC_API_KEY:snapshot.env.ANTHROPIC_API_KEY};
 const prefix=reference.slot.slice(0,-'SECRET_REF'.length),env:Record<string,string|undefined>={};
 for(const suffix of ['SECRET_REF','MODEL','BASE_URL','API_FORMAT','AUTH_STYLE','PROVIDER'])env[prefix+suffix]=snapshot.env[prefix+suffix];
 const name=/^env:(.+)$/.exec(snapshot.env[reference.slot]?.trim()??'')?.[1];
 if(name)env[name]=snapshot.env[name];
 return env;
}
function currentRowToken(row:CapturedModelRow,env:Record<string,string|undefined>):string{
 if(row.secretValue===SECRET_DECRYPT_FAIL_SENTINEL)return '';
 const name=/^env:(.+)$/.exec(row.secretReference.trim())?.[1];
 return row.secretValue?.trim()||(name?env[name]?.trim():'')||'';
}
/** 原option必须仍在原能力允许的目录中；移除时不能借唯一default替换。 */
function referencedOfficialSnapshot(route:Extract<FrozenModelRoute,{source:'official';readiness:'configured'}>,snapshot:SelectedModelSnapshot):SelectedModelSnapshot{
 const official=snapshot.official,identity=route.identity;
 if(!official||official.scopeId!==identity.scopeId)return frozenCredentialError(route,'MODEL_ROUTE_IDENTITY_CHANGED');
 const capability=route.mode==='vision'?'asset.classify':route.capability==='review.analyze'?'review.insights':route.capability;
 const canDefault=(route.mode==='text'||route.mode==='structured')&&capability!=='chat.fallback';
 const models=official.payload.models;
 if(!models||typeof models!=='object'||Array.isArray(models))return frozenCredentialError(route,'MODEL_ROUTE_IDENTITY_CHANGED');
 const pools=[...new Set([capability,...(canDefault?['default']:[])])];
 const options=pools.flatMap(key=>{
  const value=(models as Record<string,unknown>)[key];
  return Array.isArray(value)?value.filter((item):item is Record<string,unknown>=>!!item&&typeof item==='object'&&!Array.isArray(item)&&(item as Record<string,unknown>).id===identity.optionId):[];
 });
 if(options.length!==1)return frozenCredentialError(route,'MODEL_ROUTE_IDENTITY_CHANGED');
 return {...snapshot,rows:[],env:{},official:{...official,
  // 窄化为原option；parser不再有任何default选项可替换原引用。
  payload:{...official.payload,models:{[capability]:options}},selections:{[capability]:identity.optionId},selectionErrors:{},
  // 先核无秘密identity，再由原scope/service端口取得当前凭据。
  credentialAvailable:{[identity.serviceId]:true},
 }};
}
/** SEMANTIC_BOUNDARY_ALLOW: 只核冻结引用、当前协议身份和凭据，不理解意图、不选模型或来源。 */
export async function resolveFrozenModelCredential(ctx:RequestContext,rawRoute:FrozenModelRoute,ports:FrozenModelCredentialPorts,signal?:AbortSignal):Promise<FrozenModelCredential>{
 signal?.throwIfAborted();
 const route=frozenModelRouteSchema.parse(rawRoute);
 if(route.readiness!=='configured')return frozenCredentialError(route,route.reasonCode);
 // callback必须由实际dispatch调用，不能在排队前创建带token的长期resolver。
 const snapshot=structuredClone(await ports.readSnapshot(ctx,route,signal));signal?.throwIfAborted();
 if(snapshot.ctx.userId!==ctx.userId||snapshot.ctx.accountId!==ctx.accountId||snapshot.ctx.groupId!==ctx.groupId)return frozenCredentialError(route,'MODEL_ROUTE_IDENTITY_CHANGED');
 const entry=modelRouteCatalog.find(value=>value.routeKey===route.routeKey)!;
 let bounded:SelectedModelSnapshot;
 if(route.source==='self'){
  const reference=route.identity.configuration;
  const rows=reference.kind==='row'?snapshot.rows.filter(value=>value.id===reference.id&&value.capability===reference.capability):[];
  if(reference.kind==='row'&&rows.length!==1)return frozenCredentialError(route,'MODEL_ROUTE_IDENTITY_CHANGED');
  bounded={...snapshot,rows,env:referencedEnvironment(route,snapshot),official:null,codex:null};
 }else if(route.source==='official')bounded=referencedOfficialSnapshot(route,snapshot);
 else if(route.source==='local')bounded={...snapshot,rows:[],env:{CREATOROS_WHISPER_LEVEL:route.identity.level},official:null,codex:null};
 else{
  const status=snapshot.codex;
  if(status?.availableModels!==undefined){
   const original=status.availableModels.filter(model=>model.id===route.identity.requestedModel);
   if(original.length!==1)return frozenCredentialError(route,'MODEL_ROUTE_IDENTITY_CHANGED');
   // 仅从实际model/list按原ID投影身份/模态；当前默认选择不替换原任务。
   bounded={...snapshot,rows:[],env:{},official:null,codex:{...status,defaultModelId:original[0]!.id,...(status.capabilities?{capabilities:{...status.capabilities,imageUnderstanding:original[0]!.inputModalities.includes('image')}}:{})}};
  }else bounded={...snapshot,rows:[],env:{},official:null};
 }
 const metadata=await createSelectedModelSnapshotReader(bounded)(entry,route.source);signal?.throwIfAborted();
 if(!metadata.identity)return frozenCredentialError(route,metadata.reasonCode??'MODEL_CREDENTIAL_UNAVAILABLE');
 assertFrozenRouteIdentity(route,metadata.identity);
 if(route.source==='codex')return {kind:'codex',spec:{engine:'codex',...route.identity}};
 if(route.source==='local')return {kind:'local',spec:{provider:'whisper-local',model:route.identity.level,baseUrl:null,token:'',kind:'audio'}};
 if(route.source==='official'&&route.mode==='asr'&&route.identity.credentialLifecycle==='per_request'&&ports.deferAsrPerRequest){
  const identity=route.identity;
  return {kind:'asr-pending-lease',spec:{provider:identity.provider,apiFormat:identity.apiFormat,authStyle:identity.authStyle,model:identity.model,baseUrl:identity.endpoint,token:'',settings:projectFrozenModelSettings(identity.settings),displayModelKey:'channel-managed',credentialLifecycle:'per_request',serviceId:identity.serviceId}};
 }
 let token:string;
 if(route.source==='self'){
  const reference=route.identity.configuration;
  if(reference.kind==='row')token=currentRowToken(bounded.rows[0]!,bounded.env);
  else if(reference.slot==='ANTHROPIC_API_KEY')token=bounded.env.ANTHROPIC_API_KEY?.trim()??'';
  else {const name=/^env:(.+)$/.exec(bounded.env[reference.slot]?.trim()??'')?.[1];token=name?bounded.env[name]?.trim()??'':'';}
 }else if(route.identity.credentialLifecycle==='persistent'){
  // 当前原scope明确缺Key/服务不可用时不能读回保留的旧Key；identity窄化不授予凭据可用权。
  if(snapshot.official?.credentialAvailable[route.identity.serviceId]===false)return frozenCredentialError(route,'MODEL_CREDENTIAL_UNAVAILABLE');
  token=(await ports.readOfficialPersistent(ctx,route.identity,signal))?.trim()??'';
 }else{
  // 完整identity核对之后才沿原owner端口领一次短效Key。
  const lease=await ports.acquireOfficialPerRequest(ctx,route.identity,signal);
  if(lease.model!==route.identity.model||lease.baseUrl!==route.identity.endpoint)return frozenCredentialError(route,'MODEL_ROUTE_IDENTITY_CHANGED');
  token=lease.token.trim();
 }
 signal?.throwIfAborted();
 if(!token||token===SECRET_DECRYPT_FAIL_SENTINEL)return frozenCredentialError(route,'MODEL_CREDENTIAL_UNAVAILABLE');
 const identity=route.identity;
 return {kind:'api',mode:route.mode,spec:{provider:identity.provider,apiFormat:identity.apiFormat,authStyle:identity.authStyle,model:identity.model,baseUrl:identity.endpoint,token,settings:projectFrozenModelSettings(identity.settings),
  ...(route.source==='official'?{displayModelKey:'channel-managed' as const,credentialLifecycle:route.identity.credentialLifecycle,serviceId:route.identity.serviceId}:{})}};
}
