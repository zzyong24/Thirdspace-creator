import * as React from "react";
import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import userEvent from "@testing-library/user-event";
import {GroupWorkspaceFilters} from "./group-workspace-filters";
import {GroupOverview} from "./group-overview";
import type {GroupWorkspace} from "./workspace-query";

const navigation=vi.hoisted(()=>({push:vi.fn(),refresh:vi.fn(),path:"/overview",search:"platform=douyin&copilot=open"}));
vi.mock("next/navigation",()=>({useRouter:()=>navigation,usePathname:()=>navigation.path,useSearchParams:()=>new URLSearchParams(navigation.search)}));
vi.mock("@/features/daily-report/report-date-range",()=>({ReportDateRange:({onChange,disabled}:{onChange:(range:{startDate:string;endDate:string})=>void;disabled?:boolean})=><button disabled={disabled} onClick={()=>onChange({startDate:"2026-08-01",endDate:"2026-08-31"})}>改日期</button>}));
const workspace:GroupWorkspace={groupId:"g",groupName:"真实组",status:"active",platform:"douyin",accountId:null,startDate:"2026-09-01",endDate:"2026-09-30",generatedAt:"2026-10-01T01:00:00Z",contentCount:1,publicationCount:1,pendingCount:0,collectedAccounts:1,totalAccounts:1,videoViews:12,articleReads:null,followers:null,latestCapturedAt:null,coverage:"真实采集范围",metricMode:"published_in_period_cumulative",accounts:[{id:"d",name:"抖音账号",platform:"douyin",historical:false,archived:false},{id:"k",name:"快手账号",platform:"kuaishou",historical:false,archived:false}],platforms:[{platform:"douyin",publicationCount:1,sampleCount:1,views:12,reads:null,likes:null,shares:null,capturedAt:null}]};
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
function ReadPage({gate}:{gate:Promise<void>|null}){if(gate)React.use(gate);return <GroupOverview workspace={workspace} filters={<GroupWorkspaceFilters workspace={workspace}/>}/>;}
function SuspendedPage({gate}:{gate:Promise<void>}){const [pending,setPending]=React.useState<Promise<void>|null>(null);navigation.push.mockImplementation(()=>setPending(gate));return <React.Suspense fallback={<p>替换整页</p>}><ReadPage gate={pending}/></React.Suspense>;}
beforeEach(()=>{navigation.push.mockReset();navigation.refresh.mockReset();navigation.path="/overview";navigation.search="platform=douyin&copilot=open";});
afterEach(()=>{cleanup();vi.useRealTimers();localStorage.clear();});

it("真实RSC挂起时仍能切平台、账号和日期，旧指标保持可见",async()=>{
 const gate=deferred();render(<SuspendedPage gate={gate.promise}/>);
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"快手"})));
 expect(screen.getByRole("button",{name:"小红书"})).toBeEnabled();
 expect(screen.getByRole("combobox",{name:"平台账号"})).toBeEnabled();
 expect(screen.getByRole("button",{name:"改日期"})).toBeEnabled();
 expect(within(screen.getByLabelText("账号组指标")).getByText("12")).toBeVisible();expect(screen.queryByText("替换整页")).toBeNull();
 await act(async()=>gate.resolve());
});

it("尚未提交平台时改日期沿最新意图合并，不退回旧平台",()=>{
 render(<GroupWorkspaceFilters workspace={workspace}/>);
 fireEvent.click(screen.getByRole("button",{name:"快手"}));
 fireEvent.click(screen.getByRole("button",{name:"改日期"}));
 const href=navigation.push.mock.calls.at(-1)![0] as string;
 expect(href).toContain("platform=kuaishou");expect(href).toContain("startDate=2026-08-01");expect(href).toContain("copilot=open");
});

it("尚未提交平台时账号选项属于目标平台，连续选择不请求旧平台的账号",async()=>{
 render(<GroupWorkspaceFilters workspace={workspace}/>);
 fireEvent.click(screen.getByRole("button",{name:"快手"}));
 await userEvent.click(screen.getByRole("combobox",{name:"平台账号"}));
 expect(screen.queryByRole("option",{name:"抖音 · 抖音账号"})).toBeNull();
 await userEvent.click(screen.getByRole("option",{name:"快手 · 快手账号"}));
 const href=navigation.push.mock.calls.at(-1)![0] as string;
 expect(href).toContain("platform=kuaishou");expect(href).toContain("accountId=k");
});

