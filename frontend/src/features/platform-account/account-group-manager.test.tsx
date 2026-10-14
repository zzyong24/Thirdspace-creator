import * as React from "react";
import type {AccountGroupResource} from "@creatoros/contract";
import { act, cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const router={refresh:vi.fn()};
const api=vi.hoisted(()=>({listAccountGroups:vi.fn(),listAccounts:vi.fn(),createAccountGroup:vi.fn(),getAccountGroup:vi.fn(),updateAccountGroup:vi.fn(),archiveAccountGroup:vi.fn(),restoreAccountGroup:vi.fn(),previewAccountGroupTransfer:vi.fn(),transferAccountGroupMember:vi.fn(),createAccount:vi.fn(),getAccount:vi.fn(),archiveAccount:vi.fn(),updateAccount:vi.fn(),loginDouyin:vi.fn(),listProjects:vi.fn(),listKnowledge:vi.fn(),listConversations:vi.fn(),getPlatformAccountCapabilities:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>router}));
vi.mock("@/lib/contract-client",()=>({client:api}));
const pagination=vi.hoisted(()=>({total:null as number|null}));
vi.mock("@/lib/http-transport",async importOriginal=>{
 const actual=await importOriginal<typeof import("@/lib/http-transport")>();
 return {...actual,createHttpTransport:()=>({request:async(endpoint:{id:string},input:{query:{page:number;pageSize:number}})=>{
  if(endpoint.id==="groupResourceGrants.list")return {data:[],meta:{requestId:"owned-grants-list",page:input.query.page??1,pageSize:input.query.pageSize??100,total:0}};
  if(endpoint.id!=="accountGroups.list")throw Error(`未装配的测试读取入口：${endpoint.id}`);
  const data=await api.listAccountGroups(input);
  return {data,meta:{requestId:"owned-group-list",page:input.query.page,pageSize:input.query.pageSize,total:pagination.total??data.length}};
 }})};
});

import { AccountManagerView } from "./account-manager-view";
import { CURRENT_GROUP_KEY } from "@/lib/http-transport";
import { notifyAccountsChanged } from "@/lib/account-events";
const member={id:"m",accountId:"a",groupId:"g",platform:"douyin" as const,accountHandle:"真实账号",status:"active" as const,version:2,joinedAt:"2026-10-01T00:00:00.000Z",leftAt:null};
const group=(id="g",name="创作者",members=id==="g"?[member]:[])=>({id,userId:"u",name,status:"active" as const,version:1,createdAt:"2026-10-01T00:00:00.000Z",updatedAt:"2026-10-01T00:00:00.000Z",members});
const renderManager=()=>render(<AccountManagerView viewModel={{accounts:[],groups:[group(),group("h","另一组")]}}/>);
beforeEach(()=>{pagination.total=null;vi.clearAllMocks();localStorage.clear();localStorage.setItem(CURRENT_GROUP_KEY,"g");window.history.replaceState(null,"","/accounts");api.getPlatformAccountCapabilities.mockResolvedValue([{platform:"douyin",bind:{available:true,reason:"已接入真实扫码",method:"qr"},collect:{available:true,reason:"已接入作品采集"},publish:{available:false,reason:"自动发布端口未装配"},draft:{available:false,reason:"草稿端口未装配"},manual:{available:true,reason:"可登记真实账号"}},{platform:"kuaishou",bind:{available:false,reason:"快手扫码端口未装配",method:"none"},collect:{available:false,reason:"快手采集端口未装配"},publish:{available:false,reason:"自动发布端口未装配"},draft:{available:false,reason:"草稿端口未装配"},manual:{available:true,reason:"可登记真实账号"}}]);api.listProjects.mockResolvedValue([{id:"p",title:"原组真实项目"}]);api.listKnowledge.mockResolvedValue([]);api.listConversations.mockResolvedValue([]);api.listAccountGroups.mockResolvedValue([group(),group("h","另一组")]);api.listAccounts.mockResolvedValue([]);api.getAccountGroup.mockResolvedValue(group());api.getAccount.mockResolvedValue({id:"manual"});});afterEach(cleanup);
describe("账号组管理真实操作",()=>{
 it("显示组与真实成员，允许创建空组而不强制先绑定",async()=>{renderManager();expect(await screen.findByRole("heading",{name:"账号组与绑定账号"})).toBeVisible();expect(screen.getByText("真实账号")).toBeVisible();expect(screen.getByRole("button",{name:"创建账号组"})).toBeVisible();});
 it("建组调用真实接口并读回，不制造本地成功",async()=>{api.createAccountGroup.mockResolvedValue(group("new","品牌组",[]));api.getAccountGroup.mockResolvedValue(group("new","品牌组",[]));api.listAccountGroups.mockResolvedValueOnce([group(),group("h","另一组")]).mockResolvedValue([group(),group("h","另一组"),group("new","品牌组",[])]);renderManager();fireEvent.change(screen.getByLabelText("新账号组名称"),{target:{value:"品牌组"}});fireEvent.click(screen.getByRole("button",{name:"创建账号组"}));await waitFor(()=>expect(api.createAccountGroup).toHaveBeenCalled());expect(api.createAccountGroup.mock.calls[0][0].body).toMatchObject({name:"品牌组"});await waitFor(()=>expect(api.getAccountGroup).toHaveBeenCalledWith(expect.objectContaining({params:{groupId:"new"}})));});
 it("修改名称携带版本，失败保留输入且不显示内部操作编号",async()=>{api.updateAccountGroup.mockRejectedValue(new Error("HttpTransport: 409 for accountGroups.update: 名称未保存：版本冲突"));renderManager();fireEvent.change(screen.getByLabelText("账号组名称"),{target:{value:"新名称"}});fireEvent.click(screen.getByRole("button",{name:"保存名称"}));await screen.findByText("名称未保存：版本冲突");expect(screen.getByLabelText("账号组名称")).toHaveValue("新名称");expect(screen.getByText('名称未保存：版本冲突').closest('[role="alert"]')).not.toHaveTextContent('HttpTransport');expect(api.updateAccountGroup.mock.calls[0][0].body).toEqual({name:"新名称",expectedVersion:1});});
 it("转组先显示影响预览，明确确认后才用digest与版本提交",async()=>{const preview={accountId:"a",fromGroupId:"g",toGroupId:"h",expectedMembershipVersion:2,digest:"checked",activeTaskCount:0,historyPolicy:"keep_original_group"};api.previewAccountGroupTransfer.mockResolvedValue(preview);api.transferAccountGroupMember.mockResolvedValue({...member,groupId:"h"});renderManager();fireEvent.click(screen.getByText("账号管理与能力"));fireEvent.click(screen.getByRole("button",{name:"转组"}));fireEvent.change(screen.getByLabelText("目标账号组"),{target:{value:"h"}});fireEvent.click(screen.getByRole("button",{name:"查看转组影响"}));await screen.findByText(/历史作品和数据仍在原组/);expect(api.transferAccountGroupMember).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"确认转组"}));await waitFor(()=>expect(api.transferAccountGroupMember).toHaveBeenCalled());expect(api.transferAccountGroupMember.mock.calls[0][0].body).toMatchObject(preview);});
 it("非抖音明确登记，不能伪装扫码绑定或已自动采集",async()=>{api.createAccount.mockResolvedValue({id:"manual",platform:"kuaishou",accountHandle:"快手品牌"});renderManager();await screen.findByLabelText("登记平台");fireEvent.change(screen.getByLabelText("登记平台"),{target:{value:"kuaishou"}});fireEvent.change(screen.getByLabelText("平台账号名称"),{target:{value:"快手品牌"}});expect(screen.getByRole("button",{name:"登记账号"})).toBeDisabled();fireEvent.click(screen.getByLabelText("确认这是我管理的账号"));fireEvent.click(screen.getByRole("button",{name:"登记账号"}));await waitFor(()=>expect(api.createAccount).toHaveBeenCalled());expect(api.createAccount.mock.calls[0][0].body).toEqual({platform:"kuaishou",accountHandle:"快手品牌",idempotencyKey:expect.any(String)});expect(screen.getByText(/不会验证登录或自动采集/)).toBeVisible();});
 it("归档与恢复携带版本，回读真实状态并保留历史成员",async()=>{
  let persisted:AccountGroupResource=group();api.listAccountGroups.mockImplementation(async()=>[persisted,group("h","另一组")]);api.getAccountGroup.mockImplementation(async()=>persisted);
  api.archiveAccountGroup.mockImplementation(async()=>{persisted={...persisted,status:"archived",version:2};return persisted;});api.restoreAccountGroup.mockImplementation(async()=>{persisted={...persisted,status:"active",version:3};return persisted;});
  renderManager();fireEvent.click(screen.getByText("管理账号组"));fireEvent.click(screen.getByRole("button",{name:"归档账号组"}));await screen.findByRole("button",{name:"恢复账号组"});
  expect(api.archiveAccountGroup.mock.calls[0][0].body).toEqual({expectedVersion:1});expect(screen.getByText("真实账号")).toBeVisible();
  fireEvent.click(screen.getByRole("button",{name:"恢复账号组"}));await waitFor(()=>expect(api.restoreAccountGroup).toHaveBeenCalled());expect(api.restoreAccountGroup.mock.calls[0][0].body).toEqual({expectedVersion:2});
 });
 it("转组预览有在途任务时保留原因，不能确认",async()=>{
  api.previewAccountGroupTransfer.mockResolvedValue({accountId:"a",fromGroupId:"g",toGroupId:"h",expectedMembershipVersion:2,digest:"blocked",activeTaskCount:3,historyPolicy:"keep_original_group"});renderManager();
  await screen.findByLabelText("登记平台");fireEvent.click(screen.getByText("账号管理与能力"));fireEvent.click(screen.getByRole("button",{name:"转组"}));fireEvent.click(screen.getByRole("button",{name:"查看转组影响"}));await screen.findByText(/请先等待该账号任务结束/);expect(screen.getByRole("button",{name:"确认转组"})).toBeDisabled();expect(api.transferAccountGroupMember).not.toHaveBeenCalled();
 });
 it("创建结果未知后重试复用同一幂等key，保留组名",async()=>{
  api.createAccountGroup.mockRejectedValueOnce(new Error("网络中断，尚未读到结果")).mockResolvedValue(group("new","品牌组",[]));api.getAccountGroup.mockResolvedValue(group("new","品牌组",[]));renderManager();
  fireEvent.change(screen.getByLabelText("新账号组名称"),{target:{value:"品牌组"}});fireEvent.click(screen.getByRole("button",{name:"创建账号组"}));await screen.findByText("网络中断，尚未读到结果");expect(screen.getByLabelText("新账号组名称")).toHaveValue("品牌组");fireEvent.click(screen.getByRole("button",{name:"创建账号组"}));await waitFor(()=>expect(api.createAccountGroup).toHaveBeenCalledTimes(2));expect(api.createAccountGroup.mock.calls[0][0].body.idempotencyKey).toBe(api.createAccountGroup.mock.calls[1][0].body.idempotencyKey);
 });

});

