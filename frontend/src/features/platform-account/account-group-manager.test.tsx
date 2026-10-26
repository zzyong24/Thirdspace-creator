import * as React from "react";
import userEvent from "@testing-library/user-event";
import type {AccountGroupResource} from "@creatoros/contract";
import { act, cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const router={refresh:vi.fn()};
const api=vi.hoisted(()=>({listAccountGroups:vi.fn(),listAccounts:vi.fn(),createAccountGroup:vi.fn(),getAccountGroup:vi.fn(),updateAccountGroup:vi.fn(),archiveAccountGroup:vi.fn(),restoreAccountGroup:vi.fn(),previewAccountGroupTransfer:vi.fn(),transferAccountGroupMember:vi.fn(),createAccount:vi.fn(),getAccount:vi.fn(),archiveAccount:vi.fn(),updateAccount:vi.fn(),loginDouyin:vi.fn(),listProjects:vi.fn(),listKnowledge:vi.fn(),listConversations:vi.fn(),getPlatformAccountCapabilities:vi.fn(),startAccountBinding:vi.fn(),getAccountBinding:vi.fn(),cancelAccountBinding:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>router}));
vi.mock("@/lib/contract-client",()=>({client:api}));
const pagination=vi.hoisted(()=>({total:null as number|null,accountTotal:null as number|null}));
vi.mock("@/lib/http-transport",async importOriginal=>{
 const actual=await importOriginal<typeof import("@/lib/http-transport")>();
 return {...actual,createHttpTransport:()=>({request:async(endpoint:{id:string},input:{query:{page:number;pageSize:number}})=>{
  if(endpoint.id==="groupResourceGrants.list")return {data:[],meta:{requestId:"owned-grants-list",page:input.query.page??1,pageSize:input.query.pageSize??100,total:0}};
  if(endpoint.id==="accounts.list"){
   const rows=await api.listAccounts(input);
   const data=rows.map((row:Record<string,unknown>)=>({userId:"u",externalAccountId:null,secretReference:null,followerBaseline:0,createdAt:"2026-10-01T00:00:00.000Z",updatedAt:"2026-10-01T00:00:00.000Z",...row}));
   return {data,meta:{requestId:"owned-account-list",page:input.query.page,pageSize:input.query.pageSize,total:pagination.accountTotal??data.length}};
  }
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
const openManagement=async(name="真实账号")=>{const trigger=screen.getByRole("button",{name:`管理${name}`});await userEvent.click(trigger);return trigger;};
const openTransfer=async()=>{const trigger=await openManagement();await userEvent.click(screen.getByRole("menuitem",{name:"转组"}));return trigger;};
const openRename=async()=>{await openManagement("创作者");await userEvent.click(screen.getByRole("menuitem",{name:"重命名"}));};
beforeEach(()=>{sessionStorage.clear();pagination.total=null;pagination.accountTotal=null;vi.clearAllMocks();localStorage.clear();localStorage.setItem(CURRENT_GROUP_KEY,"g");window.history.replaceState(null,"","/accounts");api.getPlatformAccountCapabilities.mockResolvedValue([{platform:"douyin",bind:{available:true,reason:"已接入真实扫码",method:"qr"},collect:{available:true,reason:"已接入作品采集"},publish:{available:false,reason:"自动发布端口未装配"},draft:{available:false,reason:"草稿端口未装配"},manual:{available:true,reason:"可登记真实账号"}},{platform:"kuaishou",bind:{available:false,reason:"快手扫码端口未装配",method:"none"},collect:{available:false,reason:"快手采集端口未装配"},publish:{available:false,reason:"自动发布端口未装配"},draft:{available:false,reason:"草稿端口未装配"},manual:{available:true,reason:"可登记真实账号"}}]);api.listProjects.mockResolvedValue([{id:"p",title:"原组真实项目"}]);api.listKnowledge.mockResolvedValue([]);api.listConversations.mockResolvedValue([]);api.listAccountGroups.mockResolvedValue([group(),group("h","另一组")]);api.listAccounts.mockResolvedValue([]);api.getAccountGroup.mockResolvedValue(group());api.getAccount.mockResolvedValue({id:"manual"});api.startAccountBinding.mockImplementation(async({body})=>({runId:`run-${body.platform}`,groupId:body.groupId,platform:body.platform,status:"waiting_verification",accountId:null,error:null,createdAt:"2026-10-18T00:00:00Z",updatedAt:"2026-10-18T00:00:00Z"}));api.getAccountBinding.mockImplementation(async({params})=>({runId:params.runId,groupId:"g",platform:params.runId.slice(4),status:"waiting_verification",accountId:null,error:null,createdAt:"2026-10-18T00:00:00Z",updatedAt:"2026-10-18T00:00:00Z"}));});afterEach(cleanup);
describe("账号组管理真实操作",()=>{
 it("显示组与真实成员，允许创建空组而不强制先绑定",async()=>{renderManager();expect(await screen.findByRole("heading",{name:"账号组与绑定账号"})).toBeVisible();expect(screen.getByText("真实账号")).toBeVisible();expect(screen.getByRole("button",{name:"创建账号组"})).toBeVisible();});
 it("建组调用真实接口并读回，不制造本地成功",async()=>{api.createAccountGroup.mockResolvedValue(group("new","品牌组",[]));api.getAccountGroup.mockResolvedValue(group("new","品牌组",[]));api.listAccountGroups.mockResolvedValueOnce([group(),group("h","另一组")]).mockResolvedValue([group(),group("h","另一组"),group("new","品牌组",[])]);renderManager();fireEvent.change(screen.getByLabelText("新账号组名称"),{target:{value:"品牌组"}});fireEvent.click(screen.getByRole("button",{name:"创建账号组"}));await waitFor(()=>expect(api.createAccountGroup).toHaveBeenCalled());expect(api.createAccountGroup.mock.calls[0][0].body).toMatchObject({name:"品牌组"});await waitFor(()=>expect(api.getAccountGroup).toHaveBeenCalledWith(expect.objectContaining({params:{groupId:"new"}})));});
 it("修改名称携带版本，失败保留输入且不显示内部操作编号",async()=>{api.updateAccountGroup.mockRejectedValue(new Error("HttpTransport: 409 for accountGroups.update: 名称未保存：版本冲突"));renderManager();await openRename();fireEvent.change(screen.getByLabelText("账号组名称"),{target:{value:"新名称"}});fireEvent.click(screen.getByRole("button",{name:"保存名称"}));await screen.findByText("名称未保存：版本冲突");expect(screen.getByLabelText("账号组名称")).toHaveValue("新名称");expect(screen.getByText('名称未保存：版本冲突').closest('[role="alert"]')).not.toHaveTextContent('HttpTransport');expect(api.updateAccountGroup.mock.calls[0][0].body).toEqual({name:"新名称",expectedVersion:1});});
 it("转组先显示影响预览，明确确认后才用digest与版本提交",async()=>{const preview={accountId:"a",fromGroupId:"g",toGroupId:"h",expectedMembershipVersion:2,digest:"checked",activeTaskCount:0,historyPolicy:"keep_original_group"};api.previewAccountGroupTransfer.mockResolvedValue(preview);api.transferAccountGroupMember.mockResolvedValue({...member,groupId:"h"});renderManager();await openTransfer();fireEvent.change(screen.getByLabelText("目标账号组"),{target:{value:"h"}});fireEvent.click(screen.getByRole("button",{name:"查看转组影响"}));await screen.findByText(/历史作品和数据仍在原组/);expect(api.transferAccountGroupMember).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"确认转组"}));await waitFor(()=>expect(api.transferAccountGroupMember).toHaveBeenCalled());expect(api.transferAccountGroupMember.mock.calls[0][0].body).toMatchObject(preview);});
 it("T1345手动登记入口已移除，不伪装不支持平台已绑定",async()=>{renderManager();await screen.findByRole("table",{name:"各平台能力"});expect(screen.queryByLabelText("登记平台")).toBeNull();expect(api.createAccount).not.toHaveBeenCalled();expect(screen.getByText(/身份未验证/)).toBeVisible();});
 it("归档与恢复携带版本，回读真实状态并保留历史成员",async()=>{
  let persisted:AccountGroupResource=group();api.listAccountGroups.mockImplementation(async()=>[persisted,group("h","另一组")]);api.getAccountGroup.mockImplementation(async()=>persisted);
  api.archiveAccountGroup.mockImplementation(async()=>{persisted={...persisted,status:"archived",version:2};return persisted;});api.restoreAccountGroup.mockImplementation(async()=>{persisted={...persisted,status:"active",version:3};return persisted;});
  renderManager();await openManagement("创作者");await userEvent.click(screen.getByRole("menuitem",{name:"归档账号组"}));await waitFor(()=>expect(api.archiveAccountGroup).toHaveBeenCalled());await openManagement("创作者");await screen.findByRole("menuitem",{name:"恢复账号组"});
  expect(api.archiveAccountGroup.mock.calls[0][0].body).toEqual({expectedVersion:1});expect(screen.getByText("真实账号")).toBeVisible();
  await userEvent.click(screen.getByRole("menuitem",{name:"恢复账号组"}));await waitFor(()=>expect(api.restoreAccountGroup).toHaveBeenCalled());expect(api.restoreAccountGroup.mock.calls[0][0].body).toEqual({expectedVersion:2});
 });
 it("转组预览有在途任务时保留原因，不能确认",async()=>{
  api.previewAccountGroupTransfer.mockResolvedValue({accountId:"a",fromGroupId:"g",toGroupId:"h",expectedMembershipVersion:2,digest:"blocked",activeTaskCount:3,historyPolicy:"keep_original_group"});renderManager();
  await screen.findByRole("heading",{name:"平台能力"});await openTransfer();fireEvent.click(screen.getByRole("button",{name:"查看转组影响"}));await screen.findByText(/请先等待该账号任务结束/);expect(screen.getByRole("button",{name:"确认转组"})).toBeDisabled();expect(api.transferAccountGroupMember).not.toHaveBeenCalled();
 });
 it("创建结果未知后重试复用同一幂等key，保留组名",async()=>{
  api.createAccountGroup.mockRejectedValueOnce(new Error("网络中断，尚未读到结果")).mockResolvedValue(group("new","品牌组",[]));api.getAccountGroup.mockResolvedValue(group("new","品牌组",[]));renderManager();
  fireEvent.change(screen.getByLabelText("新账号组名称"),{target:{value:"品牌组"}});fireEvent.click(screen.getByRole("button",{name:"创建账号组"}));await screen.findByText("网络中断，尚未读到结果");expect(screen.getByLabelText("新账号组名称")).toHaveValue("品牌组");fireEvent.click(screen.getByRole("button",{name:"创建账号组"}));await waitFor(()=>expect(api.createAccountGroup).toHaveBeenCalledTimes(2));expect(api.createAccountGroup.mock.calls[0][0].body.idempotencyKey).toBe(api.createAccountGroup.mock.calls[1][0].body.idempotencyKey);
 });

});

it("T1345历史资料与共享资源不再挂载，migrationId也不隐式读写历史",async()=>{window.history.replaceState(null,"","/accounts?migrationId=old");renderManager();await screen.findByRole("table",{name:"各平台能力"});expect(api.listProjects).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:"整理历史资料"})).toBeNull();});
it("T1345查看另一组只展示该组成员，不偷读已删除的历史资料区",async()=>{renderManager();await screen.findByRole("table",{name:"各平台能力"});fireEvent.click(screen.getByRole("button",{name:/另一组/}));expect(screen.getByRole("button",{name:"进入此账号组"})).toBeVisible();expect(api.listProjects).not.toHaveBeenCalled();expect(screen.queryByText("真实账号")).toBeNull();});

it("平台能力来自真实接口，只展示已装配行列而不是平台名推断",async()=>{renderManager();const table=await screen.findByRole("table",{name:"各平台能力"});expect(within(table).getByRole("row",{name:/抖音/})).toHaveTextContent("已接入作品采集");expect(within(table).queryByRole("row",{name:/快手/})).toBeNull();expect(within(table).queryByRole("columnheader",{name:"平台草稿"})).toBeNull();expect(api.getPlatformAccountCapabilities).toHaveBeenCalled();});
it("实际扫码端口不可用时显示原因并隐藏该自动绑定入口",async()=>{api.getPlatformAccountCapabilities.mockResolvedValue([{platform:"douyin",bind:{available:false,reason:"本机扫码端口未装配",method:"none"},collect:{available:false,reason:"采集端口未装配"},publish:{available:false,reason:"发布端口未装配"},draft:{available:false,reason:"草稿端口未装配"},manual:{available:true,reason:"可登记"}}]);renderManager();await screen.findByText("当前没有可用的平台能力。");expect(screen.queryByRole("button",{name:"扫码绑定抖音账号"})).toBeNull();expect(api.loginDouyin).not.toHaveBeenCalled();});
it("能力读取失败保留重读，不假报不可用或出现手动登记",async()=>{api.getPlatformAccountCapabilities.mockRejectedValueOnce(Error("能力读取失败"));renderManager();await screen.findByText("能力读取失败");expect(screen.getByRole("button",{name:"重试读取"})).toBeVisible();expect(screen.queryByLabelText("登记平台")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"重试读取"}));await screen.findByRole("table",{name:"各平台能力"});});

