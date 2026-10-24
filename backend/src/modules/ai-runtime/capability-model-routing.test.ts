import {describe,expect,it,vi} from 'vitest';
import {SECRET_DECRYPT_FAIL_SENTINEL} from '../settings';
import {resolveLlmConfig} from './llm/resolve';
import {resolveMultimodalSpec,resolveTranscribeSpec} from './multimodal/resolve';
import {freezeSelectedModelRoutes,assertFrozenRouteIdentity,createSelectedModelSnapshotReader,resolveFrozenModelCredential,type SelectedModelSnapshot} from './capability-model-routing';
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
  await expect(freezeSelectedModelRoutes({choices,revision:2,main:{mode:'text',capability:'topic.generate'},explicitEngine:'pi',read})).rejects.toThrow('选择 Codex 引擎');
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

describe('T1278 原resolver同一配置快照的无秘密元数据',()=>{
 it('真实命中default行与同源图片编辑回退，调用者后续修改不替换已捕获行',async()=>{
  const rows=[{...row,id:'row-default',capability:'default',settings:{structuredOutputs:true}},{...row,id:'row-image',capability:'image.generate'}];
  const read=createSelectedModelSnapshotReader({ctx,rows,env:{},official:null,codex:null});
  rows[0]!.modelName='changed-after-capture';
  const text=await read(modelRouteCatalog.find(e=>e.routeKey==='structured:script.draft')!,'self');
  expect(text).toMatchObject({status:'ready',identity:{model:'self-test-model',configuration:{kind:'row',id:'row-default',capability:'default'},settings:{structuredOutputs:true}}});
  expect(JSON.stringify(text)).not.toContain('self-private');
  expect(await read(modelRouteCatalog.find(e=>e.routeKey==='image:image.edit')!,'self')).toMatchObject({identity:{configuration:{id:'row-image',capability:'image.generate'}}});
 },180_000);
 it('Codex默认ID与local档位来自真实捕获，缺默认ID不伪造，官方缺失不借自配',async()=>{
  const read=createSelectedModelSnapshotReader({ctx,rows:[{...row,id:'row-default',capability:'default'}],env:{CREATOROS_WHISPER_LEVEL:'tiny'},official:null,codex:{available:true,version:'0.159.3',capabilities:{text:true,imageUnderstanding:true,imageGeneration:true}}});
  const text=modelRouteCatalog.find(e=>e.routeKey==='text:topic.generate')!;
  expect(await read(text,'codex')).toMatchObject({status:'unverified',reasonCode:'CODEX_CAPABILITY_UNVERIFIED'});
  expect(await read(text,'official')).toMatchObject({status:'not_configured'});
  expect(await read(modelRouteCatalog.find(e=>e.routeKey==='asr:transcribe.audio')!,'local')).toMatchObject({identity:{provider:'whisper-local',level:'tiny',runtimeVersion:'whisper-local.v1'}});
 },180_000);
 it('自配env沿原解析并冻结真实配置slot；秘密旋转不改变元数据身份',async()=>{
  const entry=modelRouteCatalog.find(e=>e.routeKey==='structured:script.draft')!;
  const env={CREATOROS_LLM_SECRET_REF:'env:FIXTURE_KEY',FIXTURE_KEY:'first-private',CREATOROS_LLM_MODEL:'actual-env-model',CREATOROS_LLM_API_FORMAT:'openai_chat',CREATOROS_LLM_BASE_URL:'https://fixture.invalid/v1'};
  const a=await createSelectedModelSnapshotReader({ctx,rows:[],env,official:null,codex:null})(entry,'self');
  const b=await createSelectedModelSnapshotReader({ctx,rows:[],env:{...env,FIXTURE_KEY:'rotated-private'},official:null,codex:null})(entry,'self');
  expect(a).toMatchObject({status:'ready',identity:{model:'actual-env-model',configuration:{kind:'env',slot:'CREATOROS_LLM_SECRET_REF'}}});
  expect(a.identity).toEqual(b.identity);expect(JSON.stringify(a)).not.toContain('first-private');
 },180_000);
});

it('通用任务创建只冻结完整map，不用虚构default主能力阻断已有专配步骤',async()=>{
 const choices={text:'self',vision:'self',image:'self',video:'self',audio:'local',embed:'self'} as const;
 const read=createSelectedModelSnapshotReader({ctx,rows:[{...row,id:'script-only',capability:'script.draft'}],env:{},official:null,codex:null});
 const root=await freezeSelectedModelRoutes({choices,revision:1,read});
 expect(root.routes['structured:script.draft']).toMatchObject({readiness:'configured',identity:{configuration:{id:'script-only'}}});
 expect(root.routes['structured:default']).toMatchObject({readiness:'unavailable'});
 expect(Object.keys(root.routes)).toHaveLength(modelRouteCatalog.length);
},180_000);