it("历史资料入口在当前组本地展开，关闭时不提前读资料",async()=>{renderManager();await screen.findByLabelText("登记平台");expect(api.listProjects).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"整理历史资料"}));await screen.findByLabelText("项目：原组真实项目");expect(router.refresh).not.toHaveBeenCalled();});
it("查看另一组不能偷读其历史资料，明确提示先进入",async()=>{renderManager();await screen.findByLabelText("登记平台");fireEvent.click(screen.getByRole("button",{name:/另一组/}));expect(await screen.findByText("先进入此账号组，再查看和整理历史资料。")).toBeVisible();expect(api.listProjects).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:"整理历史资料"})).toBeNull();});

it("平台能力来自真实接口，明确展示缺失原因而不是平台名推断",async()=>{renderManager();expect(await screen.findByText("快手采集端口未装配")).toBeVisible();expect(screen.getByText("快手扫码端口未装配")).toBeVisible();expect(screen.getByRole("table",{name:"各平台能力"})).toHaveTextContent("草稿端口未装配");expect(api.getPlatformAccountCapabilities).toHaveBeenCalled();});
it("实际扫码端口不可用时显示原因并隐藏该自动绑定入口",async()=>{api.getPlatformAccountCapabilities.mockResolvedValue([{platform:"douyin",bind:{available:false,reason:"本机扫码端口未装配",method:"none"},collect:{available:false,reason:"采集端口未装配"},publish:{available:false,reason:"发布端口未装配"},draft:{available:false,reason:"草稿端口未装配"},manual:{available:true,reason:"可登记"}}]);renderManager();await screen.findByText("本机扫码端口未装配");expect(screen.queryByRole("button",{name:"扫码绑定新抖音号"})).toBeNull();expect(api.loginDouyin).not.toHaveBeenCalled();});
it("能力读取失败保留合法登记路径并提供重读，不假报不可用",async()=>{api.getPlatformAccountCapabilities.mockRejectedValueOnce(Error("能力读取失败"));renderManager();await screen.findByText("能力读取失败");expect(screen.getByRole("button",{name:"重试读取"})).toBeVisible();expect(screen.getByLabelText("登记平台")).toBeEnabled();fireEvent.click(screen.getByRole("button",{name:"重试读取"}));await screen.findByText("快手采集端口未装配");});