it("A到B再回A不能用尚未完成的旧A值提前宣称成功",async()=>{
 const gate=deferred();render(<SuspendedPage gate={gate.promise}/>);
 await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"快手"}));fireEvent.click(screen.getByRole("button",{name:"抖音"}));});
 expect(navigation.push).toHaveBeenCalledTimes(2);expect(screen.getByRole("status")).toHaveTextContent("正在读取：抖音");
 await act(async()=>gate.resolve());expect(screen.queryByRole("status")).toBeNull();
});

it("2秒只给慢反馈与真实重试，transition结束也不能把未提交数据当成功",async()=>{
 vi.useFakeTimers();render(<GroupWorkspaceFilters workspace={workspace}/>);
 fireEvent.click(screen.getByRole("button",{name:"快手"}));
 await act(async()=>vi.advanceTimersByTime(2000));
 expect(screen.getByRole("status")).toHaveTextContent("读取较慢");
 expect(screen.getByRole("status")).toHaveTextContent("当前仍显示：抖音");
 expect(screen.getByRole("status")).toHaveTextContent("正在读取：快手");
 fireEvent.click(screen.getByRole("button",{name:"重试读取所选数据"}));
 expect(navigation.push).toHaveBeenCalledTimes(2);
 expect(navigation.push.mock.calls[1]![0]).toBe(navigation.push.mock.calls[0]![0]);
});

it("慢反馈从筛选操作开始计时，路由同步开销不能延后2秒预算",async()=>{
 vi.useFakeTimers();
 navigation.push.mockImplementationOnce(()=>vi.advanceTimersByTime(1200));
 render(<GroupOverview workspace={workspace} filters={<GroupWorkspaceFilters workspace={workspace}/>}/>);
 fireEvent.click(screen.getByRole("button",{name:"快手"}));
 expect(screen.getByRole("status")).toHaveTextContent("正在读取所选数据");
 await act(async()=>vi.advanceTimersByTime(799));
 expect(screen.queryByRole("button",{name:"重试读取所选数据"})).toBeNull();
 await act(async()=>vi.advanceTimersByTime(1));
 expect(screen.getByRole("status")).toHaveTextContent("读取较慢");
 expect(screen.getByRole("button",{name:"重试读取所选数据"})).toBeEnabled();
 expect(screen.getByRole("button",{name:"小红书"})).toBeEnabled();
 expect(within(screen.getByLabelText("账号组指标")).getByText("12")).toBeVisible();
 expect(screen.getByRole("status")).toHaveTextContent("当前仍显示：抖音");
 expect(screen.getByRole("status")).toHaveTextContent("正在读取：快手");
});

it("新筛选有自己的2秒预算，旧ticket计时不能提前打开新重试",async()=>{
 vi.useFakeTimers();render(<GroupWorkspaceFilters workspace={workspace}/>);
 fireEvent.click(screen.getByRole("button",{name:"快手"}));
 await act(async()=>vi.advanceTimersByTime(1500));
 fireEvent.click(screen.getByRole("button",{name:"小红书"}));
 await act(async()=>vi.advanceTimersByTime(500));
 expect(screen.getByRole("status")).toHaveTextContent("正在读取所选数据");
 expect(screen.queryByRole("button",{name:"重试读取所选数据"})).toBeNull();
 await act(async()=>vi.advanceTimersByTime(1500));
 expect(screen.getByRole("status")).toHaveTextContent("读取较慢");
 expect(screen.getByRole("status")).toHaveTextContent("正在读取：小红书");
});

it("完成提交或卸载后清掉慢反馈计时，不留迟到回调",async()=>{
 vi.useFakeTimers();const view=render(<GroupWorkspaceFilters workspace={workspace}/>);
 fireEvent.click(screen.getByRole("button",{name:"快手"}));
 expect(vi.getTimerCount()).toBe(1);
 await act(async()=>view.rerender(<GroupWorkspaceFilters workspace={{...workspace,platform:"kuaishou"}}/>));
 expect(vi.getTimerCount()).toBe(0);
 fireEvent.click(screen.getByRole("button",{name:"小红书"}));
 expect(vi.getTimerCount()).toBe(1);
 view.unmount();
 expect(vi.getTimerCount()).toBe(0);
 await act(async()=>vi.advanceTimersByTime(2000));
 expect(navigation.push).toHaveBeenCalledTimes(2);
});

