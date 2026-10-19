import * as React from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import type {AccountGroupResource} from '@creatoros/contract';
const api=vi.hoisted(()=>({startAccountBinding:vi.fn(),getAccountBinding:vi.fn(),cancelAccountBinding:vi.fn(),getAccount:vi.fn(),getAccountGroup:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:api}));
import {AccountBindingPanel} from './account-binding-panel';
import {CURRENT_GROUP_KEY} from '@/lib/http-transport';
const group:AccountGroupResource={id:'g',userId:'u',name:'真实创作者',status:'active',version:1,members:[{id:'verified-member',groupId:'g',accountId:'real-account',platform:'douyin',accountHandle:'已核验账号',status:'active',version:1,joinedAt:'2026-10-04T00:00:00Z',leftAt:null}],createdAt:'2026-10-04T00:00:00Z',updatedAt:'2026-10-04T00:00:00Z'};
const run={runId:'real-run',groupId:'g',platform:'douyin',status:'waiting_verification',accountId:null,error:null,createdAt:'2026-10-04T00:00:00Z',updatedAt:'2026-10-04T00:00:00Z'};
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();sessionStorage.clear();localStorage.setItem(CURRENT_GROUP_KEY,'g');api.startAccountBinding.mockResolvedValue(run);api.getAccountBinding.mockResolvedValue(run);api.cancelAccountBinding.mockResolvedValue({...run,status:'cancel_requested'});api.getAccountGroup.mockResolvedValue(group);api.getAccount.mockResolvedValue({id:'real-account',userId:'u',platform:'douyin',accountHandle:'已核验账号'});});afterEach(cleanup);
const show=(changed=vi.fn())=>render(<AccountBindingPanel group={group} canStart onChanged={changed}/>);
it('开始真实run冻结目标组版本，等待扫码时不能假报已连接',async()=>{show();fireEvent.click(screen.getByRole('button',{name:'扫码绑定抖音账号'}));await screen.findByText('等待扫码验证');expect(api.startAccountBinding.mock.calls[0][0].body).toMatchObject({groupId:'g',platform:'douyin',expectedGroupVersion:1});expect(screen.queryByText('绑定已完成')).toBeNull();expect(screen.queryByText(/real-run/)).toBeNull();expect(JSON.parse(sessionStorage.getItem('creatoros:account-binding:u:g')!).runId).toBe(run.runId);});
it('取消返回requested只展示停止中，实际status确认cancelled后才结束',async()=>{show();fireEvent.click(screen.getByRole('button',{name:'扫码绑定抖音账号'}));await screen.findByText('等待扫码验证');fireEvent.click(screen.getByRole('button',{name:'取消本次绑定'}));await screen.findByText('正在停止本次扫码');expect(screen.queryByText('本次绑定已取消')).toBeNull();api.getAccountBinding.mockResolvedValue({...run,status:'cancelled'});fireEvent.click(screen.getByRole('button',{name:'刷新绑定状态'}));await screen.findByText('本次绑定已取消');});
it('未知开始结果重试复用同一个意图key，不重复启动扫码',async()=>{api.startAccountBinding.mockRejectedValueOnce(Error('结果未知')).mockResolvedValue(run);show();fireEvent.click(screen.getByRole('button',{name:'扫码绑定抖音账号'}));await screen.findByText('结果未知');fireEvent.click(screen.getByRole('button',{name:'核对上次绑定请求'}));await screen.findByText('等待扫码验证');expect(api.startAccountBinding.mock.calls[0][0].body.idempotencyKey).toBe(api.startAccountBinding.mock.calls[1][0].body.idempotencyKey);});
it('只有真实成功账号详情读回才刷新组数据',async()=>{api.getAccountBinding.mockResolvedValue({...run,status:'succeeded',accountId:'real-account'});const changed=vi.fn();show(changed);fireEvent.click(screen.getByRole('button',{name:'扫码绑定抖音账号'}));await waitFor(()=>expect(api.getAccount).toHaveBeenCalledWith({params:{accountId:'real-account'},query:undefined,body:undefined}));await waitFor(()=>expect(changed).toHaveBeenCalledTimes(1));await screen.findByText('绑定已完成');});
it('切组或卸载后的迟到开始结果不写新组状态',async()=>{let resolve!:(value:typeof run)=>void;api.startAccountBinding.mockImplementation(()=>new Promise(done=>{resolve=done;}));const changed=vi.fn(),view=show(changed);fireEvent.click(screen.getByRole('button',{name:'扫码绑定抖音账号'}));await waitFor(()=>expect(api.startAccountBinding).toHaveBeenCalled());localStorage.setItem(CURRENT_GROUP_KEY,'h');view.unmount();resolve(run);await Promise.resolve();expect(api.getAccountBinding).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();});
it('状态刷新最多一个在途请求，连续点击不能重复读回或采纳结果',async()=>{
 let resolve!:(value:typeof run)=>void;api.getAccountBinding.mockImplementation(()=>new Promise(done=>{resolve=done;}));show();fireEvent.click(screen.getByRole('button',{name:'扫码绑定抖音账号'}));await screen.findByText('等待扫码验证');await waitFor(()=>expect(api.getAccountBinding).toHaveBeenCalledOnce());fireEvent.click(screen.getByRole('button',{name:'刷新绑定状态'}));fireEvent.click(screen.getByRole('button',{name:'刷新绑定状态'}));expect(api.getAccountBinding).toHaveBeenCalledOnce();resolve(run);
});
it('重新进入页面读真实run索引，不再次启动扫码任务',async()=>{const first=show();fireEvent.click(screen.getByRole('button',{name:'扫码绑定抖音账号'}));await screen.findByText('等待扫码验证');first.unmount();api.startAccountBinding.mockClear();show();await screen.findByText('等待扫码验证');expect(api.startAccountBinding).not.toHaveBeenCalled();expect(api.getAccountBinding).toHaveBeenCalled();});
it('卸载会释放提交中的前台离开保护，迟到回执仍被丢弃',async()=>{const {hasForegroundActivity}=await import('@/lib/foreground-activity');let resolve!:(value:typeof run)=>void;api.startAccountBinding.mockImplementation(()=>new Promise(done=>{resolve=done;}));const first=show();fireEvent.click(screen.getByRole('button',{name:'扫码绑定抖音账号'}));expect(hasForegroundActivity()).toBe(true);await waitFor(()=>expect(api.startAccountBinding).toHaveBeenCalled());first.unmount();expect(hasForegroundActivity()).toBe(false);resolve(run);await Promise.resolve();expect(api.getAccountBinding).not.toHaveBeenCalled();});
it('T1069 小红书入口冻结真实平台，同组不同平台的未知请求索引分开',async()=>{
 api.startAccountBinding.mockResolvedValue({...run,platform:'xiaohongshu'});
 render(<AccountBindingPanel {...({group,canStart:true,platform:'xiaohongshu',onChanged:vi.fn()} as any)}/>);
 fireEvent.click(screen.getByRole('button',{name:'扫码绑定小红书账号'}));await waitFor(()=>expect(api.startAccountBinding).toHaveBeenCalled());expect(api.startAccountBinding.mock.calls[0][0].body.platform).toBe('xiaohongshu');
 expect(JSON.parse(sessionStorage.getItem('creatoros:account-binding:u:g:xiaohongshu')!).runId).toBe(run.runId);expect(sessionStorage.getItem('creatoros:account-binding:u:g')).toBeNull();
});