it("转组影响明确列出历史作品和待发布目标，定位稿件素材仍留原组",async()=>{api.previewAccountGroupTransfer.mockResolvedValue({accountId:"a",fromGroupId:"g",toGroupId:"h",expectedMembershipVersion:2,digest:"real",activeTaskCount:0,historyPolicy:"keep_original_group",impact:{historyPublicationCount:3,pendingPublicationTargetCount:2,sharedProjectCount:1,positioningCount:4,assetReferenceCount:5}});renderManager();await screen.findByRole("heading",{name:"平台能力"});await openTransfer();fireEvent.click(screen.getByRole("button",{name:"查看转组影响"}));expect(await screen.findByText("历史发布作品：3")).toBeVisible();expect(screen.getByText("待发布目标：2")).toBeVisible();expect(screen.getByText(/定位、稿件和素材仍留在原组/)).toBeVisible();expect(api.transferAccountGroupMember).not.toHaveBeenCalled();});
it("首个空组读回后直接提供免登录定位，不启动扫码任务",async()=>{localStorage.clear();api.listAccountGroups.mockResolvedValueOnce([]).mockResolvedValue([group("new","首个品牌",[])]);api.createAccountGroup.mockResolvedValue(group("new","首个品牌",[]));api.getAccountGroup.mockResolvedValue(group("new","首个品牌",[]));render(<AccountManagerView viewModel={{accounts:[],groups:[]}}/>);await screen.findByRole("region",{name:"创建你的第一个账号组"});fireEvent.change(screen.getByLabelText("新账号组名称"),{target:{value:"首个品牌"}});fireEvent.click(screen.getByRole("button",{name:"创建账号组"}));await waitFor(()=>expect(localStorage.getItem(CURRENT_GROUP_KEY)).toBe("new"));expect(screen.getByLabelText("新账号组名称")).toHaveValue("");expect(screen.getByRole("region",{name:"首个品牌"})).toBeVisible();expect(screen.getByRole("link",{name:"开始定位（无需抖音登录）"})).toHaveAttribute("href","/positioning");expect(api.startAccountBinding).not.toHaveBeenCalled();expect(api.loginDouyin).not.toHaveBeenCalled();});