it("转组影响明确列出历史作品和待发布目标，定位稿件素材仍留原组",async()=>{api.previewAccountGroupTransfer.mockResolvedValue({accountId:"a",fromGroupId:"g",toGroupId:"h",expectedMembershipVersion:2,digest:"real",activeTaskCount:0,historyPolicy:"keep_original_group",impact:{historyPublicationCount:3,pendingPublicationTargetCount:2,sharedProjectCount:1,positioningCount:4,assetReferenceCount:5}});renderManager();await screen.findByLabelText("登记平台");fireEvent.click(screen.getByText("账号管理与能力"));fireEvent.click(screen.getByRole("button",{name:"转组"}));fireEvent.click(screen.getByRole("button",{name:"查看转组影响"}));expect(await screen.findByText("历史发布作品：3")).toBeVisible();expect(screen.getByText("待发布目标：2")).toBeVisible();expect(screen.getByText(/定位、稿件和素材仍留在原组/)).toBeVisible();expect(api.transferAccountGroupMember).not.toHaveBeenCalled();});
it("首个空组创建读回后选择新组并清空名称，不能被自动选择变化吞掉成功回调",async()=>{localStorage.clear();api.listAccountGroups.mockResolvedValueOnce([]).mockResolvedValue([group("new","首个品牌",[])]);api.createAccountGroup.mockResolvedValue(group("new","首个品牌",[]));api.getAccountGroup.mockResolvedValue(group("new","首个品牌",[]));render(<AccountManagerView viewModel={{accounts:[],groups:[]}}/>);await screen.findByText("先创建账号组，账号可以稍后绑定。");fireEvent.change(screen.getByLabelText("新账号组名称"),{target:{value:"首个品牌"}});fireEvent.click(screen.getByRole("button",{name:"创建账号组"}));await screen.findByRole("button",{name:"进入此账号组"});expect(screen.getByLabelText("新账号组名称")).toHaveValue("");expect(screen.getByLabelText("账号组名称")).toHaveValue("首个品牌");});

