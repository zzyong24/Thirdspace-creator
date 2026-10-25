import * as React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,within} from '@testing-library/react';
import {GroupOverview} from './group-overview';
import type {GroupWorkspace} from './workspace-query';
vi.mock('./group-platform-data',()=>({GroupPlatformData:()=>null}));
const base:GroupWorkspace={groupId:'g',groupName:'测试组',status:'active',platform:'xiaohongshu',accountId:null,startDate:'2026-09-25',endDate:'2026-10-24',generatedAt:'2026-10-24T12:00:00Z',contentCount:0,publicationCount:0,pendingCount:0,collectedAccounts:1,totalAccounts:1,videoViews:null,articleReads:null,browseViews:3692,followers:null,latestCapturedAt:null,coverage:'',metricMode:'published_and_collected_in_period_cumulative',accounts:[{id:'x',name:'本人',platform:'xiaohongshu',historical:false,archived:false}],platforms:[{platform:'xiaohongshu',publicationCount:0,sampleCount:0,views:null,reads:null,browses:3692,likes:57,shares:5,capturedAt:null}],collected:{state:'ready',catalogWorkCount:13,unattributableWorkCount:0,deduplicatedWorkCount:0,metrics:[]}};
afterEach(cleanup);
it('小红书主要展示真实采集作品和浏览，不混入公众号阅读或系统发布零数',()=>{
 const {container}=render(<GroupOverview workspace={base}/>);
 const main=within(screen.getByLabelText('账号组指标'));
 expect(main.getByText('已采集作品（条）').parentElement).toHaveTextContent('13');
 expect(main.getByText('累计浏览（次）').parentElement).toHaveTextContent('3,692');
 expect(main.queryByText('平台发布记录（条）')).toBeNull();
 expect(screen.queryByText(/公众号阅读指标/)).toBeNull();
 expect(screen.queryByText('文章累计阅读（次）')).toBeNull();
 expect(screen.queryByRole('columnheader',{name:'阅读（次）'})).toBeNull();
 expect(container.querySelector('[data-slot="group-article-axis"]')).toBeNull();
 expect(container.querySelector('[data-slot="group-video-axis"]')).toBeNull();
 expect(container.querySelector('[data-slot="group-browse-axis"]')).toBeTruthy();
 expect(screen.getByText(/CreatorOS 已发布内容：0 期/)).toBeVisible();
});
it.each(['douyin','kuaishou','wechatVideo'] as const)('%s只有播放指标，不显示公众号或浏览空卡',platform=>{
 render(<GroupOverview workspace={{...base,platform,accounts:[{...base.accounts[0]!,platform}],platforms:[],videoViews:0,browseViews:null}}/>);
 expect(screen.getByText('视频累计播放（次）').parentElement).toHaveTextContent('0');
 expect(screen.queryByText('文章累计阅读（次）')).toBeNull();expect(screen.queryByText('累计浏览（次）')).toBeNull();
});
it.each(['wechatOfficial','wechatOfficialAccount'] as const)('%s只展示阅读并保留未知说明',platform=>{
 render(<GroupOverview workspace={{...base,platform,accounts:[{...base.accounts[0]!,platform}],platforms:[],browseViews:null}}/>);
 expect(screen.getByText('文章累计阅读（次）').parentElement).toHaveTextContent('—');
 expect(screen.getByText('所选日期内暂无文章阅读样本')).toBeVisible();
 expect(screen.queryByText('视频累计播放（次）')).toBeNull();expect(screen.queryByText('累计浏览（次）')).toBeNull();
 expect(screen.getByRole('rowheader',{name:/公众号/})).toBeVisible();
});
it('只选账号仍按该账号平台决定指标',()=>{
 render(<GroupOverview workspace={{...base,platform:null,accountId:'x'}}/>);
 expect(screen.getByText('累计浏览（次）')).toBeVisible();expect(screen.queryByText('文章累计阅读（次）')).toBeNull();
});
it('全部平台三种口径保持分开',()=>{
 render(<GroupOverview workspace={{...base,platform:null}}/>);
 for(const title of ['视频累计播放（次）','文章累计阅读（次）','累计浏览（次）'])expect(screen.getByText(title)).toBeVisible();
});
it.each(['unavailable','missing'] as const)('采集摘要%s不能把系统发布0冒充平台作品0',state=>{
 render(<GroupOverview workspace={{...base,collected:state==='missing'?undefined:{state:'unavailable',catalogWorkCount:null,unattributableWorkCount:null,deduplicatedWorkCount:null,metrics:[]}}}/>);
 expect(screen.getByText('已采集作品（条）').parentElement).toHaveTextContent('—');
});

it('两个公众号历史键同时存在时保留两行，不合并或丢弃事实',()=>{
 render(<GroupOverview workspace={{...base,platform:'wechatOfficial',articleReads:8,browseViews:null,platforms:['wechatOfficial','wechatOfficialAccount'].map((platform,index)=>({platform:platform as 'wechatOfficial'|'wechatOfficialAccount',publicationCount:index+1,sampleCount:0,views:null,reads:index?5:3,browses:null,likes:null,shares:null,capturedAt:null}))}}/>);
 expect(screen.getAllByRole('rowheader',{name:/公众号/})).toHaveLength(2);
});