it('编辑仅复用生图env时保存实际生成slot，独立编辑env仍优先',async()=>{
 const env={CREATOROS_IMAGE_SECRET_REF:'env:FIXTURE_IMAGE',FIXTURE_IMAGE:'private-image',CREATOROS_IMAGE_MODEL:'fixture-image',CREATOROS_IMAGE_PROVIDER:'openai',CREATOROS_IMAGE_BASE_URL:'https://fixture.invalid/v1'};
 const entry=modelRouteCatalog.find(e=>e.routeKey==='image:image.edit')!;
 expect(await createSelectedModelSnapshotReader({ctx,rows:[],env,official:null,codex:null})(entry,'self')).toMatchObject({status:'ready',identity:{configuration:{kind:'env',slot:'CREATOROS_IMAGE_SECRET_REF'}}});
 const explicit={...env,CREATOROS_IMAGE_EDIT_SECRET_REF:'env:FIXTURE_IMAGE',CREATOROS_IMAGE_EDIT_MODEL:'fixture-edit',CREATOROS_IMAGE_EDIT_PROVIDER:'openai',CREATOROS_IMAGE_EDIT_BASE_URL:'https://fixture.invalid/v1'};
 expect(await createSelectedModelSnapshotReader({ctx,rows:[],env:explicit,official:null,codex:null})(entry,'self')).toMatchObject({status:'ready',identity:{model:'fixture-edit',configuration:{slot:'CREATOROS_IMAGE_EDIT_SECRET_REF'}}});
},180_000);
it.each(['image:image.generate','vision:asset.classify','video:video.generate','asr:transcribe.audio'])('解密失败行不得伪装成可用env配置 %s',async key=>{
 const entry=modelRouteCatalog.find(e=>e.routeKey===key)!;
 const read=createSelectedModelSnapshotReader({ctx,rows:[{...row,id:'failed-key',capability:entry.mode==='vision'?'asset.classify':entry.capability,secretValue:SECRET_DECRYPT_FAIL_SENTINEL}],env:{},official:null,codex:null});
 const metadata=await read(entry,'self');expect(metadata.status).not.toBe('ready');expect(metadata.identity).toBeUndefined();
 const route=await freezeSelectedModelRoutes({choices:{text:'self',vision:'self',image:'self',video:'self',audio:'self',embed:'self'},revision:1,read});
 expect(route.routes[key]).toMatchObject({source:'self',readiness:'unavailable'});
},180_000);
it('无凭据专配行只复用真正命中的同源默认行，冻结行引用',async()=>{
 const entry=modelRouteCatalog.find(e=>e.routeKey==='image:image.generate')!;
 const read=createSelectedModelSnapshotReader({ctx,rows:[{...row,id:'bad-image',capability:'image.generate',secretValue:SECRET_DECRYPT_FAIL_SENTINEL},{...row,id:'real-default',capability:'image.default'}],env:{},official:null,codex:null});
 expect(await read(entry,'self')).toMatchObject({status:'ready',identity:{configuration:{kind:'row',id:'real-default',capability:'image.default'}}});
},180_000);

