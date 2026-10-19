import {beforeEach,describe,expect,it,vi,type Mock} from 'vitest';
import {constants} from 'node:fs';

type Step={value?:unknown;error?:unknown;before?:()=>void};
type SessionRecord={binary:string;args:string[];options:{cwd:string;env:NodeJS.ProcessEnv;signal:AbortSignal};requests:Array<{method:string;params:unknown;timeout?:number}>;initialized:Mock<()=>void>;close:Mock<()=>Promise<void>>};
const fixture=vi.hoisted(()=>({
 sessions:[] as SessionRecord[],steps:[] as Step[],firstConfig:{} as unknown,secondConfig:{} as unknown,
 capabilities:{} as unknown,models:{} as unknown,accountIndex:0,
 artifactMetadata:'/t1294-locked-artifact/@openai/codex/package.json',
 platformMetadata:'/t1294-locked-artifact/platform/package.json',binary:'/t1294-locked-artifact/codex',
 requireInputs:[] as string[],resolveInputs:[] as string[],
 readFile:vi.fn(),realpath:vi.fn(),access:vi.fn(),execFile:vi.fn(),
}));
vi.mock('node:module',async original=>{
 const actual=await original<typeof import('node:module')>();
 return {...actual,createRequire:(file:string)=>{
  fixture.requireInputs.push(String(file));
  return {resolve:(specifier:string)=>{
   fixture.resolveInputs.push(specifier);
   if(specifier==='@openai/codex/package.json')return fixture.artifactMetadata;
   if(specifier===`@openai/codex-${process.platform}-${process.arch}/package.json`)return fixture.platformMetadata;
   throw Error('不允许解析其它 artifact: '+specifier);
  }};
 }};
});
vi.mock('node:fs/promises',async original=>({...await original<typeof import('node:fs/promises')>(),readFile:fixture.readFile,realpath:fixture.realpath,access:fixture.access}));
vi.mock('node:child_process',async original=>({...await original<typeof import('node:child_process')>(),execFile:fixture.execFile}));
vi.mock('./codex-app-server-protocol',async original=>{
 const actual=await original<typeof import('./codex-app-server-protocol')>();
 return {...actual,CodexRpcSession:class{
  readonly record:SessionRecord;
  constructor(binary:string,args:string[],options:SessionRecord['options']){
   this.record={binary,args,options,requests:[],initialized:vi.fn(),close:vi.fn(async()=>{})};fixture.sessions.push(this.record);
  }
  initialized(){this.record.initialized();}
  close(){return this.record.close();}
  async request(method:string,params:unknown,timeout?:number){
   this.record.requests.push({method,params,timeout});
   if(method==='initialize')return {};
   if(method==='config/read')return fixture.sessions.indexOf(this.record)===0?fixture.firstConfig:fixture.secondConfig;
   if(method==='account/read'){
    const step=fixture.steps[fixture.accountIndex++];if(!step)throw Error('不允许第三次账户读取');
    step.before?.();if(Object.hasOwn(step,'error'))throw step.error;return step.value;
   }
   if(method==='modelProvider/capabilities/read')return fixture.capabilities;
   if(method==='model/list')return fixture.models;
   throw Error('本测试禁止其它协议方法: '+method);
  }
 }};
});
import {CODEX_RUNTIME_VERSION,CodexHostError,createControlledCodexSession} from './codex-app-server';