it('三平台扫码入口在能力表内，删除常驻刷新及重复扫码框',async()=>{
 const row=(platform:string)=>({platform,bind:{available:true,reason:'已接入',method:'qr'},collect:{available:true,reason:'真实采集'},publish:{available:false,reason:'尚未接入'},draft:{available:false,reason:'尚未接入'},manual:{available:true,reason:'可登记'}});api.getPlatformAccountCapabilities.mockResolvedValue(['douyin','kuaishou','xiaohongshu'].map(row));renderManager();const table=await screen.findByRole('table',{name:'各平台能力'});await waitFor(()=>expect(within(table).getByRole('button',{name:'扫码绑定快手账号'})).toBeEnabled());expect(within(table).getByRole('button',{name:'扫码绑定抖音账号'})).toBeEnabled();expect(within(table).getByRole('button',{name:'扫码绑定小红书账号'})).toBeEnabled();expect(screen.queryByRole('button',{name:'重新读取平台能力'})).toBeNull();expect(screen.queryByText('兼容扫码入口')).toBeNull();fireEvent.click(within(table).getByRole('button',{name:'扫码绑定快手账号'}));expect(await screen.findByRole('dialog')).toHaveTextContent('扫码绑定快手账号');expect(api.loginDouyin).not.toHaveBeenCalled();
});

