import {describe,it,expect,vi} from "vitest";
import {createDailyReportApplication,yesterdayBeijing,type DailyReportPorts} from "./daily-report";
import {pagesOperations} from "../../../../contract/src/operations/pages";
const ctx={userId:"u",accountId:"a",requestId:"r"} as any;
function setup(){const ports={now:()=>"2026-09-13T16:00:00Z",projectsService:{listOutputRefsByOutputIds:vi.fn(async()=>[{outputId:"o",projectId:"p",title:"稿"}])},publishingService:{listPublishedInWindow:vi.fn(async()=>[{id:"pub",accountId:"a",contentOutputId:"o",status:"published",hiddenAt:null,removedAt:null,publishedAt:"2026-09-12T16:00:00Z"}])},analyticsService:{listLatestSnapshotsByPublicationIds:vi.fn(async()=>[{publicationId:"pub",capturedAt:"2026-09-14T00:00:00Z",rawMetrics:{views:0,likes:3}}])},trafficService:{getProject:vi.fn(async()=>({items:[]}))},readScript:vi.fn(async()=>"用户已确认稿"),readPositioning:vi.fn(async()=>"真实定位")};return {ports,app:createDailyReportApplication(ports as unknown as DailyReportPorts)};}
describe("运营日报",()=>{
 it("北京时间跨日及月底边界",()=>{expect(yesterdayBeijing("2026-09-13T15:59:59Z").date).toBe("2026-09-12");expect(yesterdayBeijing("2026-09-13T16:00:00Z").date).toBe("2026-09-13");expect(yesterdayBeijing("2026-03-01T00:00:00Z").date).toBe("2026-02-28");});
 it("当日发布区间包含起点、不含终点，跨账号/隐藏/删除不入日报",async()=>{const {ports,app}=setup();const base=(await ports.publishingService.listPublishedInWindow())[0]!;ports.publishingService.listPublishedInWindow.mockResolvedValue([base,{...base,id:"other",accountId:"b"},{...base,id:"end",publishedAt:"2026-09-13T16:00:00Z"},{...base,id:"early",publishedAt:"2026-09-12T15:59:59Z"},{...base,id:"hidden",hiddenAt:"2026-09-13"} as any]);const r=await app.getDailyReport(ctx);expect(r.works.map(w=>w.publicationId)).toEqual(["pub"]);expect(r.works[0]!.metrics.views).toBe(0);expect(r.works[0]!.script).toBe("用户已确认稿");expect(ports.publishingService.listPublishedInWindow).toHaveBeenCalledWith(ctx,{start:"2026-09-06T16:00:00.000Z",end:"2026-09-13T16:00:00.000Z"});});
 it("无账号不调用任何数据读取；缺指标不造0",async()=>{const {ports,app}=setup();expect((await app.getDailyReport({...ctx,accountId:null})).works).toEqual([]);expect(ports.projectsService.listOutputRefsByOutputIds).not.toHaveBeenCalled();ports.analyticsService.listLatestSnapshotsByPublicationIds.mockResolvedValue([]);expect((await app.getDailyReport(ctx )).works[0]!.metrics).toEqual({});});
 it("可选日期严格合法，读取失败不冒充无作品",async()=>{expect(pagesOperations.getDailyReport.query?.safeParse({date:"2026-02-30"}).success).toBe(false);const {ports,app}=setup();await expect(app.getDailyReport(ctx,"2026-02-30")).rejects.toThrow("日期无效");ports.projectsService.listOutputRefsByOutputIds.mockRejectedValue(new Error("offline"));await expect(app.getDailyReport(ctx)).rejects.toThrow("offline");});
});

it("1000+历史作品只做一次窗口查询与批量引用，历史稿件不读取", async()=>{
 const {ports,app}=setup();const base=(await ports.publishingService.listPublishedInWindow())[0]!;
 const pubs=Array.from({length:1005},(_,i)=>({...base,id:`pub-${i}`,contentOutputId:`o-${i}`,publishedAt:"2026-09-07T12:00:00Z"}));
 pubs.push(base);ports.publishingService.listPublishedInWindow.mockClear().mockResolvedValue(pubs);
 ports.projectsService.listOutputRefsByOutputIds.mockResolvedValue(pubs.map(p=>({outputId:p.contentOutputId,projectId:p.contentOutputId,title:"作品"})));
 const result=await app.getDailyReport(ctx);
 expect(result.recentWorks).toHaveLength(1006);expect(result.works).toHaveLength(1);
 expect(ports.publishingService.listPublishedInWindow).toHaveBeenCalledTimes(1);expect(ports.projectsService.listOutputRefsByOutputIds).toHaveBeenCalledTimes(1);
 expect(ports.analyticsService.listLatestSnapshotsByPublicationIds).toHaveBeenCalledTimes(1);
 expect(ports.readScript).toHaveBeenCalledTimes(1);expect(ports.trafficService.getProject).toHaveBeenCalledTimes(1);
});
it("当日详情最多四个项目并发，失败保留其他结果，授权无引用的作品不进入报告",async()=>{
 const {ports,app}=setup();const base=(await ports.publishingService.listPublishedInWindow())[0]!;
 const pubs=Array.from({length:9},(_,i)=>({...base,id:`pub-${i}`,contentOutputId:`o-${i}`}));
 ports.publishingService.listPublishedInWindow.mockResolvedValue([...pubs,{...base,id:"orphan",contentOutputId:"foreign"}]);
 ports.projectsService.listOutputRefsByOutputIds.mockResolvedValue(pubs.map(p=>({outputId:p.contentOutputId,projectId:p.contentOutputId,title:"作品"})));
 let running=0,max=0;ports.readScript.mockImplementation(async()=>{running++;max=Math.max(max,running);await new Promise(resolve=>setTimeout(resolve,5));running--;throw Error("稿件异常");});
 ports.trafficService.getProject.mockRejectedValue(Error("来源异常"));
 const report=await app.getDailyReport(ctx);expect(report.works).toHaveLength(9);expect(max).toBe(4);
 expect(report.warnings).toContain("部分作品稿件读取失败");expect(report.warnings).toContain("部分流量来源读取失败");
 expect(report.works.every(w=>w.script===null&&w.traffic.length===0)).toBe(true);
});
it("缺失分析指标可降级，核心发布查询失败仍需重试",async()=>{
 const {ports,app}=setup();ports.analyticsService.listLatestSnapshotsByPublicationIds.mockRejectedValue(Error("metrics offline"));
 const report=await app.getDailyReport(ctx);expect(report.works[0]!.metrics).toEqual({});expect(report.warnings).toContain("作品指标暂时读取失败");
 ports.publishingService.listPublishedInWindow.mockRejectedValue(Error("offline"));await expect(app.getDailyReport(ctx)).rejects.toThrow("offline");
});

it("旧日报响应缺少recentWorks仍可解析为空列表",async()=>{const {app}=setup();const {recentWorks,...legacy}=await app.getDailyReport(ctx);expect(pagesOperations.getDailyReport.response.parse(legacy).recentWorks).toEqual([]);});