function credentialPorts(snapshot:SelectedModelSnapshot){return {readSnapshot:vi.fn(async()=>snapshot),readOfficialPersistent:vi.fn(async()=> 'official-current-fixture'),acquireOfficialPerRequest:vi.fn(async()=>{throw Error('不应提前申请按次Key');})};}
it('派发时只读取原row引用；新专配和当前偏好不替换原default，秘密可旋转',async()=>{
 const entry=modelRouteCatalog.find(e=>e.routeKey==='structured:script.draft')!,original={ctx,rows:[{...row,id:'frozen-default',capability:'default'}],env:{},official:null,codex:null};
 const root=await freezeSelectedModelRoutes({choices:{text:'self',vision:'self',image:'self',video:'self',audio:'local',embed:'self'},revision:1,main:{mode:entry.mode,capability:entry.capability},read:createSelectedModelSnapshotReader(original)}),route=root.routes[entry.routeKey]!;
 const live={...original,rows:[{...original.rows[0]!,secretValue:'rotated-current-fixture'},{...row,id:'new-specific',capability:'script.draft',modelName:'newly-selected-model'}]};
 const ports=credentialPorts(live);expect(await resolveFrozenModelCredential(ctx,route,ports)).toMatchObject({kind:'api',spec:{model:'self-test-model',token:'rotated-current-fixture'}});
 expect(ports.readOfficialPersistent).not.toHaveBeenCalled();expect(ports.acquireOfficialPerRequest).not.toHaveBeenCalled();
 live.rows[0]!.modelName='replaced-original-row';await expect(resolveFrozenModelCredential(ctx,route,ports)).rejects.toMatchObject({details:{domainCode:'MODEL_ROUTE_IDENTITY_CHANGED'}});
 live.rows.shift();live.env={ANTHROPIC_API_KEY:'another-secret'};await expect(resolveFrozenModelCredential(ctx,route,ports)).rejects.toMatchObject({details:{domainCode:'MODEL_ROUTE_IDENTITY_CHANGED'}});
},180_000);
it('编辑原env引用不会被新编辑专配替换，local保原档位，Codex保真实requestedModel且API调用0',async()=>{
 const snapshot:SelectedModelSnapshot={ctx,rows:[],env:{CREATOROS_IMAGE_SECRET_REF:'env:FIXTURE_IMAGE',FIXTURE_IMAGE:'fixture-private',CREATOROS_IMAGE_PROVIDER:'openai',CREATOROS_IMAGE_MODEL:'actual-image',CREATOROS_IMAGE_BASE_URL:'https://fixture.invalid/v1',CREATOROS_WHISPER_LEVEL:'tiny'},official:null,codex:{available:true,version:'0.159.3',defaultModelId:'actual-model-id',capabilities:{text:true,imageUnderstanding:true,imageGeneration:true}}};
 const root=await freezeSelectedModelRoutes({choices:{text:'codex',vision:'codex',image:'self',video:'self',audio:'local',embed:'self'},revision:1,read:createSelectedModelSnapshotReader(snapshot)}),ports=credentialPorts(snapshot);
 snapshot.env={...snapshot.env,CREATOROS_WHISPER_LEVEL:'base',CREATOROS_IMAGE_EDIT_SECRET_REF:'env:FIXTURE_IMAGE',CREATOROS_IMAGE_EDIT_PROVIDER:'openai',CREATOROS_IMAGE_EDIT_MODEL:'later-edit',CREATOROS_IMAGE_EDIT_BASE_URL:'https://fixture.invalid/v1'};
 expect(await resolveFrozenModelCredential(ctx,root.routes['image:image.edit']!,ports)).toMatchObject({kind:'api',spec:{model:'actual-image'}});
 expect(await resolveFrozenModelCredential(ctx,root.routes['asr:transcribe.audio']!,ports)).toMatchObject({kind:'local',spec:{model:'tiny'}});
 expect(await resolveFrozenModelCredential(ctx,root.routes['text:topic.generate']!,ports)).toMatchObject({kind:'codex',spec:{requestedModel:'actual-model-id'}});
 expect(ports.readOfficialPersistent).not.toHaveBeenCalled();expect(ports.acquireOfficialPerRequest).not.toHaveBeenCalled();
},180_000);
it('原官方option精确复用而非新默认，整bundle变化不拦截；原option撤下在取Key前拒绝',async()=>{
 const snapshot:SelectedModelSnapshot={ctx,rows:[],env:{},codex:null,official:{scopeId:'original-scope',bundleDigest:`sha256:${'a'.repeat(64)}`,selections:{default:'original-option'},credentialAvailable:{'omnihi-main':true},payload:{services:[{id:'omnihi-main',name:'原账户',provider:'omnihi',credential:{type:'api_key',source:'activation_managed',lifecycle:'persistent',allowMultiple:false}}],connections:[{id:'original-connection',serviceId:'omnihi-main',provider:'omnihi',baseURL:'https://api.fixture.invalid/v1',apiFormat:'openai_chat'}],models:{default:[{id:'original-option',name:'原模型',connectionId:'original-connection',model:'original-model',isDefault:true,settings:{}}]}}}};
 const root=await freezeSelectedModelRoutes({choices:{text:'official',vision:'self',image:'self',video:'self',audio:'local',embed:'self'},revision:1,main:{mode:'text',capability:'topic.generate'},read:createSelectedModelSnapshotReader(snapshot)}),ports=credentialPorts(snapshot);
 snapshot.official!.bundleDigest=`sha256:${'b'.repeat(64)}`;snapshot.official!.selections.default='later-option';
 const models=snapshot.official!.payload.models as {default:Record<string,unknown>[]};models.default[0]!.isDefault=false;models.default.push({...models.default[0]!,id:'later-option',model:'later-model',isDefault:true});
 expect(await resolveFrozenModelCredential(ctx,root.routes['text:topic.generate']!,ports)).toMatchObject({kind:'api',spec:{model:'original-model',token:'official-current-fixture'}});expect(ports.readOfficialPersistent).toHaveBeenCalledTimes(1);
 ports.readOfficialPersistent.mockClear();snapshot.official!.credentialAvailable['omnihi-main']=false;
 await expect(resolveFrozenModelCredential(ctx,root.routes['text:topic.generate']!,ports)).rejects.toMatchObject({details:{domainCode:'MODEL_CREDENTIAL_UNAVAILABLE'}});expect(ports.readOfficialPersistent).not.toHaveBeenCalled();
 snapshot.official!.credentialAvailable['omnihi-main']=true;
 models.default.shift();await expect(resolveFrozenModelCredential(ctx,root.routes['text:topic.generate']!,ports)).rejects.toMatchObject({details:{domainCode:'MODEL_ROUTE_IDENTITY_CHANGED'}});expect(ports.readOfficialPersistent).not.toHaveBeenCalled();
},180_000);

