import type {PublishingScheduleProjection} from '@/server/publishing-schedule-projection';
import {platformName,type GroupWorkspace} from '@/features/group-workspace/workspace-query';
import type {PublishingCenterViewModel} from './publishing-center-page';
const fmt=(n:number|null)=>n===null?'—':n.toLocaleString('zh-CN');
/** SEMANTIC_BOUNDARY_ALLOW: 对已授权真实行落实用户平台、账号与北京时间范围；不推断内容关联。 */
export function scopeGroupPublishingProjection(projection:PublishingScheduleProjection,data:{workspace:GroupWorkspace;dataOverview:{trend:PublishingCenterViewModel['trend']}}):PublishingScheduleProjection{
 const w=data.workspace,start=Date.parse(`${w.startDate}T00:00:00+08:00`),end=Date.parse(`${w.endDate}T00:00:00+08:00`)+86400000;
 const accounts=new Map(w.accounts.map(a=>[a.id,a]));
 const rows=projection.performance.publications.filter(r=>(!w.platform||r.platform===w.platform)&&(!w.accountId||r.accountId===w.accountId)&&Date.parse(r.publishedAt)>=start&&Date.parse(r.publishedAt)<end).map(r=>({...r,platformLabel:platformName(r.platform),accountName:accounts.get(r.accountId??'')?.name??r.accountName,engagementLabel:`点赞 ${fmt(r.likes??null)} · 评论 ${fmt(r.comments??null)} · 分享 ${fmt(r.shares??null)}`}));
 const visible=new Set(rows.map(r=>r.id));
 const rowById=new Map(rows.map(r=>[r.id,r]));
 const metrics:PublishingCenterViewModel['metrics']=[{id:'pubc-total-plays',label:'视频累计播放（次）',value:fmt(w.videoViews),delta:'',trend:'flat',tone:'info'},{id:'pubc-total-reads',label:'文章累计阅读（次）',value:fmt(w.articleReads),delta:'',trend:'flat',tone:'info'},{id:'pubc-published-count',label:'期间已发布（条）',value:String(w.publicationCount),delta:'',trend:'flat',tone:'neutral'},{id:'pubc-content-count',label:'期间内容（期）',value:String(w.contentCount),delta:'',trend:'flat',tone:'neutral'}];
 const measured=rows.filter(r=>r.status==='published'&&!r.hidden&&r.metricKind!=='reads'&&typeof r.metricValue==='number');
 const performance={...projection.performance,publications:rows,metrics,platformComparison:w.platforms.filter(p=>p.views!==null).map(p=>({platform:p.platform,platformLabel:platformName(p.platform),share:p.views!,views:fmt(p.views)})).sort((a,b)=>b.share-a.share),trend:data.dataOverview.trend,topContent:measured.sort((a,b)=>b.metricValue!-a.metricValue!).slice(0,5).map(r=>({id:r.id,title:r.contentTitle,platform:r.platform,platformLabel:r.platformLabel,views:`${fmt(r.metricValue!)} 播放`,engagement:r.engagementLabel,coverAssetId:r.coverAssetId}))};
 return {...projection,performance,calendar:projection.calendar.state==='ready'?{...projection.calendar,viewModel:{...projection.calendar.viewModel,publications:projection.calendar.viewModel.publications.filter(r=>visible.has(r.id)).map(r=>({...r,platformLabel:rowById.get(r.id)!.platformLabel}))}}:projection.calendar};
}