// 明确的 0.159.3 配置响应夹具；原 factory 仍执行完整配置校验。
function configuration(image=false){return {config:{web_search:'disabled',mcp_servers:{'fixture-mcp':{enabled:false}},features:{
 apps:false,plugins:false,hooks:false,multi_agent:false,multi_agent_v2:false,image_generation:image,
 browser_use:false,computer_use:false,code_mode:image?{enabled:false,direct_only_tool_namespaces:['image_gen']}:false,
 code_mode_host:false,tool_suggest:false,shell_tool:false,unified_exec:false,view_image:false,
 skill_search:false,skill_mcp_dependency_install:false,omit_app_server_notification_media:false,
}}};}
const account={account:{type:'chatgpt',planType:'plus'},requiresOpenaiAuth:true};
const internal=()=>new CodexHostError('CODEX_RPC_REJECTED',{rpcMethod:'account/read',rpcCode:-32603});
function session(index=1){const value=fixture.sessions[index];if(!value)throw Error('缺少原会话 '+index);return value;}
const requests=(index=1)=>fixture.sessions[index]?.requests??[];
const reads=()=>requests().filter(r=>r.method==='account/read');
function assertFactoryBoundary(controller:AbortController){
 expect(fixture.sessions).toHaveLength(2);
 expect(fixture.sessions.every(s=>s.binary===fixture.binary&&s.options.signal===controller.signal)).toBe(true);
 expect(session(0).options).toEqual({cwd:'/t1294-owned-workspace',env:{HOME:'/t1294-owned-home',PATH:'/t1294-owned-path'},signal:controller.signal});
 expect(session(0).requests.map(r=>r.method)).toEqual(['initialize','config/read']);
 expect(fixture.sessions.every(s=>s.initialized.mock.calls.length===1)).toBe(true);
 expect(session(0).close).toHaveBeenCalledTimes(1);
 expect(session().args).toContain('mcp_servers={"fixture-mcp"={enabled=false}}');
 expect(session().args).toContain('web_search="disabled"');
 expect(requests().slice(0,2)).toEqual([
  {method:'initialize',params:{clientInfo:{name:'creatoros',title:'CreatorOS',version:'1'},capabilities:{experimentalApi:true}},timeout:undefined},
  {method:'config/read',params:{includeLayers:false,cwd:'/t1294-owned-workspace'},timeout:undefined},
 ]);
 expect(fixture.resolveInputs).toEqual(['@openai/codex/package.json',`@openai/codex-${process.platform}-${process.arch}/package.json`]);
 expect(fixture.readFile).toHaveBeenCalledExactlyOnceWith(fixture.artifactMetadata,'utf8');
 expect(fixture.realpath).toHaveBeenCalledTimes(1);expect(fixture.access).toHaveBeenCalledExactlyOnceWith(fixture.binary,process.platform==='win32'?constants.F_OK:constants.X_OK);
 expect(fixture.execFile).toHaveBeenCalledTimes(1);
 expect(fixture.execFile.mock.calls[0]!.slice(0,2)).toEqual([fixture.binary,['--version']]);
 expect(fixture.execFile.mock.calls[0]![2]).toMatchObject({timeout:120000,maxBuffer:4096});
 expect(fixture.sessions.flatMap(s=>s.requests).every(r=>!['thread/start','turn/start'].includes(r.method))).toBe(true);
}
const create=(c:AbortController,image=false)=>createControlledCodexSession('/t1294-owned-workspace',c.signal,{HOME:'/t1294-owned-home',PATH:'/t1294-owned-path'},image);
beforeEach(()=>{
 vi.clearAllMocks();fixture.sessions=[];fixture.steps=[{value:account}];fixture.accountIndex=0;fixture.requireInputs=[];fixture.resolveInputs=[];
 fixture.firstConfig={config:{mcp_servers:{'fixture-mcp':{enabled:true}}}};
 fixture.secondConfig=configuration();fixture.capabilities={imageGeneration:true,namespaceTools:true};fixture.models={data:[{isDefault:true,inputModalities:['text','image']}]};
 fixture.readFile.mockImplementation(async(file:string)=>{expect(file).toBe(fixture.artifactMetadata);return JSON.stringify({version:'0.159.3'});});
 fixture.realpath.mockImplementation(async(file:string)=>{expect(file).toMatch(/vendor\/.+\/bin\/codex(?:\.exe)?$/);return fixture.binary;});
 fixture.access.mockResolvedValue(undefined);
 fixture.execFile.mockImplementation((...args:unknown[])=>{const callback=args[3] as (error:Error|null,stdout:string,stderr:string)=>void;callback(null,'codex-cli 0.159.3\n','');});
});

