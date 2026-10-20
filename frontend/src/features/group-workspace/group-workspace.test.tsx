import * as React from "react";
import {render,screen,within,cleanup} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach,describe,it,expect,vi} from "vitest";
import {GroupWorkspaceFilters} from "./group-workspace-filters";
import {GroupOverview} from "./group-overview";
import {workspaceQueryFromSearch,workspaceFilterHref,type GroupWorkspace} from "./workspace-query";
const push=vi.fn();
let queryString="platform=douyin&accountId=a1&copilot=open";
vi.mock("next/navigation",()=>({useRouter:()=>({push}),usePathname:()=>"/overview",useSearchParams:()=>new URLSearchParams(queryString)}));
vi.mock("@/features/daily-report/report-date-range",()=>({ReportDateRange:({onChange}:{onChange:(r:{startDate:string;endDate:string})=>void})=><button onClick={()=>onChange({startDate:"2026-09-01",endDate:"2026-09-30"})}>改日期</button>}));
export const workspace:GroupWorkspace={groupId:"g1",groupName:"月明账号组",status:"active",platform:"douyin",accountId:"a1",startDate:"2026-09-01",endDate:"2026-09-30",generatedAt:"2026-10-01T01:00:00Z",contentCount:2,publicationCount:3,pendingCount:1,collectedAccounts:1,totalAccounts:2,videoViews:90,articleReads:20,followers:null,latestCapturedAt:null,coverage:"1 / 2 个账号已采集",metricMode:"published_in_period_cumulative",accounts:[{id:"a1",name:"月明视频",platform:"douyin",historical:false,archived:false},{id:"a2",name:"月明文章",platform:"wechatOfficial",historical:true,archived:false}],platforms:[{platform:"douyin",publicationCount:2,sampleCount:2,views:90,reads:null,likes:2,shares:null,capturedAt:null},{platform:"wechatOfficial",publicationCount:1,sampleCount:1,views:null,reads:20,likes:null,shares:null,capturedAt:null}]};
afterEach(()=>{cleanup();push.mockClear();queryString="platform=douyin&accountId=a1&copilot=open";});
describe("账号组筛选真实行为",()=>{
 it("五平台可见，切平台清具体账号而保留其他查询",async()=>{render(<GroupWorkspaceFilters workspace={workspace}/>);await userEvent.click(screen.getByRole("button",{name:"公众号"}));expect(push).toHaveBeenCalledWith("/overview?platform=wechatOfficial&copilot=open",{scroll:false});expect(screen.getByRole("button",{name:"快手"})).toBeVisible();});
 it("同平台多账号与历史成员用真实ID局部选择",async()=>{queryString="";render(<GroupWorkspaceFilters workspace={{...workspace,platform:null,accountId:null}}/>);await userEvent.click(screen.getByRole("combobox",{name:"平台账号"}));await userEvent.click(screen.getByRole("option",{name:"公众号 · 月明文章 · 历史归属"}));expect(push).toHaveBeenCalledWith("/overview?accountId=a2",{scroll:false});expect(window.localStorage.getItem("creatoros:current-account")).toBeNull();});
 it("日期变更保留平台账号",async()=>{render(<GroupWorkspaceFilters workspace={workspace}/>);await userEvent.click(screen.getByRole("button",{name:"改日期"}));expect(push.mock.calls[0]?.[0]).toContain("accountId=a1");expect(push.mock.calls[0]?.[0]).toContain("startDate=2026-09-01");});
 it("只读取安全查询，合法日期成对校验",()=>{expect(workspaceQueryFromSearch({platform:"invented",accountId:"a1",startDate:"2026-02-30",endDate:"2026-03-01"})).toEqual({accountId:"a1"});expect(workspaceFilterHref("/",new URLSearchParams("accountId=a1&platform=douyin"),{platform:null})).toBe("/");});
 it("总览拆分播放阅读，未知粉丝保留空值，不伪造曲线",()=>{const {container}=render(<GroupOverview workspace={workspace}/>);expect(screen.getByText("视频累计播放（次）")).toBeVisible();expect(screen.getByText("文章累计阅读（次）")).toBeVisible();expect(within(screen.getByLabelText("账号组指标")).getByText("账号粉丝合计（人，未去重）：").querySelector(".tabular-nums")).toHaveTextContent("—");expect(container.querySelector('[data-slot="group-video-axis"]')).toBeTruthy();expect(container.querySelector('[data-slot="group-article-axis"]')).toBeTruthy();});
 it("空组保留零基线网格而不产生虚假条形，保留真实创建/绑定入口",()=>{const {container}=render(<GroupOverview workspace={{...workspace,totalAccounts:0,accounts:[],platforms:[],videoViews:null,articleReads:null,followers:null,publicationCount:0,collectedAccounts:0}}/>);expect(container.querySelector('[data-slot="group-video-svg"]')).toBeNull();expect(container.querySelector('[data-slot="group-article-svg"]')).toBeNull();expect(screen.getAllByText('当前筛选内尚未绑定平台账号')).toHaveLength(2);expect(screen.getByRole("link",{name:"管理账号组"})).toHaveAttribute("href","/accounts");expect(screen.getByText("尚未绑定平台账号，可继续创建内容。" )).toBeVisible();});
});


