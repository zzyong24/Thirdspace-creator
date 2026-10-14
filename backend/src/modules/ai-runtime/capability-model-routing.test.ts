import {describe,expect,it,vi} from 'vitest';
import {resolveLlmConfig} from './llm/resolve';
import {resolveMultimodalSpec,resolveTranscribeSpec} from './multimodal/resolve';
import {freezeSelectedModelRoutes,assertFrozenRouteIdentity} from './capability-model-routing';
import {modelRouteCatalog,type ModelRouteCatalogEntry} from '@creatoros/contract';
const ctx={userId:'routing-source-owner',requestId:'routing-source',source:'user' as const};
const row={provider:'openai',modelName:'self-test-model',apiFormat:'openai_chat' as const,baseUrl:'https://self.example/v1',secretReference:'',secretValue:'self-private',settings:{}};

describe('T1278 真实既有resolver按显式来源解析，禁止跨源',()=>{
  it('文本self完全不读取官方目录或官方凭据',async()=>{
    const channel=vi.fn(async()=>{throw Error('不应访问官方目录');});
    const credential=vi.fn(async()=>'official-private');
    const value=await resolveLlmConfig(ctx,'script.draft',{env:{},getModelConfig:async()=>row,getChannelModelConfig:channel,getChannelModelCredential:credential},'self');
    expect(value).toMatchObject({model:'self-test-model',token:'self-private'});
    expect(channel).not.toHaveBeenCalled();expect(credential).not.toHaveBeenCalled();
  });
  it('文本official缺目录时拒绝，即使self/env可用也不越源',async()=>{
    const self=vi.fn(async()=>row);
    await expect(resolveLlmConfig(ctx,'script.draft',{env:{ANTHROPIC_API_KEY:'env-private'},getChannelModelConfig:async()=>null,getModelConfig:self},'official')).rejects.toThrow('官方');
    expect(self).not.toHaveBeenCalled();
  });
  it('图片self编辑只复用同源生图配置，不受另一官方目录覆盖',async()=>{
    const channel=vi.fn(async()=>{throw Error('不应访问官方目录');});
    const value=await resolveMultimodalSpec(ctx,'image.edit',{env:{},getChannelModelConfig:channel,getModelConfig:async(_c,cap)=>cap==='image.generate'?row:null},'self');
    expect(value).toMatchObject({provider:'openai',model:'self-test-model',token:'self-private'});
    expect(channel).not.toHaveBeenCalled();
  });
  it('图片official缺能力时不调用已配self',async()=>{
    const self=vi.fn(async()=>row);
    await expect(resolveMultimodalSpec(ctx,'image.generate',{env:{},getChannelModelConfig:async()=>null,getModelConfig:self},'official')).rejects.toThrow('官方');
    expect(self).not.toHaveBeenCalled();
  });
  it('显式local语音不读任何云配置；legacy仍保持原Whisper降级',async()=>{
    const self=vi.fn(async()=>{throw Error('不应访问云配置');});
    const channel=vi.fn(async()=>{throw Error('不应访问官方目录');});
    const deps={env:{},getModelConfig:self,getChannelModelConfig:channel};
    expect(await resolveTranscribeSpec(ctx,deps,'local')).toMatchObject({provider:'whisper-local',kind:'audio',token:''});
    expect(self).not.toHaveBeenCalled();expect(channel).not.toHaveBeenCalled();
    expect(await resolveTranscribeSpec(ctx,deps)).toMatchObject({provider:'whisper-local',kind:'audio'});
  });
});

describe('T1278 完整冻结只访问用户选择的来源',()=>{
 const choices={text:'codex',vision:'self',image:'official',video:'self',audio:'local',embed:'self'} as const;
 const codex={protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'actual-default-from-model-list'};
 const digest=`sha256:${'a'.repeat(64)}`;
 it('未使用能力缺失不会阻断文本，完整map仍保不可用事实',async()=>{
  const read=vi.fn(async(_entry:ModelRouteCatalogEntry,source:string)=>source==='codex'?{status:'ready' as const,identity:codex}:{status:'not_configured' as const,reasonCode:'MODEL_NOT_CONFIGURED'});
  const route=await freezeSelectedModelRoutes({choices,revision:2,main:{mode:'text',capability:'topic.generate'},read});
  expect(Object.keys(route.routes)).toHaveLength(modelRouteCatalog.length);
  expect(route.routes['image:image.generate']).toMatchObject({source:'official',readiness:'unavailable'});
  expect(route.orchestrator.engine).toBe('codex');
  for(const [entry,source] of read.mock.calls)expect(source).toBe(choices[entry.family]);
 });
 it('当前必需能力不可用时给原原因，不尝试另一来源',async()=>{
  const read=vi.fn(async()=>({status:'unavailable' as const,reasonCode:'CODEX_LOGIN_REQUIRED'}));
  await expect(freezeSelectedModelRoutes({choices,revision:2,main:{mode:'text',capability:'topic.generate'},read})).rejects.toMatchObject({details:{domainCode:'CODEX_LOGIN_REQUIRED',routeKey:'text:topic.generate'}});
 });
 it('显式pi不猜API来源，显式codex只覆盖当轮主调用',async()=>{
  const read=vi.fn(async()=>({status:'ready' as const,identity:codex}));
  await expect(freezeSelectedModelRoutes({choices,revision:2,main:{mode:'text',capability:'topic.generate'},explicitEngine:'pi',read})).rejects.toMatchObject({details:{domainCode:'MODEL_ROUTING_CONFLICT'}});
  expect(read).not.toHaveBeenCalled();
 });
 it('官方其它目录变化不等于选中身份改变，选中模型变化仍拒绝',()=>{
  const identity={provider:'api',model:'one',apiFormat:'openai_chat',authStyle:'bearer',endpoint:'https://official.example/v1',settings:{},configIdentityDigest:digest,scopeId:'scope',serviceId:'service',optionId:'option',credentialLifecycle:'persistent',authorityRouteDigest:digest,freezeBundleDigest:digest};
  const route={routeKey:'image:image.generate',capability:'image.generate',mode:'image',source:'official',readiness:'configured',identity};
  expect(()=>assertFrozenRouteIdentity(route,{...identity,freezeBundleDigest:`sha256:${'b'.repeat(64)}`})).not.toThrow();
  expect(()=>assertFrozenRouteIdentity(route,{...identity,settings:{headers:{Authorization:'rotated-private'},apiKey:'rotated-private'}})).not.toThrow();
  expect(()=>assertFrozenRouteIdentity(route,{...identity,model:'two'})).toThrow('MODEL_ROUTE_IDENTITY_CHANGED');
 });
});