describe('T1294 原 factory 的 account/read 单次有限恢复（全 stub，无 CLI/网络）',()=>{
 it('首次成功只读一次，保持原两个会话、配置/MCP、版本/权限路径及正常close',async()=>{
  const c=new AbortController();const result=await create(c);
  try{expect(CODEX_RUNTIME_VERSION).toBe('0.159.3');expect(result).toMatchObject({authenticated:true,loginStatus:'authenticated',mcpNames:['fixture-mcp']});
   expect(reads()).toEqual([{method:'account/read',params:{refreshToken:false},timeout:undefined}]);assertFactoryBoundary(c);
   expect(session().close).not.toHaveBeenCalled();
  }finally{await result.rpc.close();}
  expect(session().close).toHaveBeenCalledTimes(1);
 });
 it('只有精确typed内部拒绝才在原RPC原params重读一次，第二真实response决定身份',async()=>{
  const c=new AbortController();fixture.steps=[{error:internal()},{value:account}];
  const result=await create(c);try{
   expect(result.authenticated).toBe(true);assertFactoryBoundary(c);expect(reads()).toHaveLength(2);
   expect(reads()[0]!.params).toEqual({refreshToken:false});expect(reads()[1]!.params).toBe(reads()[0]!.params);
   expect(requests().map(r=>r.method)).toEqual(['initialize','config/read','account/read','account/read']);
  }finally{await result.rpc.close();}
  expect(session().close).toHaveBeenCalledTimes(1);
 });
 it.each(['普通Error','同精确内部拒绝'])('第二次%s原对象抛出，无第三次/新会话，原RPC正常关闭',async kind=>{
  const c=new AbortController(),second=kind==='普通Error'?new Error('fixture-second-read'):internal();fixture.steps=[{error:internal()},{error:second}];
  await expect(create(c)).rejects.toBe(second);assertFactoryBoundary(c);expect(reads()).toHaveLength(2);expect(session().close).toHaveBeenCalledTimes(1);
 });
 const negatives:Array<[string,()=>unknown]>=[
  ['普通Error',()=>new Error('fixture-untyped')],
  ['同字段普通对象',()=>({code:'CODEX_RPC_REJECTED',rpcMethod:'account/read',rpcCode:-32603})],
  ['RPC timeout',()=>new CodexHostError('CODEX_RPC_TIMEOUT',{rpcMethod:'account/read',rpcCode:-32603})],
  ['明确登录拒绝',()=>new CodexHostError('CODEX_LOGIN_REQUIRED',{rpcMethod:'account/read',rpcCode:-32603})],
  ['其它method',()=>new CodexHostError('CODEX_RPC_REJECTED',{rpcMethod:'config/read',rpcCode:-32603})],
  ['其它上游code',()=>new CodexHostError('CODEX_RPC_REJECTED',{rpcMethod:'account/read',rpcCode:-32602})],
  ['缺method/code',()=>new CodexHostError('CODEX_RPC_REJECTED')],
  ['缺code',()=>new CodexHostError('CODEX_RPC_REJECTED',{rpcMethod:'account/read',rpcCode:undefined})],
  ['缺method但有code',()=>Object.assign(new CodexHostError('CODEX_RPC_REJECTED'),{rpcCode:-32603})],
 ];
 it.each(negatives)('%s不重读、不越过原错误',async(_name,errorFor)=>{
  const c=new AbortController(),error=errorFor();fixture.steps=[{error},{value:account}];
  await expect(create(c)).rejects.toBe(error);assertFactoryBoundary(c);expect(reads()).toHaveLength(1);expect(session().close).toHaveBeenCalledTimes(1);
 });
 it('首次精确拒绝时原signal已取消：抛原取消原因，只读一次并close',async()=>{
  const c=new AbortController(),cancel=new DOMException('fixture-cancelled','AbortError');fixture.steps=[{error:internal(),before:()=>c.abort(cancel)},{value:account}];
  await expect(create(c)).rejects.toBe(cancel);assertFactoryBoundary(c);expect(reads()).toHaveLength(1);expect(session().close).toHaveBeenCalledTimes(1);
 });
 it('第二次真实未登录响应保持unauthenticated；不拿第一次失败伪造ready',async()=>{
  const c=new AbortController();fixture.steps=[{error:internal()},{value:{account:null,requiresOpenaiAuth:true}}];
  const result=await create(c);try{expect(result).toMatchObject({authenticated:false,loginStatus:'unauthenticated'});assertFactoryBoundary(c);expect(reads()).toHaveLength(2);}finally{await result.rpc.close();}
 });
 it('原无需认证响应仍保not-required，非重读成功猜登录',async()=>{
  const c=new AbortController();fixture.steps=[{value:{account:null,requiresOpenaiAuth:false}}];const result=await create(c);
  try{expect(result).toMatchObject({authenticated:true,loginStatus:'not-required'});expect(reads()).toHaveLength(1);}finally{await result.rpc.close();}
 });
 it('图片精确重读成功后仍执行原capabilities与真实default image模型校验',async()=>{
  const c=new AbortController();fixture.secondConfig=configuration(true);fixture.steps=[{error:internal()},{value:account}];
  const result=await create(c,true);try{assertFactoryBoundary(c);expect(result.authenticated).toBe(true);
   expect(requests().map(r=>r.method)).toEqual(['initialize','config/read','account/read','account/read','modelProvider/capabilities/read','model/list']);
   expect(session().args).toContain('features.image_generation=true');
   expect(session().args).toContain('features.code_mode={enabled=false,direct_only_tool_namespaces=["image_gen"]}');
  }finally{await result.rpc.close();}
 });
 it.each([
  ['未登录',{account:null,requiresOpenaiAuth:true},'CODEX_LOGIN_REQUIRED'],
  ['free',{account:{type:'chatgpt',planType:'free'}},'CODEX_IMAGE_CAPABILITY_UNAVAILABLE'],
  ['非chatgpt',{account:{type:'apiKey'}},'CODEX_IMAGE_CAPABILITY_UNAVAILABLE'],
 ] as const)('重读后图片%s仍拒绝',async(_name,response,code)=>{
  const c=new AbortController();fixture.secondConfig=configuration(true);fixture.steps=[{error:internal()},{value:response}];
  await expect(create(c,true)).rejects.toMatchObject({code});expect(reads()).toHaveLength(2);expect(fixture.sessions).toHaveLength(2);expect(session().close).toHaveBeenCalledTimes(1);
 });
 it.each(['imageGeneration','namespaceTools'])('重读后图片能力%s缺失仍拒绝',async key=>{
  const c=new AbortController();fixture.secondConfig=configuration(true);fixture.capabilities={imageGeneration:true,namespaceTools:true,[key]:false};fixture.steps=[{error:internal()},{value:account}];
  await expect(create(c,true)).rejects.toMatchObject({code:'CODEX_IMAGE_CAPABILITY_UNAVAILABLE'});expect(reads()).toHaveLength(2);expect(requests().some(r=>r.method==='model/list')).toBe(false);expect(session().close).toHaveBeenCalledTimes(1);
 });
 it('重读后default模型不支持image仍拒绝',async()=>{
  const c=new AbortController();fixture.secondConfig=configuration(true);fixture.models={data:[{isDefault:true,inputModalities:['text']}]};fixture.steps=[{error:internal()},{value:account}];
  await expect(create(c,true)).rejects.toMatchObject({code:'CODEX_IMAGE_MODEL_UNAVAILABLE'});expect(reads()).toHaveLength(2);expect(session().close).toHaveBeenCalledTimes(1);
 });
 it.each(['web_search','notification','mcp-enabled','unexpected-mcp','dangerous-feature','image-namespace'])('原%s配置边界仍在account/read前拒绝',async fault=>{
  const c=new AbortController(),config=configuration(fault==='image-namespace');
  if(fault==='web_search')config.config.web_search='enabled';
  if(fault==='notification')config.config.features.omit_app_server_notification_media=true;
  if(fault==='mcp-enabled')config.config.mcp_servers['fixture-mcp'].enabled=true;
  if(fault==='unexpected-mcp')Object.assign(config.config.mcp_servers,{'unexpected':{enabled:false}});
  if(fault==='dangerous-feature')config.config.features.shell_tool=true;
  if(fault==='image-namespace')config.config.features.code_mode={enabled:false,direct_only_tool_namespaces:['untrusted']};
  fixture.secondConfig=config;
  await expect(create(c,fault==='image-namespace')).rejects.toMatchObject({code:fault==='unexpected-mcp'?'CODEX_CONFIG_CHANGED':'CODEX_CAPABILITY_UNVERIFIED'});
  expect(reads()).toHaveLength(0);expect(fixture.sessions).toHaveLength(2);expect(session().close).toHaveBeenCalledTimes(1);
 });
});