it("查看另一账号组时不会用当前组身份直达定位，须先通过切组",async()=>{renderManager();await screen.findByRole("table",{name:"各平台能力"});expect(screen.getByRole("link",{name:"开始定位（无需抖音登录）"})).toHaveAttribute("href","/positioning");fireEvent.click(screen.getByRole("button",{name:/另一组/}));expect(screen.queryByRole("link",{name:"开始定位（无需抖音登录）"})).toBeNull();expect(localStorage.getItem(CURRENT_GROUP_KEY)).toBe("g");fireEvent.click(screen.getByRole("button",{name:"进入此账号组"}));await waitFor(()=>expect(localStorage.getItem(CURRENT_GROUP_KEY)).toBe("h"));expect(screen.getByRole("link",{name:"开始定位（无需抖音登录）"})).toHaveAttribute("href","/positioning");expect(api.startAccountBinding).not.toHaveBeenCalled();});

it('三平台扫码入口在平台选择，删除常驻刷新及重复扫码框',async()=>{
 const row=(platform:string)=>({platform,bind:{available:true,reason:'已接入',method:'qr'},collect:{available:true,reason:'真实采集'},publish:{available:false,reason:'尚未接入'},draft:{available:false,reason:'尚未接入'},manual:{available:true,reason:'可登记'}});api.getPlatformAccountCapabilities.mockResolvedValue(['douyin','kuaishou','xiaohongshu'].map(row));renderManager();const table=await screen.findByRole('table',{name:'各平台能力'});await waitFor(()=>expect(screen.getByRole('button',{name:'扫码绑定快手账号'})).toBeEnabled());expect(screen.getByRole('button',{name:'扫码绑定抖音账号'})).toBeEnabled();expect(screen.getByRole('button',{name:'扫码绑定小红书账号'})).toBeEnabled();expect(screen.queryByRole('button',{name:'重新读取平台能力'})).toBeNull();expect(screen.queryByText('兼容扫码入口')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'扫码绑定快手账号'}));expect(await screen.findByRole('dialog')).toHaveTextContent('扫码绑定快手账号');expect(api.loginDouyin).not.toHaveBeenCalled();
});

