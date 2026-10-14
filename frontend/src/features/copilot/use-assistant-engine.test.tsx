import {StrictMode} from 'react';
import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {CURRENT_ACCOUNT_KEY} from '@/lib/http-transport';
const api=vi.hoisted(()=>({getPreferences:vi.fn(),patchPreferences:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:api}));
import {loadAssistantEngine,writeAssistantEngine} from './assistant-engine';
import {useAssistantEngine} from './use-assistant-engine';
const preference=(engine:'pi'|'codex'|null)=>({assistantExecutionEngine:engine});
const status=(available=true)=>new Response(JSON.stringify({engines:[{engine:'codex',installed:true,available,version:'0.159.3',loginStatus:'authenticated',capabilities:{text:true,imageUnderstanding:true,imageGeneration:true}}]}),{status:200});
const setServer=async(engine:'pi'|'codex'|null)=>{api.getPreferences.mockResolvedValue(preference(engine));await loadAssistantEngine(true);};
beforeEach(async()=>{api.getPreferences.mockReset().mockResolvedValue(preference('pi'));api.patchPreferences.mockReset().mockImplementation(async({body})=>preference(body.assistantExecutionEngine));await loadAssistantEngine(true);});
describe('T-1238 后端编导引擎偏好和真实本地状态',()=>{
 it('后端Pi覆盖旧浏览器Codex缓存，Pi不请求Codex状态',{timeout:120_000,retry:0},async()=>{
  localStorage.setItem('creatoros:assistant-engine:v1','codex');await setServer('pi');const fetch=vi.spyOn(globalThis,'fetch');const {result}=renderHook(()=>useAssistantEngine());
  expect(result.current).toMatchObject({engine:'pi',available:true,checking:false,preference:{ready:true}});expect(api.getPreferences).toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(localStorage.getItem('creatoros:assistant-engine:v1')).toBe('pi');
 });
 it('后端未设置时只用initialize比较写迁移旧浏览器选择',{timeout:120_000,retry:0},async()=>{
  localStorage.setItem('creatoros:assistant-engine:v1','codex');await setServer(null);localStorage.setItem(CURRENT_ACCOUNT_KEY,'account-a');const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(status());const {result}=renderHook(()=>useAssistantEngine());
  await waitFor(()=>expect(result.current.available).toBe(true));expect(api.patchPreferences).toHaveBeenCalledWith({params:undefined,query:undefined,body:{assistantExecutionEngine:'codex',initializeAssistantExecutionEngine:true}});
  expect(fetch).toHaveBeenCalledWith('/api/chat/engines',expect.objectContaining({headers:{'x-account-id':'account-a'},credentials:'same-origin',signal:expect.any(AbortSignal)}));expect(result.current.status).toContain('文本与生图可用');
 });
 it('PATCH成功前旧引擎保持，保存中不可用；服务回执后才生效',{timeout:120_000,retry:0},async()=>{
  let resolve!:(value:ReturnType<typeof preference>)=>void;api.patchPreferences.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));vi.spyOn(globalThis,'fetch').mockResolvedValue(status());const {result}=renderHook(()=>useAssistantEngine());let saving!:Promise<unknown>;
  act(()=>{saving=writeAssistantEngine('codex');});expect(result.current).toMatchObject({engine:'pi',available:false,preference:{saving:true}});expect(localStorage.getItem('creatoros:assistant-engine:v1')).toBe('pi');
  await act(async()=>{resolve(preference('codex'));await saving;});await waitFor(()=>expect(result.current).toMatchObject({engine:'codex',available:true,preference:{saving:false}}));
  expect(api.patchPreferences).toHaveBeenLastCalledWith({params:undefined,query:undefined,body:{assistantExecutionEngine:'codex'}});
 });
 it('PATCH失败保留已读服务值并可重试，不按浏览器缓存伪成功',{timeout:120_000,retry:0},async()=>{
  api.patchPreferences.mockRejectedValueOnce(Error('save-failed'));vi.spyOn(globalThis,'fetch').mockResolvedValue(status());const {result}=renderHook(()=>useAssistantEngine());
  await act(async()=>{await expect(writeAssistantEngine('codex')).rejects.toThrow('save-failed');});expect(result.current).toMatchObject({engine:'pi',preference:{saving:false,error:'引擎保存失败，请重试'}});expect(localStorage.getItem('creatoros:assistant-engine:v1')).toBe('pi');
  await act(async()=>{await writeAssistantEngine('codex');});await waitFor(()=>expect(result.current).toMatchObject({engine:'codex',available:true,preference:{error:null}}));
 });
 it('切回Pi取消Codex在途请求，晚回执不能覆盖',{timeout:120_000,retry:0},async()=>{
  await setServer('codex');let resolve!:(value:Response)=>void;const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(r=>{resolve=r;}));const {result}=renderHook(()=>useAssistantEngine());await waitFor(()=>expect(fetch).toHaveBeenCalledOnce());const signal=fetch.mock.calls[0][1]?.signal;
  await act(async()=>{await writeAssistantEngine('pi');});expect(signal?.aborted).toBe(true);await act(async()=>resolve(status()));expect(result.current).toMatchObject({engine:'pi',available:true});
 });
 it('跨窗广播重新读后端，缓存内容不能覆盖服务值',{timeout:120_000,retry:0},async()=>{
  await setServer('codex');vi.spyOn(globalThis,'fetch').mockResolvedValue(status());const {result}=renderHook(()=>useAssistantEngine());await waitFor(()=>expect(result.current.available).toBe(true));api.getPreferences.mockResolvedValue(preference('pi'));
  act(()=>{localStorage.setItem('creatoros:assistant-engine:v1','codex');window.dispatchEvent(new StorageEvent('storage',{key:'creatoros:assistant-engine:v1'}));});await waitFor(()=>expect(result.current).toMatchObject({engine:'pi',available:true}));expect(api.getPreferences).toHaveBeenCalledTimes(3);
 });
 it('账号变更取消旧状态并忽略未遵守取消的晚回执',{timeout:120_000,retry:0},async()=>{
  await setServer('codex');localStorage.setItem(CURRENT_ACCOUNT_KEY,'account-a');const pending:Array<(value:Response)=>void>=[];const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(r=>pending.push(r)));const {result,unmount}=renderHook(()=>useAssistantEngine());await waitFor(()=>expect(fetch).toHaveBeenCalledOnce());
  act(()=>{localStorage.setItem(CURRENT_ACCOUNT_KEY,'account-b');window.dispatchEvent(new CustomEvent('creatoros:accounts-changed'));});await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);expect(fetch.mock.calls[1][1]?.headers).toMatchObject({'x-account-id':'account-b'});
  await act(async()=>pending[1](status(false)));await act(async()=>pending[0](status(true)));expect(result.current).toMatchObject({accountId:'account-b',available:false});const secondSignal=fetch.mock.calls[1][1]?.signal;unmount();expect(secondSignal?.aborted).toBe(true);
 });
 it('重新检查广播到两个窗口订阅，旧回执不反写',{timeout:120_000,retry:0},async()=>{
  await setServer('codex');let resolve!:(value:Response)=>void;const fetch=vi.spyOn(globalThis,'fetch').mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockImplementation(async()=>status());const first=renderHook(()=>useAssistantEngine());await waitFor(()=>expect(fetch).toHaveBeenCalledOnce());const signal=fetch.mock.calls[0][1]?.signal;const second=renderHook(()=>useAssistantEngine());await waitFor(()=>expect(second.result.current.available).toBe(true));act(()=>second.result.current.recheck());await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(4));expect(signal?.aborted).toBe(true);await waitFor(()=>expect(first.result.current.available).toBe(true));await act(async()=>resolve(status(false)));expect(first.result.current.available).toBe(true);
 });
 it('真实状态读取失败显示未核实，重查可恢复',{timeout:120_000,retry:0},async()=>{
  await setServer('codex');const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(Error('unavailable')).mockResolvedValue(status());const {result}=renderHook(()=>useAssistantEngine());await waitFor(()=>expect(result.current.checking).toBe(false));expect(result.current).toMatchObject({available:false,status:'本地 Codex 状态暂未核实'});act(()=>result.current.recheck());await waitFor(()=>expect(result.current.available).toBe(true));expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('浏览器缓存写失败仍以成功PATCH回执生效',{timeout:120_000,retry:0},async()=>{
  vi.spyOn(Object.getPrototypeOf(localStorage),'setItem').mockImplementation(()=>{throw Error('quota');});vi.spyOn(globalThis,'fetch').mockResolvedValue(status());const {result}=renderHook(()=>useAssistantEngine());await act(async()=>{await writeAssistantEngine('codex');});await waitFor(()=>expect(result.current).toMatchObject({engine:'codex',available:true}));api.getPreferences.mockResolvedValue(preference('pi'));act(()=>window.dispatchEvent(new Event('focus')));await waitFor(()=>expect(result.current.engine).toBe('pi'));
 });
 it('StrictMode取消首挂载请求，不产生重复状态调用',{timeout:120_000,retry:0},async()=>{
  await setServer('codex');const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(status());const {result}=renderHook(()=>useAssistantEngine(),{wrapper:StrictMode});await waitFor(()=>expect(result.current.available).toBe(true));expect(fetch).toHaveBeenCalledOnce();
 });
});