it.each([false,true])('T1298 任务函数直连配置完整读回，图片=%s',async image=>{
 const c=new AbortController(),config=configuration(image);
 (config.config.features as any).code_mode={enabled:false,direct_only_tool_namespaces:[...(image?['image_gen']:[]),'functions']};fixture.secondConfig=config;
 const owned=await createControlledCodexSession('/t1294-owned-workspace',c.signal,{HOME:'/t1294-owned-home',PATH:'/t1294-owned-path'},image,true);
 try{expect(owned.authenticated).toBe(true);expect(session().args).toContain('features.code_mode_host=false');expect(session().args).toContain(`features.code_mode={enabled=false,direct_only_tool_namespaces=${JSON.stringify([...(image?['image_gen']:[]),'functions'])}}`);}finally{await owned.rpc.close();}
});
it.each([[],['functions','functions'],['functions','shell'],['image_gen','functions']].map(list=>({list})))('T1298 任务函数读回名单缺失/重复/越界拒绝 $list',async({list})=>{
 const config=configuration();(config.config.features as any).code_mode={enabled:false,direct_only_tool_namespaces:list};fixture.secondConfig=config;
 await expect(createControlledCodexSession('/t1294-owned-workspace',new AbortController().signal,{HOME:'/t1294-owned-home',PATH:'/t1294-owned-path'},false,true)).rejects.toMatchObject({code:'CODEX_CAPABILITY_UNVERIFIED'});
 expect(reads()).toHaveLength(0);
});
it('T1298 直连模式不能重新启用code-mode host',async()=>{
 const config=configuration();(config.config.features as any).code_mode={enabled:false,direct_only_tool_namespaces:['functions']};(config.config.features as any).code_mode_host=true;fixture.secondConfig=config;
 await expect(createControlledCodexSession('/t1294-owned-workspace',new AbortController().signal,{HOME:'/t1294-owned-home',PATH:'/t1294-owned-path'},false,true)).rejects.toMatchObject({code:'CODEX_CAPABILITY_UNVERIFIED'});
});