it.each([0,123])('T1362 typed浏览%s独立可见，不用legacy样本0宣称未采集',value=>{
 const data:GroupWorkspace={...workspace,platform:'xiaohongshu',accountId:null,browseViews:value,videoViews:null,articleReads:null,publicationCount:0,accounts:[{id:'x',name:'真实小红书',platform:'xiaohongshu',historical:false,archived:false}],platforms:[{platform:'xiaohongshu',publicationCount:0,sampleCount:0,views:null,browses:value,reads:null,likes:0,shares:null,capturedAt:'2026-10-01T01:00:00Z'}],collected:{state:'ready',catalogWorkCount:1,unattributableWorkCount:0,deduplicatedWorkCount:0,metrics:[{platform:'xiaohongshu',metricKey:'view_count',scope:'work',unit:'count',window:'lifetime',value,knownCount:1,eligibleCount:1,capturedAt:null,observedAt:null,sources:['fixture']}]}};
 render(<GroupOverview workspace={data}/>);expect(screen.getByText('累计浏览（次）')).toBeVisible();expect(screen.getByRole('columnheader',{name:'浏览（次）'})).toBeVisible();expect(screen.queryByText('尚未采集指标')).toBeNull();expect(screen.getByText('已有采集指标')).toBeVisible();expect(screen.getByRole('columnheader',{name:'发布指标样本（条）'})).toBeVisible();
});
it('T1362旧DTO缺浏览仍显示未知，摘要失败不称未采集',()=>{
 render(<GroupOverview workspace={{...workspace,collected:{state:'unavailable',catalogWorkCount:null,unattributableWorkCount:null,deduplicatedWorkCount:null,metrics:[]}}}/>);
 expect(screen.getByText('累计浏览（次）').parentElement).toHaveTextContent('—');expect(screen.getByText('平台采集摘要暂不可读，保留已知发布指标。')).toBeVisible();
});


it('T1362有归属记录但未知不说未采集，旧sampleCount不冒目录数',()=>{
 const data:GroupWorkspace={...workspace,platform:'xiaohongshu',accounts:[{id:'x',name:'真实账号',platform:'xiaohongshu',historical:false,archived:false}],platforms:[{platform:'xiaohongshu',publicationCount:0,sampleCount:0,views:null,browses:null,reads:null,likes:null,shares:null,capturedAt:null}],collected:{state:'ready',catalogWorkCount:1,unattributableWorkCount:0,deduplicatedWorkCount:0,metrics:[{platform:'xiaohongshu',metricKey:'view_count',scope:'work',unit:'count',window:'lifetime',value:null,knownCount:0,eligibleCount:1,capturedAt:null,observedAt:null,sources:[]}]}};
 render(<GroupOverview workspace={data}/>);expect(screen.getByText('部分指标暂缺')).toBeVisible();expect(screen.queryByText('尚未采集指标')).toBeNull();const row=screen.getByRole('rowheader',{name:/小红书/}).closest('tr')!;expect(row.children[2]).toHaveTextContent('0');expect(row.children[4]).toHaveTextContent('—');
});

it("总览嵌入已有标题的页面时不重复标题，指标与管理入口保留",()=>{
 render(<main><h1>创作者总览</h1><GroupOverview workspace={workspace} showPageHeading={false}/></main>);
 expect(screen.getAllByRole("heading",{level:1,name:"创作者总览"})).toHaveLength(1);
 expect(screen.getByText("视频累计播放（次）")).toBeVisible();
 expect(screen.getByRole("link",{name:"管理账号组"})).toHaveAttribute("href","/accounts");
});
