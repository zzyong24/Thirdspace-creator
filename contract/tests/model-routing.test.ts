import {describe, expect, it} from 'vitest';
import {modelRoutingChoicesSchema, modelRoutingPutSchema, modelRoutingResourceSchema} from '../src/internal/model-routing';
import {modelRouteCatalog,executionRouteV2Schema} from '../src/internal/model-routing';
import {frozenSelfModelIdentitySchema,projectFrozenModelSettings} from '../src/internal/model-routing';
import {executionRouteSchema,createExecutionRoute,frozenExecutionEngine,readFrozenModelRoute} from '../src/internal/execution-engine';

const choices = {text:'codex', vision:'official', image:'self', video:'official', audio:'local', embed:'self'} as const;

describe('T1278 按能力模型来源的公开合同', () => {
  it('无秘密身份拒绝嵌套headers及任意密钥参数',()=>{
    const identity={provider:'api',model:'model',apiFormat:'openai_chat',authStyle:'bearer',endpoint:null,configIdentityDigest:`sha256:${'a'.repeat(64)}`,configuration:{kind:'row',id:'config',capability:'default'}};
    expect(frozenSelfModelIdentitySchema.safeParse({...identity,settings:{headers:{Authorization:'fixture-private-token'},apiKey:'fixture-private-key'}}).success).toBe(false);
    expect(projectFrozenModelSettings({headers:{Authorization:'fixture-private-token'},apiKey:'fixture-private-key',size:'1024x1024',reasoning:true})).toEqual({size:'1024x1024',reasoning:true});
  });
  it('完整保存六种用途，允许文本和图片来源不同', () => {
    expect(modelRoutingPutSchema.parse({schemaVersion:1, choices, expectedRevision:0}).choices).toEqual(choices);
  });
  it.each(['video', 'audio', 'embed'])('不将Codex宣称具备%s能力', family => {
    expect(modelRoutingChoicesSchema.safeParse({...choices, [family]:'codex'}).success).toBe(false);
  });
  it('拒绝部分更新、未知用途、负版本和秘密字段', () => {
    for(const raw of [
      {schemaVersion:1,choices:{text:'codex'},expectedRevision:0},
      {schemaVersion:1,choices:{...choices,unknown:'self'},expectedRevision:0},
      {schemaVersion:1,choices,expectedRevision:-1},
      {schemaVersion:1,choices,expectedRevision:0,secret:'never-public'},
    ]) expect(modelRoutingPutSchema.safeParse(raw).success).toBe(false);
  });
  it('旧配置可以保持null和部分有效来源，不伪造完整迁移', () => {
    const value={schemaVersion:1,revision:0,choices:null,legacyExecutionEngine:'pi',effectiveChoices:{text:'self'},capabilities:[]};
    expect(modelRoutingResourceSchema.parse(value)).toEqual(value);
    expect(modelRoutingResourceSchema.safeParse({...value,token:'never-public'}).success).toBe(false);
  });
});

describe('T1278 完整任务冻结与原v1兼容',()=>{
  const digest=`sha256:${'1'.repeat(64)}`;
  const frozen=()=>({schemaVersion:2,orchestrator:{engine:'codex',source:'preference',protocolKind:'codex-app-server',runtimeVersion:'0.159.3'},selectionRevision:3,catalogVersion:1,rootRouteDigest:digest,
    routes:Object.fromEntries(modelRouteCatalog.map(({family,...entry})=>[entry.routeKey,{...entry,source:choices[family],readiness:'unavailable',reasonCode:'MODEL_NOT_CONFIGURED'}])),
  });
  it('原strict v1逐字读回，v2编排与图片来源分开',()=>{
    const old=createExecutionRoute('codex');expect(executionRouteSchema.parse(old)).toEqual(old);
    const route=frozen();expect(executionRouteV2Schema.parse(route)).toEqual(route);
    expect(frozenExecutionEngine({executionRoute:route})).toBe('codex');
    expect(readFrozenModelRoute({executionRoute:route},'image','image.generate')).toMatchObject({source:'self'});
    expect(readFrozenModelRoute({executionRoute:old},'image','image.generate')).toBeNull();
  });
  it('登记目录缺项和未知项均拒绝，不读当前设置补齐',()=>{
    const route=frozen();delete route.routes['image:image.generate'];
    expect(executionRouteV2Schema.safeParse(route).success).toBe(false);
    expect(()=>readFrozenModelRoute({executionRoute:route},'image','image.generate')).toThrow('MODEL_ROUTE_NOT_FROZEN');
    expect(executionRouteV2Schema.safeParse({...frozen(),routes:{...frozen().routes,'image:unknown':{}}}).success).toBe(false);
  });
});