it.each([['wechatOfficial','公众号'],['wechatVideo','视频号']] as const)('T1110 %s真实扫码按钮在平台能力行，组成员冗余数据入口已移除',async(platform,label)=>{const own={...member,platform,accountId:'wechat-real',accountHandle:'本人微信账号'};api.listAccountGroups.mockResolvedValue([{...group(),members:[own]}]);api.getPlatformAccountCapabilities.mockResolvedValue([{platform,bind:{available:true,reason:'真实端口已装配',method:'qr'},collect:{available:true,reason:'原生报表'},publish:{available:false,reason:'未接入'},draft:{available:false,reason:'未接入'},manual:{available:true,reason:'可登记'}}]);render(<AccountManagerView viewModel={{accounts:[],groups:[{...group(),members:[own]}]}}/>);const table=await screen.findByRole('table',{name:'各平台能力'});const trigger=await screen.findByRole('button',{name:`扫码绑定${label}账号`});expect(trigger).toBeEnabled();expect(screen.queryByRole('link',{name:'查看本人微信账号的数据'})).toBeNull();expect(screen.getByRole('button',{name:'管理本人微信账号'})).toBeVisible();fireEvent.click(trigger);expect(await screen.findByRole('dialog')).toHaveTextContent(`扫码绑定${label}账号`);expect(api.loginDouyin).not.toHaveBeenCalled();});

it.each(['douyin','wechatVideo','wechatOfficial'] as const)('T1169 %s转组Esc和取消均回原按钮，重复打开不预览或提交',async platform=>{
 const own={...member,platform};const groups=[{...group(),members:[own]},group('h','另一组')];api.listAccountGroups.mockResolvedValue(groups);
 render(<AccountManagerView viewModel={{accounts:[],groups}}/>);await screen.findByRole("heading",{name:"平台能力"},{timeout:120000});
 const trigger=screen.getByRole("button",{name:"管理真实账号"});
 for(const close of ['escape','cancel']){
  trigger.focus();await openTransfer();const dialog=await screen.findByRole('dialog',{}, {timeout:120000});expect(within(dialog).getByLabelText('目标账号组')).toHaveValue('h');
  await act(async()=>{if(close==='escape')fireEvent.keyDown(document,{key:'Escape',code:'Escape'});else fireEvent.click(within(dialog).getByRole('button',{name:'取消'}));});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});expect(screen.queryByRole('dialog')).toBeNull();expect(trigger).toHaveFocus();
 }
 expect(api.previewAccountGroupTransfer).not.toHaveBeenCalled();expect(api.transferAccountGroupMember).not.toHaveBeenCalled();
});

it('T1169切组后保留旧表面也不对旧工作区触发器回焦',async()=>{
 renderManager();await screen.findByRole("heading",{name:"平台能力"},{timeout:120000});const trigger=await openTransfer();await screen.findByRole('dialog',{}, {timeout:120000});const focused=vi.spyOn(trigger,'focus');
 localStorage.setItem(CURRENT_GROUP_KEY,'h');await act(async()=>{fireEvent.keyDown(document,{key:'Escape',code:'Escape'});});await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
 expect(trigger.isConnected).toBe(true);expect(focused).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();expect(api.previewAccountGroupTransfer).not.toHaveBeenCalled();expect(api.transferAccountGroupMember).not.toHaveBeenCalled();focused.mockRestore();
});
it('T1169真实成员回读移除触发器后关闭不对脱离DOM的按钮回焦',async()=>{
 renderManager();await screen.findByRole("heading",{name:"平台能力"},{timeout:120000});const trigger=await openTransfer();await screen.findByRole('dialog',{}, {timeout:120000});const focused=vi.spyOn(trigger,'focus');
 api.listAccountGroups.mockResolvedValue([group('g','创作者',[]),group('h','另一组')]);await act(async()=>{notifyAccountsChanged({source:'account-management',groupId:'g',routeRefreshScheduled:true});});
 await waitFor(()=>expect(screen.queryByRole('button',{name:'管理真实账号'})).toBeNull(),{timeout:120000});expect(trigger.isConnected).toBe(false);
 await act(async()=>{fireEvent.keyDown(document,{key:'Escape',code:'Escape'});});await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
 expect(focused).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();expect(api.previewAccountGroupTransfer).not.toHaveBeenCalled();expect(api.transferAccountGroupMember).not.toHaveBeenCalled();focused.mockRestore();
});

