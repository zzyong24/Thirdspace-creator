import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {
  ErrorCode,executionRouteV2Schema,frozenModelRouteSchema,frozenSelfModelIdentitySchema,frozenOfficialModelIdentitySchema,modelRoutingChoicesSchema,modelRouteCatalog,projectFrozenModelSettings,
  type ModelRoutingChoices,type ModelRouteCatalogEntry,type ModelRouteMode,type ExecutionRouteV2,
} from '@creatoros/contract';
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
  main:{mode:ModelRouteMode;capability:string};
  explicitEngine?:'pi'|'codex';
  read:SelectedModelMetadataReader;
}):Promise<ExecutionRouteV2>{
  const choices=modelRoutingChoicesSchema.parse(input.choices),key=`${input.main.mode}:${input.main.capability}`;
  const main=modelRouteCatalog.find(entry=>entry.routeKey===key);
  if(!main)throw new CapabilityModelRoutingError('MODEL_ROUTE_NOT_FROZEN',key);
  if(input.explicitEngine==='pi'&&choices[main.family]==='codex')throw new CapabilityModelRoutingError('MODEL_ROUTING_CONFLICT',key);
  if(input.explicitEngine!==undefined&&!['text','vision'].includes(main.mode))throw new CapabilityModelRoutingError('MODEL_ROUTE_UNSUPPORTED',key);
  const routes:ExecutionRouteV2['routes']={};
  for(const entry of modelRouteCatalog){
    const source=entry.routeKey===key&&input.explicitEngine==='codex'?'codex':choices[entry.family];
    const metadata=await input.read(entry,source);
    routes[entry.routeKey]=prepareSelectedModelRoute(entry,source,metadata);
  }
  const selected=routes[key]!;
  if(selected.readiness==='unavailable')throw new CapabilityModelRoutingError(selected.reasonCode,key);
  const engine=selected.source==='codex'?'codex':'pi';
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