it.each([['wechatOfficial','公众号'],['wechatVideo','视频号']] as const)('T1110 %s真实扫码按钮在能力表中，组成员链接带显式accountId',async(platform,label)=>{const own={...member,platform,accountId:'wechat-real',accountHandle:'本人微信账号'};api.listAccountGroups.mockResolvedValue([{...group(),members:[own]}]);api.getPlatformAccountCapabilities.mockResolvedValue([{platform,bind:{available:true,reason:'真实端口已装配',method:'qr'},collect:{available:true,reason:'原生报表'},publish:{available:false,reason:'未接入'},draft:{available:false,reason:'未接入'},manual:{available:true,reason:'可登记'}}]);render(<AccountManagerView viewModel={{accounts:[],groups:[{...group(),members:[own]}]}}/>);const table=await screen.findByRole('table',{name:'各平台能力'});const trigger=await within(table).findByRole('button',{name:`扫码绑定${label}账号`});expect(trigger).toBeEnabled();expect(screen.getByRole('link',{name:'查看本人微信账号的数据'})).toHaveAttribute('href','/accounts/works?accountId=wechat-real');fireEvent.click(trigger);expect(await screen.findByRole('dialog')).toHaveTextContent(`扫码绑定${label}账号`);expect(api.loginDouyin).not.toHaveBeenCalled();});

it.each(['douyin','wechatVideo','wechatOfficial'] as const)('T1169 %s转组Esc和取消均回原按钮，重复打开不预览或提交',async platform=>{
 const own={...member,platform};const groups=[{...group(),members:[own]},group('h','另一组')];api.listAccountGroups.mockResolvedValue(groups);
 render(<AccountManagerView viewModel={{accounts:[],groups}}/>);await screen.findByLabelText('登记平台',{}, {timeout:120000});
 fireEvent.click(screen.getByText('账号管理与能力'));
 const trigger=screen.getByRole('button',{name:'转组'});
 for(const close of ['escape','cancel']){
  trigger.focus();fireEvent.click(trigger);const dialog=await screen.findByRole('dialog',{}, {timeout:120000});expect(within(dialog).getByLabelText('目标账号组')).toHaveValue('h');
  await act(async()=>{if(close==='escape')fireEvent.keyDown(document,{key:'Escape',code:'Escape'});else fireEvent.click(within(dialog).getByRole('button',{name:'取消'}));});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});expect(screen.queryByRole('dialog')).toBeNull();expect(trigger).toHaveFocus();
 }
 expect(api.previewAccountGroupTransfer).not.toHaveBeenCalled();expect(api.transferAccountGroupMember).not.toHaveBeenCalled();
});

