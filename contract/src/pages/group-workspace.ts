import {z} from 'zod';
import {id,platformId,calendarDate} from '../primitives';
import {dashboardPage} from './dashboard';
export const groupWorkspaceQuery=z.object({platform:platformId.optional(),accountId:id.optional(),startDate:calendarDate.optional(),endDate:calendarDate.optional()}).superRefine((q,ctx)=>{
 if(Boolean(q.startDate)!==Boolean(q.endDate))ctx.addIssue({code:'custom',message:'开始和结束日期必须同时提供'});
 if(q.startDate&&q.endDate&&q.startDate>q.endDate)ctx.addIssue({code:'custom',message:'开始日期不能晚于结束日期'});
});
export type GroupWorkspaceQuery=z.infer<typeof groupWorkspaceQuery>;
export const groupWorkspaceMeta=z.object({
 groupId:id,groupName:z.string(),status:z.enum(['active','archived']),platform:platformId.nullable(),accountId:id.nullable(),startDate:z.string(),endDate:z.string(),generatedAt:z.string(),
 contentCount:z.number().int(),publicationCount:z.number().int(),pendingCount:z.number().int(),collectedAccounts:z.number().int(),totalAccounts:z.number().int(),
 videoViews:z.number().nullable(),articleReads:z.number().nullable(),followers:z.number().nullable(),latestCapturedAt:z.string().nullable(),
 accounts:z.array(z.object({id,platform:platformId,name:z.string(),historical:z.boolean(),archived:z.boolean()})),
 platforms:z.array(z.object({platform:platformId,publicationCount:z.number().int(),sampleCount:z.number().int(),views:z.number().nullable(),reads:z.number().nullable(),likes:z.number().nullable(),shares:z.number().nullable(),capturedAt:z.string().nullable()})),
 coverage:z.string(),metricMode:z.literal('published_in_period_cumulative'),
});
export const groupDashboardPage=dashboardPage.extend({workspace:groupWorkspaceMeta});