it.each([['wechatOfficial','公众号'],['wechatVideo','视频号']] as const)('T1110 %s扫码弹窗按Escape关闭后回到原平台按钮',async(platform,label)=>{
 sessionStorage.clear();
 api.getPlatformAccountCapabilities.mockResolvedValue([{platform,bind:{available:true,reason:'真实端口已装配',method:'qr'},collect:{available:true,reason:'原生报表'},publish:{available:false,reason:'未接入'},draft:{available:false,reason:'未接入'},manual:{available:true,reason:'可登记'}}]);
 renderManager();
 const trigger=await screen.findByRole('button',{name:`扫码绑定${label}账号`});
 await waitFor(()=>expect(trigger).toBeEnabled());trigger.focus();fireEvent.click(trigger);
 const dialog=await screen.findByRole('dialog',{name:`扫码绑定${label}账号`});
 fireEvent.keyDown(dialog,{key:'Escape'});
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 await waitFor(()=>expect(trigger).toHaveFocus());
 expect(api.loginDouyin).not.toHaveBeenCalled();
});

it("T1246 当前合法组位于第113项时逐页读取真实total，保留当前组与成员管理入口",async()=>{
 const rows=Array.from({length:113},(_,index)=>group(`page-group-${index+1}`,`真实组${index+1}`,index===112?[{...member,groupId:"page-group-113",accountId:"own-page-account"}]:[]));
 localStorage.setItem(CURRENT_GROUP_KEY,"page-group-113");pagination.total=113;
 api.listAccountGroups.mockImplementation(async({query})=>rows.slice((query.page-1)*query.pageSize,query.page*query.pageSize));
 render(<AccountManagerView viewModel={{accounts:[],groups:[]}}/>);
 const selected=await screen.findByRole("button",{name:/真实组113.*当前工作区/},{timeout:120000});
 expect(selected).toHaveAttribute("aria-pressed","true");
 expect(api.listAccountGroups.mock.calls.map(([input])=>input.query.page)).toEqual([1,2]);
 expect(screen.queryByRole("link",{name:"查看真实账号的数据"})).toBeNull();expect(screen.getByRole("button",{name:"管理真实账号"})).toBeVisible();
});


it("T1345删除三个管理区块且不读取共享或历史资料",async()=>{
 renderManager();await screen.findByRole("table",{name:"各平台能力"});
 expect(screen.queryByRole("region",{name:"手动登记平台账号"})).toBeNull();
 expect(screen.queryByRole("region",{name:"共享资源"})).toBeNull();
 expect(screen.queryByRole("region",{name:"整理历史资料"})).toBeNull();
 expect(api.listProjects).not.toHaveBeenCalled();expect(api.createAccount).not.toHaveBeenCalled();
});
it("T1345成员只有一条身份展示，管理回到对象右侧",async()=>{
 const account={id:"a",platform:"douyin",accountHandle:"真实账号",status:"active",externalAccountId:"real",createdAt:"2026-10-01T00:00:00.000Z"};
 api.listAccounts.mockResolvedValue([account]);render(<AccountManagerView viewModel={{accounts:[account] as never,groups:[group(),group("h","另一组")]}}/>);
 await screen.findByRole("table",{name:"各平台能力"});expect(screen.getAllByText("真实账号")).toHaveLength(1);
 expect(screen.getByRole("button",{name:"管理真实账号"})).toBeVisible();expect(screen.getByRole("button",{name:"管理创作者"})).toBeVisible();
});
it("T1345首组创建读回后直接进入工作区且平台选择可立即继续",async()=>{
 localStorage.clear();api.listAccountGroups.mockResolvedValueOnce([]).mockResolvedValue([group("new","首个品牌",[])]);
 api.createAccountGroup.mockResolvedValue(group("new","首个品牌",[]));api.getAccountGroup.mockResolvedValue(group("new","首个品牌",[]));
 render(<AccountManagerView viewModel={{accounts:[],groups:[]}}/>);await screen.findByRole("region",{name:"创建你的第一个账号组"});
 fireEvent.change(screen.getByLabelText("新账号组名称"),{target:{value:"首个品牌"}});fireEvent.click(screen.getByRole("button",{name:"创建账号组"}));
 await waitFor(()=>expect(api.getAccountGroup).toHaveBeenCalled());await waitFor(()=>expect(localStorage.getItem(CURRENT_GROUP_KEY)).toBe("new"));
 expect(screen.queryByRole("button",{name:"进入此账号组"})).toBeNull();expect(screen.getByRole("heading",{name:"平台能力"})).toBeVisible();
 expect(screen.getByRole("button",{name:"扫码绑定抖音账号"})).toBeEnabled();expect(api.createAccount).not.toHaveBeenCalled();
});