it('按次ASR元数据阶段只返回待租约规格，派发阶段才沿原owner端口取Key',async()=>{
 const endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1',snapshot:SelectedModelSnapshot={ctx,rows:[],env:{},codex:null,official:{scopeId:'original-qwen-scope',bundleDigest:`sha256:${'c'.repeat(64)}`,selections:{},credentialAvailable:{},payload:{services:[{id:'omnihi-main',name:'统一模型账户',provider:'omnihi',credential:{type:'api_key',source:'activation_managed',lifecycle:'persistent',allowMultiple:false}},{id:'qwen-asr-main',name:'语音转文字',provider:'qwen',credential:{type:'api_key',source:'activation_managed',lifecycle:'per_request',allowMultiple:false}}],connections:[{id:'qwen-asr',serviceId:'qwen-asr-main',provider:'qwen',baseURL:endpoint,apiFormat:'qwen_chat_audio'}],models:{'transcribe.audio':[{id:'qwen3-asr-flash',name:'语音转文字',connectionId:'qwen-asr',model:'qwen3-asr-flash',isDefault:true,settings:{maxBytes:10485760,maxDurationSeconds:300,chargeUnits:25000}}]}}}};
 const frozen=await freezeSelectedModelRoutes({choices:{text:'self',vision:'self',image:'self',video:'self',audio:'official',embed:'self'},revision:1,read:createSelectedModelSnapshotReader(snapshot)}),ports={...credentialPorts(snapshot),deferAsrPerRequest:true as const,acquireOfficialPerRequest:vi.fn(async()=>({token:'one-current-lease',model:'qwen3-asr-flash',baseUrl:endpoint}))};
 expect(await resolveFrozenModelCredential(ctx,frozen.routes['asr:transcribe.audio']!,ports)).toMatchObject({kind:'asr-pending-lease',spec:{provider:'qwen',model:'qwen3-asr-flash',token:'',credentialLifecycle:'per_request'}});expect(ports.acquireOfficialPerRequest).not.toHaveBeenCalled();
 expect(await resolveFrozenModelCredential(ctx,frozen.routes['asr:transcribe.audio']!,{...ports,deferAsrPerRequest:undefined})).toMatchObject({kind:'api',spec:{token:'one-current-lease'}});expect(ports.acquireOfficialPerRequest).toHaveBeenCalledTimes(1);
},180_000);

it('旧ANTHROPIC_API_KEY凭据入口保原内置规格，不因新增主secretRef替换原入口',async()=>{
 const snapshot:SelectedModelSnapshot={ctx,rows:[],official:null,codex:null,env:{ANTHROPIC_API_KEY:'legacy-original-private',CREATOROS_LLM_MODEL:'legacy-configured-model',CREATOROS_LLM_API_FORMAT:'openai_chat',CREATOROS_LLM_BASE_URL:'https://legacy.fixture.invalid/v1'}};
 const root=await freezeSelectedModelRoutes({choices:{text:'self',vision:'self',image:'self',video:'self',audio:'local',embed:'self'},revision:1,main:{mode:'structured',capability:'script.draft'},read:createSelectedModelSnapshotReader(snapshot)}),ports=credentialPorts(snapshot);
 expect(root.routes['structured:script.draft']).toMatchObject({identity:{configuration:{kind:'env',slot:'ANTHROPIC_API_KEY'}}});
 snapshot.env.CREATOROS_LLM_SECRET_REF='env:LATER_KEY';snapshot.env.LATER_KEY='later-selected-private';
 const frozen=root.routes['structured:script.draft']!;if(frozen.readiness!=='configured'||frozen.source!=='self')throw Error('缺原配置快照');
 expect(await resolveFrozenModelCredential(ctx,frozen,ports)).toMatchObject({kind:'api',spec:{model:frozen.identity.model,apiFormat:frozen.identity.apiFormat,baseUrl:frozen.identity.endpoint,token:'legacy-original-private'}});
},180_000);

