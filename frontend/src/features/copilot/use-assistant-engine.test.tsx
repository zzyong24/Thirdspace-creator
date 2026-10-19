import {StrictMode} from 'react';
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import type {ModelRoutingChoices,ModelRoutingResource} from '@creatoros/contract';
import {CURRENT_ACCOUNT_KEY,CURRENT_GROUP_KEY} from '@/lib/http-transport';
const api=vi.hoisted(()=>({getPreferences:vi.fn(),patchPreferences:vi.fn(),getModelRouting:vi.fn(),putModelRouting:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:api}));
const choices:ModelRoutingChoices={text:'self',vision:'self',image:'self',video:'self',audio:'local',embed:'self'};
function dto(engine:'pi'|'codex'|null='pi',selected:ModelRoutingChoices|null=null,revision=0):ModelRoutingResource{return {schemaVersion:1,revision,choices:selected,legacyExecutionEngine:engine,effectiveChoices:selected??{},capabilities:selected?[{mode:'text',capability:'copilot.assist',source:selected.text,status:'ready',reasonCode:null}]:[]};}
const status=(available=true)=>new Response(JSON.stringify({engines:[{engine:'codex',installed:true,available,version:'0.159.3',loginStatus:'authenticated',capabilities:{text:true,imageUnderstanding:true,imageGeneration:true}}]}),{status:200});
let store:typeof import('./assistant-engine'),hook:typeof import('./use-assistant-engine'),current:ModelRoutingResource;
const observe=()=>renderHook(()=>hook.useAssistantEngine());
const wait=async(assert:()=>void)=>waitFor(assert,{timeout:120_000});
beforeEach(async()=>{vi.resetModules();localStorage.clear();current=dto();api.getPreferences.mockReset().mockResolvedValue({assistantExecutionEngine:'pi'});api.patchPreferences.mockReset();api.getModelRouting.mockReset().mockImplementation(async()=>current);api.putModelRouting.mockReset().mockImplementation(async({body})=>{current=dto('pi',body.choices,body.expectedRevision+1);return current;});store=await import('./assistant-engine');hook=await import('./use-assistant-engine');await store.loadModelRouting(true);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
async function legacy(engine:'pi'|'codex'|null){current=dto(engine);await store.loadModelRouting(true);}
describe('T1278 来源真值与 v1 本地状态保护（迁移 T1238）',()=>{
 it('后端 legacy Pi 不被旧浏览器 Codex 缓存覆盖，Pi 不请求 Codex 状态',{timeout:180_000,retry:0},async()=>{
  localStorage.setItem('creatoros:assistant-engine:v1','codex');await legacy('pi');const fetch=vi.spyOn(globalThis,'fetch');const {result}=observe();expect(result.current).toMatchObject({engine:'pi',available:true,checking:false,preference:{ready:true},v2:false});expect(fetch).not.toHaveBeenCalled();expect(api.patchPreferences).not.toHaveBeenCalled();expect(api.putModelRouting).not.toHaveBeenCalled();
 });
 it('legacy engine=null / choices=null 不按浏览器缓存 initialize 或自动 PUT',{timeout:180_000,retry:0},async()=>{
  localStorage.setItem('creatoros:assistant-engine:v1','codex');await legacy(null);const fetch=vi.spyOn(globalThis,'fetch');const {result}=observe();expect(result.current.routing.resource).toMatchObject({choices:null,effectiveChoices:{},legacyExecutionEngine:null});expect(api.patchPreferences).not.toHaveBeenCalled();expect(api.putModelRouting).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('PUT 完成前原选择保持，保存中不提交；只有 GET 读回后新来源生效',{timeout:180_000,retry:0},async()=>{
  current=dto('pi',choices,1);await store.loadModelRouting(true);let resolve!:(value:ModelRoutingResource)=>void;api.putModelRouting.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const {result}=observe();let saving!:Promise<unknown>;
  act(()=>{saving=store.writeModelRouting({...choices,text:'codex'},1);});expect(result.current).toMatchObject({engine:'pi',canSubmitText:false,preference:{saving:true}});
  await act(async()=>{current=dto('pi',{...choices,text:'codex'},2);resolve(current);await saving;});expect(result.current).toMatchObject({engine:'codex',canSubmitText:true,preference:{saving:false}});expect(api.getModelRouting).toHaveBeenCalled();expect(api.putModelRouting).toHaveBeenCalledWith({params:undefined,query:undefined,body:{schemaVersion:1,choices:{...choices,text:'codex'},expectedRevision:1}});expect(api.patchPreferences).not.toHaveBeenCalled();
 });
 it('PUT 失败保原来源与真实失败，重试仍同 revision，不能把缓存当持久化',{timeout:180_000,retry:0},async()=>{
  current=dto('pi',choices,1);await store.loadModelRouting(true);api.putModelRouting.mockRejectedValueOnce(Error('save-failed'));const {result}=observe();await act(async()=>{await expect(store.writeModelRouting({...choices,text:'codex'},1)).rejects.toThrow('save-failed');});expect(result.current).toMatchObject({engine:'pi',preference:{saving:false,error:'模型来源保存失败，草稿已保留'}});await act(async()=>{await store.writeModelRouting({...choices,text:'codex'},1);});expect(result.current).toMatchObject({engine:'codex',canSubmitText:true,preference:{error:null}});expect(api.putModelRouting.mock.calls.map(([request])=>request.body.expectedRevision)).toEqual([1,1]);
 });
 it('legacy Codex切回Pi直接消费设置资源，不创建可迟到的独立状态请求',{timeout:180_000,retry:0},async()=>{
  await legacy('codex');const fetch=vi.spyOn(globalThis,'fetch');const {result}=observe();expect(result.current.canSubmitText).toBe(true);expect(result.current.available).toBe(false);await act(async()=>{current=dto('pi');await store.loadModelRouting(true);});expect(result.current).toMatchObject({engine:'pi',available:true,checking:false});expect(fetch).not.toHaveBeenCalled();
 });
 it('跨窗 revision 广播重新 GET，旧 engine 缓存不能覆盖来源服务值',{timeout:180_000,retry:0},async()=>{
  current=dto('pi',{...choices,text:'codex'},1);await store.loadModelRouting(true);const {result}=observe();expect(result.current.engine).toBe('codex');const before=api.getModelRouting.mock.calls.length;current=dto('pi',choices,2);act(()=>{localStorage.setItem('creatoros:assistant-engine:v1','codex');window.dispatchEvent(new StorageEvent('storage',{key:'creatoros:model-routing:revision'}));});await wait(()=>expect(result.current).toMatchObject({engine:'pi',available:true}));expect(api.getModelRouting).toHaveBeenCalledTimes(before+1);
 });
 it('账号改变仅读当前统一资源，两个hook和卸载不新建状态检查',{timeout:180_000,retry:0},async()=>{
  localStorage.setItem(CURRENT_ACCOUNT_KEY,'account-a');await legacy('codex');const fetch=vi.spyOn(globalThis,'fetch');const first=observe(),second=observe();await act(async()=>{localStorage.setItem(CURRENT_ACCOUNT_KEY,'account-b');current=dto('pi',choices,2);window.dispatchEvent(new CustomEvent('creatoros:accounts-changed'));await store.loadModelRouting(true);});expect(first.result.current).toMatchObject({accountId:'account-b',engine:'pi',available:true});expect(second.result.current.engine).toBe('pi');first.unmount();second.unmount();expect(fetch).not.toHaveBeenCalled();
 });
 it('同account=null组切换重新读取所属组资源，不复检本机Codex',{timeout:180_000,retry:0},async()=>{
  localStorage.setItem(CURRENT_GROUP_KEY,'group-a');await legacy('codex');const fetch=vi.spyOn(globalThis,'fetch');const {result}=observe();await act(async()=>{localStorage.setItem(CURRENT_GROUP_KEY,'group-b');current={...dto('pi',choices,2),capabilities:[{mode:'text',capability:'copilot.assist',source:'self',status:'unavailable',reasonCode:'MODEL_CONFIGURATION_UNAVAILABLE'}]};window.dispatchEvent(new CustomEvent('creatoros:accounts-changed'));await store.loadModelRouting(true);});expect(result.current.canSubmitText).toBe(false);expect(result.current.routing.scope).toContain('group-b');expect(fetch).not.toHaveBeenCalled();
 });
 it('两个订阅的显式重新读取共享同一GET，保持零独立状态请求',{timeout:180_000,retry:0},async()=>{
  await legacy('codex');const fetch=vi.spyOn(globalThis,'fetch');const first=observe(),second=observe();let release!:(value:ModelRoutingResource)=>void;api.getModelRouting.mockImplementationOnce(()=>new Promise(r=>{release=r;}));const count=api.getModelRouting.mock.calls.length;act(()=>{first.result.current.recheck();second.result.current.recheck();});expect(api.getModelRouting).toHaveBeenCalledTimes(count+1);await act(async()=>{release(dto('pi',choices,3));});await wait(()=>expect(first.result.current.engine).toBe('pi'));expect(second.result.current.engine).toBe('pi');expect(fetch).not.toHaveBeenCalled();
 });
 it('统一来源读取失败保原输入资格和真实错误，重新读回恢复，不发送探针',{timeout:180_000,retry:0},async()=>{
  await legacy('codex');const fetch=vi.spyOn(globalThis,'fetch');const {result}=observe();api.getModelRouting.mockRejectedValueOnce(Error('read-failed'));await act(async()=>result.current.recheck());await wait(()=>expect(result.current.routing.error).toBe('模型来源暂未取得，请重新读取'));expect(result.current.canSubmitText).toBe(true);await act(async()=>result.current.recheck());await wait(()=>expect(result.current.routing.error).toBeNull());expect(fetch).not.toHaveBeenCalled();
 });
 it('revision 广播缓存写失败仍服从 PUT/GET；focus 重新读取服务值',{timeout:180_000,retry:0},async()=>{
  current=dto('pi',choices,1);await store.loadModelRouting(true);vi.spyOn(Object.getPrototypeOf(localStorage),'setItem').mockImplementation(()=>{throw Error('quota');});const {result}=observe();await act(async()=>{await store.writeModelRouting({...choices,text:'codex'},1);});expect(result.current).toMatchObject({engine:'codex',canSubmitText:true});current=dto('pi',choices,3);act(()=>window.dispatchEvent(new Event('focus')));await wait(()=>expect(result.current.engine).toBe('pi'));
 });
 it('StrictMode与重复挂载不请求独立Codex状态，来源GET仍共享',{timeout:180_000,retry:0},async()=>{
  await legacy('codex');const fetch=vi.spyOn(globalThis,'fetch');const count=api.getModelRouting.mock.calls.length;const {result}=renderHook(()=>hook.useAssistantEngine(),{wrapper:StrictMode});expect(result.current).toMatchObject({canSubmitText:true,checking:false});await act(async()=>{});expect(fetch).not.toHaveBeenCalled();expect(api.getModelRouting).toHaveBeenCalledTimes(count);
 });
 it('旧PATCH经真实GET生效，两hook共享新legacy来源；不PUT或拼造v2',{timeout:180_000,retry:0},async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async()=>status());await store.loadAssistantEngine(true);const first=observe(),second=observe();
  api.patchPreferences.mockImplementationOnce(async({body})=>{current=dto(body.assistantExecutionEngine);return {assistantExecutionEngine:body.assistantExecutionEngine};});
  const reads=api.getModelRouting.mock.calls.length;await act(async()=>{await expect(store.writeAssistantEngine('codex')).resolves.toBe('codex');});
  await wait(()=>expect(first.result.current).toMatchObject({engine:'codex',canSubmitText:true,v2:false}));expect(second.result.current.engine).toBe('codex');
  expect(api.getModelRouting).toHaveBeenCalledTimes(reads+1);expect(first.result.current.routing.resource).toEqual(dto('codex'));expect(api.patchPreferences).toHaveBeenCalledWith({params:undefined,query:undefined,body:{assistantExecutionEngine:'codex'}});expect(api.putModelRouting).not.toHaveBeenCalled();
 });
 it('旧PATCH已受理但GET未确认时不提交，重新GET恢复；不自动重投PATCH',{timeout:180_000,retry:0},async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async()=>status());await store.loadAssistantEngine(true);const {result}=observe();
  api.patchPreferences.mockImplementationOnce(async()=>{current=dto('codex');return {assistantExecutionEngine:'codex'};});api.getModelRouting.mockRejectedValueOnce(Error('read-failed'));
  await act(async()=>{await expect(store.writeAssistantEngine('codex')).rejects.toThrow('read-failed');});expect(result.current).toMatchObject({canSubmitText:false,preference:{ready:false,saving:false}});expect(api.patchPreferences).toHaveBeenCalledOnce();
  await act(async()=>{await store.loadModelRouting(true);});await wait(()=>expect(result.current).toMatchObject({engine:'codex',canSubmitText:true}));expect(api.patchPreferences).toHaveBeenCalledOnce();expect(api.putModelRouting).not.toHaveBeenCalled();
 });
 it('旧PATCH读回在途不能提交，原GET晚结果不能覆盖读回Codex',{timeout:180_000,retry:0},async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async()=>status());await store.loadAssistantEngine(true);const {result}=observe();let oldRead!:(value:ModelRoutingResource)=>void;
  api.getModelRouting.mockImplementationOnce(()=>new Promise(r=>{oldRead=r;}));let reading!:Promise<void>;act(()=>{reading=store.loadModelRouting(true);});
  let receipt!:(value:{assistantExecutionEngine:'codex'})=>void;api.patchPreferences.mockImplementationOnce(()=>new Promise(r=>{receipt=r;}));let saving!:Promise<unknown>;act(()=>{saving=store.writeAssistantEngine('codex');});
  expect(result.current.canSubmitText).toBe(false);await act(async()=>{current=dto('codex');receipt({assistantExecutionEngine:'codex'});await saving;});await wait(()=>expect(result.current.engine).toBe('codex'));
  await act(async()=>{oldRead(dto('pi'));await reading;});expect(result.current).toMatchObject({engine:'codex',canSubmitText:true});expect(api.putModelRouting).not.toHaveBeenCalled();
 });
 it('旧PATCH晚回执不能覆盖换组后的来源或再GET旧范围',{timeout:180_000,retry:0},async()=>{
  localStorage.setItem(CURRENT_GROUP_KEY,'legacy-write-a');await store.loadModelRouting(true);await store.loadAssistantEngine(true);const {result}=observe();let receipt!:(value:{assistantExecutionEngine:'codex'})=>void;
  api.patchPreferences.mockImplementationOnce(()=>new Promise(r=>{receipt=r;}));let saving!:Promise<unknown>;let rejected!:Promise<unknown>;act(()=>{saving=store.writeAssistantEngine('codex');rejected=expect(saving).rejects.toThrow('账号组已变化');});
  await act(async()=>{localStorage.setItem(CURRENT_GROUP_KEY,'legacy-write-b');window.dispatchEvent(new CustomEvent('creatoros:accounts-changed'));await store.loadModelRouting(true);});const reads=api.getModelRouting.mock.calls.length;
  await act(async()=>{receipt({assistantExecutionEngine:'codex'});await rejected;});expect(result.current).toMatchObject({engine:'pi',preference:{saving:false},routing:{scope:JSON.stringify(['legacy-write-b',null])}});expect(api.getModelRouting).toHaveBeenCalledTimes(reads);expect(api.putModelRouting).not.toHaveBeenCalled();
 });
 it('旧PATCH不得覆盖已有完整v2选择；同域读回保持全部六槽',{timeout:180_000,retry:0},async()=>{
  current=dto('pi',choices,5);await store.loadModelRouting(true);await store.loadAssistantEngine(true);const {result}=observe();api.patchPreferences.mockImplementationOnce(async()=>{current=dto('codex',choices,5);return {assistantExecutionEngine:'codex'};});
  await act(async()=>{await store.writeAssistantEngine('codex');});expect(result.current).toMatchObject({engine:'pi',v2:true,available:true});expect(result.current.routing.resource).toEqual(dto('codex',choices,5));expect(api.putModelRouting).not.toHaveBeenCalled();
 });
 it('旧跨窗engine事件从GET更新legacy读面，缓存不充当来源真值',{timeout:180_000,retry:0},async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async()=>status());const {result}=observe();const reads=api.getModelRouting.mock.calls.length;
  current=dto('codex');act(()=>{localStorage.setItem('creatoros:assistant-engine:v1','pi');window.dispatchEvent(new StorageEvent('storage',{key:'creatoros:assistant-engine:v1'}));});await wait(()=>expect(result.current).toMatchObject({engine:'codex',canSubmitText:true}));expect(api.getModelRouting).toHaveBeenCalledTimes(reads+1);expect(api.patchPreferences).not.toHaveBeenCalled();expect(api.putModelRouting).not.toHaveBeenCalled();
 });

});

