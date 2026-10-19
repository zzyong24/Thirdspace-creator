import {readDashboardNativeTrend,unavailablePerformance,type NativeReportsPort} from './dashboard-native-trend';
import type {RequestContext,MetricCard} from '@creatoros/contract';
import {groupWorkspaceQuery,groupDashboardPage,groupDashboardTrend} from '@creatoros/contract';
import {OwnershipError} from '../../errors';
import type {AccountGroupService} from '../../modules/platform-account';
import type {ProjectsService} from '../../modules/projects';
import type {PublishingService} from '../../modules/publishing';
import type {AnalyticsService} from '../../modules/analytics';
import type {DashboardPage} from '@creatoros/contract';
import type {createPlatformCollectionService} from '../../modules/platform-collection';
import {projectCollectedDashboard,type CollectedDashboardFacts,type CoveredPublication} from './dashboard-collected-metrics';
const num=(m:Record<string,unknown>,keys:string[])=>{for(const k of keys){const v=m[k];if(typeof v==='number'&&Number.isFinite(v))return v;}return null;};
const sum=(values:Array<number|null>)=>{const known=values.filter((v):v is number=>v!==null);return known.length?known.reduce((a,b)=>a+b,0):null;};
const fmt=(n:number|null)=>n===null?'—':n.toLocaleString('zh-CN');
const card=(id:string,label:string,n:number|null):MetricCard=>({id,label,value:fmt(n),delta:'',trend:'flat',tone:'neutral'});
/** 组页面只组合现有业务端口；共享创作卡片始终用组范围，平台筛选只消费发布与指标。 */
export function createGroupWorkspaceApplication(ports:{groups:AccountGroupService;projects:ProjectsService;publishing:PublishingService;analytics:AnalyticsService;nativeReports:NativeReportsPort;collectedMetrics?:Pick<ReturnType<typeof createPlatformCollectionService>,'readDashboardSummary'>;dashboard:{getDashboard(ctx:RequestContext):Promise<DashboardPage>};now:()=>string}){
 return {async getTrend(ctx:RequestContext,groupId:string,input:unknown){
  const query=groupWorkspaceQuery.parse(input),group=await ports.groups.get(ctx,groupId);
  if(ctx.groupId&&ctx.groupId!==groupId)throw new OwnershipError('请切换到此账号组');
  const endDate=query.endDate??new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ports.now()));
  const startDate=query.startDate??new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.parse(endDate+'T00:00:00+08:00')-29*86400000));
  const members=group.members.filter(member=>(!query.platform||member.platform===query.platform)&&(!query.accountId||member.accountId===query.accountId)&&(query.accountId||member.status==='active'&&member.leftAt===null));
  const member=members.length===1?members[0]:undefined;
  const base={groupId,platform:query.platform??null,accountId:query.accountId??null,startDate,endDate};
  const empty=(reason:string)=>groupDashboardTrend.parse({...base,trend:[],performanceTrend:unavailablePerformance(reason,member?.accountId??query.accountId??null,member?.platform==='wechatOfficial'||query.platform==='wechatOfficial')});
  if(members.length!==1)return empty(members.length?'select_account':'no_account');
  if(member!.status!=='active'||member!.leftAt!==null)return empty('unavailable_account');
  if(member!.platform==='wechatOfficial')return empty('no_total_channel');
  if(member!.platform!=='wechatVideo')return empty('unsupported_platform');
  const result=await readDashboardNativeTrend({ctx:{...ctx,groupId,accountId:member!.accountId,groupVersion:group.version,membershipVersion:member!.version},accountId:member!.accountId,startDate,endDate,reports:ports.nativeReports});
  return groupDashboardTrend.parse({...base,...result});
 },async get(ctx:RequestContext,groupId:string,input:unknown){
  const query=groupWorkspaceQuery.parse(input);const group=await ports.groups.get(ctx,groupId);
  if(ctx.groupId&&ctx.groupId!==groupId)throw new OwnershipError('请切换到此账号组');
  const sharedCtx={...ctx,groupId,accountId:null};
  const generatedAt=ports.now();const endDate=query.endDate??new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(generatedAt));
  const startDate=query.startDate??new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.parse(endDate+'T00:00:00+08:00')-29*86400000));
  // 获取冻结组历史事实，选项包含已转出的账号，不向前端借账号列表扩大权限。
  const [base,projects,allPubs]=await Promise.all([ports.dashboard.getDashboard(sharedCtx),ports.projects.listProjectsForComposition(sharedCtx),ports.publishing.listPublicationsForUser(sharedCtx,{limit:100000,offset:0})]);
  let collectedFacts:CollectedDashboardFacts|undefined,summaryUnavailable=false;
  if(ports.collectedMetrics){
   try{collectedFacts=await ports.collectedMetrics.readDashboardSummary(sharedCtx,{groupId,platform:query.platform,accountId:query.accountId,startDate,endDate});}
   catch{summaryUnavailable=true;}
  }
  const accounts=new Map(group.members.map(m=>[m.accountId,{id:m.accountId,platform:m.platform,name:m.accountHandle,historical:false,archived:m.status==='archived'}]));
  for(const account of collectedFacts?.accountOptions??[])if(!accounts.has(account.id))accounts.set(account.id,account);
  for(const p of allPubs)if(!accounts.has(p.accountId))accounts.set(p.accountId,{id:p.accountId,platform:p.platform as typeof group.members[number]['platform'],name:p.accountReference||p.accountId,historical:true,archived:false});
  if(query.accountId&&!accounts.has(query.accountId))throw new OwnershipError('账号不属于当前组或没有此组历史事实');
  if(query.accountId&&query.platform&&accounts.get(query.accountId)!.platform!==query.platform)throw new OwnershipError('账号与所选平台不一致');
  const inWindow=(p:typeof allPubs[number])=>!!p.publishedAt&&Date.parse(p.publishedAt)>=Date.parse(startDate+'T00:00:00+08:00')&&Date.parse(p.publishedAt)<Date.parse(endDate+'T00:00:00+08:00')+86400000;
  const pubs=allPubs.filter(p=>(!query.platform||p.platform===query.platform)&&(!query.accountId||p.accountId===query.accountId));
  const published=pubs.filter(p=>p.status==='published'&&!p.hiddenAt&&!p.removedAt&&inWindow(p));
  const latest=published.length?await ports.analytics.listLatestSnapshotsByPublicationIds(sharedCtx,published.map(p=>p.id)):[];
  const byPub=new Map(latest.map(s=>[s.publicationId,s]));
  const covered:CoveredPublication[]=published.flatMap(p=>{
   const snapshot=byPub.get(p.id);if(!snapshot||p.userId!==ctx.userId)return [];
   const raw=(snapshot.rawMetrics??{}) as Record<string,unknown>,metricKeys=new Set<string>();
   const definitions:Array<[string,string[]]>=[['like_count',['likes']],['share_count',['shares']],['comment_count',['comments']]];
   definitions.push(p.platform==='wechatOfficial'?['read_count',['reads','read_count','views']]:p.platform==='xiaohongshu'?['view_count',['views']]:['play_count',['views','plays']]);
   for(const [key,names] of definitions){const value=num(raw,names);if(value!==null&&value>=0)metricKeys.add(key);}
   return [{id:p.id,accountId:p.accountId,platform:p.platform,metricKeys}];
  });
  const collected=collectedFacts?projectCollectedDashboard(collectedFacts,covered):undefined;
  const typedValue=(platform:string,key:string)=>collected?.metrics.find(m=>m.platform===platform&&m.metricKey===key)?.value??null;
  const platformNames=[...new Set([...group.members.map(m=>m.platform),...pubs.map(p=>p.platform),...(collectedFacts?.accountOptions.map(a=>a.platform)??[])])];
  const platforms=platformNames.filter(p=>!query.platform||p===query.platform).map(platform=>{
   const facts=published.filter(p=>p.platform===platform);const snapshots=facts.flatMap(p=>byPub.has(p.id)?[byPub.get(p.id)!]:[]);
   const raws=snapshots.map(s=>(s.rawMetrics??{}) as Record<string,unknown>);const article=platform==='wechatOfficial',browse=platform==='xiaohongshu';
   return {platform,publicationCount:facts.length,sampleCount:snapshots.length,views:sum([article||browse?null:sum(raws.map(m=>num(m,['views','plays']))),typedValue(platform,'play_count')]),browses:sum([browse?sum(raws.map(m=>num(m,['views']))):null,typedValue(platform,'view_count')]),reads:sum([article?sum(raws.map(m=>num(m,['reads','read_count','views']))):null,typedValue(platform,'read_count')]),likes:sum([sum(raws.map(m=>num(m,['likes']))),typedValue(platform,'like_count')]),shares:sum([sum(raws.map(m=>num(m,['shares']))),typedValue(platform,'share_count')]),capturedAt:[...snapshots.map(s=>s.capturedAt),...(collected?.metrics.filter(m=>m.platform===platform).flatMap(m=>m.capturedAt?[m.capturedAt]:[])??[])].sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)??null};
  });
  const outputRefs=await ports.projects.listOutputRefsByOutputIds(sharedCtx,published.map(p=>p.contentOutputId));
  const contentCount=new Set(outputRefs.map(p=>p.projectId)).size;const pendingCount=pubs.filter(p=>p.status!=='published'&&p.status!=='removed').length;
  const videoViews=sum(platforms.map(p=>p.views)),browseViews=sum(platforms.map(p=>p.browses)),articleReads=sum(platforms.map(p=>p.reads));
  const collectedAccounts=new Set([...published.filter(p=>byPub.has(p.id)).map(p=>p.accountId),...(collected?.knownAccountIds??[])]).size;const selectedAccounts=[...accounts.values()].filter(a=>(!query.platform||a.platform===query.platform)&&(!query.accountId||a.id===query.accountId));
  const legacyCoverage=`${collectedAccounts}/${selectedAccounts.length} 个账号有作品指标；期间发布作品截至采集时的累计表现`;
  const coverage=collected?`当前组已读取 ${collected.catalogWorkCount} 条平台作品 · 数据为累计值${collected.metrics.some(m=>m.knownCount<m.eligibleCount)?'；部分指标暂缺':''}${collected.unattributableWorkCount?`；另有 ${collected.unattributableWorkCount} 条作品尚未确认所属账号组`:''}`:legacyCoverage+(summaryUnavailable?'；平台采集摘要暂不可读，以上保留已知发布记录指标':'');
  const followerFacts=new Map<string,{capturedAt:string;value:number|null}>();
  for(const p of published){const snap=byPub.get(p.id);if(!snap)continue;const value=num((snap.rawMetrics??{}) as Record<string,unknown>,['followers','follower_count','fans_count']);if(value!==null&&(!followerFacts.has(p.accountId)||snap.capturedAt>followerFacts.get(p.accountId)!.capturedAt))followerFacts.set(p.accountId,{capturedAt:snap.capturedAt,value});}
  for(const fact of collected?.followerFacts??[]){if(!fact.observedAt)continue;const prior=followerFacts.get(fact.accountId);if(!prior||Date.parse(fact.observedAt)>Date.parse(prior.capturedAt))followerFacts.set(fact.accountId,{capturedAt:fact.capturedAt!,value:fact.value});else if(Date.parse(fact.observedAt)===Date.parse(prior.capturedAt)&&fact.value!==prior.value)followerFacts.set(fact.accountId,{capturedAt:prior.capturedAt,value:null});}
  const followers=sum([...followerFacts.values()].map(f=>f.value));
  const rollup=query.platform?await ports.analytics.getDashboardRollup(sharedCtx,{publicationIds:published.map(p=>p.id)}):null;
  const finish=rollup?.finishAvg;
  const metrics=query.platform?[
   card('g-views',query.platform==='wechatOfficial'?'文章阅读（次）':query.platform==='xiaohongshu'?'浏览（次）':'视频播放（次）',query.platform==='wechatOfficial'?articleReads:query.platform==='xiaohongshu'?browseViews:videoViews),card('g-likes','点赞（次）',sum(platforms.map(p=>p.likes))),card('g-followers','账号粉丝合计（人，未去重）',followers),query.platform==='wechatOfficial'?card('g-watching','在看（次）',sum(latest.map(s=>num((s.rawMetrics??{}) as Record<string,unknown>,['watching','wow','in_look'])))):{...card('g-finish','平均完播率',null),value:typeof finish==='number'&&rollup!.finishCount>0?finish.toFixed(1)+'%':'—'},card('g-shares','分享（次）',sum(platforms.map(p=>p.shares))),
  ]:[card('g-content','独立内容数（期）',new Set(projects.map(p=>p.id)).size),card('g-pubs','期间发布记录（条）',published.length),card('g-pending','待分发记录（条）',pendingCount),card('g-video','视频播放合计（次）',videoViews),card('g-read','文章阅读（次）',articleReads),...(browseViews!==null?[card('g-browse','浏览合计（次）',browseViews)]:[])];
  const titles=await ports.publishing.listCurrentRevisionSummariesByPublicationIds(sharedCtx,published.map(p=>p.id));const byTitle=new Map(titles.map(t=>[t.publicationId,t.title]));
  const recentPublications=published.slice().sort((a,b)=>(b.publishedAt??'').localeCompare(a.publishedAt??'')).slice(0,5).map(p=>({id:p.id,title:byTitle.get(p.id)||'未命名发布',platform:p.platform,status:p.status,views:num((byPub.get(p.id)?.rawMetrics??{}) as Record<string,unknown>,p.platform==='wechatOfficial'?['reads','read_count','views']:['views','plays']),engagement:sum([num((byPub.get(p.id)?.rawMetrics??{}) as Record<string,unknown>,['likes']),num((byPub.get(p.id)?.rawMetrics??{}) as Record<string,unknown>,['comments']),num((byPub.get(p.id)?.rawMetrics??{}) as Record<string,unknown>,['shares'])]),publishedAt:p.publishedAt!}));
  // 首页概要不读取日报；独立图卡通过getTrend读取，避免日报分页阻塞其它卡片。
  const trend: Array<{label:string;value:number|null}>=[];
  return groupDashboardPage.parse({...base,metrics,recentPublications,dataOverview:{metrics,trend},workspace:{groupId,groupName:group.name,status:group.status,platform:query.platform??null,accountId:query.accountId??null,startDate,endDate,generatedAt,contentCount,publicationCount:published.length,pendingCount,collectedAccounts,totalAccounts:selectedAccounts.length,videoViews,articleReads,browseViews,followers,latestCapturedAt:[...latest.map(s=>s.capturedAt),...(collected?.metrics.flatMap(m=>m.capturedAt?[m.capturedAt]:[])??[])].sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)??null,...(collected?{collected:{state:'ready',catalogWorkCount:collected.catalogWorkCount,unattributableWorkCount:collected.unattributableWorkCount,deduplicatedWorkCount:collected.deduplicatedWorkCount,metrics:collected.metrics}}:summaryUnavailable?{collected:{state:'unavailable',catalogWorkCount:null,unattributableWorkCount:null,deduplicatedWorkCount:null,metrics:[]}}:{}),accounts:[...accounts.values()],platforms,coverage,metricMode:collected?'published_and_collected_in_period_cumulative':'published_in_period_cumulative'}});
 }};
}
