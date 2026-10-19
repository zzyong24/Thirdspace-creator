import {expect,it,vi} from 'vitest';
import {createGroupWorkspaceApplication} from './group-workspace';
const ctx={userId:'owner',groupId:'g',requestId:'group-page',source:'user' as const};
const now='2026-10-04T04:00:00Z';
const base={scenario:'default',kind:'dashboard',loading:false,error:null,scheduleReminderReadState:{state:'ready',error:null},metrics:[],continueCreating:null,todos:[],trendingTopics:[],recentPublications:[],dataOverview:{metrics:[],trend:[]},suggestions:[],assistantPrompt:''};
const pubs=[{id:'video',accountId:'d',platform:'douyin',contentOutputId:'output-video',publishedAt:'2026-10-02T00:00:00Z',status:'published',removedAt:null,hiddenAt:null},{id:'article',accountId:'w',platform:'wechatOfficial',contentOutputId:'output-article',publishedAt:'2026-10-02T00:00:00Z',status:'published',removedAt:null,hiddenAt:null}];
function ports(){return {now:()=>now,groups:{get:vi.fn(async()=>({id:'g',name:'工作区',status:'active',members:[{accountId:'d',platform:'douyin',accountHandle:'视频',status:'active'},{accountId:'w',platform:'wechatOfficial',accountHandle:'文章',status:'active'}]}))},dashboard:{getDashboard:vi.fn(async()=>base)},projects:{listProjectsForComposition:vi.fn(async()=>[{id:'same-content'}]),listOutputRefsByOutputIds:vi.fn(async(_c,ids)=>ids.map((outputId:string)=>({outputId,projectId:'same-content'})))},publishing:{listPublicationsForUser:vi.fn(async()=>pubs),listCurrentRevisionSummariesByPublicationIds:vi.fn(async()=>pubs.map(p=>({publicationId:p.id,title:p.id})))},analytics:{getDailyPlayTrend:vi.fn(async()=>[]),listLatestSnapshotsByPublicationIds:vi.fn(async()=>[{publicationId:'video',rawMetrics:{views:0,likes:0},capturedAt:now},{publicationId:'article',rawMetrics:{reads:230,likes:4},capturedAt:now}]),getDashboardRollup:vi.fn(async()=>({finishAvg:null,finishCount:0}))}};}
it('组展示阅读与播放独立，真实0保留，同内容两个输出只计一次且日期轴用北京时间',async()=>{const p=ports();const app=createGroupWorkspaceApplication(p as any);const page=await app.get(ctx,'g',{});expect(page.workspace.contentCount).toBe(1);expect(page.workspace.publicationCount).toBe(2);expect(page.workspace.videoViews).toBe(0);expect(page.workspace.articleReads).toBe(230);expect(page.workspace.startDate).toBe('2026-09-05');expect(page.dataOverview.trend).toEqual([]);expect(p.dashboard.getDashboard).toHaveBeenCalledWith(expect.objectContaining({groupId:'g',accountId:null}));});
it('平台筛选不更换共享项目上下文，未知指标不变成0，跨组账号筛选拒绝',async()=>{const p=ports();const app=createGroupWorkspaceApplication(p as any);await expect(app.get(ctx,'g',{accountId:'other'})).rejects.toMatchObject({code:'OwnershipError'});await expect(app.get(ctx,'other',{})).rejects.toMatchObject({code:'OwnershipError'});const page=await app.get(ctx,'g',{platform:'douyin'});expect(page.workspace.articleReads).toBeNull();expect(page.metrics.find(c=>c.id==='g-followers')?.value).toBe('—');expect(p.projects.listProjectsForComposition).toHaveBeenLastCalledWith(expect.objectContaining({groupId:'g',accountId:null}));});

it("趋势仅显示实测日期，覆盖不全留null且公众号不混入视频轴",async()=>{const p=ports();p.analytics.getDailyPlayTrend.mockResolvedValue([{day:"2026-09-01",plays:900},{day:"2026-10-02",plays:20,complete:false},{day:"2026-10-03",plays:0}] as never);const page=await createGroupWorkspaceApplication(p as any).get(ctx,"g",{});expect(page.dataOverview.trend).toEqual([]);expect(p.analytics.getDailyPlayTrend).not.toHaveBeenCalled();});

