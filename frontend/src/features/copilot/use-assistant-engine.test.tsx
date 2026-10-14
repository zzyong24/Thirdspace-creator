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
  await act(async()=>{current=dto('pi',{...choices,text:'codex'},2);resolve(current);await saving;});expect(result.current).toMatchObject({engine:'codex',available:true,preference:{saving:false}});expect(api.getModelRouting).toHaveBeenCalled();expect(api.putModelRouting).toHaveBeenCalledWith({params:undefined,query:undefined,body:{schemaVersion:1,choices:{...choices,text:'codex'},expectedRevision:1}});expect(api.patchPreferences).not.toHaveBeenCalled();
 });
 it('PUT 失败保原来源与真实失败，重试仍同 revision，不能把缓存当持久化',{timeout:180_000,retry:0},async()=>{
  current=dto('pi',choices,1);await store.loadModelRouting(true);api.putModelRouting.mockRejectedValueOnce(Error('save-failed'));const {result}=observe();await act(async()=>{await expect(store.writeModelRouting({...choices,text:'codex'},1)).rejects.toThrow('save-failed');});expect(result.current).toMatchObject({engine:'pi',preference:{saving:false,error:'模型来源保存失败，草稿已保留'}});await act(async()=>{await store.writeModelRouting({...choices,text:'codex'},1);});expect(result.current).toMatchObject({engine:'codex',available:true,preference:{error:null}});expect(api.putModelRouting.mock.calls.map(([request])=>request.body.expectedRevision)).toEqual([1,1]);
 });
 it('legacy Codex 改为 legacy Pi 取消原状态请求，未遵守取消的晚结果也不能反写',{timeout:180_000,retry:0},async()=>{
  await legacy('codex');let resolve!:(value:Response)=>void;const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(r=>{resolve=r;}));const {result}=observe();await wait(()=>expect(fetch).toHaveBeenCalledOnce());const signal=fetch.mock.calls[0]![1]?.signal;await act(async()=>{current=dto('pi');await store.loadModelRouting(true);});expect(signal?.aborted).toBe(true);await act(async()=>resolve(status()));expect(result.current).toMatchObject({engine:'pi',available:true});
 });
 it('跨窗 revision 广播重新 GET，旧 engine 缓存不能覆盖来源服务值',{timeout:180_000,retry:0},async()=>{
  current=dto('pi',{...choices,text:'codex'},1);await store.loadModelRouting(true);const {result}=observe();expect(result.current.engine).toBe('codex');const before=api.getModelRouting.mock.calls.length;current=dto('pi',choices,2);act(()=>{localStorage.setItem('creatoros:assistant-engine:v1','codex');window.dispatchEvent(new StorageEvent('storage',{key:'creatoros:model-routing:revision'}));});await wait(()=>expect(result.current).toMatchObject({engine:'pi',available:true}));expect(api.getModelRouting).toHaveBeenCalledTimes(before+1);
 });
 it('账号改变取消 legacy Codex 状态，晚回执/卸载不能反写当前号',{timeout:180_000,retry:0},async()=>{
  localStorage.setItem(CURRENT_ACCOUNT_KEY,'account-a');await legacy('codex');const pending:Array<(value:Response)=>void>=[];const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(r=>pending.push(r)));const {result,unmount}=observe();await wait(()=>expect(fetch).toHaveBeenCalledOnce());
  await act(async()=>{localStorage.setItem(CURRENT_ACCOUNT_KEY,'account-b');window.dispatchEvent(new CustomEvent('creatoros:accounts-changed'));await store.loadModelRouting(true);});await wait(()=>expect(fetch).toHaveBeenCalledTimes(2));expect(fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true);expect(fetch.mock.calls[1]![1]?.headers).toMatchObject({'x-account-id':'account-b'});
  await act(async()=>pending[1]!(status(false)));await act(async()=>pending[0]!(status(true)));expect(result.current).toMatchObject({accountId:'account-b',available:false});const signal=fetch.mock.calls[1]![1]?.signal;unmount();expect(signal?.aborted).toBe(true);
 });
 it('同 account=null 的组切换也须重新检查，旧组 status 不能供新组使用',{timeout:180_000,retry:0},async()=>{
  localStorage.setItem(CURRENT_GROUP_KEY,'group-a');await legacy('codex');const pending:Array<(value:Response)=>void>=[];const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(r=>pending.push(r)));const {result}=observe();await wait(()=>expect(fetch).toHaveBeenCalledOnce());
  await act(async()=>{localStorage.setItem(CURRENT_GROUP_KEY,'group-b');window.dispatchEvent(new CustomEvent('creatoros:accounts-changed'));await store.loadModelRouting(true);});await wait(()=>expect(fetch).toHaveBeenCalledTimes(2));expect(fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true);expect(fetch.mock.calls[1]![1]?.headers).toMatchObject({'x-group-id':'group-b'});await act(async()=>pending[1]!(status(false)));await act(async()=>pending[0]!(status(true)));expect(result.current.available).toBe(false);
 });
 it('重新检查广播到两个订阅，原请求取消且迟到失败不反写',{timeout:180_000,retry:0},async()=>{
  await legacy('codex');let resolve!:(value:Response)=>void;const fetch=vi.spyOn(globalThis,'fetch').mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockImplementation(async()=>status());const first=observe();await wait(()=>expect(fetch).toHaveBeenCalledOnce());const signal=fetch.mock.calls[0]![1]?.signal;const second=observe();await wait(()=>expect(second.result.current.available).toBe(true));act(()=>second.result.current.recheck());await wait(()=>expect(fetch).toHaveBeenCalledTimes(4));expect(signal?.aborted).toBe(true);await wait(()=>expect(first.result.current.available).toBe(true));await act(async()=>resolve(status(false)));expect(first.result.current.available).toBe(true);
 });
 it('原状态读取失败显示未核实，重新检查恢复真实状态',{timeout:180_000,retry:0},async()=>{
  await legacy('codex');const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(Error('unavailable')).mockResolvedValue(status());const {result}=observe();await wait(()=>expect(result.current.checking).toBe(false));expect(result.current).toMatchObject({available:false,status:'本地 Codex 状态暂未核实'});act(()=>result.current.recheck());await wait(()=>expect(result.current.available).toBe(true));expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('revision 广播缓存写失败仍服从 PUT/GET；focus 重新读取服务值',{timeout:180_000,retry:0},async()=>{
  current=dto('pi',choices,1);await store.loadModelRouting(true);vi.spyOn(Object.getPrototypeOf(localStorage),'setItem').mockImplementation(()=>{throw Error('quota');});const {result}=observe();await act(async()=>{await store.writeModelRouting({...choices,text:'codex'},1);});expect(result.current).toMatchObject({engine:'codex',available:true});current=dto('pi',choices,3);act(()=>window.dispatchEvent(new Event('focus')));await wait(()=>expect(result.current.engine).toBe('pi'));
 });
 it('StrictMode 取消首挂载，legacy 状态不重复调用；routing GET 在途共享',{timeout:180_000,retry:0},async()=>{
  await legacy('codex');const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(status());const {result}=renderHook(()=>hook.useAssistantEngine(),{wrapper:StrictMode});await wait(()=>expect(result.current.available).toBe(true));expect(fetch).toHaveBeenCalledOnce();
 });
 it('旧PATCH经真实GET生效，两hook共享新legacy来源；不PUT或拼造v2',{timeout:180_000,retry:0},async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async()=>status());await store.loadAssistantEngine(true);const first=observe(),second=observe();
  api.patchPreferences.mockImplementationOnce(async({body})=>{current=dto(body.assistantExecutionEngine);return {assistantExecutionEngine:body.assistantExecutionEngine};});
  const reads=api.getModelRouting.mock.calls.length;await act(async()=>{await expect(store.writeAssistantEngine('codex')).resolves.toBe('codex');});
  await wait(()=>expect(first.result.current).toMatchObject({engine:'codex',available:true,v2:false}));expect(second.result.current.engine).toBe('codex');
  expect(api.getModelRouting).toHaveBeenCalledTimes(reads+1);expect(first.result.current.routing.resource).toEqual(dto('codex'));expect(api.patchPreferences).toHaveBeenCalledWith({params:undefined,query:undefined,body:{assistantExecutionEngine:'codex'}});expect(api.putModelRouting).not.toHaveBeenCalled();
 });
 it('旧PATCH已受理但GET未确认时不提交，重新GET恢复；不自动重投PATCH',{timeout:180_000,retry:0},async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async()=>status());await store.loadAssistantEngine(true);const {result}=observe();
  api.patchPreferences.mockImplementationOnce(async()=>{current=dto('codex');return {assistantExecutionEngine:'codex'};});api.getModelRouting.mockRejectedValueOnce(Error('read-failed'));
  await act(async()=>{await expect(store.writeAssistantEngine('codex')).rejects.toThrow('read-failed');});expect(result.current).toMatchObject({canSubmitText:false,preference:{ready:false,saving:false}});expect(api.patchPreferences).toHaveBeenCalledOnce();
  await act(async()=>{await store.loadModelRouting(true);});await wait(()=>expect(result.current).toMatchObject({engine:'codex',available:true}));expect(api.patchPreferences).toHaveBeenCalledOnce();expect(api.putModelRouting).not.toHaveBeenCalled();
 });
 it('旧PATCH读回在途不能提交，原GET晚结果不能覆盖读回Codex',{timeout:180_000,retry:0},async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async()=>status());await store.loadAssistantEngine(true);const {result}=observe();let oldRead!:(value:ModelRoutingResource)=>void;
  api.getModelRouting.mockImplementationOnce(()=>new Promise(r=>{oldRead=r;}));let reading!:Promise<void>;act(()=>{reading=store.loadModelRouting(true);});
  let receipt!:(value:{assistantExecutionEngine:'codex'})=>void;api.patchPreferences.mockImplementationOnce(()=>new Promise(r=>{receipt=r;}));let saving!:Promise<unknown>;act(()=>{saving=store.writeAssistantEngine('codex');});
  expect(result.current.canSubmitText).toBe(false);await act(async()=>{current=dto('codex');receipt({assistantExecutionEngine:'codex'});await saving;});await wait(()=>expect(result.current.engine).toBe('codex'));
  await act(async()=>{oldRead(dto('pi'));await reading;});expect(result.current).toMatchObject({engine:'codex',available:true});expect(api.putModelRouting).not.toHaveBeenCalled();
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
  current=dto('codex');act(()=>{localStorage.setItem('creatoros:assistant-engine:v1','pi');window.dispatchEvent(new StorageEvent('storage',{key:'creatoros:assistant-engine:v1'}));});await wait(()=>expect(result.current).toMatchObject({engine:'codex',available:true}));expect(api.getModelRouting).toHaveBeenCalledTimes(reads+1);expect(api.patchPreferences).not.toHaveBeenCalled();expect(api.putModelRouting).not.toHaveBeenCalled();
 });

});
