import {describe,it,expect} from "vitest";
import {render,screen} from "@testing-library/react";
import {ReportNativeComparisons} from "./report-native-comparisons";
import {ReportBar} from "./report-details";
import {overviewMetrics,type DailyReport} from "./report-metrics";
const report:DailyReport={date:"2026-09-01",timeZone:"Asia/Shanghai",generatedAt:"2026-10-01T00:00:00Z",accountId:"g",accountName:"组",positioning:null,warnings:[],recentWorks:[],works:[{publicationId:"v",projectId:"pv",platform:"douyin",title:"视频作品",publishedAt:"2026-09-01T00:00:00Z",capturedAt:null,script:null,metrics:{views:0},traffic:[]},{publicationId:"a",projectId:"pa",platform:"wechatOfficial",title:"文章作品",publishedAt:"2026-09-01T00:00:00Z",capturedAt:null,script:null,metrics:{reads:20},traffic:[]},{publicationId:"missing",projectId:"pm",platform:"kuaishou",title:"未采集作品",publishedAt:"2026-09-01T00:00:00Z",capturedAt:null,script:null,metrics:{},traffic:[]}]};
describe("原生指标与坐标",()=>{
 it("文章阅读与视频播放各自有共同坐标、单位和真实零",()=>{const {container}=render(<ReportNativeComparisons report={report}/>);expect(screen.getByRole("heading",{name:"视频播放比较"})).toBeVisible();expect(screen.getByRole("heading",{name:"文章阅读比较"})).toBeVisible();expect(screen.getByText("0 次")).toBeVisible();expect(screen.getByText("20 次")).toBeVisible();expect(container.querySelector('[data-slot="report-reads-axis"]')).toBeTruthy();expect(screen.getByText(/暂无指标快照：快手/)).toBeVisible();expect(screen.getByRole("link",{name:"未采集作品 · 复盘 →"})).toHaveAttribute("href","/projects/pm/review");});
 it("摘要不会把文章阅读算为播放，阅读独立保留",()=>{const metrics=overviewMetrics(report,report.works[0]);expect(metrics.find(m=>m.label==="文章累计阅读")?.value).toBe("20");expect(metrics.find(m=>m.label==="视频累计播放")?.value).toBe("0");});
 it("未知比例不绘制零条；真实比例展示0/50/100百分比坐标",()=>{const view=render(<ReportBar label="未知留存" value={null}/>);expect(view.container.querySelector('[style*="width"]')).toBeNull();view.rerender(<ReportBar label="真实留存" value={20}/>);expect(screen.getByText("0%")).toBeVisible();expect(screen.getByText("100%")).toBeVisible();});
});