describe('T1294 聊天仅消费统一来源，不另做Codex预检',()=>{
 it('未存完整choices仍消费服务端官方effectiveChoices，不自动保存',async()=>{
  current={...dto(null),effectiveChoices:{text:'official',vision:'official',image:'official',video:'official',audio:'official',embed:'official'}};
  await store.loadModelRouting(true);const fetch=vi.spyOn(globalThis,'fetch');const {result}=observe();
  expect(result.current).toMatchObject({v2:true,engine:'pi',checking:false,canSubmitText:true});
  expect(fetch).not.toHaveBeenCalled();expect(api.putModelRouting).not.toHaveBeenCalled();expect(api.patchPreferences).not.toHaveBeenCalled();
 });
 it('冷启动Codex未核实可提交，由实际准入取得真实模型ID；双hook不另请求engines',async()=>{
  current={...dto('codex'),effectiveChoices:{text:'codex',vision:'codex',image:'codex',video:'official',audio:'official',embed:'official'},capabilities:[{mode:'text',capability:'copilot.assist',source:'codex',status:'unverified',reasonCode:'CODEX_STATUS_UNAVAILABLE'}]};
  await store.loadModelRouting(true);const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('应当零额外探针'));
  const first=observe(),second=renderHook(()=>hook.useAssistantEngine(),{wrapper:StrictMode});
  expect(first.result.current).toMatchObject({engine:'codex',checking:false,available:false,canSubmitText:true,v2:true});
  expect(second.result.current.canSubmitText).toBe(true);await act(async()=>{});expect(fetch).not.toHaveBeenCalled();
 });
 it('已核验版本不支持仍阻止提交，刷新只读统一来源，无旧检查横条',async()=>{
  current={...dto('codex',{...choices,text:'codex'}),capabilities:[{mode:'text',capability:'copilot.assist',source:'codex',status:'unavailable',reasonCode:'CODEX_VERSION_UNSUPPORTED'}]};
  await store.loadModelRouting(true);const fetch=vi.spyOn(globalThis,'fetch');const {result}=observe();
  expect(result.current.canSubmitText).toBe(false);expect(result.current.status).not.toContain('正在检查');
  await act(async()=>result.current.recheck());expect(fetch).not.toHaveBeenCalled();
 });
});

