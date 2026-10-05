import {metricValue,nativeMetric,type DailyReport} from './report-metrics';
import {reportPeriodLabel} from './report-period';
import {platformName} from '@/features/group-workspace/workspace-query';
// SEMANTIC_BOUNDARY_ALLOW: 原生指标分别汇总和排序，不跨指标比较，不判断内容优劣或推断原因。
export function buildShareModel(report:DailyReport){
 const works=report.works.map(work=>{const views=nativeMetric(work,'views'),reads=nativeMetric(work,'reads');return {
  title:work.title,capturedAt:work.capturedAt,platform:work.platform?platformName(work.platform):null,
  metric:(work.platform==='wechatOfficial'||(reads!==null&&views===null)?'reads':'views') as 'reads'|'views',views,reads,
  followers:metricValue(work.metrics,['follower_gain']),
  interactions:[['likes','digg'],['comments'],['shares'],['favorites','collect']].map(keys=>metricValue(work.metrics,keys)),
 };});
 function aggregate(values:Array<number|null>,expected:number){const known=values.filter((n):n is number=>n!==null);return {value:known.length?known.reduce((a,b)=>a+b,0):null,coverage:known.length,expected};}
 const video=works.filter(w=>w.metric==='views'),article=works.filter(w=>w.metric==='reads');
 const sort=(rows:typeof works,metric:'views'|'reads')=>[...rows].sort((a,b)=>(b[metric]??-Infinity)-(a[metric]??-Infinity));
 return {accountName:report.accountName??'我的创作',period:reportPeriodLabel(report),generatedAt:report.generatedAt,
  positioningOneLiner:report.positioningOneLiner??null,profileUrl:report.accountProfileUrl??null,profilePlatform:report.platform?platformName(report.platform):report.works.length===1&&report.works[0].platform?platformName(report.works[0].platform):null,
  count:works.length,views:aggregate(works.map(w=>w.views),video.length),reads:aggregate(works.map(w=>w.reads),article.length),followers:aggregate(works.map(w=>w.followers),works.length),interactions:aggregate(works.flatMap(w=>w.interactions),works.length*4),
  highlights:[...sort(video,'views'),...sort(article,'reads')],
 };
}
