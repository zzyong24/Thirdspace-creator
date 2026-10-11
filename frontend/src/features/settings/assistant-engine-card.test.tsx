import {fireEvent,render,screen,waitFor,act} from '@testing-library/react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
const api=vi.hoisted(()=>({getPreferences:vi.fn(),patchPreferences:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:api}));
import {loadAssistantEngine} from '@/features/copilot/assistant-engine';
import {AssistantEngineCard} from './assistant-engine-card';
const preference=(engine:'pi'|'codex')=>({assistantExecutionEngine:engine});
const response=(available=true,imageGeneration=true)=>new Response(JSON.stringify({engines:[{engine:'codex',installed:true,available,version:'0.159.3',loginStatus:'authenticated',capabilities:{text:true,imageUnderstanding:true,imageGeneration}}]}),{status:200});
beforeEach(async()=>{api.getPreferences.mockReset().mockResolvedValue(preference('pi'));api.patchPreferences.mockReset().mockImplementation(async({body})=>preference(body.assistantExecutionEngine));await loadAssistantEngine(true);});
describe('T-1238 设置引擎卡保存原后端偏好',()=>{
 it('真实选择PATCH成功后显示Codex文本与生图状态，重复选择不重复保存',{timeout:120_000,retry:0},async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(response());const {container}=render(<AssistantEngineCard/>);expect(container.querySelector('[data-highlight="assistant-engine"]')).not.toBeNull();const select=screen.getByRole('combobox',{name:'编导引擎'});expect(select).toHaveValue('pi');fireEvent.change(select,{target:{value:'codex'}});
  await screen.findByText('本地 Codex 已连接 · 0.159.3 · 文本与生图可用');expect(api.patchPreferences).toHaveBeenCalledWith({params:undefined,query:undefined,body:{assistantExecutionEngine:'codex'}});expect(select).toHaveValue('codex');expect(fetch).toHaveBeenCalledOnce();fireEvent.change(select,{target:{value:'codex'}});expect(api.patchPreferences).toHaveBeenCalledOnce();expect(screen.getByRole('button',{name:'重新检查'})).toBeEnabled();
 });
 it('保存中禁止重复交互，失败保留Pi并可重试',{timeout:120_000,retry:0},async()=>{
  let reject!:(reason:unknown)=>void;api.patchPreferences.mockImplementationOnce(()=>new Promise((_resolve,r)=>{reject=r;}));vi.spyOn(globalThis,'fetch').mockResolvedValue(response());render(<AssistantEngineCard/>);const select=screen.getByRole('combobox',{name:'编导引擎'});fireEvent.change(select,{target:{value:'codex'}});expect(select).toBeDisabled();expect(select).toHaveValue('pi');expect(screen.getByRole('status')).toHaveTextContent('正在保存引擎');await act(async()=>reject(Error('save-failed')));await screen.findByText('引擎保存失败，请重试');expect(select).toBeEnabled();expect(select).toHaveValue('pi');fireEvent.change(select,{target:{value:'codex'}});await screen.findByText('本地 Codex 已连接 · 0.159.3 · 文本与生图可用');expect(api.patchPreferences).toHaveBeenCalledTimes(2);
 });
 it('状态检查中不并发重查，失败后可重查且真实能力不足如实显示',{timeout:120_000,retry:0},async()=>{
  api.getPreferences.mockResolvedValue(preference('codex'));await loadAssistantEngine(true);let reject!:(reason:unknown)=>void;const fetch=vi.spyOn(globalThis,'fetch').mockImplementationOnce(()=>new Promise((_resolve,r)=>{reject=r;})).mockResolvedValue(response(true,false));render(<AssistantEngineCard/>);const recheck=screen.getByRole('button',{name:'重新检查'});expect(recheck).toBeDisabled();await waitFor(()=>expect(fetch).toHaveBeenCalledOnce());fireEvent.click(recheck);expect(fetch).toHaveBeenCalledOnce();await act(async()=>reject(Error('status-read-unavailable')));await screen.findByText('本地 Codex 状态暂未核实');fireEvent.click(recheck);await screen.findByText('本地 Codex 已连接 · 0.159.3 · 文本可用，生图能力当前不可用');expect(fetch).toHaveBeenCalledTimes(2);
 });
});
