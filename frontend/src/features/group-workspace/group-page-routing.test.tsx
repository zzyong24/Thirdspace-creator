import * as React from "react";
import {describe,it,expect,vi,beforeEach} from "vitest";
const mock=vi.hoisted(()=>({session:vi.fn(),overview:vi.fn(),workspace:vi.fn(),dashboard:vi.fn(),report:vi.fn()}));
vi.mock("@/lib/session.server",()=>({resolveSession:mock.session}));
vi.mock("@/lib/contract-client.server",()=>({createServerClient:()=>({getGroupOverview:mock.overview,getGroupWorkspace:mock.workspace,getDashboard:mock.dashboard}),createCachedPageClient:()=>({getDailyReport:mock.report}),client:{getDashboard:mock.dashboard,getDailyReport:mock.report}}));
vi.mock("@/features/dashboard/dashboard-page",()=>({DashboardPage:(props:Record<string,unknown>)=><div data-rich-dashboard={JSON.stringify(props)}/>}));
vi.mock("@/features/group-workspace/group-workspace-filters",()=>({GroupWorkspaceFilters:(props:Record<string,unknown>)=><div data-filter={JSON.stringify(props)}/>}));
vi.mock("@/features/group-workspace/group-overview",()=>({GroupOverview:()=>null}));
vi.mock("@/features/daily-report/daily-report-page",()=>({DailyReportPage:()=>null}));
import Home from "@/app/(creator)/page";
import Overview from "@/app/(creator)/overview/page";
import DailyReport from "@/app/(creator)/daily-report/page";
beforeEach(()=>{vi.clearAllMocks();mock.session.mockResolvedValue({ctx:{groupId:"real-group",userId:"u"},user:{displayName:"真实创作者"}});mock.overview.mockResolvedValue({workspace:{groupId:"real-group"},metrics:[],continueCreating:[],todos:[],trendingTopics:[],recentPublications:[],dataOverview:{trend:[]},suggestions:[]});mock.workspace.mockResolvedValue({workspace:{groupId:"real-group",accounts:[],platforms:[],totalAccounts:0}});mock.report.mockResolvedValue({works:[]});});
describe("正式组页面服务查询",()=>{
 it("总览仅请求专用workspace端点，首页组合不进入筛选等待链",async()=>{await Overview({searchParams:Promise.resolve({platform:"xiaohongshu"})});expect(mock.workspace).toHaveBeenCalledWith({body:undefined,params:{groupId:"real-group"},query:{platform:"xiaohongshu"}});expect(mock.overview).not.toHaveBeenCalled();});
 it("首页按真实组和局部筛选调用合同，保留DashboardPage",async()=>{const page=await Home({searchParams:Promise.resolve({platform:"douyin",accountId:"real-account",startDate:"2026-09-01",endDate:"2026-09-30"})});expect(mock.overview).toHaveBeenCalledWith({body:undefined,params:{groupId:"real-group"},query:{platform:"douyin",accountId:"real-account",startDate:"2026-09-01",endDate:"2026-09-30"}});expect(mock.dashboard).not.toHaveBeenCalled();expect(page.props.viewModel.continueCreating).toEqual([]);expect(page.props.filters.props.workspace.groupId).toBe('real-group');expect(page.props.greetingName).toBe('真实创作者');});
 it("总览没有组时不给虚构数据",async()=>{mock.session.mockResolvedValue({ctx:{userId:"u"},user:{displayName:"创作者"}});await Overview();expect(mock.overview).not.toHaveBeenCalled();});
 it("运营分析同平台账号日期，选项来自安全组查询",async()=>{await DailyReport({searchParams:Promise.resolve({platform:"wechatOfficial",accountId:"article-id",date:"2026-09-15"})});expect(mock.overview).toHaveBeenCalledWith({body:undefined,params:{groupId:"real-group"},query:{platform:"wechatOfficial",accountId:"article-id",startDate:"2026-09-15",endDate:"2026-09-15"}});expect(mock.report).toHaveBeenCalledWith({params:undefined,body:undefined,query:{date:"2026-09-15",platform:"wechatOfficial",accountId:"article-id"}});});
});
