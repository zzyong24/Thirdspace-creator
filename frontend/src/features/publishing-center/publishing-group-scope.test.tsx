import * as React from "react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen,fireEvent,within} from "@testing-library/react";
import {PublishingCenterSummaryRail} from "./publishing-center-interactive-region";
import {PublishingContentList} from "./publishing-content-list";
import {scopeGroupPublishingProjection} from "./publishing-group-scope";
import type {PublicationRow} from "./publishing-center-page";
import type {GroupWorkspace} from "../group-workspace/workspace-query";
vi.mock("next/link",()=>({default:({href,children}:React.PropsWithChildren<{href:string}>)=><a href={href}>{children}</a>}));
afterEach(cleanup);
const row=(id:string,projectId:string,platform:string,accountId:string,status:PublicationRow['status']='published'):PublicationRow=>({id,projectId,projectTitle:'同名内容',contentTitle:`平台版本 ${id}`,contentType:'video',platform,platformLabel:platform==='douyin'?'抖音':'公众号',accountId,accountName:accountId,publishedAt:'2026-10-02T10:00:00Z',publishedAtLabel:'2026-10-02',status,statusLabel:status==='draft'?'草稿':'已发布',hidden:false,views:'—',engagementLabel:'—',engagementTone:'neutral',thumbnailToken:id,metricValue:null});
const workspace:GroupWorkspace={groupId:'g',groupName:'当前组',status:'active',platform:'douyin',accountId:'a2',startDate:'2026-10-01',endDate:'2026-10-04',generatedAt:'2026-10-04T00:00:00Z',contentCount:1,publicationCount:1,pendingCount:1,collectedAccounts:0,totalAccounts:1,videoViews:null,articleReads:null,followers:null,latestCapturedAt:null,accounts:[{id:'a2',name:'抖音第二号',platform:'douyin',historical:false,archived:false}],platforms:[],coverage:'0/1 个账号有作品指标',metricMode:'published_in_period_cumulative'};
const projection=(rows:PublicationRow[])=>({calendar:{state:'ready' as const,error:null,viewModel:{accountId:null,groupId:'g',accounts:[],month:'2026-10',referenceDateKey:'2026-10-04',publications:rows.map(r=>({id:r.id,dateKey:'2026-10-02',title:r.contentTitle,projectId:r.projectId!,platformLabel:r.platformLabel,views:r.views,coverAssetId:null})),entries:[{id:'planned-group'}],projects:[{id:'p',title:'未设平台的创作项目'}],cadence:null,attainment:null,window:{from:'2026-10-01',to:'2026-11-01'}}},performance:{scenario:'default' as const,kind:'publishing-center' as const,loading:false,error:null,contentTypeTabs:[],publications:rows,metrics:[],platformComparison:[],trend:[],topContent:[],pagination:{currentPage:1,totalPages:1}}});
describe('T1022 发布中心账号组作品视图',()=>{
 it('一期按真实 projectId 分组，展开目标版本；同名项目不合并，可切实际发布记录',()=>{
  const rows=[row('p1-a','p1','douyin','a1'),row('p1-b','p1','douyin','a2','draft'),row('p2-a','p2','wechatOfficial','a3')];
  const {container}=render(<PublishingContentList rows={rows}/>);
  expect(container.querySelectorAll('details')).toHaveLength(2);
  const first=container.querySelector('details')!;fireEvent.click(within(first).getByText('同名内容'));
  expect(within(first).getByText('a1')).toBeInTheDocument();expect(within(first).getByText('a2')).toBeInTheDocument();expect(within(first).getByText('草稿')).toBeInTheDocument();
  expect(within(first).getAllByText('—').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button',{name:'按发布记录'}));expect(container.querySelectorAll('details')).toHaveLength(0);expect(container.querySelectorAll('[data-publication-id]')).toHaveLength(3);
 });
 it('平台/实际账号/北京时间日期作用于版本和月历发布事实，组级创作排期保留',()=>{
  const rows=[row('match','p','douyin','a2'),row('other-account','p','douyin','a1'),row('article','p','wechatOfficial','a3'),{...row('old','p','douyin','a2'),publishedAt:'2026-09-30T15:59:59Z'},row('draft','p','douyin','a2','draft')];
  const input=projection(rows);const scoped=scopeGroupPublishingProjection(input as never,{workspace,dataOverview:{trend:[]}});
  expect(scoped.performance.publications.map(r=>r.id)).toEqual(['match','draft']);
  expect(scoped.performance.publications[0]?.accountName).toBe('抖音第二号');
  expect(scoped.performance.metrics.find(m=>m.id==='pubc-total-plays')?.value).toBe('—');
  if(scoped.calendar.state!=='ready')throw new Error('日历应保留');expect(scoped.calendar.viewModel.publications.map(r=>r.id)).toEqual(['match','draft']);expect(scoped.calendar.viewModel.entries).toEqual(input.calendar.viewModel.entries);expect(scoped.calendar.viewModel.projects).toEqual(input.calendar.viewModel.projects);
 });
});
it('北京时间范围含首日零点，真实零值与未知区分，阅读不进入播放比较',()=>{
 const edge={...row('edge','p','wechatOfficial','a3'),publishedAt:'2026-09-30T16:00:00Z',metricKind:'reads' as const,metricValue:0,likes:0};
 const data={workspace:{...workspace,platform:null,accountId:null,videoViews:1200,articleReads:0,platforms:[{platform:'douyin' as const,publicationCount:1,sampleCount:1,views:1200,reads:null,likes:null,shares:null,capturedAt:null},{platform:'wechatOfficial' as const,publicationCount:1,sampleCount:1,views:null,reads:0,likes:0,shares:null,capturedAt:null}]},dataOverview:{trend:[{label:'2026-10-01',value:null}]}};
 const scoped=scopeGroupPublishingProjection(projection([edge]) as never,data);
 expect(scoped.performance.publications[0]?.id).toBe('edge');expect(scoped.performance.metrics.find(m=>m.id==='pubc-total-reads')?.value).toBe('0');expect(scoped.performance.platformComparison.map(r=>r.platform)).toEqual(['douyin']);expect(scoped.performance.trend[0]?.value).toBeNull();
 render(<PublishingContentList rows={scoped.performance.publications}/>);expect(screen.getAllByText('0').length).toBeGreaterThan(0);expect(screen.getByText('阅读')).toBeInTheDocument();expect(screen.getByText('尚未采集')).toBeInTheDocument();
});
it('组平台身份统一中文，包括无库存行但有历史指标的平台',()=>{
 const variants=['kuaishou','wechatVideo','wechatOfficial'] as const;
 const data={workspace:{...workspace,platform:null,accountId:null,platforms:variants.map(platform=>({platform,publicationCount:1,sampleCount:1,views:platform==='wechatOfficial'?null:1,reads:platform==='wechatOfficial'?1:null,likes:null,shares:null,capturedAt:null}))},dataOverview:{trend:[]}};
 const scoped=scopeGroupPublishingProjection(projection(variants.map((platform,i)=>({...row(`r${i}`,`p${i}`,platform,`a${i}`),platformLabel:platform}))) as never,data);
 expect(scoped.performance.publications.map(r=>r.platformLabel)).toEqual(['快手','视频号','公众号']);expect(scoped.performance.platformComparison.map(r=>r.platformLabel)).toEqual(['快手','视频号']);
 const noRows=scopeGroupPublishingProjection(projection([]) as never,data);expect(noRows.performance.platformComparison.map(r=>r.platformLabel)).toEqual(['快手','视频号']);
});

it('组趋势只有一个实测点也保留数值、日期轴与零基线',()=>{
 const {container}=render(<PublishingCenterSummaryRail nativeMode viewModel={{metrics:[],platformComparison:[],trend:[{label:'2026-10-04',value:1200}]}}/>);
 expect(container.querySelector('[data-slot="chart-value-axis"]')).not.toBeNull();expect(container.querySelector('[data-slot="chart-zero-baseline"]')).not.toBeNull();expect(container.querySelector('[data-slot="chart-date-axis"]')).not.toBeNull();expect(container.querySelector('[data-slot="chart-frame-svg"] path')).toBeNull();
});