it("已取消的旧timer回调不能丢失新ticket的清理句柄",()=>{
 vi.useFakeTimers();const schedule=vi.spyOn(window,"setTimeout");
 const view=render(<GroupWorkspaceFilters workspace={workspace}/>);
 fireEvent.click(screen.getByRole("button",{name:"快手"}));
 const stale=schedule.mock.calls.at(-1)![0] as ()=>void;
 schedule.mockRestore();
 fireEvent.click(screen.getByRole("button",{name:"小红书"}));
 act(()=>stale());
 expect(screen.getByRole("status")).toHaveTextContent("正在读取所选数据");
 expect(screen.getByRole("status")).toHaveTextContent("正在读取：小红书");
 view.unmount();
 expect(vi.getTimerCount()).toBe(0);
});

it("旧scope提交不能清新目标，完整账号日期一致后才收口",async()=>{
 const view=render(<GroupWorkspaceFilters workspace={workspace}/>);
 fireEvent.click(screen.getByRole("button",{name:"快手"}));fireEvent.click(screen.getByRole("button",{name:"小红书"}));
 view.rerender(<GroupWorkspaceFilters workspace={{...workspace,platform:"kuaishou"}}/>);
 expect(screen.getByRole("status")).toHaveTextContent("正在读取：小红书");
 view.rerender(<GroupWorkspaceFilters workspace={{...workspace,platform:"xiaohongshu",endDate:"2026-09-29"}}/>);
 expect(screen.getByRole("status")).toHaveTextContent("正在读取：小红书");
 await act(async()=>view.rerender(<GroupWorkspaceFilters workspace={{...workspace,platform:"xiaohongshu"}}/>));
 expect(screen.queryByRole("status")).toBeNull();
});

it("目标URL已到但数据仍旧时重试refresh，同一轮重复重试不叠请求",async()=>{
 vi.useFakeTimers();const view=render(<GroupWorkspaceFilters workspace={workspace}/>);
 fireEvent.click(screen.getByRole("button",{name:"快手"}));
 navigation.search="platform=kuaishou&copilot=open";view.rerender(<GroupWorkspaceFilters workspace={workspace}/>);
 await act(async()=>vi.advanceTimersByTime(2000));
 const button=screen.getByRole("button",{name:"重试读取所选数据"});
 act(()=>{fireEvent.click(button);fireEvent.click(button);});
 expect(navigation.refresh).toHaveBeenCalledTimes(1);expect(navigation.push).toHaveBeenCalledTimes(1);
});

it("切组使旧重试和旧计时失效，不能向新组重放旧请求",async()=>{
 vi.useFakeTimers();const view=render(<GroupWorkspaceFilters workspace={workspace}/>);
 fireEvent.click(screen.getByRole("button",{name:"快手"}));
 await act(async()=>window.dispatchEvent(new CustomEvent("creatoros:accounts-changed",{detail:{groupId:"other",source:"account-switcher",routeRefreshScheduled:true}})));
 expect(vi.getTimerCount()).toBe(0);
 await act(async()=>vi.advanceTimersByTime(2000));
 expect(screen.queryByRole("button",{name:"重试读取所选数据"})).toBeNull();
 expect(screen.getByRole("status")).toHaveTextContent("账号组已切换");
 fireEvent.click(screen.getByRole("button",{name:"小红书"}));expect(navigation.push).toHaveBeenCalledTimes(1);
 view.rerender(<GroupWorkspaceFilters workspace={{...workspace,groupId:"other",groupName:"新账号组"}}/>);
 fireEvent.click(screen.getByRole("button",{name:"小红书"}));expect(navigation.push).toHaveBeenCalledTimes(2);
 expect(screen.getByRole("status")).not.toHaveTextContent("账号组已切换");
});

