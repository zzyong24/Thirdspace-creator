import {describe,it,expect,vi} from "vitest";
import {render,screen} from "@testing-library/react";
import {DailyReportPage,reportAnalysisPrompt} from "./daily-report-page";
import {totals,type DailyReport} from "./report-metrics";
vi.mock("next/link",()=>({default:({children,...props}:any)=><a {...props}>{children}</a>}));
const report:DailyReport={date:"2026-09-13",timeZone:"Asia/Shanghai",generatedAt:"2026-09-14T00:00:00Z",accountId:"a",accountName:"真实账号",positioning:"教小店经营",warnings:[],works:[{publicationId:"pub",projectId:"p",title:"真实作品",publishedAt:"2026-09-13T00:00:00Z",capturedAt:null,metrics:{views:0,likes:8},script:"确认稿",traffic:[]}]};
describe("日报界面",()=>{
 it("真实零与缺失值区分，AI入口带日期作品证据，稿件与来源诚实",()=>{render(<DailyReportPage report={report}/>);expect(screen.getByText("确认稿")).toBeInTheDocument();expect(screen.getByText("暂无来源数据")).toBeInTheDocument();const href=screen.getByRole("link",{name:"让 AI 分析日报"}).getAttribute("href")!;const q=new URLSearchParams(href);expect(q.get("copilot")).toBe("open");expect(q.get("prefill")).toContain('"publicationId":"pub"');expect(q.get("prefill")).toContain("2026-09-13");expect(totals(report)[0].value).toBe(0);expect(totals(report)[2].value).toBeNull();});
 it("无作品只展示空态不生成分析结论",()=>{render(<DailyReportPage report={{...report,works:[]}}/>);expect(screen.getByText("这一天暂无已发布作品")).toBeInTheDocument();expect(screen.queryByRole("link",{name:"让 AI 分析日报"})).toBeNull();});
 it("超过12条时明确样本数与查询完整作品要求",()=>{const r={...report,works:Array.from({length:13},(_,i)=>({...report.works[0],publicationId:`p${i}`}))};expect(reportAnalysisPrompt(r)).toContain("共 13 条");expect(reportAnalysisPrompt(r)).toContain("前 12 条");});
});