it('T1345继续创作只属于当前可用工作区，浏览另一组或归档组不误跳当前项目',async()=>{
 const archived={...group('old','已归档工作区'),status:'archived' as const};api.listAccountGroups.mockResolvedValue([group(),group('h','另一组'),archived]);
 renderManager();expect(await screen.findByRole('link',{name:'继续创作 →'})).toHaveAttribute('href','/projects');
 fireEvent.click(screen.getByRole('button',{name:/另一组/}));expect(screen.queryByRole('link',{name:'继续创作 →'})).toBeNull();expect(screen.getByRole('button',{name:'进入此账号组'})).toBeVisible();
 fireEvent.click(screen.getByLabelText('显示已归档组'));fireEvent.click(screen.getByRole('button',{name:/已归档工作区/}));expect(screen.queryByRole('link',{name:'继续创作 →'})).toBeNull();expect(screen.queryByRole('button',{name:'进入此账号组'})).toBeNull();
});

it.each([['douyin','抖音'],['xiaohongshu','小红书']] as const)('T1345成功核对后继续选择%s，真实管理组件每次明确点击仅启动一个run',async(nextPlatform,nextLabel)=>{
 const capability=(platform:string)=>({platform,bind:{available:true,reason:'受控组件真实端口',method:'qr'},collect:{available:true,reason:'已有采集'},publish:{available:false,reason:'未接入'},draft:{available:false,reason:'未接入'},manual:{available:true,reason:'可登记'}});
 api.getPlatformAccountCapabilities.mockResolvedValue(['douyin','xiaohongshu'].map(capability));
 let persisted:AccountGroupResource=group('g','创作者',[]);let accounts:Array<{id:string;userId:string;platform:string;accountHandle:string;status:'active'}>=[];
 const runs=new Map<string,{runId:string;groupId:string;platform:string;status:'succeeded';accountId:string;error:null;createdAt:string;updatedAt:string}>();
 api.listAccountGroups.mockImplementation(async()=>[persisted]);api.listAccounts.mockImplementation(async()=>accounts);api.getAccountGroup.mockImplementation(async()=>persisted);
 api.getAccount.mockImplementation(async({params})=>accounts.find(row=>row.id===params.accountId));
 api.startAccountBinding.mockImplementation(async({body})=>{
  expect(body.expectedGroupVersion).toBe(persisted.version);const n=accounts.length+1,id=`continued-account-${n}`,runId=`continued-run-${n}`;
  const account={id,userId:'u',platform:body.platform,accountHandle:`已核对账号${n}`,status:'active' as const};accounts=[...accounts,account];persisted={...persisted,version:persisted.version+1,members:[...persisted.members,{...member,id:`continued-member-${n}`,accountId:id,platform:body.platform,accountHandle:account.accountHandle}]};
  const receipt={runId,groupId:'g',platform:body.platform,status:'succeeded' as const,accountId:id,error:null,createdAt:'2026-10-18T00:00:00Z',updatedAt:'2026-10-18T00:00:00Z'};runs.set(runId,receipt);return receipt;
 });
 api.getAccountBinding.mockImplementation(async({params})=>runs.get(params.runId));
 render(<AccountManagerView viewModel={{accounts:[],groups:[persisted]}}/>);
 const first=await screen.findByRole('button',{name:'扫码绑定抖音账号'});await waitFor(()=>expect(first).toBeEnabled());await userEvent.click(first);
 await waitFor(()=>expect(api.startAccountBinding).toHaveBeenCalledTimes(1));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(screen.getByText('已核对账号1',{exact:true})).toBeVisible();
 await userEvent.click(screen.getByRole('button',{name:`扫码绑定${nextLabel}账号`}));await waitFor(()=>expect(api.startAccountBinding).toHaveBeenCalledTimes(2));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(api.startAccountBinding).toHaveBeenCalledTimes(2);expect(api.startAccountBinding.mock.calls[1][0].body).toMatchObject({platform:nextPlatform,expectedGroupVersion:2});expect(screen.getByText('已核对账号2',{exact:true})).toBeVisible();expect(screen.getAllByTestId('group-member-row')).toHaveLength(2);
});

