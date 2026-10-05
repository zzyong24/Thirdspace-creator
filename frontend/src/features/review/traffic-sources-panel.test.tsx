import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TrafficSourcesPanel } from './traffic-sources-panel';
const mocks=vi.hoisted(()=>({account:'account-1',group:'group-1',get:vi.fn(),refresh:vi.fn()}));
vi.mock('@/lib/http-transport',()=>({readCurrentAccountId:()=>mocks.account,readCurrentGroupId:()=>mocks.group}));
vi.mock('@/lib/contract-client',()=>({client:{getProjectTrafficSources:mocks.get,refreshProjectTrafficSources:mocks.refresh}}));
vi.mock('@/lib/ai-error-humanize',()=>({describeUserError:(_:unknown,fallback:string)=>fallback}));
const row=(status='pending',label='推荐页')=>({publicationId:'pub-1',externalId:'123',status,error:null,capturedAt:'2026-09-11T01:00:00Z',data:status==='pending'?null:{app:'抖音 App',windowLabel:null,complete:true,entries:[{label,percentage:0}]}});
const settle=()=>act(async()=>{await Promise.resolve();});
beforeEach(()=>{vi.useFakeTimers();vi.resetAllMocks();mocks.account='account-1';mocks.group='group-1';mocks.get.mockResolvedValue({items:[]});mocks.refresh.mockResolvedValue({jobRunId:'run-1'});});
it('局部平台选择只展示真实所选发布的来源，切组不接受旧组晚到响应',async()=>{
 let resolveOld!:(v:unknown)=>void;
 mocks.get.mockReturnValueOnce(new Promise(r=>{resolveOld=r;})).mockResolvedValue({items:[{...row('succeeded','目标来源'),publicationId:'selected'},row('succeeded','非所选来源')]});
 render(<TrafficSourcesPanel projectId="p1" publicationIds={['selected']}/>);
 mocks.group='group-2';window.dispatchEvent(new Event('creatoros:accounts-changed'));await settle();
 resolveOld({items:[{...row('succeeded','旧组来源'),publicationId:'selected'}]});await settle();
 expect(screen.queryByText('旧组来源')).toBeNull();expect(screen.queryByText('非所选来源')).toBeNull();expect(screen.getByText('目标来源')).toBeTruthy();
});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('平台未提供来源时保留历史及原采集时间，不显示读取失败或伪造比例',async()=>{
 mocks.get.mockResolvedValue({items:[{...row('unavailable','历史来源'),error:'平台暂未提供该作品的流量来源数据'}]});
 render(<TrafficSourcesPanel projectId="p1"/>);await settle();
 expect(screen.getByText('平台暂未提供来源数据')).toBeTruthy();expect(screen.getByText('历史来源')).toBeTruthy();
 expect(screen.getByText(/以下保留上次成功数据/)).toBeTruthy();expect(screen.queryByText('读取失败，可重试')).toBeNull();
});
it('初始没有待采任务，手动补采后持续轮询直到成功，真实零保留',async()=>{
 render(<TrafficSourcesPanel projectId="p1"/>);await settle();
 mocks.get.mockResolvedValueOnce({items:[row()]}).mockResolvedValue({items:[row('succeeded')]});
 fireEvent.click(screen.getByRole('button',{name:'补采 / 重试'}));await settle();
 expect(screen.getByText('后台补采中')).toBeTruthy();
 await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
 expect(screen.getByText('已采集')).toBeTruthy();expect(screen.getByText('0%')).toBeTruthy();
 const calls=mocks.get.mock.calls.length;
 await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});
 expect(mocks.get).toHaveBeenCalledTimes(calls);
});
it('待采期间一次读取失败仍继续轮询恢复',async()=>{
 mocks.get.mockResolvedValueOnce({items:[row()]}).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({items:[row('succeeded')]});
 render(<TrafficSourcesPanel projectId="p1"/>);await settle();
 await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
 expect(screen.getByRole('alert')).toBeTruthy();
 await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
 expect(screen.getByText('已采集')).toBeTruthy();expect(screen.queryByRole('alert')).toBeNull();
});
it('切换项目后迟到的读取与补采结果不能污染新项目或续开旧轮询',async()=>{
 let resolveRead!:(v:unknown)=>void,resolveRefresh!:(v:unknown)=>void;
 mocks.get.mockReturnValueOnce(new Promise(r=>{resolveRead=r;}));
 mocks.refresh.mockReturnValueOnce(new Promise(r=>{resolveRefresh=r;}));
 const {rerender}=render(<TrafficSourcesPanel projectId="old"/>);
 fireEvent.click(screen.getByRole('button',{name:'补采 / 重试'}));
 rerender(<TrafficSourcesPanel projectId="new"/>);await settle();
 await act(async()=>{resolveRead({items:[row('succeeded','旧账号来源')]});resolveRefresh({jobRunId:'old-job'});});
 expect(screen.queryByText('旧账号来源')).toBeNull();expect(screen.queryByRole('status')).toBeNull();
 expect(screen.getByRole('button',{name:'补采 / 重试'})).not.toBeDisabled();
 await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
 expect(mocks.get.mock.calls.map(c=>c[0].params.projectId)).toEqual(['old','new']);
});
it('账号切换重载并清理旧数据，旧请求拒绝也不会显示错误',async()=>{
 let reject!:(e:Error)=>void;
 mocks.get.mockReturnValueOnce(new Promise((_,r)=>{reject=r;}));
 render(<TrafficSourcesPanel projectId="p1"/>);
 await act(async()=>{mocks.account='account-2';window.dispatchEvent(new Event('creatoros:accounts-changed'));});
 await settle();
 await act(async()=>{reject(new Error('old account'));});
 expect(screen.queryByRole('alert')).toBeNull();expect(mocks.get).toHaveBeenCalledTimes(2);
});
it('卸载后迟到的 pending 响应不再排轮询',async()=>{
 let resolve!:(v:unknown)=>void;
 mocks.get.mockReturnValueOnce(new Promise(r=>{resolve=r;}));
 const {unmount}=render(<TrafficSourcesPanel projectId="p1"/>);unmount();
 await act(async()=>{resolve({items:[row()]});await vi.advanceTimersByTimeAsync(15000);});
 expect(mocks.get).toHaveBeenCalledTimes(1);
});
it('重复手动刷新响应乱序时保留后一次结果',async()=>{
 let resolve!:(v:unknown)=>void;
 mocks.get.mockReturnValueOnce(new Promise(r=>{resolve=r;})).mockResolvedValue({items:[row('succeeded','最新来源')]});
 render(<TrafficSourcesPanel projectId="p1"/>);
 fireEvent.click(screen.getByRole('button',{name:'刷新结果'}));await settle();
 await act(async()=>{resolve({items:[row('failed','过期来源')]});});
 expect(screen.getByText('最新来源')).toBeTruthy();expect(screen.queryByText('过期来源')).toBeNull();
});
it('启动失败立即回读已结算失败行，不再挂抓取中且可重试',async()=>{
 mocks.get.mockResolvedValueOnce({items:[row()]}).mockResolvedValue({items:[{...row('failed'),error:'启动失败，数据保留'}]});
 mocks.refresh.mockRejectedValue(new Error('prepare failed'));
 render(<TrafficSourcesPanel projectId="p1"/>);await settle();
 fireEvent.click(screen.getByRole('button',{name:'补采 / 重试'}));await settle();
 expect(screen.queryByText('后台补采中')).toBeNull();expect(screen.getByText('读取失败，可重试')).toBeTruthy();expect(screen.getByRole('alert')).toBeTruthy();expect(screen.getByRole('button',{name:'补采 / 重试'})).not.toBeDisabled();
 const calls=mocks.get.mock.calls.length;await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});expect(mocks.get).toHaveBeenCalledTimes(calls);
});