describe('T1337 自主任务自动Skill目录隔离配置',()=>{
 const isolated=()=>{
  const value=configuration();value.config.features.code_mode={enabled:false,direct_only_tool_namespaces:['functions']};
  return {...value,config:{...value.config,skills:{include_instructions:false}}};
 };
 it('显式opt-in在两次真实session startup均传false，保原MCP/账号读取路径',async()=>{
  const c=new AbortController();fixture.secondConfig=isolated();
  const owned=await createControlledCodexSession('/t1294-owned-workspace',c.signal,{HOME:'/t1294-owned-home',PATH:'/t1294-owned-path'},false,true,true);
  try{assertFactoryBoundary(c);expect(owned.authenticated).toBe(true);expect(reads()).toHaveLength(1);
   for(const row of fixture.sessions)expect(row.args.filter(v=>v==='skills.include_instructions=false')).toHaveLength(1);
  }finally{await owned.rpc.close();}
 });
 it.each([undefined,true,'false',null,0,{},[]])('最终配置非boolean false（%j）在账号/模型前拒绝并关闭原session',async value=>{
  const config=isolated();(config.config.skills as {include_instructions:unknown}).include_instructions=value;fixture.secondConfig=config;
  await expect(createControlledCodexSession('/t1294-owned-workspace',new AbortController().signal,{HOME:'/t1294-owned-home',PATH:'/t1294-owned-path'},false,true,true)).rejects.toMatchObject({code:'CODEX_CAPABILITY_UNVERIFIED'});
  expect(fixture.sessions).toHaveLength(2);expect(reads()).toHaveLength(0);expect(session().close).toHaveBeenCalledTimes(1);
 });
 it.each([false,true])('不显式opt-in的任务工具caller保持原默认；用户当前值=%s',async include=>{
  const config=isolated();config.config.skills.include_instructions=include;fixture.secondConfig=config;
  const owned=await createControlledCodexSession('/t1294-owned-workspace',new AbortController().signal,{HOME:'/t1294-owned-home',PATH:'/t1294-owned-path'},false,true);
  try{expect(owned.authenticated).toBe(true);expect(fixture.sessions.every(row=>!row.args.some(v=>v.startsWith('skills.')))).toBe(true);}finally{await owned.rpc.close();}
 });
});