function prepareCompletedBinding(){
 let persisted=group('g','创作者',[]);
 const bound={id:'verified-member-account',userId:'u',platform:'douyin',accountHandle:'本次已核验账号',status:'active' as const,externalAccountId:'verified-platform-identity'};
 let started=false;
 api.listAccountGroups.mockImplementation(async()=>[persisted]);api.listAccounts.mockImplementation(async()=>started?[bound]:[]);api.getAccountGroup.mockImplementation(async()=>persisted);api.getAccount.mockResolvedValue(bound);
 api.startAccountBinding.mockImplementation(async()=>{started=true;persisted={...persisted,version:2,members:[{...member,id:'verified-member',accountId:bound.id,accountHandle:bound.accountHandle}]};return {runId:'verified-current-run',groupId:'g',platform:'douyin',status:'succeeded',accountId:bound.id,error:null,createdAt:'2026-10-19T00:00:00Z',updatedAt:'2026-10-19T00:00:00Z'};});
 api.getAccountBinding.mockResolvedValue({runId:'verified-current-run',groupId:'g',platform:'douyin',status:'succeeded',accountId:bound.id,error:null,createdAt:'2026-10-19T00:00:00Z',updatedAt:'2026-10-19T00:00:00Z'});
 return {get currentGroup(){return persisted;}};
}
it('T1355当前扫码账号和成员列表核验完成后自动关窗并回到平台按钮',async()=>{
 prepareCompletedBinding();renderManager();const trigger=await screen.findByRole('button',{name:'扫码绑定抖音账号'});await waitFor(()=>expect(trigger).toBeEnabled());await userEvent.click(trigger);
 await waitFor(()=>expect(api.getAccount).toHaveBeenCalled());await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(screen.getByText('本次已核验账号',{exact:true})).toBeVisible();await waitFor(()=>expect(trigger).toHaveFocus());expect(screen.getByRole('status').textContent).toContain('已绑定');expect(api.startAccountBinding).toHaveBeenCalledOnce();
});
it('T1355列表读失败不把run成功冒已核验完成，保原run重读恢复',async()=>{
 prepareCompletedBinding();renderManager();const trigger=await screen.findByRole('button',{name:'扫码绑定抖音账号'});await waitFor(()=>expect(trigger).toBeEnabled());api.listAccountGroups.mockRejectedValueOnce(Error('本次成员列表读取失败'));await userEvent.click(trigger);
 const dialog=await screen.findByRole('dialog');await waitFor(()=>expect(api.getAccount).toHaveBeenCalled());await waitFor(()=>expect(within(dialog).getByText('本次成员列表读取失败')).toBeVisible());expect(within(dialog).queryByText('绑定已完成')).toBeNull();expect(api.startAccountBinding).toHaveBeenCalledOnce();
 await userEvent.click(within(dialog).getByRole('button',{name:'刷新绑定状态'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(api.startAccountBinding).toHaveBeenCalledOnce();
});
it('T1355已有列表读取在途时完成门必须等待最新有效列表，不能提前成功',async()=>{
 const fixture=prepareCompletedBinding();renderManager();const trigger=await screen.findByRole('button',{name:'扫码绑定抖音账号'});await waitFor(()=>expect(trigger).toBeEnabled());let release!:(value:AccountGroupResource[])=>void;
 api.listAccountGroups.mockImplementationOnce(()=>new Promise(done=>{release=done;}));act(()=>notifyAccountsChanged({source:'account-management',routeRefreshScheduled:false}));await waitFor(()=>expect(release).toBeTypeOf('function'));
 try{await userEvent.click(trigger);const dialog=await screen.findByRole('dialog');await waitFor(()=>expect(api.getAccount).toHaveBeenCalled());expect(within(dialog).queryByText('绑定已完成')).toBeNull();}finally{await act(async()=>release([fixture.currentGroup]));}
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(api.startAccountBinding).toHaveBeenCalledOnce();
});

it('T1355第101个绑定账号按完整分页核验后自动关闭，不被第一页截断',async()=>{
 const fixture=prepareCompletedBinding();
 const filler=Array.from({length:100},(_,index)=>({id:`existing-${index}`,userId:'u',platform:'douyin',accountHandle:`已有账号${index}`,status:'active' as const}));
 api.listAccounts.mockImplementation(async({query})=>{
  const target=fixture.currentGroup.members.find(row=>row.accountId==='verified-member-account');
  const rows=target?[...filler,{id:target.accountId,userId:'u',platform:target.platform,accountHandle:target.accountHandle,status:'active' as const}]:filler;
  pagination.accountTotal=rows.length;
  return rows.slice((query.page-1)*query.pageSize,query.page*query.pageSize);
 });
 renderManager();await screen.findByTestId('account-empty-state');const trigger=screen.getByRole('button',{name:'扫码绑定抖音账号'});await waitFor(()=>expect(trigger).toBeEnabled(),{timeout:120000});await userEvent.click(trigger);
 await screen.findByText('本次已核验账号',{exact:true},{timeout:120000});await act(async()=>{await Promise.resolve();});
 expect(screen.queryByRole('dialog')).toBeNull();expect(api.startAccountBinding).toHaveBeenCalledOnce();expect(api.listAccounts.mock.calls.some(([input])=>input.query.page===2)).toBe(true);
 await waitFor(()=>expect(trigger).toHaveFocus(),{timeout:120000});
});

it('T1370原平台表直接展开且唯一扫码触发器属于对应平台行',async()=>{
 renderManager();
 const trigger=await screen.findByRole('button',{name:'扫码绑定抖音账号'});await waitFor(()=>expect(trigger).toBeEnabled());
 const table=screen.getByRole('table',{name:'各平台能力'}),row=within(table).getByRole('row',{name:/抖音/});
 expect(within(row).getByRole('button',{name:'扫码绑定抖音账号'})).toBe(trigger);
 expect(table.closest('details')).toBeNull();expect(screen.queryByRole('heading',{name:'选择平台，扫码绑定'})).toBeNull();
 expect(screen.queryByText('点击平台后打开扫码窗口。绑定完成可继续添加同平台或其他平台的账号。')).toBeNull();
 expect(screen.queryByRole('columnheader',{name:'自动发布'})).toBeNull();expect(screen.queryByRole('columnheader',{name:'平台草稿'})).toBeNull();
 expect(within(table).queryByRole('row',{name:/快手/})).toBeNull();
 expect(screen.queryByRole('link',{name:'查看真实账号的数据'})).toBeNull();expect(screen.queryByText(/状态见账号数据/)).toBeNull();
});
it('T1370能力完全未接入隐藏空表和无效按钮，真实读取失败仍保重试',async()=>{
 api.getPlatformAccountCapabilities.mockResolvedValue([{platform:'douyin',bind:{available:false,reason:'合成未装配',method:'none'},collect:{available:false,reason:'合成未装配'},publish:{available:false,reason:'合成未装配'},draft:{available:false,reason:'合成未装配'},manual:{available:false,reason:'合成未装配'}}]);
 renderManager();await waitFor(()=>expect(api.getPlatformAccountCapabilities).toHaveBeenCalled());await act(async()=>{await Promise.resolve();});
 expect(screen.queryByRole('table',{name:'各平台能力'})).toBeNull();expect(screen.queryByRole('button',{name:/扫码绑定.*账号/})).toBeNull();
 expect(screen.getByText('当前没有可用的平台能力。')).toBeVisible();
});
it('T1370能力fetch失败不冒空集合，行内重试恢复真实可用能力',async()=>{
 api.getPlatformAccountCapabilities.mockRejectedValueOnce(Error('合成能力读取失败'));renderManager();
 expect(await screen.findByText('合成能力读取失败')).toBeVisible();expect(screen.queryByText('当前没有可用的平台能力。')).toBeNull();
 await userEvent.click(screen.getByRole('button',{name:'重试读取'}));
 const table=await screen.findByRole('table',{name:'各平台能力'});expect(within(table).getByRole('button',{name:'扫码绑定抖音账号'})).toBeEnabled();
});
it('T1370非当前组仍显示能力但扫码守原组选中保护',async()=>{
 renderManager();const trigger=await screen.findByRole('button',{name:'扫码绑定抖音账号'});await waitFor(()=>expect(trigger).toBeEnabled());
 await userEvent.click(screen.getByRole('button',{name:/另一组/}));
 const table=screen.getByRole('table',{name:'各平台能力'});expect(within(table).getByRole('button',{name:'扫码绑定抖音账号'})).toBeDisabled();
 expect(api.startAccountBinding).not.toHaveBeenCalled();expect(screen.getByText('先进入此账号组，再扫码绑定。')).toBeVisible();
});

it('T1370能力未读完保loading，不先报不支持或空集合',async()=>{
 let release!:(rows:unknown[])=>void;api.getPlatformAccountCapabilities.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));renderManager();
 await screen.findByText('正在读取平台能力…');expect(screen.queryByRole('table',{name:'各平台能力'})).toBeNull();expect(screen.queryByText('当前没有可用的平台能力。')).toBeNull();
 await waitFor(()=>expect(release).toBeTypeOf('function'));await act(async()=>release([]));expect(await screen.findByText('当前没有可用的平台能力。')).toBeVisible();
});
it('T1370一平台只采集一平台只扫码时，不支持的单元格不造按钮或原因项',async()=>{
 const no={available:false,reason:'合成未装配'};api.getPlatformAccountCapabilities.mockResolvedValue([{platform:'douyin',bind:{...no,method:'none'},collect:{available:true,reason:'合成已装配采集'},publish:no,draft:no,manual:no},{platform:'xiaohongshu',bind:{available:true,reason:'合成已装配扫码',method:'qr'},collect:no,publish:no,draft:no,manual:no}]);renderManager();
 const table=await screen.findByRole('table',{name:'各平台能力'});expect(within(table).getAllByRole('columnheader')).toHaveLength(3);expect(within(table).getByRole('button',{name:'扫码绑定小红书账号'})).toBeEnabled();expect(within(table).queryByRole('button',{name:'扫码绑定抖音账号'})).toBeNull();expect(within(table).queryByText('合成未装配')).toBeNull();
});
it('T1370归档和binding busy不冒无能力，仍禁止启动另一个run',async()=>{
 const archived={...group('old','原归档组'),status:'archived' as const};api.listAccountGroups.mockResolvedValue([group(),archived]);
 const start=api.startAccountBinding.getMockImplementation()!;let release!:()=>void;api.startAccountBinding.mockImplementationOnce(async input=>{await new Promise<void>(done=>{release=done;});return start(input);});renderManager();
 const trigger=await screen.findByRole('button',{name:'扫码绑定抖音账号'});await waitFor(()=>expect(trigger).toBeEnabled());await userEvent.click(trigger);await screen.findByRole('dialog');await waitFor(()=>expect(trigger).toBeDisabled());expect(api.startAccountBinding).toHaveBeenCalledOnce();await act(async()=>release());await waitFor(()=>expect(trigger).toBeEnabled());await userEvent.keyboard('{Escape}');await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 await userEvent.click(screen.getByLabelText('显示已归档组'));await userEvent.click(screen.getByRole('button',{name:/原归档组/}));expect(screen.getByRole('table',{name:'各平台能力'})).toBeVisible();expect(screen.getByRole('button',{name:'扫码绑定抖音账号'})).toBeDisabled();expect(screen.queryByText('当前没有可用的平台能力。')).toBeNull();expect(api.startAccountBinding).toHaveBeenCalledOnce();
});