it.each(['CODEX_LOGIN_REQUIRED','CODEX_STATUS_UNAVAILABLE','CODEX_CONFIG_CHANGED','CODEX_RUNTIME_UNAVAILABLE'])('T1294 已存Codex观察失败%s不永久锁死新提交，真正可用性仍由原准入负责',async reasonCode=>{
 current={...dto('codex',{...choices,text:'codex'}),capabilities:[{mode:'text',capability:'copilot.assist',source:'codex',status:'unavailable',reasonCode}]};
 await store.loadModelRouting(true);const fetch=vi.spyOn(globalThis,'fetch');const {result}=observe();
 expect(result.current).toMatchObject({available:false,textAvailable:false,checking:false,canSubmitText:true});
 expect(result.current.status).toContain('不可用');await act(async()=>{});expect(fetch).not.toHaveBeenCalled();expect(api.putModelRouting).not.toHaveBeenCalled();
});

it('T1294 冷窗口focus与来源GET并发不按浏览器旧Codex缓存初始化服务端偏好',async()=>{
 vi.resetModules();localStorage.setItem('creatoros:assistant-engine:v1','codex');
 store=await import('./assistant-engine');hook=await import('./use-assistant-engine');
 let release!:(value:ModelRoutingResource)=>void;api.getModelRouting.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 api.getPreferences.mockResolvedValue({assistantExecutionEngine:null});api.patchPreferences.mockResolvedValue({assistantExecutionEngine:'codex'});
 const {result}=observe();
 try{
  expect(result.current.routing.ready).toBe(false);await act(async()=>{window.dispatchEvent(new Event('focus'));});
  expect(api.getPreferences).not.toHaveBeenCalled();expect(api.patchPreferences).not.toHaveBeenCalled();expect(api.putModelRouting).not.toHaveBeenCalled();
 }finally{await act(async()=>{release({...dto(null),effectiveChoices:{text:'official',vision:'official',image:'official',video:'official',audio:'official',embed:'official'}});});}
 expect(result.current).toMatchObject({engine:'pi',v2:true,canSubmitText:true});
});