it('T1347公开组查询经真实native service读取自然日播放，不再把旧采集差分当每日',async()=>{
 const {createDb}=await import('../../db');
 const {platformAccounts}=await import('../../schema/platform-account');
 const {accountGroups,accountGroupMemberships}=await import('../../schema/account-groups');
 const {platformNativeReports}=await import('../../schema/platform-collection');
 const {createPlatformCollectionService}=await import('../../modules/platform-collection');
 const {lockWorkspaceMembership,assertFrozenWorkspaceMembership}=await import('../../modules/platform-account');
 const {createQueryServicesTransport}=await import('../../modules/query-services/query-services.transport');
 const {ENDPOINTS}=await import('@creatoros/contract');
 const f=await createDb();
 try{
  await f.db.insert(platformAccounts).values({id:'daily-account',userId:'owner',platform:'wechatVideo',accountHandle:'隔离视频号',createdAt:now,updatedAt:now});
  await f.db.insert(accountGroups).values({id:'g',userId:'owner',name:'隔离组',version:1,createdAt:now,updatedAt:now});
  await f.db.insert(accountGroupMemberships).values({id:'daily-member',userId:'owner',groupId:'g',accountId:'daily-account',version:1,joinedAt:now});
  const payload={platform:'wechatVideo' as const,kind:'channelsDaily' as const,scope:'accountDaily' as const,accumulation:'daily' as const,selection:{startDate:'2026-10-02',endDate:'2026-10-03',timeZone:'Asia/Shanghai' as const,meaning:'statisticsDates' as const},sourcePath:'/platform/statistic/post' as const,filename:'synthetic.csv',sha256:'b'.repeat(64),receivedBytes:100,tables:[{key:'daily',label:'每日',columns:[{key:'时间',label:'时间',unit:'date' as const},{key:'播放',label:'播放',unit:'count' as const}],rows:[[{raw:'2026-10-02',value:'2026-10-02'},{raw:'0',value:0}],[{raw:'2026-10-03',value:'2026-10-03'},{raw:'23',value:23}]]}]};
  await f.db.insert(platformNativeReports).values({id:'daily-report',userId:'owner',groupId:'g',accountId:'daily-account',membershipVersion:1,platform:'wechatVideo',kind:'channelsDaily',sha256:payload.sha256,selectionKey:'synthetic-selection',payload,observedAt:now,ingestedAt:now});
  const service=createPlatformCollectionService({db:f.db,now:()=>now,nextId:p=>p+'-unused',nativeReportOwnership:{freeze:(tx,c,a)=>lockWorkspaceMembership(tx,{...c,accountId:a}),assert:assertFrozenWorkspaceMembership}});
  const p=ports();p.groups.get.mockResolvedValue({id:'g',userId:'owner',name:'隔离组',status:'active',version:1,members:[{id:'daily-member',accountId:'daily-account',groupId:'g',platform:'wechatVideo',accountHandle:'隔离视频号',status:'active',version:1,leftAt:null,joinedAt:now}]} as never);
  p.publishing.listPublicationsForUser.mockResolvedValue([] as never);
  p.analytics.getDailyPlayTrend.mockResolvedValue([{day:'2026-10-03',plays:9999}] as never);
  const nativeReports={listNativeReports:vi.fn(service.listNativeReports)};
  const app=createGroupWorkspaceApplication({...p,nativeReports} as any);
  const transport=createQueryServicesTransport({groupOverview:app} as any);
  const result:any=await transport.request(ENDPOINTS.getGroupTrend,{params:{groupId:'g'},query:{platform:'wechatVideo',accountId:'daily-account',startDate:'2026-10-02',endDate:'2026-10-03'},body:undefined},ctx);
  expect(result.data.trend).toEqual([{label:'2026-10-02',value:0},{label:'2026-10-03',value:23}]);
  expect(result.data.performanceTrend).toMatchObject({mode:'daily',unit:'次',valueLabel:'播放量',accountId:'daily-account',reportIds:['daily-report']});
  expect(nativeReports.listNativeReports).toHaveBeenCalled();
  expect(p.analytics.getDailyPlayTrend).not.toHaveBeenCalled();
 }finally{await f.client.close();}
},180000);

