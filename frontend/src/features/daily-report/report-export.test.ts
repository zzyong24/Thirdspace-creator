import {it,expect,vi} from "vitest";
import {exportDailyReport} from "./report-export";
import {PURCHASE_QR,PURCHASE_URL} from "./purchase-qr";
it("导出绘制当前报告日期和真实零值，并附固定购买二维码",async()=>{
 const context={scale:vi.fn(),fillRect:vi.fn(),fillText:vi.fn(),measureText:vi.fn((s:string)=>({width:s.length*12})),font:"",fillStyle:""};
 vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue(context as any);
 vi.spyOn(HTMLCanvasElement.prototype,"toBlob").mockImplementation(cb=>cb(new Blob(["png"],{type:"image/png"})));
 Object.defineProperty(document,"fonts",{configurable:true,value:{ready:Promise.resolve()}});
 const click=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});
 const create=vi.fn(()=>"blob:test"),revoke=vi.fn();Object.defineProperty(URL,"createObjectURL",{configurable:true,value:create});Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:revoke});
 await exportDailyReport({date:"2026-10-01",timeZone:"Asia/Shanghai",generatedAt:"2026-10-02T00:00:00Z",accountId:"a",accountName:"真实账号",positioning:null,warnings:[],works:[{publicationId:"pub",projectId:"p",title:"真实作品",publishedAt:"2026-10-01T00:00:00Z",capturedAt:null,metrics:{views:0},script:null,traffic:[]}]});
 expect(context.fillText).toHaveBeenCalledWith("2026-10-01",40,118);expect(context.fillText).toHaveBeenCalledWith("真实作品",40,542);expect(context.fillText).toHaveBeenCalledWith("0",40,308);expect(PURCHASE_URL).toBe("https://buy.aitongban.cloud/");expect(PURCHASE_QR.length).toBeGreaterThan(400);expect(click).toHaveBeenCalledOnce();
 vi.restoreAllMocks();
});
