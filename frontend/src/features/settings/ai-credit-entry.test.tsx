import * as React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import {CURRENT_ACCOUNT_KEY,CURRENT_GROUP_KEY} from '@/lib/http-transport';
const ports=vi.hoisted(()=>({open:vi.fn(),push:vi.fn()}));
vi.mock('@tauri-apps/plugin-opener',()=>({openUrl:ports.open}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:ports.push,replace:vi.fn(),refresh:vi.fn()}),usePathname:()=>'/projects',useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/components/shell/notification-popover',()=>({NotificationPopover:()=>null}));
import {TopHeader,type TopHeaderMode} from '@/components/shell/top-header';
function later<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
const response=()=>new Response(JSON.stringify({openUrl:'https://credit-fixture.invalid/credits/connect#one-use-fixture'}),{status:200});
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();localStorage.setItem(CURRENT_GROUP_KEY,'fixture-group-a');localStorage.setItem(CURRENT_ACCOUNT_KEY,'fixture-account-a');ports.open.mockResolvedValue(undefined);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('T1294真实TopHeader消费者与原额度helper（受控fetch/opener，零外部网络）',()=>{
 it.each(['global','project-overview','project-workspace','search','overlay-background'] as TopHeaderMode[])('模式%s永久入口，挂载零资金请求',{timeout:180_000,retry:0},async mode=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('禁止挂载资金请求'));render(<TopHeader mode={mode} pathname="/projects"/>);
  expect(screen.getByRole('button',{name:'充值'})).toBeEnabled();expect(fetch).not.toHaveBeenCalled();expect(ports.open).not.toHaveBeenCalled();
 });
 it('同一次点击走原connect/no-store，双击只一单，实际受控opener一次',{timeout:180_000,retry:0},async()=>{
  const read=later<Response>(),fetch=vi.spyOn(globalThis,'fetch').mockReturnValue(read.promise);render(<TopHeader pathname="/"/>);
  fireEvent.click(screen.getByRole('button',{name:'充值'}));fireEvent.click(screen.getByRole('button',{name:'正在打开…'}));expect(fetch).toHaveBeenCalledTimes(1);
  const [url,options]=fetch.mock.calls[0];expect(url).toBe('/api/v1/local/ai-credits/connect');expect(options).toMatchObject({method:'POST',cache:'no-store',redirect:'manual'});expect(options?.body).toBeUndefined();
  await act(async()=>read.resolve(response()));await waitFor(()=>expect(ports.open).toHaveBeenCalledTimes(1),{timeout:120_000});expect(ports.open).toHaveBeenCalledWith('https://credit-fixture.invalid/credits/connect#one-use-fixture');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it.each(['scope','unmount'] as const)('%s后connect晚回不打开，不走浏览器fallback',{timeout:180_000,retry:0},async action=>{
  const read=later<Response>(),fetch=vi.spyOn(globalThis,'fetch').mockReturnValue(read.promise),browser=vi.spyOn(window,'open').mockReturnValue(null);const view=render(<TopHeader/>);
  fireEvent.click(screen.getByRole('button',{name:'充值'}));const signal=fetch.mock.calls[0][1]?.signal as AbortSignal;
  if(action==='unmount')view.unmount();else act(()=>{localStorage.setItem(CURRENT_GROUP_KEY,'fixture-group-b');localStorage.setItem(CURRENT_ACCOUNT_KEY,'fixture-account-b');window.dispatchEvent(new Event('creatoros:accounts-changed'));});
  expect(signal.aborted).toBe(true);await act(async()=>{read.resolve(response());await Promise.resolve();});expect(ports.open).not.toHaveBeenCalled();expect(browser).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('json读取晚回、错组后不得打开旧额度中心',{timeout:180_000,retry:0},async()=>{
  const body=later<unknown>(),json=vi.fn(()=>body.promise);vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,json} as unknown as Response);const browser=vi.spyOn(window,'open').mockReturnValue(null);render(<TopHeader/>);
  fireEvent.click(screen.getByRole('button',{name:'充值'}));await waitFor(()=>expect(json).toHaveBeenCalledTimes(1),{timeout:120_000});act(()=>{localStorage.setItem(CURRENT_GROUP_KEY,'fixture-group-b');window.dispatchEvent(new Event('creatoros:accounts-changed'));});await act(async()=>body.resolve({openUrl:'https://credit-fixture.invalid/credits/connect#one-use-fixture'}));expect(ports.open).not.toHaveBeenCalled();expect(browser).not.toHaveBeenCalled();
 });
 it('真实受控失败保原错误与显式模型设置路径，不发新bootstrap',{timeout:180_000,retry:0},async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({error:'当前官方额度尚未开通，请使用自己的充值码'}),{status:409}));render(<TopHeader/>);fireEvent.click(screen.getByRole('button',{name:'充值'}));await screen.findByRole('alert',{}, {timeout:120_000});expect(screen.getByRole('alert')).toHaveTextContent('当前官方额度尚未开通，请使用自己的充值码');expect(screen.getByRole('link',{name:'前往模型设置'})).toHaveAttribute('href','/settings?highlight=ai-credits');expect(fetch).toHaveBeenCalledTimes(1);expect(ports.open).not.toHaveBeenCalled();
 });
});


describe('T1294局部关闭与Esc取消原打开观察',()=>{
 it.each(['button','escape'] as const)('%s取消在途，晚connect回执零外开',{timeout:180_000,retry:0},async how=>{
  const read=later<Response>(),fetch=vi.spyOn(globalThis,'fetch').mockReturnValue(read.promise),browser=vi.spyOn(window,'open').mockReturnValue(null);render(<TopHeader/>);fireEvent.click(screen.getByRole('button',{name:'充值'}));const signal=fetch.mock.calls[0][1]?.signal as AbortSignal;
  if(how==='button')fireEvent.click(screen.getByRole('button',{name:'取消打开额度中心'}));else fireEvent.keyDown(document,{key:'Escape'});
  expect(signal.aborted).toBe(true);expect(screen.getByRole('button',{name:'充值'})).toBeEnabled();await act(async()=>{read.resolve(response());await Promise.resolve();});expect(ports.open).not.toHaveBeenCalled();expect(browser).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(1);
 });
 it.each(['button','escape'] as const)('%s关闭错误提示，返回充值焦点，不重新发请求',{timeout:180_000,retry:0},async how=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({error:'受控额度打开失败'}),{status:409}));render(<TopHeader/>);fireEvent.click(screen.getByRole('button',{name:'充值'}));await screen.findByRole('alert',{}, {timeout:120_000});
  if(how==='button')fireEvent.click(screen.getByRole('button',{name:'关闭充值提示'}));else fireEvent.keyDown(document,{key:'Escape'});
  expect(screen.queryByRole('alert')).toBeNull();expect(screen.queryByRole('link',{name:'前往模型设置'})).toBeNull();expect(screen.getByRole('button',{name:'充值'})).toHaveFocus();expect(fetch).toHaveBeenCalledTimes(1);
 });
});
