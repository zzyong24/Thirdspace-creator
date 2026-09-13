import {it,expect,vi} from "vitest";
import {dailyReportCsv,exportDailyReport,renderDailyReportCanvas} from "./report-export";
import {PURCHASE_QR,PURCHASE_URL} from "./purchase-qr";
import type {DailyReport} from "./report-metrics";
const report:DailyReport={date:"2026-10-01",timeZone:"Asia/Shanghai",generatedAt:"2026-10-02T00:00:00Z",accountId:"a",accountName:"真实账号",positioning:null,warnings:[],recentWorks:[],works:[{publicationId:"pub",projectId:"p",title:"真实作品",publishedAt:"2026-10-01T00:00:00Z",capturedAt:null,metrics:{views:0,finish_5s_rate:20},script:null,traffic:[]}]};
it("导出与预览同一绘制入口，仅公开真实成绩，排除内部分析并保留购买码",async()=>{
 const context={scale:vi.fn(),fillRect:vi.fn(),fillText:vi.fn(),measureText:vi.fn((s:string)=>({width:s.length*12})),font:"",fillStyle:""};
 vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue(context as any);
 vi.spyOn(HTMLCanvasElement.prototype,"toBlob").mockImplementation(cb=>cb(new Blob(["png"],{type:"image/png"})));
 Object.defineProperty(document,"fonts",{configurable:true,value:{ready:Promise.resolve()}});
 const click=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});Object.defineProperty(URL,"createObjectURL",{configurable:true,value:vi.fn(()=>"blob:test")});Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:vi.fn()});
 const options={analysis:{format:"creatoros.daily-report.v1" as const,date:report.date,accountId:"a",sourceGeneratedAt:report.generatedAt,headline:"真实结论",summary:"有证据的建议",positioning:{observation:"",suggestion:""},works:[],experiments:[{title:"仅改开场",action:"先演示结果",variable:"开场",metric:"留存",prerequisite:"核对原片"}]},rawAnalysis:"不应分享的内部分析秘密",sourceGeneratedAt:report.generatedAt,stale:true};
 const canvas=await renderDailyReportCanvas(report,options);expect(canvas.width).toBe(2160);const preview=context.fillText.mock.calls.map(call=>call[0]);expect(preview).not.toContain("真实结论");expect(preview.join(" ")).not.toContain("内部分析秘密");expect(preview).not.toContain("20%");expect(preview).toContain("0");expect(preview.join(" ")).not.toContain("先演示结果");expect(preview.join(" ")).not.toContain("数据已有更新");expect(preview.join(" ")).toContain("作品带来关注");expect(preview.join(" ")).toContain("真实作品");expect(preview).toContain(PURCHASE_URL);
 context.fillText.mockClear();await exportDailyReport(report,options);expect(context.fillText.mock.calls.map(call=>call[0])).toEqual(preview);expect(PURCHASE_URL).toBe("https://buy.aitongban.cloud/");expect(PURCHASE_QR.length).toBeGreaterThan(400);expect(click).toHaveBeenCalledOnce();vi.restoreAllMocks();
});
it("超长作品标题限制两行，完整标题仍在原报告中，海报不会被撑开",async()=>{
 const context={scale:vi.fn(),fillRect:vi.fn(),fillText:vi.fn(),measureText:vi.fn((s:string)=>({width:s.length*12})),font:"",fillStyle:""};
 vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue(context as any);
 Object.defineProperty(document,"fonts",{configurable:true,value:{ready:Promise.resolve()}});
 const normal=await renderDailyReportCanvas(report);
 context.fillText.mockClear();const longTitle='标题'.repeat(200);const long=await renderDailyReportCanvas({...report,works:[{...report.works[0],title:longTitle}]});
 expect(long.height).toBe(normal.height);const lines=context.fillText.mock.calls.map(call=>call[0]).filter(text=>String(text).includes('标题'));
 expect(lines).toHaveLength(2);expect(lines[1]).toMatch(/…$/);expect(lines.join('')).not.toContain(longTitle);
 vi.restoreAllMocks();
});
it("CSV 使用 UTF-8 BOM、中文列名和标准双引号转义；缺失指标保持为空",()=>{
 const csv=dailyReportCsv({...report,accountName:'账号,"甲"',works:[{...report.works[0],title:'标题,"乙"',metrics:{views:12} as any}]});
 expect(csv.startsWith("\uFEFF\"账号\",\"统计周期\"")).toBe(true);
 expect(csv).toContain('"账号,""甲"""');
 expect(csv).toContain('"标题,""乙"""');
 expect(csv).toContain('"12"');
 expect(csv).toContain('""');
 expect(csv).not.toContain('undefined');
});
