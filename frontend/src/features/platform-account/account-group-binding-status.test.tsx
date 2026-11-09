import * as React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {AccountGroupResource} from '@creatoros/contract';
const api=vi.hoisted(()=>({getAccountGroupBindingStatus:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:api}));
import {AccountGroupBindingStatusCell,useAccountGroupBindingStatus} from './account-group-binding-status';
const group=(id:string):AccountGroupResource=>({id,userId:'u',name:id,status:'active',version:1,createdAt:'2026-11-09T00:00:00Z',updatedAt:'2026-11-09T00:00:00Z',members:[{id:'member-'+id,groupId:id,accountId:'a-'+id,platform:'douyin',accountHandle:'账号'+id,status:'active',version:1,joinedAt:'2026-11-09T00:00:00Z',leftAt:null}]});
const result=(id:string)=>({groupId:id,accounts:[{accountId:'a-'+id,platform:'douyin',accountHandle:'账号'+id,bindingState:'bound',loginState:'verified',checkedAt:'2026-11-09T04:22:00Z',reasonCode:null}]});
function Harness({id}:{id:string}){const g=group(id),status=useAccountGroupBindingStatus(g);return <><button onClick={status.refresh}>刷新</button><AccountGroupBindingStatusCell platform="douyin" members={g.members} status={status}/></>;}
beforeEach(()=>{vi.resetAllMocks();});afterEach(cleanup);
it('旧组在途结果不能覆盖新组，读取重叠仅排队一次；卸载后无后续请求',async()=>{
 let finish!:(value:unknown)=>void;
 api.getAccountGroupBindingStatus.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockImplementation(async({params})=>result(params.groupId));
 const view=render(<Harness id="g"/>);
 expect(await screen.findByText('登录状态读取中…')).toBeVisible();
 fireEvent.click(screen.getByText('刷新'));fireEvent.click(screen.getByText('刷新'));
 view.rerender(<Harness id="h"/>);
 expect(api.getAccountGroupBindingStatus).toHaveBeenCalledTimes(1);
 await act(async()=>finish(result('g')));
 expect(await screen.findByText('已绑定 · 账号h')).toBeVisible();
 expect(screen.queryByText(/账号g/)).toBeNull();
 expect(api.getAccountGroupBindingStatus).toHaveBeenCalledTimes(2);
 view.unmount();await act(async()=>{});expect(api.getAccountGroupBindingStatus).toHaveBeenCalledTimes(2);
});
it('同平台多账号各自显示，失效不变绿，缺证据不推断有效',async()=>{
 const g=group('g');g.members.push({...g.members[0]!,id:'second',accountId:'b',accountHandle:'第二账号'});
 api.getAccountGroupBindingStatus.mockResolvedValue({...result('g'),accounts:[...result('g').accounts,{accountId:'b',platform:'douyin',accountHandle:'第二账号',bindingState:'bound',loginState:'needs_login',checkedAt:'2026-11-09T04:23:00Z',reasonCode:'needs_auth'}]});
 function Multiple(){const status=useAccountGroupBindingStatus(g);return <AccountGroupBindingStatusCell platform="douyin" members={g.members} status={status}/>;}
 render(<Multiple/>);expect(await screen.findByText('最近验证有效')).toBeVisible();expect(screen.getByText('需要重新登录')).toBeVisible();expect(screen.getAllByRole('time')).toHaveLength(2);
});
it('错误归属和损坏证据不显示有效；空平台明确未绑定，恢复可读回',async()=>{
 api.getAccountGroupBindingStatus.mockResolvedValueOnce(result('foreign')).mockResolvedValue({groupId:'g',accounts:[]});
 render(<Harness id="g"/>);expect(await screen.findByText('登录状态未确认')).toBeVisible();expect(screen.queryByText('最近验证有效')).toBeNull();
 fireEvent.click(screen.getByText('刷新'));expect(await screen.findByText('登录待验证')).toBeVisible();
 await waitFor(()=>expect(api.getAccountGroupBindingStatus).toHaveBeenCalledTimes(2));
});
