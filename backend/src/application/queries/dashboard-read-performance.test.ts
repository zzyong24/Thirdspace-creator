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
 const app=createDashboardApplication({
 projectsService:{getDashboardSummary:async()=>({todos:[],continueCreating:null}),hasImportedProjects:async()=>true,listProjectsForComposition:async()=>[],listOutputRefsByProjects:async()=>[]},
 publishingService:{getRecentPublicationsWithTitle:async()=>[],listPublicationsByOutputIds:async()=>[]},analyticsService:{getDashboardRollup,getDailyPlayTrend},executionService:{list:async()=>({rows:[]})},
 contentCalendarService:{getCalendarRequestContext:async()=>({today:'2026-09-09'}),listActiveProjectSchedules:async()=>[]},platformAccountService:{listAccounts:async()=>({rows:[]})},candidateService:{listCandidates:async()=>({rows:[]})},learningsService:{getSuggestions:async()=>[]},notificationsServiceForQuery:{getUnreadCount:async()=>0},resolveImportedPublicationIds:resolve,
 } as unknown as Parameters<typeof createDashboardApplication>[0]);
 const first=await app.getDashboard(ctx);
 expect(first.error).toBeNull();expect(first.metrics.find(m=>m.id==='d-views')?.value).toBe('12');
 expect(resolve).toHaveBeenCalledExactlyOnceWith(ctx);
 expect(getDashboardRollup).toHaveBeenCalledWith(ctx,{publicationIds:['pub-a']});
 expect(getDailyPlayTrend).toHaveBeenCalledWith(ctx,{publicationIds:['pub-a'],days:7});
 await Promise.all([app.getDashboard(ctx),app.getDashboard({...ctx,accountId:'b'})]);
 expect(resolve).toHaveBeenCalledTimes(3);
 expect(getDashboardRollup).toHaveBeenCalledWith({...ctx,accountId:'b'},{publicationIds:['pub-b']});
});
