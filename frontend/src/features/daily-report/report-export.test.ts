import {it,expect,vi} from "vitest";
import {exportDailyReport,renderDailyReportCanvas} from "./report-export";
import {PURCHASE_QR,PURCHASE_URL} from "./purchase-qr";
import type {DailyReport} from "./report-metrics";
const report:DailyReport={date:"2026-10-01",timeZone:"Asia/Shanghai",generatedAt:"2026-10-02T00:00:00Z",accountId:"a",accountName:"真实账号",positioning:null,warnings:[],recentWorks:[],works:[{publicationId:"pub",projectId:"p",title:"真实作品",publishedAt:"2026-10-01T00:00:00Z",capturedAt:null,metrics:{views:0,finish_5s_rate:20},script:null,traffic:[]}]};
it("导出与预览同一绘制入口，真实零、选定留存、模型行动、过时提示和购买码均保留",async()=>{
 const context={scale:vi.fn(),fillRect:vi.fn(),fillText:vi.fn(),measureText:vi.fn((s:string)=>({width:s.length*12})),font:"",fillStyle:""};
 vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue(context as any);
 vi.spyOn(HTMLCanvasElement.prototype,"toBlob").mockImplementation(cb=>cb(new Blob(["png"],{type:"image/png"})));
 Object.defineProperty(document,"fonts",{configurable:true,value:{ready:Promise.resolve()}});
 const click=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});Object.defineProperty(URL,"createObjectURL",{configurable:true,value:vi.fn(()=>"blob:test")});Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:vi.fn()});
 const options={analysis:{format:"creatoros.daily-report.v1" as const,date:report.date,accountId:"a",sourceGeneratedAt:report.generatedAt,headline:"真实结论",summary:"有证据的建议",positioning:{observation:"",suggestion:""},works:[],experiments:[{title:"仅改开场",action:"先演示结果",variable:"开场",metric:"留存",prerequisite:"核对原片"}]},sourceGeneratedAt:report.generatedAt,stale:true};
 const canvas=await renderDailyReportCanvas(report,options);expect(canvas.width).toBe(2160);const preview=context.fillText.mock.calls.map(call=>call[0]);expect(preview).toContain("真实结论");expect(preview).toContain("20%");expect(preview).toContain("0");expect(preview).toContain("先演示结果");expect(preview.join(" ")).toContain("数据已有更新");expect(preview).toContain(PURCHASE_URL);
 context.fillText.mockClear();await exportDailyReport(report,options);expect(context.fillText.mock.calls.map(call=>call[0])).toEqual(preview);expect(PURCHASE_URL).toBe("https://buy.aitongban.cloud/");expect(PURCHASE_QR.length).toBeGreaterThan(400);expect(click).toHaveBeenCalledOnce();vi.restoreAllMocks();
});
