import {metricValue, type DailyReport} from './report-metrics';
import {reportPeriodLabel} from './report-period';

// SEMANTIC_BOUNDARY_ALLOW: 仅汇总已采集指标与按播放量排序，不判断内容优劣或推断运营原因。
export function buildShareModel(report: DailyReport) {
 const works = report.works.map(work => ({
  title: work.title,
  views: metricValue(work.metrics, ['views', 'plays']),
  followers: metricValue(work.metrics, ['follower_gain']),
  interactions: [ ['likes','digg'], ['comments'], ['shares'], ['favorites','collect'] ].map(keys => metricValue(work.metrics, keys)),
 }));
 function aggregate(values: Array<number|null>, expected: number) {
  const known = values.filter((n): n is number => n !== null);
  return {value: known.length ? known.reduce((a,b)=>a+b,0) : null, coverage: known.length, expected};
 }
 return {
  accountName: report.accountName ?? '我的创作', period: reportPeriodLabel(report), generatedAt: report.generatedAt,
  count: works.length,
  views: aggregate(works.map(work=>work.views), works.length),
  followers: aggregate(works.map(work=>work.followers), works.length),
  interactions: aggregate(works.flatMap(work=>work.interactions), works.length*4),
  highlights: [...works].sort((a,b)=>(b.views??-Infinity)-(a.views??-Infinity)).slice(0,3).map(({title,views,followers})=>({title,views,followers})),
 };
}
