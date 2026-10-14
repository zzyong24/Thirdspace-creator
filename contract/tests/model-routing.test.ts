import {assetGenerationInputSchema} from '../src/internal/asset-generation';
import {localCodexStatusSchema} from '../src/internal/local-codex-status';
import {describe, expect, it} from 'vitest';
import {modelRoutingChoicesSchema, modelRoutingPutSchema, modelRoutingResourceSchema} from '../src/internal/model-routing';
import {modelRouteCatalog,executionRouteV2Schema} from '../src/internal/model-routing';
import {frozenSelfModelIdentitySchema,projectFrozenModelSettings} from '../src/internal/model-routing';
import {executionRouteSchema,createExecutionRoute,frozenExecutionEngine,readFrozenModelRoute,frozenExecutionRoute,inheritExecutionRoute} from '../src/internal/execution-engine';

const choices = {text:'codex', vision:'official', image:'self', video:'official', audio:'local', embed:'self'} as const;

describe('T1278 按能力模型来源的公开合同', () => {
  it('Codex默认模型只接受实际ID，图像理解、生图与编辑核实状态分开',()=>{
    const actual={engine:'codex',installed:true,available:true,version:'0.159.3',loginStatus:'authenticated',defaultModelId:'fixture-model-from-list',capabilities:{text:true,imageUnderstanding:true,imageGeneration:true,imageEditing:'unverified'}};
    expect(localCodexStatusSchema.parse(actual)).toEqual(actual);
    expect(localCodexStatusSchema.safeParse({...actual,defaultModelId:''}).success).toBe(false);
  });
  it('无秘密身份拒绝嵌套headers及任意密钥参数',()=>{
    const identity={provider:'api',model:'model',apiFormat:'openai_chat',authStyle:'bearer',endpoint:null,configIdentityDigest:`sha256:${'a'.repeat(64)}`,configuration:{kind:'row',id:'config',capability:'default'}};
    expect(frozenSelfModelIdentitySchema.safeParse({...identity,settings:{headers:{Authorization:'fixture-private-token'},apiKey:'fixture-private-key'}}).success).toBe(false);
    expect(projectFrozenModelSettings({headers:{Authorization:'fixture-private-token'},apiKey:'fixture-private-key',size:'1024x1024',reasoning:true})).toEqual({size:'1024x1024',reasoning:true});
  });
  it('保留真实文本消费者structuredOutputs参数，不把协议开关当未知字段丢弃',()=>{
    expect(projectFrozenModelSettings({structuredOutputs:true,headers:{Authorization:'fixture-private-key'}})).toEqual({structuredOutputs:true});
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
  it('执行绑定与父子继承保完整v2冻结，副本不共享可变引用',()=>{
    const original=executionRouteV2Schema.parse(frozen());
    const copy=frozenExecutionRoute({executionRoute:original});
    const child=inheritExecutionRoute({executionRoute:original});
    expect(copy).toEqual(original);expect(child).toEqual(original);
    expect(copy).not.toBe(original);expect(child).not.toBe(original);
    if(child.schemaVersion!==2)throw new Error('v2被降为v1');
    child.routes['image:image.generate']={...child.routes['image:image.generate']!,readiness:'unavailable',reasonCode:'CHILD_ONLY'};
    expect(original.routes['image:image.generate']).not.toHaveProperty('reasonCode','CHILD_ONLY');
    expect(inheritExecutionRoute({executionRoute:createExecutionRoute('codex')})).toEqual(createExecutionRoute('codex','parent'));
    expect(frozenExecutionRoute({})).toEqual(createExecutionRoute('pi','legacy'));
    expect(()=>inheritExecutionRoute({executionRoute:{...original,routes:{}}})).toThrow();
  });
  it('登记目录缺项和未知项均拒绝，不读当前设置补齐',()=>{
    const route=frozen();delete route.routes['image:image.generate'];
    expect(executionRouteV2Schema.safeParse(route).success).toBe(false);
    expect(()=>readFrozenModelRoute({executionRoute:route},'image','image.generate')).toThrow('MODEL_ROUTE_NOT_FROZEN');
    expect(executionRouteV2Schema.safeParse({...frozen(),routes:{...frozen().routes,'image:unknown':{}}}).success).toBe(false);
  });
});

it('Codex图片输入保真实requestedModel，旧v1不补默认且仍strict',()=>{
 const old={kind:'asset.generate',operationKey:'asset.generate',mediaKind:'image',capability:'image.generate',prompt:'原描述',engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3'};
 expect(assetGenerationInputSchema.parse(old)).toEqual(old);
 expect(assetGenerationInputSchema.parse({...old,requestedModel:'fixture-model-list-id'})).toMatchObject({requestedModel:'fixture-model-list-id'});
 expect(assetGenerationInputSchema.safeParse({...old,requestedModel:''}).success).toBe(false);
 expect(assetGenerationInputSchema.safeParse({...old,model:'spoofed-api'}).success).toBe(false);
});

it('Codex可选模型清单来自真实model/list，旧status无清单仍合法，身份/模态不容空ID',()=>{
 const old={engine:'codex',installed:true,available:true,version:'0.159.3',loginStatus:'authenticated'};
 expect(localCodexStatusSchema.parse(old)).toEqual(old);
 expect(localCodexStatusSchema.parse({...old,availableModels:[{id:'actual-id',inputModalities:['text','image']}]})).toHaveProperty('availableModels');
 expect(localCodexStatusSchema.safeParse({...old,availableModels:[{id:'',inputModalities:[]}]}).success).toBe(false);
});