it('T1169切组后保留旧表面也不对旧工作区触发器回焦',async()=>{
 renderManager();await screen.findByLabelText('登记平台',{}, {timeout:120000});fireEvent.click(screen.getByText('账号管理与能力'));const trigger=screen.getByRole('button',{name:'转组'});trigger.focus();fireEvent.click(trigger);await screen.findByRole('dialog',{}, {timeout:120000});const focused=vi.spyOn(trigger,'focus');
 localStorage.setItem(CURRENT_GROUP_KEY,'h');await act(async()=>{fireEvent.keyDown(document,{key:'Escape',code:'Escape'});});await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
 expect(trigger.isConnected).toBe(true);expect(focused).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();expect(api.previewAccountGroupTransfer).not.toHaveBeenCalled();expect(api.transferAccountGroupMember).not.toHaveBeenCalled();focused.mockRestore();
});
it('T1169真实成员回读移除触发器后关闭不对脱离DOM的按钮回焦',async()=>{
 renderManager();await screen.findByLabelText('登记平台',{}, {timeout:120000});fireEvent.click(screen.getByText('账号管理与能力'));const trigger=screen.getByRole('button',{name:'转组'});trigger.focus();fireEvent.click(trigger);await screen.findByRole('dialog',{}, {timeout:120000});const focused=vi.spyOn(trigger,'focus');
 api.listAccountGroups.mockResolvedValue([group('g','创作者',[]),group('h','另一组')]);await act(async()=>{notifyAccountsChanged({source:'account-management',groupId:'g',routeRefreshScheduled:true});});
 await waitFor(()=>expect(screen.queryByRole('button',{name:'转组'})).toBeNull(),{timeout:120000});expect(trigger.isConnected).toBe(false);
 await act(async()=>{fireEvent.keyDown(document,{key:'Escape',code:'Escape'});});await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
 expect(focused).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();expect(api.previewAccountGroupTransfer).not.toHaveBeenCalled();expect(api.transferAccountGroupMember).not.toHaveBeenCalled();focused.mockRestore();
});

it.each([['wechatOfficial','公众号'],['wechatVideo','视频号']] as const)('T1110 %s扫码弹窗按Escape关闭后回到原表格按钮',async(platform,label)=>{
 sessionStorage.clear();
 api.getPlatformAccountCapabilities.mockResolvedValue([{platform,bind:{available:true,reason:'真实端口已装配',method:'qr'},collect:{available:true,reason:'原生报表'},publish:{available:false,reason:'未接入'},draft:{available:false,reason:'未接入'},manual:{available:true,reason:'可登记'}}]);
 renderManager();
 const trigger=await within(await screen.findByRole('table',{name:'各平台能力'})).findByRole('button',{name:`扫码绑定${label}账号`});
 await waitFor(()=>expect(trigger).toBeEnabled());trigger.focus();fireEvent.click(trigger);
 const dialog=await screen.findByRole('dialog',{name:`扫码绑定${label}账号`});
 fireEvent.keyDown(dialog,{key:'Escape'});
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 await waitFor(()=>expect(trigger).toHaveFocus());
 expect(api.loginDouyin).not.toHaveBeenCalled();
});

it("T1246 当前合法组位于第113项时逐页读取真实total，保留当前组与合法数据入口",async()=>{
 const rows=Array.from({length:113},(_,index)=>group(`page-group-${index+1}`,`真实组${index+1}`,index===112?[{...member,groupId:"page-group-113",accountId:"own-page-account"}]:[]));
 localStorage.setItem(CURRENT_GROUP_KEY,"page-group-113");pagination.total=113;
 api.listAccountGroups.mockImplementation(async({query})=>rows.slice((query.page-1)*query.pageSize,query.page*query.pageSize));
 render(<AccountManagerView viewModel={{accounts:[],groups:[]}}/>);
 const selected=await screen.findByRole("button",{name:/真实组113.*当前工作区/},{timeout:120000});
 expect(selected).toHaveAttribute("aria-pressed","true");
 expect(api.listAccountGroups.mock.calls.map(([input])=>input.query.page)).toEqual([1,2]);
 expect(screen.getByRole("link",{name:"查看真实账号的数据"})).toHaveAttribute("href","/accounts/works?accountId=own-page-account");
});