it.each([['wechatOfficial','公众号'],['wechatVideo','视频号']] as const)('T1110 %s扫码冻结真实微信平台而不调抖音入口',async(platform,label)=>{api.startAccountBinding.mockResolvedValue({...run,platform});api.getAccountBinding.mockResolvedValue({...run,platform});render(<AccountBindingPanel group={group} canStart platform={platform} onChanged={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:`扫码绑定${label}账号`}));await waitFor(()=>expect(api.startAccountBinding).toHaveBeenCalledOnce());expect(api.startAccountBinding.mock.calls[0][0].body).toMatchObject({platform,groupId:'g',expectedGroupVersion:1});await screen.findByText('等待扫码验证');});

it('T1345平台明确点击意图在StrictMode下只启动一次，无需第二按钮确认',async()=>{
 render(<React.StrictMode><AccountBindingPanel {...({group,canStart:true,onChanged:vi.fn(),startIntent:'explicit-platform-click-1'} as any)}/></React.StrictMode>);
 await screen.findByText('等待扫码验证');expect(api.startAccountBinding).toHaveBeenCalledTimes(1);
});
it('T1345重新打开明确扫码入口时已有活跃run只恢复原run，不重复启动',async()=>{
 sessionStorage.setItem('creatoros:account-binding:u:g',JSON.stringify({runId:'real-run'}));
 render(<AccountBindingPanel {...({group,canStart:true,onChanged:vi.fn(),startIntent:'explicit-platform-click-2'} as any)}/>);
 await screen.findByText('等待扫码验证');expect(api.startAccountBinding).not.toHaveBeenCalled();expect(api.getAccountBinding.mock.calls[0][0].params.runId).toBe('real-run');
});
it('T1345未知旧intent重开不自动重发，显式核对仍复用原key',async()=>{
 const original={groupId:'g',platform:'douyin',expectedGroupVersion:1,idempotencyKey:'original-intent-key'};
 sessionStorage.setItem('creatoros:account-binding:u:g',JSON.stringify({intent:original}));
 render(<AccountBindingPanel {...({group,canStart:true,onChanged:vi.fn(),startIntent:'explicit-platform-click-3'} as any)}/>);
 await screen.findByRole('button',{name:'核对上次绑定请求'});expect(api.startAccountBinding).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'核对上次绑定请求'}));await screen.findByText('等待扫码验证');expect(api.startAccountBinding.mock.calls[0][0].body.idempotencyKey).toBe('original-intent-key');
});

