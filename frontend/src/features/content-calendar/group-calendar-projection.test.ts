import {describe,expect,it,vi} from 'vitest';
import {buildPublishingScheduleProjection,type PublishingScheduleProjectionDeps} from '@/server/publishing-schedule-projection';
const context={userId:'group-user',groupId:'group-a',accountId:'acct-real-filter',requestId:'req',source:'user' as const};
describe('组计划与平台事实投影',()=>{
 it('平台筛选不改变共享项目和组排期，组节奏独立读取',async()=>{
  const listGroupCalendar=vi.fn(async()=>({rows:[],total:0})),listCalendar=vi.fn(),projects=vi.fn(async()=>[{id:'project-shared',title:'共享项目'}]),publications=vi.fn(async()=>[]),getGroupCadence=vi.fn(async()=>({id:'cadence-group',accountId:null,groupId:'group-a',frequency:'weekly'}));
  const deps={calendar:{getCalendarRequestContext:async()=>({referenceInstant:'2026-10-04T00:00:00.000Z',effectiveTimezone:'UTC',today:'2026-10-04'}),listGroupCalendar,listCalendar,getGroupCadence},projects:{listProjectsForComposition:projects,listOutputRefsByProjects:async()=>[]},publishing:{listPublicationsByOutputIds:publications,listCurrentRevisionSummariesByPublicationIds:async()=>[]},analytics:{listLatestSnapshotsByPublicationIds:async()=>[],getDailyPlayTrend:async()=>[]}} as unknown as PublishingScheduleProjectionDeps;
  const result=await buildPublishingScheduleProjection(deps,context,'2026-10');
  expect(listGroupCalendar).toHaveBeenCalledWith(context,'group-a',expect.any(Object),{limit:500,offset:0});expect(listCalendar).not.toHaveBeenCalled();
  expect(projects).toHaveBeenCalledWith(expect.objectContaining({groupId:'group-a',accountId:null}));expect(publications).toHaveBeenCalledWith(context,[]);
  expect(getGroupCadence).toHaveBeenCalledWith(expect.objectContaining({groupId:'group-a',accountId:null}),'group-a');
  expect(result.calendar.state).toBe('ready');if(result.calendar.state==='ready')expect(result.calendar.viewModel).toMatchObject({groupId:'group-a',projects:[{id:'project-shared',title:'共享项目'}],cadence:{id:'cadence-group',accountId:null}});
 });
 it('平台发布记录读取失败时共享组计划仍可查看，明确声明事实暂不可用',async()=>{
  const deps={calendar:{getCalendarRequestContext:async()=>({referenceInstant:'2026-10-04T00:00:00.000Z',effectiveTimezone:'UTC',today:'2026-10-04'}),listGroupCalendar:async()=>({rows:[{id:'plan',projectId:'project-shared',status:'planned'}],total:1}),getGroupCadence:async()=>null},projects:{listProjectsForComposition:async()=>[{id:'project-shared',title:'共享项目'}],listOutputRefsByProjects:async()=>[]},publishing:{listPublicationsByOutputIds:async()=>{throw new Error('platform unavailable')}},analytics:{}} as unknown as PublishingScheduleProjectionDeps;
  const result=await buildPublishingScheduleProjection(deps,context,'2026-10');
  expect(result.calendar.state).toBe('ready');if(result.calendar.state==='ready')expect(result.calendar.viewModel).toMatchObject({entries:[{id:'plan'}],projects:[{id:'project-shared'}],publicationsUnavailable:true});
  expect(result.performance.scenario).toBe('error');
 });
});
