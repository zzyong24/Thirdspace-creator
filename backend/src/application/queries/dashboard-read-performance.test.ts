import { expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { resolveImportedPublicationIdsInBatch } from "./imported-publication-ids";
import { createDashboardApplication } from "./dashboard";
const ctx = { userId: "u", accountId: "a", source: "user" } as RequestContext;
it("120个项目批量读取保持集合和账号，空集合不继续查询", async () => {
 const ids=Array.from({length:120},(_,i)=>`p${i}`), outputs=ids.map(id=>({outputId:`o-${id}`}));
 const pubs=outputs.map(o=>({id:`pub-${o.outputId}`}));
 const ports={projects:{listImportedProjectIds:vi.fn(async()=>ids),listOutputRefsByProjects:vi.fn(async()=>outputs)},publishing:{listPublicationsByOutputIds:vi.fn(async()=>[...pubs,pubs[0]!])}};
 expect(await resolveImportedPublicationIdsInBatch(ctx,ports)).toEqual(pubs.map(p=>p.id));
 expect(ports.projects.listImportedProjectIds).toHaveBeenCalledExactlyOnceWith(ctx);
 expect(ports.projects.listOutputRefsByProjects).toHaveBeenCalledExactlyOnceWith(ctx,ids);
 expect(ports.publishing.listPublicationsByOutputIds).toHaveBeenCalledExactlyOnceWith(ctx,outputs.map(o=>o.outputId));
 ports.projects.listImportedProjectIds.mockResolvedValue([]);
 expect(await resolveImportedPublicationIdsInBatch(ctx,ports)).toEqual([]);
 expect(ports.projects.listOutputRefsByProjects).toHaveBeenCalledTimes(1);
 ports.projects.listImportedProjectIds.mockResolvedValue(ids);
 ports.projects.listOutputRefsByProjects.mockResolvedValue([]);
 expect(await resolveImportedPublicationIdsInBatch(ctx,ports)).toEqual([]);
 expect(ports.publishing.listPublicationsByOutputIds).toHaveBeenCalledTimes(1);
});
it("同次首页共享三处解析，后续及跨号请求独立", async()=>{
 const resolve=vi.fn(async(c:RequestContext)=>[`pub-${c.accountId}`]);
 const getDashboardRollup=vi.fn(async()=>({snapshotCount:1,plays:12,likes:2,shares:1,finishCount:0,followerGain:0}));
 const getDailyPlayTrend=vi.fn(async()=>[]);
 const hasImportedProjects=vi.fn(async()=>true);
 const getRecentPublicationsWithTitle=vi.fn(async()=>[]);
 const app=createDashboardApplication({
 projectsService:{getDashboardSummary:async()=>({todos:[],continueCreating:null}),hasImportedProjects,listProjectsForComposition:async()=>[],listOutputRefsByProjects:async()=>[]},
 publishingService:{getRecentPublicationsWithTitle,listPublicationsByOutputIds:async()=>[]},analyticsService:{getDashboardRollup,getDailyPlayTrend},executionService:{list:async()=>({rows:[]})},
 contentCalendarService:{getCalendarRequestContext:async()=>({today:'2026-09-09'}),listActiveProjectSchedules:async()=>[]},platformAccountService:{listAccounts:async()=>({rows:[]})},candidateService:{listCandidates:async()=>({rows:[]})},learningsService:{getSuggestions:async()=>[]},notificationsServiceForQuery:{getUnreadCount:async()=>0},resolveImportedPublicationIds:resolve,
 } as unknown as Parameters<typeof createDashboardApplication>[0]);
 const first=await app.getDashboard(ctx);
 expect(first.error).toBeNull();expect(first.metrics.find(m=>m.id==='d-views')?.value).toBe('12');
 expect(resolve).toHaveBeenCalledExactlyOnceWith(ctx);
 expect(hasImportedProjects).toHaveBeenCalledExactlyOnceWith(ctx);
 expect(getRecentPublicationsWithTitle).toHaveBeenCalledWith(ctx,{limit:100,publicationIds:['pub-a'],displayLimit:5});
 expect(getDashboardRollup).toHaveBeenCalledWith(ctx,{publicationIds:['pub-a']});
 expect(getDailyPlayTrend).toHaveBeenCalledWith(ctx,{publicationIds:['pub-a'],days:7});
 await Promise.all([app.getDashboard(ctx),app.getDashboard({...ctx,accountId:'b'})]);
 expect(resolve).toHaveBeenCalledTimes(3);
 expect(getDashboardRollup).toHaveBeenCalledWith({...ctx,accountId:'b'},{publicationIds:['pub-b']});
});
function dashboardPorts(){
 return {
  projectsService:{getDashboardSummary:vi.fn(async()=>({todos:[],continueCreating:null})),hasImportedProjects:vi.fn(async()=>true),listProjectsForComposition:vi.fn(async()=>[]),listOutputRefsByProjects:vi.fn(async()=>[])},
  publishingService:{getRecentPublicationsWithTitle:vi.fn(async()=>[]),listPublicationsByOutputIds:vi.fn(async()=>[])},
  analyticsService:{getDashboardRollup:vi.fn(async()=>({snapshotCount:1,plays:12,likes:2,shares:1,finishCount:0,followerGain:9})),getDailyPlayTrend:vi.fn(async()=>[])},
  executionService:{list:vi.fn(async()=>({rows:[]}))},
  contentCalendarService:{getCalendarRequestContext:vi.fn(async()=>({today:'2026-09-14'})),listActiveProjectSchedules:vi.fn(async()=>[])},
  platformAccountService:{listAccounts:vi.fn(async()=>({rows:[]}))},candidateService:{listCandidates:vi.fn(async()=>({rows:[]}))},learningsService:{getSuggestions:vi.fn(async()=>[])},notificationsServiceForQuery:{getUnreadCount:vi.fn(async()=>0)},resolveImportedPublicationIds:vi.fn(async()=>[]),
 };
}
it('首页慢项目摘要不阻塞独立排期和运行状态，下一次仍实时读取',async()=>{
 const ports=dashboardPorts();let release!:()=>void;const blocked=new Promise<void>(r=>{release=r});
 ports.projectsService.getDashboardSummary.mockImplementationOnce(async()=>{await blocked;return {todos:[],continueCreating:null}});
 const app=createDashboardApplication(ports as unknown as Parameters<typeof createDashboardApplication>[0]);const pending=app.getDashboard(ctx);
 await vi.waitFor(()=>{expect(ports.contentCalendarService.getCalendarRequestContext).toHaveBeenCalledTimes(1);expect(ports.executionService.list).toHaveBeenCalledTimes(1)});
 release();expect((await pending).error).toBeNull();await app.getDashboard(ctx);
 expect(ports.contentCalendarService.getCalendarRequestContext).toHaveBeenCalledTimes(2);expect(ports.executionService.list).toHaveBeenCalledTimes(2);
 expect(ports.publishingService.getRecentPublicationsWithTitle).toHaveBeenCalledWith(ctx,{limit:100,publicationIds:[],displayLimit:5});
});
it('账号基线读取失败不能当成零基线，恢复后才可显示真实期内增长',async()=>{
 const ports=dashboardPorts();ports.platformAccountService.listAccounts.mockRejectedValueOnce(new Error('offline'));
 const app=createDashboardApplication(ports as unknown as Parameters<typeof createDashboardApplication>[0]);
 const failed=await app.getDashboard(ctx);expect(failed.metrics.find(m=>m.id==='d-followers')).toMatchObject({label:'总粉丝',value:'—'});
 const recovered=await app.getDashboard(ctx);expect(recovered.metrics.find(m=>m.id==='d-followers')).toMatchObject({label:'新增粉丝(期内)',value:'9'});
});