it('视觉env按原OpenAI聊天协议冻结，素材分类保原默认地址；带图聊天不读无协议provider作apiFormat',async()=>{
 const read=createSelectedModelSnapshotReader({ctx,rows:[],env:{CREATOROS_VISION_SECRET_REF:'env:VISION_FIXTURE_TOKEN',VISION_FIXTURE_TOKEN:'private',CREATOROS_VISION_PROVIDER:'openai',CREATOROS_VISION_MODEL:'owned-vision'},official:null,codex:null});
 expect(await read(modelRouteCatalog.find(e=>e.routeKey==='vision:asset.classify')!,'self')).toMatchObject({status:'ready',identity:{apiFormat:'openai_chat',authStyle:'bearer',endpoint:'https://api.siliconflow.cn/v1'}});
 expect(await read(modelRouteCatalog.find(e=>e.routeKey==='vision:copilot.assist')!,'self')).toMatchObject({status:'ready',identity:{apiFormat:'openai_chat',authStyle:'bearer'}});
});
it('视觉row的真实调用协议分别投影，分类保原OpenAI协议，显式Anthropic聊天用原认证',async()=>{
 const read=createSelectedModelSnapshotReader({ctx,rows:[{...row,id:'owned-vision',capability:'vision.default',apiFormat:'anthropic',baseUrl:null}],env:{},official:null,codex:null});
 expect(await read(modelRouteCatalog.find(e=>e.routeKey==='vision:asset.classify')!,'self')).toMatchObject({status:'ready',identity:{apiFormat:'openai_chat',authStyle:'bearer',endpoint:'https://api.siliconflow.cn/v1'}});
 expect(await read(modelRouteCatalog.find(e=>e.routeKey==='vision:copilot.assist')!,'self')).toMatchObject({status:'ready',identity:{apiFormat:'anthropic',authStyle:'x-api-key',endpoint:null}});
});

it('Codex新默认变化不替换原模型，派发按实际model/list原ID及图片modality核验',async()=>{
 const snapshot:SelectedModelSnapshot={ctx,rows:[],env:{},official:null,codex:{available:true,version:'0.159.3',defaultModelId:'original-model',capabilities:{text:true,imageUnderstanding:true,imageGeneration:true}}};
 const root=await freezeSelectedModelRoutes({choices:{text:'codex',vision:'codex',image:'self',video:'self',audio:'local',embed:'self'},revision:1,read:createSelectedModelSnapshotReader(snapshot)}),ports=credentialPorts(snapshot);
 Object.assign(snapshot.codex!,{defaultModelId:'later-default',capabilities:{text:true,imageUnderstanding:false,imageGeneration:true},availableModels:[{id:'original-model',inputModalities:['text','image']},{id:'later-default',inputModalities:['text']}]});
 expect(await resolveFrozenModelCredential(ctx,root.routes['vision:copilot.assist']!,ports)).toMatchObject({kind:'codex',spec:{requestedModel:'original-model'}});
 Object.assign(snapshot.codex!,{availableModels:[{id:'later-default',inputModalities:['text']}]});
 await expect(resolveFrozenModelCredential(ctx,root.routes['vision:copilot.assist']!,ports)).rejects.toThrow();
 expect(ports.readOfficialPersistent).not.toHaveBeenCalled();expect(ports.acquireOfficialPerRequest).not.toHaveBeenCalled();
},180_000);

it('Codex可选聊天备用按真实stream消费者不可用投影，合法vision/API+text/Codex组合仍保原选择',async()=>{
 const snapshot:SelectedModelSnapshot={ctx,rows:[],env:{},official:null,codex:{available:true,version:'0.159.3',defaultModelId:'original-model',capabilities:{text:true,imageUnderstanding:true,imageGeneration:true}}};
 const root=await freezeSelectedModelRoutes({choices:{text:'codex',vision:'self',image:'self',video:'self',audio:'local',embed:'self'},revision:1,read:createSelectedModelSnapshotReader(snapshot)});
 expect(root.routes['text:chat.fallback']).toMatchObject({source:'codex',readiness:'unavailable',reasonCode:'MODEL_ROUTE_UNSUPPORTED'});
 expect(root.routes['text:copilot.assist']).toMatchObject({source:'codex',readiness:'configured',identity:{requestedModel:'original-model'}});
});