it('T1345旧run刚完成后同平台新扫码使用真实最新组版本',async()=>{
 sessionStorage.setItem('creatoros:account-binding:u:g',JSON.stringify({runId:'completed-run'}));
 api.getAccountBinding.mockResolvedValue({...run,runId:'completed-run',status:'succeeded',accountId:'real-account'});
 api.getAccountGroup.mockResolvedValue({...group,version:7});
 render(<AccountBindingPanel {...({group,canStart:true,onChanged:vi.fn(),startIntent:'next-account'} as any)}/>);
 await waitFor(()=>expect(api.startAccountBinding).toHaveBeenCalledTimes(1));expect(api.startAccountBinding.mock.calls[0][0].body.expectedGroupVersion).toBe(7);
});
it('T1345成功回执详情未核实前不显示完成或继续，原run可重读恢复',async()=>{
 api.startAccountBinding.mockResolvedValue({...run,status:'succeeded',accountId:'real-account'});
 api.getAccountBinding.mockResolvedValue({...run,status:'succeeded',accountId:'real-account'});
 api.getAccount.mockRejectedValueOnce(Error('账号详情尚未读取'));
 const changed=vi.fn();render(<AccountBindingPanel group={group} canStart onChanged={changed} onCompleted={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'扫码绑定抖音账号'}));await screen.findByText('账号详情尚未读取');
 expect(screen.queryByText('绑定已完成')).toBeNull();expect(screen.queryByRole('button',{name:'继续绑定其他账号'})).toBeNull();expect(changed).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'刷新绑定状态'}));await screen.findByText('绑定已完成');expect(changed).toHaveBeenCalledTimes(1);
});
