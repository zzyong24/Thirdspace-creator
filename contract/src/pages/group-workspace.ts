import {z} from 'zod';
import {id,platformId,calendarDate} from '../primitives';
import {dashboardPage} from './dashboard';
export const groupWorkspaceQuery=z.object({platform:platformId.optional(),accountId:id.optional(),startDate:calendarDate.optional(),endDate:calendarDate.optional()}).superRefine((q,ctx)=>{
 if(Boolean(q.startDate)!==Boolean(q.endDate))ctx.addIssue({code:'custom',message:'开始和结束日期必须同时提供'});
 if(q.startDate&&q.endDate&&q.startDate>q.endDate)ctx.addIssue({code:'custom',message:'开始日期不能晚于结束日期'});
});
export type GroupWorkspaceQuery=z.infer<typeof groupWorkspaceQuery>;
export const dashboardPerformanceTrend=z.object({
 mode:z.enum(['daily','unavailable']),unit:z.enum(['次','人']),valueLabel:z.string(),reason:z.string().nullable(),accountId:id.nullable(),observedAt:z.string().nullable(),reportIds:z.array(id),
});
export const dashboardCollectedMetric=z.object({
 platform:platformId,metricKey:z.enum(['play_count','view_count','read_count','like_count','comment_count','share_count','favorite_count','follower_count']),
 scope:z.enum(['work','account']),unit:z.literal('count'),window:z.literal('lifetime'),value:z.number().nonnegative().finite().nullable(),
 knownCount:z.number().int().nonnegative(),eligibleCount:z.number().int().nonnegative(),capturedAt:z.string().nullable(),observedAt:z.string().nullable(),sources:z.array(z.string()),
}).superRefine((m,ctx)=>{if((m.metricKey==='follower_count')!==(m.scope==='account'))ctx.addIssue({code:'custom',message:'指标语义与统计范围不一致'});if(m.knownCount>m.eligibleCount||(m.knownCount===0)!==(m.value===null))ctx.addIssue({code:'custom',message:'指标值与已知覆盖不一致'});});
export const dashboardCollectedCoverage=z.object({
 state:z.enum(['ready','unavailable']),catalogWorkCount:z.number().int().nonnegative().nullable(),unattributableWorkCount:z.number().int().nonnegative().nullable(),deduplicatedWorkCount:z.number().int().nonnegative().nullable(),
 metrics:z.array(dashboardCollectedMetric),
}).superRefine((c,ctx)=>{const counts=[c.catalogWorkCount,c.unattributableWorkCount,c.deduplicatedWorkCount];if(c.state==='ready'?counts.some(v=>v===null):counts.some(v=>v!==null)||c.metrics.length>0)ctx.addIssue({code:'custom',message:'来源读取状态与覆盖计数不一致'});});
export const groupWorkspaceMeta=z.object({
 groupId:id,groupName:z.string(),status:z.enum(['active','archived']),platform:platformId.nullable(),accountId:id.nullable(),startDate:z.string(),endDate:z.string(),generatedAt:z.string(),
 contentCount:z.number().int(),publicationCount:z.number().int(),pendingCount:z.number().int(),collectedAccounts:z.number().int(),totalAccounts:z.number().int(),
 videoViews:z.number().nullable(),articleReads:z.number().nullable(),browseViews:z.number().nullable().optional(),followers:z.number().nullable(),latestCapturedAt:z.string().nullable(),collected:dashboardCollectedCoverage.optional(),
 accounts:z.array(z.object({id,platform:platformId,name:z.string(),historical:z.boolean(),archived:z.boolean()})),
 platforms:z.array(z.object({platform:platformId,publicationCount:z.number().int(),sampleCount:z.number().int(),views:z.number().nullable(),browses:z.number().nullable().optional(),reads:z.number().nullable(),likes:z.number().nullable(),shares:z.number().nullable(),capturedAt:z.string().nullable()})),
 performanceTrend:dashboardPerformanceTrend.optional(),coverage:z.string(),metricMode:z.enum(['published_in_period_cumulative','published_and_collected_in_period_cumulative']),
});
export const groupDashboardPage=dashboardPage.extend({workspace:groupWorkspaceMeta});

export const groupDashboardTrend=z.object({
 groupId:id,platform:platformId.nullable(),accountId:id.nullable(),startDate:calendarDate,endDate:calendarDate,
 trend:z.array(z.object({label:calendarDate,value:z.number().nonnegative().finite().nullable()})),performanceTrend:dashboardPerformanceTrend,
});
export type GroupDashboardTrend=z.infer<typeof groupDashboardTrend>;