it('T1347独立日报公开端点不让慢日报读取拖住概要组合',async()=>{
 const {createQueryServicesTransport}=await import('../../modules/query-services/query-services.transport');
 const {ENDPOINTS}=await import('@creatoros/contract');
 const p=ports();p.groups.get.mockResolvedValue({id:'g',userId:'owner',name:'隔离组',status:'active',version:1,members:[{id:'daily-member',accountId:'daily-account',groupId:'g',platform:'wechatVideo',accountHandle:'隔离视频号',status:'active',version:1,leftAt:null,joinedAt:now}]} as never);
 let release!:(v:unknown)=>void;
 const nativeReports={listNativeReports:vi.fn(()=>new Promise(done=>{release=done;}))};
 const app=createGroupWorkspaceApplication({...p,nativeReports} as any);
 const transport=createQueryServicesTransport({groupOverview:app} as any);
 let trendDone=false;
 const trend=transport.request({...ENDPOINTS.getGroupOverview,id:'pages.groupTrend.get'} as any,{params:{groupId:'g'},query:{platform:'wechatVideo',accountId:'daily-account',startDate:'2026-10-02',endDate:'2026-10-03'},body:undefined},ctx).then(result=>{trendDone=true;return result;}).catch(error=>({error}));
 // 观察公开请求进入真实读端口，不设置产品短超时，也不靠固定sleep判断性能。
 await Promise.resolve();await Promise.resolve();
 const overview:any=await transport.request(ENDPOINTS.getGroupOverview,{params:{groupId:'g'},query:{},body:undefined},ctx);
 expect(overview.data.workspace.groupId).toBe('g');
 expect(trendDone).toBe(false);
 expect(nativeReports.listNativeReports).toHaveBeenCalledOnce();
 release({items:[],nextCursor:null,total:0});
 expect(await trend).not.toHaveProperty('error');
});

it('T1347唯一有效成员先排除历史和归档；显式归档/多号/公众号不读取native',async()=>{
 const p=ports(),read=vi.fn(async()=>({items:[],nextCursor:null,total:0}));
 const member=(id:string,extra={})=>({id:'m-'+id,accountId:id,groupId:'g',platform:'wechatVideo',accountHandle:id,status:'active',version:1,leftAt:null,joinedAt:now,...extra});
 p.groups.get.mockResolvedValue({id:'g',name:'组',status:'active',version:1,members:[member('only'),member('archived',{status:'archived'}),member('left',{leftAt:now})]} as never);
 const app=createGroupWorkspaceApplication({...p,nativeReports:{listNativeReports:read}} as any);
 const inferred=await app.getTrend(ctx,'g',{});expect(inferred.performanceTrend.accountId).toBe('only');expect(read).toHaveBeenCalledOnce();
 read.mockClear();expect((await app.getTrend(ctx,'g',{accountId:'archived'})).performanceTrend.reason).toBe('unavailable_account');expect(read).not.toHaveBeenCalled();
 p.groups.get.mockResolvedValue({id:'g',name:'组',status:'active',version:1,members:[member('a'),member('b')]} as never);expect((await app.getTrend(ctx,'g',{})).performanceTrend.reason).toBe('select_account');expect(read).not.toHaveBeenCalled();
 p.groups.get.mockResolvedValue({id:'g',name:'组',status:'active',version:1,members:[member('official',{platform:'wechatOfficial'})]} as never);expect((await app.getTrend(ctx,'g',{})).performanceTrend).toMatchObject({unit:'人',reason:'no_total_channel'});expect(read).not.toHaveBeenCalled();
 await expect(app.getTrend({...ctx,groupId:'other'},'g',{})).rejects.toMatchObject({code:'OwnershipError'});
});
