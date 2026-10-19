import {describe,expect,it} from 'vitest';
import {dashboardCollectedCoverage,dashboardCollectedMetric,groupWorkspaceMeta} from '../src/pages/group-workspace';
const metric={platform:'xiaohongshu',metricKey:'view_count',scope:'work',unit:'count',window:'lifetime',value:0,knownCount:1,eligibleCount:2,capturedAt:'2026-10-19T00:00:00.000Z',observedAt:'2026-10-19T00:00:00.000Z',sources:['synthetic']};
const legacy={groupId:'g',groupName:'合成组',status:'active',platform:null,accountId:null,startDate:'2026-09-20',endDate:'2026-10-19',generatedAt:'2026-10-19T00:00:00.000Z',contentCount:0,publicationCount:0,pendingCount:0,collectedAccounts:0,totalAccounts:0,videoViews:null,articleReads:null,followers:null,latestCapturedAt:null,accounts:[],platforms:[],coverage:'无既有指标',metricMode:'published_in_period_cumulative'};
describe('T1356 首页累计采集来源合同',()=>{
 it('旧DTO没有新增字段仍可读，新来源与Publication数明确分开',()=>{
  expect(groupWorkspaceMeta.safeParse(legacy).success).toBe(true);
  const dto=groupWorkspaceMeta.parse({...legacy,metricMode:'published_and_collected_in_period_cumulative',browseViews:0,collected:{state:'ready',catalogWorkCount:2,unattributableWorkCount:1,deduplicatedWorkCount:0,metrics:[metric]}});
  expect(dto.publicationCount).toBe(0);expect(dto.collected?.catalogWorkCount).toBe(2);expect(dto.collected?.metrics[0]?.value).toBe(0);
 });
 it('0/未知与已知覆盖一致，followers不能冒作品指标，play/view不共用key',()=>{
  expect(dashboardCollectedMetric.safeParse({...metric,value:null,knownCount:0}).success).toBe(true);
  for(const m of [{...metric,value:0,knownCount:0},{...metric,value:null,knownCount:1},{...metric,knownCount:3},{...metric,metricKey:'follower_count'},{...metric,unit:'percent'},{...metric,window:'interval'}])expect(dashboardCollectedMetric.safeParse(m).success).toBe(false);
  expect(dashboardCollectedMetric.parse({...metric,metricKey:'play_count'}).metricKey).toBe('play_count');expect(dashboardCollectedMetric.parse(metric).metricKey).toBe('view_count');
 });
 it('读取失败以null计数标未知，禁止伪0或同时声称有已读样本',()=>{
  const unavailable={state:'unavailable',catalogWorkCount:null,unattributableWorkCount:null,deduplicatedWorkCount:null,metrics:[]};
  expect(dashboardCollectedCoverage.safeParse(unavailable).success).toBe(true);
  expect(dashboardCollectedCoverage.safeParse({...unavailable,catalogWorkCount:0}).success).toBe(false);
  expect(dashboardCollectedCoverage.safeParse({...unavailable,metrics:[metric]}).success).toBe(false);
  expect(dashboardCollectedCoverage.safeParse({...unavailable,state:'ready'}).success).toBe(false);
 });
});