it("同步导航失败明确解释且允许重试，不清已有数据",()=>{
 vi.useFakeTimers();
 navigation.push.mockImplementationOnce(()=>{throw Error("route failed");});render(<GroupWorkspaceFilters workspace={workspace}/>);
 fireEvent.click(screen.getByRole("button",{name:"快手"}));
 expect(screen.getByRole("alert")).toHaveTextContent("所选数据暂时无法读取");
 expect(vi.getTimerCount()).toBe(0);
 fireEvent.click(screen.getByRole("button",{name:"重试读取所选数据"}));expect(navigation.push).toHaveBeenCalledTimes(2);
});

it("快手不显示无关公众号阅读，作品覆盖计数不冒账号指标",()=>{
 render(<GroupOverview workspace={{...workspace,platform:"kuaishou",followers:1,collectedAccounts:0,publicationCount:0,platforms:[]}}/>);
 expect(screen.queryByText("文章累计阅读（次）")).toBeNull();
 expect(screen.queryByText("当前筛选不含公众号阅读指标")).toBeNull();
 expect(screen.getByText(/0 \/ 1 个账号有作品指标/)).toBeVisible();
});

it("全部平台未绑公众号与已绑定无阅读样本分别解释，不推断从未采集",()=>{
 const view=render(<GroupOverview workspace={{...workspace,platform:null}}/>);
 expect(screen.getByText("文章累计阅读（次）").closest("div")).toHaveTextContent("当前账号组尚未绑定公众号");
 view.rerender(<GroupOverview workspace={{...workspace,platform:"wechatOfficial",accounts:[{id:"w",platform:"wechatOfficial",name:"公众号",historical:false,archived:false}],platforms:[]}}/>);
 expect(screen.getByText("文章累计阅读（次）").closest("div")).toHaveTextContent("所选日期内暂无文章阅读样本");
 expect(screen.queryByText("尚未采集指标")).toBeNull();
});

it("账号粉丝样本与日期内作品样本分开说明，不把快手已采集粉丝说成未采集",()=>{
 render(<GroupOverview workspace={{...workspace,platform:"kuaishou",followers:1,collectedAccounts:0,videoViews:null,platforms:[],collected:{state:"ready",catalogWorkCount:0,unattributableWorkCount:0,deduplicatedWorkCount:0,metrics:[{platform:"kuaishou",metricKey:"follower_count",scope:"account",unit:"count",window:"lifetime",value:1,knownCount:1,eligibleCount:1,capturedAt:null,observedAt:null,sources:["actual-schema-fixture"]}]}}}/>);
 expect(screen.getByText("已有账号指标；当前日期内暂无作品指标")).toBeVisible();
 expect(screen.getByText(/0 \/ 1 个账号有作品指标/)).toBeVisible();
 expect(within(screen.getByLabelText("账号组指标")).getByText("账号粉丝合计（人，未去重）：")).toHaveTextContent("1");
});

it("已绑定的文章样本未知、摘要不可读、真实零阅读各自保持准确原因",()=>{
 const article:GroupWorkspace={...workspace,platform:"wechatOfficial",accounts:[{id:"w",platform:"wechatOfficial",name:"公众号",historical:false,archived:false}],platforms:[],collected:{state:"ready",catalogWorkCount:1,unattributableWorkCount:0,deduplicatedWorkCount:0,metrics:[{platform:"wechatOfficial",metricKey:"read_count",scope:"work",unit:"count",window:"lifetime",value:null,knownCount:0,eligibleCount:1,capturedAt:null,observedAt:null,sources:[]}]}};
 const view=render(<GroupOverview workspace={article}/>);
 expect(screen.getByText("文章累计阅读（次）").closest("div")).toHaveTextContent("所选日期内的文章阅读指标暂缺");
 view.rerender(<GroupOverview workspace={{...article,collected:{state:"unavailable",catalogWorkCount:null,unattributableWorkCount:null,deduplicatedWorkCount:null,metrics:[]}}}/>);
 expect(screen.getByText("文章累计阅读（次）").closest("div")).toHaveTextContent("采集摘要暂不可读，文章阅读指标未知");
 view.rerender(<GroupOverview workspace={{...article,articleReads:0}}/>);
 const card=screen.getByText("文章累计阅读（次）").closest("div")!;
 expect(within(card).getByText("0")).toBeVisible();expect(card).not.toHaveTextContent("暂缺");expect(card).not.toHaveTextContent("暂无");
});
